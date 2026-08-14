import {
  CHECKOUT_VERSION,
  type CheckoutBlocker,
  type CheckoutPreviewRequest,
  type CheckoutPreviewResponse,
  type CheckoutPreviewShop,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PricingQuoteService,
  type PricingCalculationResult,
} from '../pricing/pricing-quote.service';
import { SystemUtcClock } from '../vouchers/utc-clock';
import { checkoutFingerprint } from './checkout-canonical';
import { CheckoutUnavailableError, CheckoutValidationError } from './checkout.errors';

export interface AssembledCheckout {
  preview: CheckoutPreviewResponse;
  applied: PricingCalculationResult['applied'];
}

@Injectable()
export class CheckoutAssembler {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PricingQuoteService) private readonly pricing: PricingQuoteService,
    @Inject(SystemUtcClock) private readonly clock: SystemUtcClock,
  ) {}

  async preview(
    userId: string,
    expectedVersion: number,
    input: CheckoutPreviewRequest,
  ): Promise<CheckoutPreviewResponse> {
    return this.prisma.$transaction(
      async (transaction) =>
        (
          await this.assembleInTransaction(
            transaction,
            userId,
            expectedVersion,
            input,
            this.clock.now(),
          )
        ).preview,
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async assembleInTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    expectedVersion: number,
    input: CheckoutPreviewRequest,
    evaluatedAt: Date,
  ): Promise<AssembledCheckout> {
    const calculated = await this.pricing.calculateInTransaction(transaction, {
      userId,
      expectedVersion,
      shippingAddressId: input.shippingAddressId,
      services: input.services,
      vouchers: input.vouchers,
      evaluatedAt,
    });
    const shopIds = new Set(calculated.quote.shops.map(({ shop }) => shop.id));
    for (const note of input.notes ?? []) {
      if (!shopIds.has(note.shopId)) throw new CheckoutValidationError(['notes']);
    }
    const factsByLine = new Map(calculated.facts.lines.map((line) => [line.lineId, line]));
    const noteByShop = new Map((input.notes ?? []).map(({ shopId, note }) => [shopId, note]));
    const shops: CheckoutPreviewShop[] = calculated.quote.shops.map((shop) => ({
      ...shop,
      note: noteByShop.get(shop.shop.id) ?? '',
      lines: shop.lines.map((line) => {
        const fact = factsByLine.get(line.lineId);
        if (!fact) throw new CheckoutUnavailableError();
        return { ...line, ...fact };
      }),
    }));
    const blockers: CheckoutBlocker[] = [];
    if (calculated.quote.summary.selectedLineCount === 0) {
      blockers.push({
        code: 'EMPTY_SELECTION',
        message: 'Chưa có sản phẩm hợp lệ nào được chọn để thanh toán.',
        shopId: null,
        lineId: null,
        voucherCode: null,
      });
    }
    for (const exclusion of calculated.quote.exclusions) {
      blockers.push({
        code: 'LINE_UNAVAILABLE',
        message: exclusion.message,
        shopId: null,
        lineId: exclusion.lineId,
        voucherCode: null,
      });
    }
    for (const voucher of calculated.quote.vouchers.filter(({ status }) => status === 'REJECTED')) {
      blockers.push({
        code: 'VOUCHER_REJECTED',
        message: `Mã ${voucher.code} không còn đủ điều kiện áp dụng.`,
        shopId: voucher.shopId,
        lineId: null,
        voucherCode: voucher.code,
      });
    }
    const services = new Set(input.services.map(({ shopId }) => shopId));
    for (const shop of shops) {
      if (!services.has(shop.shop.id)) {
        blockers.push({
          code: 'MISSING_SHIPPING_SERVICE',
          message: `Hãy chọn phương thức vận chuyển cho ${shop.shop.name}.`,
          shopId: shop.shop.id,
          lineId: null,
          voucherCode: null,
        });
      }
    }
    const base: CheckoutPreviewResponse = {
      checkoutVersion: CHECKOUT_VERSION,
      pricingVersion: calculated.quote.pricingVersion,
      voucherVersion: calculated.quote.voucherVersion,
      shippingVersion: calculated.quote.shippingVersion,
      currency: calculated.quote.currency,
      evaluatedAt: calculated.quote.evaluatedAt,
      cartVersion: calculated.quote.cartVersion,
      ready: blockers.length === 0,
      checkoutFingerprint: null,
      address: calculated.facts.address,
      shops,
      vouchers: calculated.quote.vouchers,
      exclusions: calculated.quote.exclusions,
      blockers,
      summary: calculated.quote.summary,
    };
    return {
      preview: {
        ...base,
        checkoutFingerprint: base.ready ? checkoutFingerprint(base) : null,
      },
      applied: calculated.applied,
    };
  }
}
