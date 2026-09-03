import { createHash } from 'node:crypto';

import type {
  CreatePaymentCommand,
  CreatePaymentResult,
  NotificationFieldValue,
  NotificationVerificationResult,
  PaymentCorrelation,
  PaymentProvider,
  ProviderNotificationEnvelope,
  ProviderOperationResult,
  QueryPaymentCommand,
  QueryPaymentResult,
  QueryRefundCommand,
  QueryRefundResult,
  RefundPaymentCommand,
  RefundPaymentResult,
} from './payment-provider.port';
import {
  ProviderMalformedResponseError,
  ProviderMismatchError,
  ProviderTimeoutError,
} from './payment-result';

export const FAKE_NOTIFICATION_SIGNATURE = 'a'.repeat(64);

export type FakePaymentOutcome =
  'SUCCESS' | 'PENDING' | 'FAILURE' | 'CANCELLED' | 'EXPIRED' | 'TIMEOUT' | 'MALFORMED';

export interface FakeOperationBehavior {
  outcome: FakePaymentOutcome;
  delayMs?: number;
  resultCode?: number;
  providerTransactionId?: bigint;
}

export interface FakeNotificationPlan {
  outcome: Exclude<FakePaymentOutcome, 'TIMEOUT' | 'MALFORMED'>;
  deliverAfterMs: number;
  duplicateCount?: number;
  resultCode?: number;
  providerTransactionId?: bigint;
}

export interface FakePaymentProviderOptions {
  create?: FakeOperationBehavior;
  query?: FakeOperationBehavior;
  refund?: FakeOperationBehavior;
  refundQuery?: FakeOperationBehavior;
  notifications?: readonly FakeNotificationPlan[];
}

export interface FakeScheduledNotification {
  deliverAfterMs: number;
  envelope: ProviderNotificationEnvelope;
}

const defaultBehavior: FakeOperationBehavior = { outcome: 'SUCCESS' };

const resultCodes: Readonly<Record<Exclude<FakePaymentOutcome, 'TIMEOUT' | 'MALFORMED'>, number>> =
  {
    SUCCESS: 0,
    PENDING: 1000,
    FAILURE: 99,
    CANCELLED: 1017,
    EXPIRED: 1005,
  };

const vnpayResultCodes: Readonly<
  Record<Exclude<FakePaymentOutcome, 'TIMEOUT' | 'MALFORMED'>, number>
> = {
  SUCCESS: 0,
  PENDING: 99,
  FAILURE: 99,
  CANCELLED: 24,
  EXPIRED: 11,
};

function validDelay(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0 || value > 60_000) {
    throw new RangeError('Fake provider delay must be an integer between 0 and 60000');
  }
  return value;
}

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds === 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function bigintField(value: NotificationFieldValue | undefined): bigint | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  return null;
}

function integerField(value: NotificationFieldValue | undefined): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^-?(0|[1-9][0-9]*)$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function stableProviderTransactionId(correlation: PaymentCorrelation): bigint {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        correlation.provider,
        correlation.environment,
        correlation.orderId,
        correlation.requestId,
      ]),
    )
    .digest();
  const positiveSignedBigInt = digest.readBigUInt64BE(0) & 0x7fff_ffff_ffff_ffffn;
  return positiveSignedBigInt === 0n ? 1n : positiveSignedBigInt;
}

export class FakePaymentProvider implements PaymentProvider {
  readonly createCalls: CreatePaymentCommand[] = [];
  readonly queryCalls: QueryPaymentCommand[] = [];
  readonly refundCalls: RefundPaymentCommand[] = [];
  readonly refundQueryCalls: QueryRefundCommand[] = [];

  private readonly options: FakePaymentProviderOptions;
  private readonly correlations = new Map<string, PaymentCorrelation>();
  private readonly refundCorrelations = new Map<string, PaymentCorrelation>();

  constructor(options: FakePaymentProviderOptions = {}) {
    this.options = options;
  }

  async createPayment(command: CreatePaymentCommand): Promise<CreatePaymentResult> {
    this.createCalls.push(command);
    this.correlations.set(command.orderId, command);
    const result = await this.execute(command, this.options.create ?? defaultBehavior);
    return {
      ...result,
      paymentStatus:
        result.resultCode === 0 || result.resultCode === 1000
          ? 'PENDING'
          : 'PENDING_RECONCILIATION',
      instructions: {
        payUrl:
          command.provider === 'VNPAY'
            ? `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?fake=${command.orderId}`
            : `https://test-payment.momo.vn/fake/${command.orderId}`,
        deeplink: command.provider === 'VNPAY' ? null : `momo://fake/${command.orderId}`,
        qrCodeUrl:
          command.provider === 'VNPAY'
            ? null
            : `https://test-payment.momo.vn/fake/qr/${command.orderId}`,
      },
    };
  }

  async queryPayment(command: QueryPaymentCommand): Promise<QueryPaymentResult> {
    this.queryCalls.push(command);
    const correlation = this.correlations.get(command.orderId);
    if (!correlation || correlation.requestId !== command.requestId) {
      throw new ProviderMismatchError('Fake query does not match a known payment');
    }
    return this.execute(correlation, this.options.query ?? defaultBehavior);
  }

  async refundPayment(command: RefundPaymentCommand): Promise<RefundPaymentResult> {
    this.refundCalls.push(command);
    this.refundCorrelations.set(command.orderId, command);
    const result = await this.execute(command, this.options.refund ?? defaultBehavior);
    return { ...result, originalProviderTransactionId: command.providerTransactionId };
  }

  async queryRefund(command: QueryRefundCommand): Promise<QueryRefundResult> {
    this.refundQueryCalls.push(command);
    const correlation = this.refundCorrelations.get(command.orderId);
    if (!correlation || correlation.requestId !== command.requestId) {
      throw new ProviderMismatchError('Fake refund query does not match a known refund');
    }
    return this.execute(
      correlation,
      this.options.refundQuery ?? this.options.refund ?? defaultBehavior,
    );
  }

  verifyNotification(envelope: ProviderNotificationEnvelope): NotificationVerificationResult {
    if (envelope.signature !== FAKE_NOTIFICATION_SIGNATURE) {
      return { valid: false, reason: 'INVALID_SIGNATURE' };
    }

    const vnpayReference = envelope.fields.vnp_TxnRef;
    if (typeof vnpayReference === 'string') {
      const rawAmount = bigintField(envelope.fields.vnp_Amount);
      const rawResponseCode = envelope.fields.vnp_ResponseCode;
      const responseCode =
        typeof rawResponseCode === 'string' && /^\d{2}$/.test(rawResponseCode)
          ? Number(rawResponseCode)
          : integerField(rawResponseCode);
      const transaction = bigintField(envelope.fields.vnp_TransactionNo);
      if (rawAmount === null || rawAmount % 100n !== 0n || responseCode === null) {
        return { valid: false, reason: 'INVALID_AMOUNT' };
      }
      const resultCode =
        responseCode === 0 && envelope.fields.vnp_TransactionStatus === '00' ? 0 : responseCode;
      return {
        valid: true,
        observation: {
          provider: 'VNPAY',
          environment: 'SANDBOX',
          orderId: vnpayReference,
          requestId: vnpayReference,
          amountMinor: rawAmount / 100n,
          currency: 'VND',
          resultCode,
          message: null,
          providerTransactionId: transaction,
          observedAt: envelope.receivedAt,
        },
        fingerprint: createHash('sha256')
          .update(JSON.stringify(Object.entries(envelope.fields).sort()))
          .digest('hex'),
        sanitizedMetadata: {
          responseCode,
          transactionStatus: envelope.fields.vnp_TransactionStatus ?? null,
        },
      };
    }

    const orderId = envelope.fields.orderId;
    const requestId = envelope.fields.requestId;
    const amountMinor = bigintField(envelope.fields.amount);
    const resultCode = integerField(envelope.fields.resultCode);
    const providerTransactionId = bigintField(envelope.fields.transId);
    if (
      typeof orderId !== 'string' ||
      typeof requestId !== 'string' ||
      amountMinor === null ||
      resultCode === null
    ) {
      return { valid: false, reason: 'MALFORMED' };
    }

    const sanitizedMetadata = { resultCode, transId: providerTransactionId?.toString() ?? null };
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify(
          Object.entries(envelope.fields).sort(([left], [right]) => left.localeCompare(right)),
        ),
      )
      .digest('hex');

    return {
      valid: true,
      observation: {
        provider: 'MOMO',
        environment: 'SANDBOX',
        orderId,
        requestId,
        amountMinor,
        currency: 'VND',
        resultCode,
        message: null,
        providerTransactionId,
        observedAt: envelope.receivedAt,
      },
      fingerprint,
      sanitizedMetadata,
    };
  }

  buildNotificationSchedule(correlation: PaymentCorrelation): FakeScheduledNotification[] {
    const scheduled = (this.options.notifications ?? []).flatMap((plan, sequence) => {
      const duplicateCount = plan.duplicateCount ?? 1;
      if (!Number.isSafeInteger(duplicateCount) || duplicateCount < 1 || duplicateCount > 10) {
        throw new RangeError('Fake notification duplicateCount must be between 1 and 10');
      }
      const deliverAfterMs = validDelay(plan.deliverAfterMs);
      return Array.from({ length: duplicateCount }, (_, duplicate) => ({
        sequence,
        duplicate,
        deliverAfterMs,
        envelope: this.notificationEnvelope(correlation, plan),
      }));
    });

    return scheduled
      .sort(
        (left, right) =>
          left.deliverAfterMs - right.deliverAfterMs ||
          left.sequence - right.sequence ||
          left.duplicate - right.duplicate,
      )
      .map(({ deliverAfterMs, envelope }) => ({ deliverAfterMs, envelope }));
  }

  private async execute(
    correlation: PaymentCorrelation,
    behavior: FakeOperationBehavior,
  ): Promise<ProviderOperationResult> {
    await delay(validDelay(behavior.delayMs));
    if (behavior.outcome === 'TIMEOUT') {
      throw new ProviderTimeoutError('Fake provider timeout');
    }
    if (behavior.outcome === 'MALFORMED') {
      throw new ProviderMalformedResponseError('Fake provider malformed response');
    }
    return {
      ...correlation,
      resultCode:
        behavior.resultCode ??
        (correlation.provider === 'VNPAY'
          ? vnpayResultCodes[behavior.outcome]
          : resultCodes[behavior.outcome]),
      message: `fake:${behavior.outcome.toLowerCase()}`,
      providerTransactionId:
        behavior.providerTransactionId ?? stableProviderTransactionId(correlation),
      observedAt: new Date(),
    };
  }

  private notificationEnvelope(
    correlation: PaymentCorrelation,
    plan: FakeNotificationPlan,
  ): ProviderNotificationEnvelope {
    if (correlation.provider === 'VNPAY') {
      return {
        fields: {
          vnp_Amount: (correlation.amountMinor * 100n).toString(),
          vnp_Command: 'pay',
          vnp_CurrCode: 'VND',
          vnp_ResponseCode: String(plan.resultCode ?? vnpayResultCodes[plan.outcome]).padStart(
            2,
            '0',
          ),
          vnp_TmnCode: 'FAKE_VNPAY',
          vnp_TransactionNo: (
            plan.providerTransactionId ?? stableProviderTransactionId(correlation)
          ).toString(),
          vnp_TransactionStatus: plan.outcome === 'SUCCESS' ? '00' : '02',
          vnp_TxnRef: correlation.orderId,
        },
        signature: FAKE_NOTIFICATION_SIGNATURE,
        receivedAt: new Date(),
      };
    }
    return {
      fields: {
        orderId: correlation.orderId,
        requestId: correlation.requestId,
        amount: correlation.amountMinor.toString(),
        resultCode: plan.resultCode ?? resultCodes[plan.outcome],
        transId: (
          plan.providerTransactionId ?? stableProviderTransactionId(correlation)
        ).toString(),
      },
      signature: FAKE_NOTIFICATION_SIGNATURE,
      receivedAt: new Date(),
    };
  }
}
