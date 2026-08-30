import {
  parseOnlinePaymentCheckoutResponse,
  type OnlinePaymentCheckoutRequest,
  type OnlinePaymentCheckoutResponse,
  type PaymentInstructions,
  type PaymentNextAction,
  type PaymentStatusResponse,
  type PurchasePaymentStatus,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { CheckoutService } from '../checkout/checkout.service';
import { CheckoutUnavailableError } from '../checkout/checkout.errors';
import { CheckoutPurchaseNotFoundError } from '../checkout/checkout.errors';
import { PrismaService } from '../prisma/prisma.service';
import { MOMO_CONFIG, type MomoConfig } from './momo.config';
import { classifyMomoResultCode, MomoResultCodeMetrics } from './momo-result-code';
import { PAYMENT_PROVIDER, type CreatePaymentResult, type PaymentProvider } from './payment-provider.port';
import { PaymentProviderError } from './payment-result';

const FAKE_IPN_URL = 'https://sandbox.invalid/api/v1/payment-providers/momo/ipn';
const FAKE_REDIRECT_URL = 'https://sandbox.invalid/checkout/payment/result';

interface CreateUpdate {
  status: 'PENDING' | 'PENDING_RECONCILIATION';
  resultCode: number | null;
  resultClass: string;
  providerTransactionId: bigint | null;
  instructionsIssued: boolean;
}

function nextAction(
  status: PurchasePaymentStatus,
  instructions: PaymentInstructions | null,
): PaymentNextAction {
  if (status === 'PENDING') return instructions ? 'OPEN_MOMO' : 'WAIT';
  if (status === 'PENDING_RECONCILIATION' || status === 'UNKNOWN' || status === 'REFUND_PENDING') {
    return 'WAIT';
  }
  if (status === 'PAID' || status === 'REFUNDED') return 'DONE';
  if (status === 'PARTIALLY_REFUNDED') return 'CONTACT_SUPPORT';
  return 'CHECKOUT_AGAIN';
}

@Injectable()
export class OnlinePaymentService {
  constructor(
    @Inject(CheckoutService) private readonly checkout: CheckoutService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(MOMO_CONFIG) private readonly config: MomoConfig,
    @Inject(MomoResultCodeMetrics) private readonly metrics: MomoResultCodeMetrics,
  ) {}

  async checkoutWithMomo(
    userId: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: OnlinePaymentCheckoutRequest,
  ): Promise<OnlinePaymentCheckoutResponse> {
    const intent = await this.checkout.createMomoPendingIntent(
      userId,
      expectedVersion,
      idempotencyKey,
      input,
      this.config.paymentTtlSeconds,
    );

    const requestedAt = new Date();
    await this.prisma.paymentAttempt.updateMany({
      where: {
        id: intent.attempt.id,
        status: { in: ['PENDING', 'UNKNOWN', 'PENDING_RECONCILIATION'] },
        createRequestedAt: null,
      },
      data: { createRequestedAt: requestedAt, version: { increment: 1 } },
    });

    let createResult: CreatePaymentResult | null = null;
    let update: CreateUpdate;
    try {
      createResult = await this.provider.createPayment({
        provider: 'MOMO',
        environment: 'SANDBOX',
        orderId: intent.attempt.orderId,
        requestId: intent.attempt.requestId,
        amountMinor: intent.attempt.amountMinor,
        currency: 'VND',
        orderInfo: `Purchase ${intent.purchase.purchaseReference}`,
        redirectUrl: this.config.redirectUrl ?? FAKE_REDIRECT_URL,
        ipnUrl: this.config.ipnUrl ?? FAKE_IPN_URL,
        expiresAt: intent.attempt.expiresAt,
      });
      const classification = classifyMomoResultCode(createResult.resultCode, 'CREATE', this.metrics);
      update = {
        status: createResult.paymentStatus,
        resultCode: createResult.resultCode,
        resultClass: classification.resultClass,
        providerTransactionId: createResult.providerTransactionId,
        instructionsIssued: createResult.paymentStatus === 'PENDING',
      };
    } catch (error) {
      update = {
        status: 'PENDING_RECONCILIATION',
        resultCode: null,
        resultClass: error instanceof PaymentProviderError ? error.code : 'PROVIDER_UNKNOWN',
        providerTransactionId: null,
        instructionsIssued: false,
      };
    }

    const observation = await this.applyCreateUpdate(intent.attempt.id, intent.purchase.purchaseReference, update);
    const purchase = await this.checkout.getPurchase(userId, intent.purchase.purchaseReference);
    const instructions =
      observation.applied &&
      observation.status === 'PENDING' &&
      createResult !== null &&
      update.instructionsIssued
        ? {
            payUrl: createResult.instructions.payUrl,
            deeplink: createResult.instructions.deeplink,
            qrCodeValue: createResult.instructions.qrCodeUrl,
          }
        : null;
    const response: OnlinePaymentCheckoutResponse = {
      replayed: intent.replayed,
      purchase,
      payment: {
        paymentReference: observation.publicReference,
        purchaseReference: purchase.purchaseReference,
        provider: 'MOMO',
        paymentMethod: 'MOMO',
        status: purchase.paymentStatus,
        amountMinor: Number(observation.amountMinor),
        currency: 'VND',
        expiresAt: observation.expiresAt.toISOString(),
        nextAction: nextAction(purchase.paymentStatus, instructions),
        instructions,
      },
    };
    const parsed = parseOnlinePaymentCheckoutResponse(response);
    if (!parsed) throw new CheckoutUnavailableError();
    return parsed;
  }

  async getPaymentStatus(userId: string, paymentReference: string): Promise<PaymentStatusResponse> {
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { publicReference: paymentReference, purchase: { buyerId: userId } },
    });
    if (!attempt) throw new CheckoutPurchaseNotFoundError();
    const response: PaymentStatusResponse = {
      paymentReference: attempt.publicReference,
      purchaseReference: attempt.purchaseId,
      provider: 'MOMO',
      paymentMethod: 'MOMO',
      status: attempt.status,
      amountMinor: Number(attempt.amountMinor),
      currency: 'VND',
      expiresAt: attempt.expiresAt.toISOString(),
      nextAction: nextAction(attempt.status, null),
      instructions: null,
    };
    return response;
  }

  private async applyCreateUpdate(
    attemptId: string,
    purchaseId: string,
    update: CreateUpdate,
  ): Promise<{
    applied: boolean;
    publicReference: string;
    amountMinor: bigint;
    status: PurchasePaymentStatus;
    expiresAt: Date;
  }> {
    return this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      const changed = await transaction.paymentAttempt.updateMany({
        where: { id: attemptId, purchaseId, status: 'PENDING' },
        data: {
          status: update.status,
          lastResultCode: update.resultCode,
          lastResultClass: update.resultClass,
          ...(update.providerTransactionId === null
            ? {}
            : { providerTransactionId: update.providerTransactionId }),
          lastObservedAt: now,
          ...(update.instructionsIssued ? { instructionsIssuedAt: now } : {}),
          ...(update.status === 'PENDING_RECONCILIATION' ? { nextReconcileAt: now } : {}),
          version: { increment: 1 },
        },
      });
      if (changed.count === 1 && update.status !== 'PENDING') {
        await transaction.purchase.updateMany({
          where: { id: purchaseId, paymentStatus: 'PENDING' },
          data: { paymentStatus: update.status },
        });
        await transaction.shopOrder.updateMany({
          where: { purchaseId, paymentStatus: 'PENDING' },
          data: { paymentStatus: update.status },
        });
      }
      const current = await transaction.paymentAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        select: {
          publicReference: true,
          amountMinor: true,
          status: true,
          expiresAt: true,
        },
      });
      return { applied: changed.count === 1, ...current };
    });
  }
}
