import {
  parseOnlinePaymentCheckoutResponse,
  type OnlinePaymentCheckoutRequest,
  type OnlinePaymentCheckoutResponse,
  type PaymentInstructions,
  type PaymentNextAction,
  type PaymentStatusResponse,
  type PurchasePaymentStatus,
  type ShopOrderStatus,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { CheckoutService } from '../checkout/checkout.service';
import {
  CheckoutPurchaseNotFoundError,
  CheckoutUnavailableError,
  CheckoutValidationError,
  PaymentRetryNotAllowedError,
} from '../checkout/checkout.errors';
import { PrismaService } from '../prisma/prisma.service';
import { MOMO_CONFIG, type MomoConfig } from './momo.config';
import { VNPAY_CONFIG, type VnpayConfig } from './vnpay.config';
import { classifyMomoResultCode, MomoResultCodeMetrics } from './momo-result-code';
import { classifyVnpayResultCode } from './vnpay-result-code';
import { VnpayResultCodeMetrics } from './vnpay-result-code';
import { PaymentObservationService } from './payment-observation.service';
import type { CreatePaymentResult } from './payment-provider.port';
import {
  PAYMENT_PROVIDER_REGISTRY,
  type PaymentProviderRegistry,
} from './payment-provider.registry';
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
  provider: 'MOMO' | 'VNPAY',
): PaymentNextAction {
  if (status === 'PENDING')
    return instructions ? (provider === 'VNPAY' ? 'OPEN_VNPAY' : 'OPEN_MOMO') : 'WAIT';
  if (status === 'PENDING_RECONCILIATION' || status === 'UNKNOWN' || status === 'REFUND_PENDING') {
    return 'WAIT';
  }
  if (status === 'PAID' || status === 'REFUNDED') return 'DONE';
  if (status === 'PARTIALLY_REFUNDED') return 'CONTACT_SUPPORT';
  return 'CHECKOUT_AGAIN';
}

function orderNavigation(
  orders: readonly {
    id?: string;
    orderReference?: string;
    status: ShopOrderStatus;
    paymentStatus?: PurchasePaymentStatus;
  }[],
) {
  const singleOrderReference =
    orders.length === 1 ? (orders[0]?.id ?? orders[0]?.orderReference ?? null) : null;
  return {
    orderStatus: orders.length === 1 ? (orders[0]?.status ?? null) : null,
    orderStatuses: orders.map((order) => ({
      orderReference: order.id ?? order.orderReference ?? '',
      status: order.status,
      paymentStatus: order.paymentStatus ?? 'UNPAID',
    })),
    retryable: false,
    navigation: {
      kind: singleOrderReference ? ('ORDER' as const) : ('ORDERS' as const),
      orderReference: singleOrderReference,
    },
  };
}

function isTerminalPurchaseStatus(status: PurchasePaymentStatus): boolean {
  return [
    'PAID',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
    'REFUND_PENDING',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
  ].includes(status);
}

function sanitizeVnpayReturnFields(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CheckoutValidationError(['callback']);
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 64) {
    throw new CheckoutValidationError(['callback']);
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!/^vnp_[A-Za-z0-9_]{1,64}$/.test(key) || typeof value !== 'string' || value.length > 512) {
      throw new CheckoutValidationError(['callback']);
    }
    fields[key] = value;
  }
  return fields;
}

@Injectable()
export class OnlinePaymentService {
  constructor(
    @Inject(CheckoutService) private readonly checkout: CheckoutService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER_REGISTRY) private readonly providers: PaymentProviderRegistry,
    @Inject(MOMO_CONFIG) private readonly config: MomoConfig,
    @Inject(VNPAY_CONFIG) private readonly vnpayConfig: VnpayConfig,
    @Inject(MomoResultCodeMetrics) private readonly metrics: MomoResultCodeMetrics,
    @Inject(VnpayResultCodeMetrics) private readonly vnpayMetrics: VnpayResultCodeMetrics,
    @Inject(PaymentObservationService)
    private readonly observations: PaymentObservationService,
  ) {}

  async checkoutWithMomo(
    userId: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: OnlinePaymentCheckoutRequest,
    clientIp?: string,
  ): Promise<OnlinePaymentCheckoutResponse> {
    return this.checkoutWithProvider(
      'MOMO',
      userId,
      expectedVersion,
      idempotencyKey,
      input,
      clientIp,
    );
  }

  async checkoutWithVnpay(
    userId: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: OnlinePaymentCheckoutRequest,
    clientIp?: string,
  ): Promise<OnlinePaymentCheckoutResponse> {
    return this.checkoutWithProvider(
      'VNPAY',
      userId,
      expectedVersion,
      idempotencyKey,
      input,
      clientIp,
    );
  }

  async retryVnpayPayment(
    userId: string,
    paymentReference: string,
    idempotencyKey: string,
    clientIp?: string,
  ): Promise<OnlinePaymentCheckoutResponse> {
    void userId;
    void paymentReference;
    void idempotencyKey;
    void clientIp;
    throw new PaymentRetryNotAllowedError();
  }

  private async checkoutWithProvider(
    providerName: 'MOMO' | 'VNPAY',
    userId: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: OnlinePaymentCheckoutRequest,
    clientIp?: string,
  ): Promise<OnlinePaymentCheckoutResponse> {
    if (providerName === 'VNPAY' && !this.vnpayConfig.enabled) {
      throw new CheckoutUnavailableError();
    }
    const provider = this.providers.resolve(providerName);
    const paymentTtlSeconds =
      providerName === 'VNPAY' ? this.vnpayConfig.paymentTtlSeconds : this.config.paymentTtlSeconds;
    const intent = await this.checkout.createOnlinePendingIntent(
      userId,
      expectedVersion,
      idempotencyKey,
      input,
      providerName,
      paymentTtlSeconds,
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
    const replayedTerminalVnpay =
      providerName === 'VNPAY' &&
      intent.replayed &&
      isTerminalPurchaseStatus(intent.purchase.paymentStatus);
    if (replayedTerminalVnpay) {
      // A terminal VNPAY Purchase is immutable. Do not regenerate or submit
      // another provider payment session when an idempotent request is replayed.
      update = {
        status: 'PENDING_RECONCILIATION',
        resultCode: null,
        resultClass: 'TERMINAL_REPLAY_IGNORED',
        providerTransactionId: null,
        instructionsIssued: false,
      };
    } else {
      try {
        createResult = await provider.createPayment({
          provider: providerName,
          environment: 'SANDBOX',
          orderId: intent.attempt.orderId,
          requestId: intent.attempt.requestId,
          amountMinor: intent.attempt.amountMinor,
          currency: 'VND',
          orderInfo:
            providerName === 'VNPAY'
              ? 'Thanh toan don hang'
              : `Purchase ${intent.purchase.purchaseReference}`,
          redirectUrl:
            providerName === 'VNPAY'
              ? (this.vnpayConfig.returnUrl ?? FAKE_REDIRECT_URL)
              : (this.config.redirectUrl ?? FAKE_REDIRECT_URL),
          ipnUrl:
            providerName === 'VNPAY'
              ? (this.vnpayConfig.ipnUrl ??
                'https://sandbox.invalid/api/v1/payment-providers/vnpay/ipn')
              : (this.config.ipnUrl ?? FAKE_IPN_URL),
          expiresAt: intent.attempt.expiresAt,
          createdAt: intent.attempt.providerCreatedAt ?? intent.attempt.createdAt,
          clientIp,
        });
        const classification =
          providerName === 'VNPAY'
            ? classifyVnpayResultCode(createResult.resultCode, 'CREATE', this.vnpayMetrics)
            : classifyMomoResultCode(createResult.resultCode, 'CREATE', this.metrics);
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
    }

    const observation = await this.applyCreateUpdate(
      intent.attempt.id,
      intent.purchase.purchaseReference,
      update,
    );
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
        provider: providerName,
        paymentMethod: providerName,
        status: purchase.paymentStatus,
        amountMinor: Number(observation.amountMinor),
        currency: 'VND',
        expiresAt: observation.expiresAt.toISOString(),
        nextAction: nextAction(purchase.paymentStatus, instructions, providerName),
        instructions,
        ...orderNavigation(purchase.orders),
      },
    };
    const parsed = parseOnlinePaymentCheckoutResponse(response);
    if (!parsed) throw new CheckoutUnavailableError();
    return parsed;
  }

  async getPaymentStatus(userId: string, paymentReference: string): Promise<PaymentStatusResponse> {
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { publicReference: paymentReference, purchase: { buyerId: userId } },
      include: {
        purchase: {
          select: { orders: { select: { id: true, status: true, paymentStatus: true } } },
        },
      },
    });
    if (!attempt) throw new CheckoutPurchaseNotFoundError();
    const response: PaymentStatusResponse = {
      paymentReference: attempt.publicReference,
      purchaseReference: attempt.purchaseId,
      provider: attempt.provider,
      paymentMethod: attempt.provider,
      status: attempt.status,
      amountMinor: Number(attempt.amountMinor),
      currency: 'VND',
      expiresAt: attempt.expiresAt.toISOString(),
      nextAction: nextAction(attempt.status, null, attempt.provider),
      instructions: null,
      ...orderNavigation(attempt.purchase.orders),
    };
    return response;
  }

  async resolveVnpayPayment(
    userId: string,
    transactionReference: string,
  ): Promise<{ paymentReference: string; purchaseReference: string }> {
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: {
        provider: 'VNPAY',
        orderId: transactionReference,
        purchase: { buyerId: userId },
      },
      select: { publicReference: true, purchaseId: true },
    });
    if (!attempt) throw new CheckoutPurchaseNotFoundError();
    return { paymentReference: attempt.publicReference, purchaseReference: attempt.purchaseId };
  }

  async applyVnpayReturn(userId: string, rawFields: unknown): Promise<PaymentStatusResponse> {
    const fields = sanitizeVnpayReturnFields(rawFields);
    const provider = this.providers.resolve('VNPAY');
    const verified = provider.verifyNotification({
      fields,
      signature: fields.vnp_SecureHash ?? '',
      receivedAt: new Date(),
    });
    if (!verified.valid) throw new CheckoutValidationError(['callback']);

    const classification = classifyVnpayResultCode(
      verified.observation.resultCode,
      'OBSERVATION',
      this.vnpayMetrics,
    );
    if (!classification.final || classification.resultClass === 'SUCCESS') {
      throw new CheckoutValidationError(['callback']);
    }

    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: {
        provider: 'VNPAY',
        orderId: verified.observation.orderId,
        purchase: { buyerId: userId },
      },
      select: { publicReference: true },
    });
    if (!attempt) throw new CheckoutPurchaseNotFoundError();

    const result = await this.observations.applyProviderObservation({
      source: 'RETURN',
      observation: verified.observation,
      fingerprint: verified.fingerprint,
      sanitizedMetadata: verified.sanitizedMetadata,
    });
    if (result.decision === 'MISMATCH') throw new CheckoutValidationError(['callback']);
    return this.getPaymentStatus(userId, attempt.publicReference);
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
