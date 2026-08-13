import type { CartMutationResponse, CartResponse } from '@shopee-clone/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { AuthenticationFailedError } from '../auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AddCartItemDto, UpdateCartQuantityDto, UpdateCartSelectionDto } from './cart.dto';
import { CartValidationError } from './cart.errors';
import { CartExceptionFilter } from './cart-exception.filter';
import { CartService, type MutationResult } from './cart.service';

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function expectedVersion(value: string | undefined): number {
  const match = /^"cart-(0|[1-9][0-9]*)"$/.exec(value ?? '');
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version)) throw new CartValidationError(['ifMatch']);
  return version;
}

function canonicalId(value: string, parameter: string): string {
  if (!canonicalUuid.test(value)) throw new CartValidationError([parameter]);
  return value;
}

@ApiTags('shopping cart')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'A valid buyer session is required' })
@ApiResponse({ status: 400, description: 'Strict cart request validation failed' })
@ApiResponse({ status: 403, description: 'Mutation browser origin is not allowed' })
@ApiResponse({ status: 409, description: 'Stale cart version or commerce conflict' })
@ApiResponse({ status: 503, description: 'Cart persistence is temporarily unavailable' })
@Controller('cart')
@UseFilters(CartExceptionFilter)
@UseGuards(AuthGuard)
export class CartController {
  constructor(@Inject(CartService) private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: "Read the authenticated buyer's multi-shop cart" })
  async read(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartResponse> {
    const cart = await this.cart.read(this.userId(request));
    this.setCartHeaders(response, cart.version);
    return cart;
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add or merge one canonical product variant' })
  @ApiBody({ type: AddCartItemDto })
  async add(
    @Req() request: AuthenticatedRequest,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: AddCartItemDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartMutationResponse> {
    const result = await this.cart.add(
      this.userId(request),
      expectedVersion(ifMatch),
      input.variantId,
      input.quantity,
    );
    return this.finish(response, result);
  }

  @Patch('items/:lineId')
  @ApiOperation({ summary: 'Set an owned cart-line quantity' })
  @ApiBody({ type: UpdateCartQuantityDto })
  async updateQuantity(
    @Req() request: AuthenticatedRequest,
    @Param('lineId') lineId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: UpdateCartQuantityDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartMutationResponse> {
    return this.finish(
      response,
      await this.cart.updateQuantity(
        this.userId(request),
        expectedVersion(ifMatch),
        canonicalId(lineId, 'lineId'),
        input.quantity,
      ),
    );
  }

  @Delete('items/:lineId')
  @ApiOperation({ summary: 'Idempotently remove an owned cart line' })
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('lineId') lineId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartMutationResponse> {
    return this.finish(
      response,
      await this.cart.remove(
        this.userId(request),
        expectedVersion(ifMatch),
        canonicalId(lineId, 'lineId'),
      ),
    );
  }

  @Put('items/:lineId/selection')
  @ApiOperation({ summary: 'Set selection for one cart line' })
  @ApiBody({ type: UpdateCartSelectionDto })
  async selectLine(
    @Req() request: AuthenticatedRequest,
    @Param('lineId') lineId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: UpdateCartSelectionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartMutationResponse> {
    return this.finish(
      response,
      await this.cart.selectLine(
        this.userId(request),
        expectedVersion(ifMatch),
        canonicalId(lineId, 'lineId'),
        input.selected,
      ),
    );
  }

  @Put('shops/:shopId/selection')
  @ApiOperation({ summary: 'Set selection for every eligible line in one shop' })
  @ApiBody({ type: UpdateCartSelectionDto })
  async selectShop(
    @Req() request: AuthenticatedRequest,
    @Param('shopId') shopId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: UpdateCartSelectionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartMutationResponse> {
    return this.finish(
      response,
      await this.cart.selectShop(
        this.userId(request),
        expectedVersion(ifMatch),
        canonicalId(shopId, 'shopId'),
        input.selected,
      ),
    );
  }

  @Put('selection')
  @ApiOperation({ summary: 'Set selection for every eligible cart line' })
  @ApiBody({ type: UpdateCartSelectionDto })
  async selectAll(
    @Req() request: AuthenticatedRequest,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: UpdateCartSelectionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartMutationResponse> {
    return this.finish(
      response,
      await this.cart.selectAll(this.userId(request), expectedVersion(ifMatch), input.selected),
    );
  }

  private userId(request: AuthenticatedRequest): string {
    if (!request.authUser) throw new AuthenticationFailedError();
    return request.authUser.id;
  }

  private finish(response: Response, result: MutationResult): CartMutationResponse {
    this.setCartHeaders(response, result.response.cart.version);
    return result.response;
  }

  private setCartHeaders(response: Response, version: number): void {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', `"cart-${version}"`);
  }
}
