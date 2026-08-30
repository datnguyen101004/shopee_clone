export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type PaymentProviderName = 'MOMO';
export type PaymentProviderEnvironment = 'SANDBOX';

export interface PaymentCorrelation {
  provider: PaymentProviderName;
  environment: PaymentProviderEnvironment;
  orderId: string;
  requestId: string;
  amountMinor: bigint;
  currency: 'VND';
}

export interface CreatePaymentCommand extends PaymentCorrelation {
  orderInfo: string;
  redirectUrl: string;
  ipnUrl: string;
  expiresAt: Date;
}

export interface QueryPaymentCommand {
  provider: PaymentProviderName;
  environment: PaymentProviderEnvironment;
  orderId: string;
  requestId: string;
}

export interface RefundPaymentCommand extends PaymentCorrelation {
  providerTransactionId: bigint;
  description: string;
}

export type QueryRefundCommand = QueryPaymentCommand;

export interface SafePaymentInstructions {
  payUrl: string | null;
  deeplink: string | null;
  qrCodeUrl: string | null;
}

export interface ProviderOperationResult extends PaymentCorrelation {
  resultCode: number;
  message: string | null;
  providerTransactionId: bigint | null;
  observedAt: Date;
}

export interface CreatePaymentResult extends ProviderOperationResult {
  instructions: SafePaymentInstructions;
  paymentStatus: 'PENDING' | 'PENDING_RECONCILIATION';
}

export type QueryPaymentResult = ProviderOperationResult;

export interface RefundPaymentResult extends ProviderOperationResult {
  originalProviderTransactionId: bigint;
}

export type QueryRefundResult = ProviderOperationResult;

export type NotificationFieldValue = string | number | null;

export interface ProviderNotificationEnvelope {
  fields: Readonly<Record<string, NotificationFieldValue>>;
  signature: string;
  receivedAt: Date;
}

export type NotificationVerificationFailure =
  'MALFORMED' | 'INVALID_SIGNATURE' | 'UNSUPPORTED_PROVIDER';

export type NotificationVerificationResult =
  | {
      valid: true;
      observation: ProviderOperationResult;
      fingerprint: string;
      sanitizedMetadata: Readonly<Record<string, NotificationFieldValue>>;
    }
  | {
      valid: false;
      reason: NotificationVerificationFailure;
    };

/** Provider boundary. Implementations must not return secrets, signatures, or raw payloads. */
export interface PaymentProvider {
  createPayment(command: CreatePaymentCommand): Promise<CreatePaymentResult>;
  queryPayment(command: QueryPaymentCommand): Promise<QueryPaymentResult>;
  refundPayment(command: RefundPaymentCommand): Promise<RefundPaymentResult>;
  queryRefund(command: QueryRefundCommand): Promise<QueryRefundResult>;
  verifyNotification(envelope: ProviderNotificationEnvelope): NotificationVerificationResult;
}
