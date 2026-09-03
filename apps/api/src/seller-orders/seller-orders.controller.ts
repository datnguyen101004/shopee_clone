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
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  formatSellerOrderVersionEtag,
  parseSellerOrderActionRequest,
  parseSellerOrderIdempotencyKey,
  parseSellerOrderQueueQuery,
  parseSellerOrderReference,
  parseSellerOrderVersionEtag,
  type SellerOrderActionRequest,
  type SellerOrderDetailResponse,
  type SellerOrderListResponse,
} from '@shopee-clone/contracts';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuthOriginGuard } from '../auth/auth-origin.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { AuthenticationFailedError } from '../auth/auth.errors';
import { SellerOrderExceptionFilter } from './seller-order-exception.filter';
import { SellerOrderValidationError } from './seller-order.errors';
import { SellerOrderProjector } from './seller-order.projector';
import { SellerOrderService } from './seller-order.service';

@ApiTags('seller orders')
@ApiBearerAuth()
@Controller('seller/orders')
@UseFilters(SellerOrderExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('seller')
export class SellerOrdersController {
  constructor(
    @Inject(SellerOrderService) private readonly orders: SellerOrderService,
    @Inject(SellerOrderProjector) private readonly projector: SellerOrderProjector,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List orders owned by the authenticated seller shop' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'fulfillment', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'UTC date, inclusive' })
  @ApiQuery({ name: 'to', required: false, description: 'UTC date, inclusive' })
  @ApiQuery({ name: 'orderReference', required: false, format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'cursor', required: false })
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() rawQuery: Record<string, string | string[] | undefined>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SellerOrderListResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    const query = parseSellerOrderQueueQuery(rawQuery);
    if (!query) throw new SellerOrderValidationError(['query']);
    response.setHeader('Cache-Control', 'private, no-store');
    return this.orders.list(request.authUser.id, query);
  }

  @Get(':orderReference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Read one owner-scoped seller order and packing projection' })
  @ApiParam({ name: 'orderReference', format: 'uuid' })
  async detail(
    @Req() request: AuthenticatedRequest,
    @Param('orderReference') rawReference: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SellerOrderDetailResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    const orderReference = parseSellerOrderReference(rawReference);
    if (!orderReference) throw new SellerOrderValidationError(['orderReference']);
    const result = await this.orders.detail(request.authUser.id, orderReference);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'ETag',
      formatSellerOrderVersionEtag(
        result.order.summary.orderVersion,
        result.order.summary.fulfillmentVersion,
      ),
    );
    return result;
  }

  @Post(':orderReference/actions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthOriginGuard)
  @ApiOperation({ summary: 'Execute one idempotent seller fulfillment action' })
  @ApiParam({ name: 'orderReference', format: 'uuid' })
  @ApiHeader({ name: 'If-Match', required: true, example: '"seller-order-0-0"' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID idempotency key' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          enum: ['CONFIRM', 'START_PREPARING', 'MARK_READY_FOR_PICKUP', 'HAND_OFF', 'REJECT'],
        },
        reasonCode: {
          enum: [
            'OUT_OF_STOCK',
            'DAMAGED_OR_DEFECTIVE',
            'PRICE_OR_LISTING_ERROR',
            'CANNOT_FULFILL',
            'OTHER',
          ],
        },
        reasonNote: { type: 'string' },
      },
    },
  })
  async action(
    @Req() request: AuthenticatedRequest,
    @Param('orderReference') rawReference: string,
    @Headers('if-match') rawEtag: string | undefined,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SellerOrderDetailResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    const orderReference = parseSellerOrderReference(rawReference);
    const versions = parseSellerOrderVersionEtag(rawEtag);
    const idempotencyKey = parseSellerOrderIdempotencyKey(rawIdempotencyKey);
    const input = parseSellerOrderActionRequest(body);
    const invalid = [
      ...(!orderReference ? ['orderReference'] : []),
      ...(versions === null ? ['ifMatch'] : []),
      ...(!idempotencyKey ? ['idempotencyKey'] : []),
      ...(!input ? ['request'] : []),
    ];
    if (invalid.length > 0) throw new SellerOrderValidationError(invalid);
    const result = await this.orders.act(
      request.authUser.id,
      orderReference!,
      versions!.orderVersion,
      versions!.fulfillmentVersion,
      idempotencyKey!,
      input as SellerOrderActionRequest,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'ETag',
      formatSellerOrderVersionEtag(
        result.order.summary.orderVersion,
        result.order.summary.fulfillmentVersion,
      ),
    );
    return result;
  }
}
