import {
  formatOrderVersionEtag,
  parseBuyerOrderListQuery,
  parseCancelOrderRequest,
  parseCanonicalOrderReference,
  parseOrderIdempotencyKey,
  parseOrderVersionEtag,
  type BuyerOrderDetailResponse,
  type BuyerOrderListResponse,
} from '@shopee-clone/contracts';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { AuthenticationFailedError } from '../auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CancelOrderDto } from './order-history.dto';
import { OrderHistoryExceptionFilter } from './order-history-exception.filter';
import { OrderHistoryValidationError } from './order-history.errors';
import { OrderHistoryService } from './order-history.service';

@ApiTags('buyer orders')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Strict order request validation failed' })
@ApiResponse({ status: 401, description: 'A valid buyer session is required' })
@ApiResponse({ status: 403, description: 'Mutation browser origin is not allowed' })
@ApiResponse({ status: 404, description: 'Owned order was not found' })
@ApiResponse({ status: 409, description: 'Version, lifecycle, or idempotency conflict' })
@ApiResponse({ status: 503, description: 'Order data could not be returned safely' })
@Controller('account/orders')
@UseFilters(OrderHistoryExceptionFilter)
@UseGuards(AuthGuard)
export class OrderHistoryController {
  constructor(@Inject(OrderHistoryService) private readonly orders: OrderHistoryService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List authenticated buyer orders, one shop per order' })
  @ApiQuery({ name: 'filter', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOkResponse({
    description: 'Cursor-paginated shop-order cards with all products for each shop',
  })
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() input: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BuyerOrderListResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    const query = parseBuyerOrderListQuery(input);
    if (!query) throw new OrderHistoryValidationError(['query']);
    response.setHeader('Cache-Control', 'private, no-store');
    return this.orders.list(request.authUser.id, query);
  }

  @Get(':orderReference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get one owner-scoped shop order snapshot with its timeline' })
  @ApiParam({ name: 'orderReference', format: 'uuid' })
  @ApiOkResponse({ description: 'Immutable one-shop order detail and timeline' })
  async detail(
    @Req() request: AuthenticatedRequest,
    @Param('orderReference') rawReference: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BuyerOrderDetailResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    const orderReference = parseCanonicalOrderReference(rawReference);
    if (!orderReference) throw new OrderHistoryValidationError(['orderReference']);
    const detail = await this.orders.detail(request.authUser.id, orderReference);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', formatOrderVersionEtag(detail.order.version));
    return detail;
  }

  @Post(':orderReference/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an owned pending-confirmation shop order' })
  @ApiParam({ name: 'orderReference', format: 'uuid' })
  @ApiHeader({ name: 'If-Match', required: true, example: '"order-0"' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    example: '8b63c715-a17c-4da3-8cab-3ec56cf45964',
  })
  @ApiBody({ type: CancelOrderDto })
  @ApiOkResponse({ description: 'Cancelled detail or equivalent idempotent replay' })
  async cancel(
    @Req() request: AuthenticatedRequest,
    @Param('orderReference') rawReference: string,
    @Headers('if-match') rawEtag: string | undefined,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body() body: CancelOrderDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BuyerOrderDetailResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    const orderReference = parseCanonicalOrderReference(rawReference);
    const expectedVersion = parseOrderVersionEtag(rawEtag);
    const idempotencyKey = parseOrderIdempotencyKey(rawIdempotencyKey);
    const input = parseCancelOrderRequest(body);
    const invalid = [
      ...(!orderReference ? ['orderReference'] : []),
      ...(expectedVersion === null ? ['ifMatch'] : []),
      ...(!idempotencyKey ? ['idempotencyKey'] : []),
      ...(!input ? ['request'] : []),
    ];
    if (invalid.length > 0) throw new OrderHistoryValidationError(invalid);
    const detail = await this.orders.cancel(
      request.authUser.id,
      orderReference!,
      expectedVersion!,
      idempotencyKey!,
      input!,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', formatOrderVersionEtag(detail.order.version));
    return detail;
  }
}
