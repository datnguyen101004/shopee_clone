import { randomUUID } from 'node:crypto';

import type {
  CheckoutConfirmationRequest,
  PurchasePaymentMethod,
  PurchasePaymentStatus,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import type { AppliedVoucherSnapshot } from '../vouchers/voucher-pricing.calculator';
import { SystemUtcClock } from '../vouchers/utc-clock';
import { fingerprintsEqual } from './checkout-canonical';
import { CheckoutAssembler } from './checkout-assembler';
import { CheckoutNotReadyError, CheckoutPreviewChangedError } from './checkout.errors';
import { OrderWriter, type WrittenPurchaseVouchers } from './order-writer';

export interface BuildCheckoutPurchaseInput {
  userId: string;
  expectedVersion: number;
  idempotencyKey: string;
  requestDigest: string;
  confirmation: CheckoutConfirmationRequest;
  paymentMethod: PurchasePaymentMethod;
  paymentStatus: PurchasePaymentStatus;
}

export interface BuiltCheckoutPurchase {
  purchaseId: string;
  reservationId: string;
  evaluatedAt: Date;
  appliedVouchers: readonly AppliedVoucherSnapshot[];
  writtenPurchaseVouchers: WrittenPurchaseVouchers;
  cartLineIds: readonly string[];
  payableTotalMinor: number;
}

@Injectable()
export class CheckoutPurchaseBuilder {
  constructor(
    @Inject(CheckoutAssembler) private readonly assembler: CheckoutAssembler,
    @Inject(OrderWriter) private readonly writer: OrderWriter,
    @Inject(SystemUtcClock) private readonly clock: SystemUtcClock,
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}

  async buildInTransaction(
    transaction: Prisma.TransactionClient,
    input: BuildCheckoutPurchaseInput,
  ): Promise<BuiltCheckoutPurchase> {
    const assembled = await this.assembler.assembleInTransaction(
      transaction,
      input.userId,
      input.expectedVersion,
      input.confirmation,
      this.clock.now(),
    );
    if (!assembled.preview.ready || assembled.preview.checkoutFingerprint === null) {
      throw new CheckoutNotReadyError(assembled.preview);
    }
    if (
      !fingerprintsEqual(
        assembled.preview.checkoutFingerprint,
        input.confirmation.checkoutFingerprint,
      )
    ) {
      throw new CheckoutPreviewChangedError(assembled.preview);
    }

    const purchaseId = randomUUID();
    const reservation = await this.inventory.reserveForCheckout(
      transaction,
      input.userId,
      input.expectedVersion,
      input.idempotencyKey,
      input.requestDigest,
      assembled.preview.shops.flatMap((shop) =>
        shop.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
      ),
    );
    const writtenPurchaseVouchers = await this.writer.write(transaction, {
      purchaseId,
      buyerId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestDigest: input.requestDigest,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
      preview: assembled.preview,
      applied: assembled.applied,
    });
    await this.inventory.attachToPurchaseInTransaction(
      transaction,
      reservation.id,
      input.userId,
      purchaseId,
    );

    return {
      purchaseId,
      reservationId: reservation.id,
      evaluatedAt: new Date(assembled.preview.evaluatedAt),
      appliedVouchers: assembled.applied,
      writtenPurchaseVouchers,
      cartLineIds: assembled.preview.shops.flatMap((shop) =>
        shop.lines.map(({ lineId }) => lineId),
      ),
      payableTotalMinor: assembled.preview.summary.payableTotalMinor,
    };
  }

  linkRedemptions(
    transaction: Prisma.TransactionClient,
    purchaseId: string,
    written: WrittenPurchaseVouchers,
    redemptions: readonly { id: string; voucherId: string }[],
  ): Promise<void> {
    return this.writer.linkRedemptions(transaction, purchaseId, written, redemptions);
  }
}
