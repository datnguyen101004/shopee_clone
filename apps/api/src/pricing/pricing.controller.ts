import type { PricingQuoteResponse } from '@shopee-clone/contracts';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { AuthenticationFailedError } from '../auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { PricingQuoteDto } from './pricing.dto';
import { PricingExceptionFilter } from './pricing-exception.filter';
import { PricingConflictError } from './pricing.errors';
import { PricingQuoteService } from './pricing-quote.service';

function expectedVersion(value: string | undefined): number {
  const match = /^"cart-(0|[1-9][0-9]*)"$/.exec(value ?? '');
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version)) throw new PricingConflictError();
  return version;
}

@ApiTags('authoritative pricing')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Strict quote validation failed' })
@ApiResponse({ status: 401, description: 'A valid buyer session is required' })
@ApiResponse({ status: 403, description: 'Mutation browser origin is not allowed' })
@ApiResponse({ status: 404, description: 'Owned active shipping address was not found' })
@ApiResponse({ status: 409, description: 'Cart ETag is missing, malformed, or stale' })
@ApiResponse({ status: 503, description: 'A quote could not be calculated safely' })
@Controller('cart')
@UseFilters(PricingExceptionFilter)
@UseGuards(AuthGuard)
export class PricingController {
  constructor(@Inject(PricingQuoteService) private readonly pricing: PricingQuoteService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Calculate an itemized authoritative quote for the current selected cart',
  })
  @ApiHeader({ name: 'If-Match', required: true, example: '"cart-7"' })
  @ApiBody({ type: PricingQuoteDto })
  @ApiOkResponse({
    description: 'Validated pricing-v1 merchandise and mock-v1 per-shop shipping quote',
    schema: {
      type: 'object',
      required: [
        'pricingVersion',
        'shippingVersion',
        'currency',
        'cartVersion',
        'address',
        'shops',
        'exclusions',
        'summary',
      ],
      properties: {
        pricingVersion: { type: 'string', enum: ['pricing-v1'] },
        shippingVersion: { type: 'string', enum: ['mock-v1'] },
        currency: { type: 'string', enum: ['VND'] },
        cartVersion: { type: 'integer', minimum: 0 },
        address: {
          type: 'object',
          required: ['id', 'province', 'district'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            province: { type: 'string' },
            district: { type: 'string' },
          },
        },
        shops: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'shop',
              'lines',
              'shipping',
              'listSubtotalMinor',
              'productDiscountMinor',
              'merchandiseSubtotalMinor',
              'payableTotalMinor',
            ],
            properties: {
              shop: {
                type: 'object',
                required: ['id', 'slug', 'name'],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  slug: { type: 'string' },
                  name: { type: 'string' },
                },
              },
              lines: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  required: [
                    'lineId',
                    'productId',
                    'variantId',
                    'quantity',
                    'unitWeightGrams',
                    'shipmentWeightGrams',
                    'listUnitPriceMinor',
                    'sellingUnitPriceMinor',
                    'listSubtotalMinor',
                    'productDiscountMinor',
                    'merchandiseSubtotalMinor',
                  ],
                  properties: {
                    lineId: { type: 'string', format: 'uuid' },
                    productId: { type: 'string', format: 'uuid' },
                    variantId: { type: 'string', format: 'uuid' },
                    quantity: { type: 'integer', minimum: 1 },
                    unitWeightGrams: { type: 'integer', minimum: 1 },
                    shipmentWeightGrams: { type: 'integer', minimum: 1 },
                    listUnitPriceMinor: { type: 'integer', minimum: 0 },
                    sellingUnitPriceMinor: { type: 'integer', minimum: 0 },
                    listSubtotalMinor: { type: 'integer', minimum: 0 },
                    productDiscountMinor: { type: 'integer', minimum: 0 },
                    merchandiseSubtotalMinor: { type: 'integer', minimum: 0 },
                  },
                },
              },
              shipping: {
                type: 'object',
                required: [
                  'provider',
                  'version',
                  'shopId',
                  'originProvince',
                  'destinationProvince',
                  'zone',
                  'shipmentWeightGrams',
                  'service',
                  'estimatedDaysMin',
                  'estimatedDaysMax',
                  'baseFeeMinor',
                  'zoneSurchargeMinor',
                  'weightSurchargeMinor',
                  'shippingFeeMinor',
                ],
                properties: {
                  provider: { type: 'string', enum: ['MOCK'] },
                  version: { type: 'string', enum: ['mock-v1'] },
                  shopId: { type: 'string', format: 'uuid' },
                  originProvince: { type: 'string' },
                  destinationProvince: { type: 'string' },
                  zone: {
                    type: 'string',
                    enum: ['SAME_PROVINCE', 'SAME_REGION', 'CROSS_REGION', 'UNKNOWN'],
                  },
                  shipmentWeightGrams: { type: 'integer', minimum: 1 },
                  service: { type: 'string', enum: ['ECONOMY', 'STANDARD', 'EXPRESS'] },
                  estimatedDaysMin: { type: 'integer', minimum: 1 },
                  estimatedDaysMax: { type: 'integer', minimum: 1 },
                  baseFeeMinor: { type: 'integer', minimum: 0 },
                  zoneSurchargeMinor: { type: 'integer', minimum: 0 },
                  weightSurchargeMinor: { type: 'integer', minimum: 0 },
                  shippingFeeMinor: { type: 'integer', minimum: 0 },
                },
              },
              listSubtotalMinor: { type: 'integer', minimum: 0 },
              productDiscountMinor: { type: 'integer', minimum: 0 },
              merchandiseSubtotalMinor: { type: 'integer', minimum: 0 },
              payableTotalMinor: { type: 'integer', minimum: 0 },
            },
          },
        },
        exclusions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['lineId', 'code', 'message'],
            properties: {
              lineId: { type: 'string', format: 'uuid' },
              code: { type: 'string', enum: ['unavailable', 'insufficient-stock'] },
              message: { type: 'string' },
            },
          },
        },
        summary: {
          type: 'object',
          required: [
            'selectedLineCount',
            'selectedQuantity',
            'listSubtotalMinor',
            'productDiscountMinor',
            'merchandiseSubtotalMinor',
            'shippingTotalMinor',
            'payableTotalMinor',
          ],
          properties: {
            selectedLineCount: { type: 'integer', minimum: 0 },
            selectedQuantity: { type: 'integer', minimum: 0 },
            listSubtotalMinor: { type: 'integer', minimum: 0 },
            productDiscountMinor: { type: 'integer', minimum: 0 },
            merchandiseSubtotalMinor: { type: 'integer', minimum: 0 },
            shippingTotalMinor: { type: 'integer', minimum: 0 },
            payableTotalMinor: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
  })
  async quote(
    @Req() request: AuthenticatedRequest,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: PricingQuoteDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PricingQuoteResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    const quote = await this.pricing.quote(
      request.authUser.id,
      expectedVersion(ifMatch),
      input.shippingAddressId,
      input.services ?? [],
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', `"cart-${quote.cartVersion}"`);
    return quote;
  }
}
