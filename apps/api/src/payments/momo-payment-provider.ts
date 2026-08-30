import { createHash } from 'node:crypto';

import type { MomoConfig } from './momo.config';
import { classifyMomoResultCode, type MomoUnknownResultCodeObserver } from './momo-result-code';
import {
  buildMomoCreateCanonical,
  buildMomoCreateResponseCanonical,
  buildMomoIpnCanonical,
  buildMomoQueryCanonical,
  buildMomoRefundCanonical,
  signMomoCanonical,
  verifyMomoSignature,
} from './momo-signature';
import type {
  CreatePaymentCommand,
  CreatePaymentResult,
  NotificationVerificationResult,
  PaymentProvider,
  ProviderOperationResult,
  QueryPaymentCommand,
  QueryPaymentResult,
  QueryRefundCommand,
  QueryRefundResult,
  RefundPaymentCommand,
  RefundPaymentResult,
  SafePaymentInstructions,
} from './payment-provider.port';
import {
  ProviderMalformedResponseError,
  ProviderMismatchError,
  ProviderRejectedError,
} from './payment-result';

export interface MomoHttpTransport {
  post(path: string, body: Readonly<Record<string, unknown>>, timeoutMs: number): Promise<unknown>;
}

type EnabledMomoConfig = MomoConfig & {
  enabled: true;
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  ipnUrl: string;
  redirectUrl: string;
};

function enabledConfig(config: MomoConfig): EnabledMomoConfig {
  if (
    !config.enabled ||
    !config.partnerCode ||
    !config.accessKey ||
    !config.secretKey ||
    !config.ipnUrl ||
    !config.redirectUrl
  ) {
    throw new ProviderRejectedError('MoMo sandbox provider is disabled or incomplete');
  }
  return config as EnabledMomoConfig;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProviderMalformedResponseError('MoMo returned a malformed response');
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ProviderMalformedResponseError(`MoMo response is missing ${field}`);
  }
  return value;
}

function requiredInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new ProviderMalformedResponseError(`MoMo response has invalid ${field}`);
  }
  return value as number;
}

function responseMessage(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1_000) {
    throw new ProviderMalformedResponseError('MoMo response has invalid message');
  }
  return value;
}

function optionalInstruction(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (
    typeof value !== 'string' ||
    value.length > 4_096 ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new ProviderMalformedResponseError(`MoMo response has invalid ${field}`);
  }
  return value;
}

function sandboxHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'test-payment.momo.vn' &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function momoDeepLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'momo:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function optionalBigInt(value: unknown, field: string): bigint | null {
  if (value === undefined || value === null || value === 0) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  throw new ProviderMalformedResponseError(`MoMo response has invalid ${field}`);
}

function safeAmount(amountMinor: bigint): number {
  const amount = Number(amountMinor);
  if (!Number.isSafeInteger(amount) || amount < 1_000 || amount > 50_000_000) {
    throw new ProviderRejectedError('MoMo amount is outside the sandbox wallet limit');
  }
  return amount;
}

function validateMerchantIdentifier(value: string, field: 'orderId' | 'requestId'): void {
  const maximumBytes = field === 'orderId' ? 63 : 50;
  if (
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    Buffer.byteLength(value, 'utf8') === 0 ||
    Buffer.byteLength(value, 'utf8') > maximumBytes
  ) {
    throw new ProviderRejectedError(`MoMo ${field} is not a valid opaque identifier`);
  }
}

export class MomoPaymentProvider implements PaymentProvider {
  private readonly config: EnabledMomoConfig;

  constructor(
    config: MomoConfig,
    private readonly transport: MomoHttpTransport,
    private readonly resultCodeObserver?: MomoUnknownResultCodeObserver,
  ) {
    this.config = enabledConfig(config);
  }

  async createPayment(command: CreatePaymentCommand): Promise<CreatePaymentResult> {
    validateMerchantIdentifier(command.orderId, 'orderId');
    validateMerchantIdentifier(command.requestId, 'requestId');
    if (
      command.provider !== 'MOMO' ||
      command.environment !== 'SANDBOX' ||
      command.currency !== 'VND'
    ) {
      throw new ProviderRejectedError('MoMo command is not a sandbox VND payment');
    }
    if (command.ipnUrl !== this.config.ipnUrl || command.redirectUrl !== this.config.redirectUrl) {
      throw new ProviderRejectedError('MoMo callback URL differs from configured sandbox URL');
    }
    const amount = safeAmount(command.amountMinor);
    const extraData = '';
    const requestType = 'captureWallet';
    const canonical = buildMomoCreateCanonical({
      accessKey: this.config.accessKey,
      amount,
      extraData,
      ipnUrl: command.ipnUrl,
      orderId: command.orderId,
      orderInfo: command.orderInfo,
      partnerCode: this.config.partnerCode,
      redirectUrl: command.redirectUrl,
      requestId: command.requestId,
      requestType,
    });
    const response = await this.transport.post(
      '/v2/gateway/api/create',
      {
        partnerCode: this.config.partnerCode,
        partnerName: 'Shopee Clone Sandbox',
        storeId: 'shopee-clone-sandbox',
        requestId: command.requestId,
        amount,
        orderId: command.orderId,
        orderInfo: command.orderInfo,
        redirectUrl: command.redirectUrl,
        ipnUrl: command.ipnUrl,
        lang: 'vi',
        requestType,
        autoCapture: true,
        extraData,
        signature: signMomoCanonical(this.config.secretKey, canonical),
      },
      this.config.httpTimeoutMs,
    );
    const operation = this.parseOperation(
      response,
      command.orderId,
      command.requestId,
      command.amountMinor,
    );
    const payload = record(response);
    const responseTime = requiredInteger(payload.responseTime, 'responseTime');
    const message = responseMessage(payload.message);
    if (payload.signature !== undefined) {
      const responseSignature = requiredString(payload.signature, 'signature');
      const payUrl = typeof payload.payUrl === 'string' ? payload.payUrl : '';
      const canonicalResponse = buildMomoCreateResponseCanonical({
        accessKey: this.config.accessKey,
        amount,
        message,
        orderId: command.orderId,
        partnerCode: this.config.partnerCode,
        payUrl,
        requestId: command.requestId,
        responseTime,
        resultCode: operation.resultCode,
      });
      if (!verifyMomoSignature(this.config.secretKey, canonicalResponse, responseSignature)) {
        throw new ProviderMismatchError('MoMo create response signature mismatch');
      }
    }
    const createClassification = classifyMomoResultCode(
      operation.resultCode,
      'CREATE',
      this.resultCodeObserver,
    );
    return {
      ...operation,
      message,
      observedAt: new Date(responseTime),
      paymentStatus:
        createClassification.resultClass === 'PENDING' ? 'PENDING' : 'PENDING_RECONCILIATION',
      instructions: this.parseInstructions(payload, operation.resultCode),
    };
  }

  async queryPayment(command: QueryPaymentCommand): Promise<QueryPaymentResult> {
    validateMerchantIdentifier(command.orderId, 'orderId');
    validateMerchantIdentifier(command.requestId, 'requestId');
    if (command.provider !== 'MOMO' || command.environment !== 'SANDBOX') {
      throw new ProviderRejectedError('MoMo query is not for the sandbox provider');
    }
    const canonical = buildMomoQueryCanonical({
      accessKey: this.config.accessKey,
      orderId: command.orderId,
      partnerCode: this.config.partnerCode,
      requestId: command.requestId,
    });
    const response = await this.transport.post(
      '/v2/gateway/api/query',
      {
        partnerCode: this.config.partnerCode,
        requestId: command.requestId,
        orderId: command.orderId,
        lang: 'vi',
        signature: signMomoCanonical(this.config.secretKey, canonical),
      },
      this.config.httpTimeoutMs,
    );
    const payload = record(response);
    return this.parseOperation(
      payload,
      command.orderId,
      command.requestId,
      BigInt(requiredInteger(payload.amount, 'amount')),
    );
  }

  async refundPayment(command: RefundPaymentCommand): Promise<RefundPaymentResult> {
    validateMerchantIdentifier(command.orderId, 'orderId');
    validateMerchantIdentifier(command.requestId, 'requestId');
    if (
      command.provider !== 'MOMO' ||
      command.environment !== 'SANDBOX' ||
      command.currency !== 'VND'
    ) {
      throw new ProviderRejectedError('MoMo refund is not for sandbox VND');
    }
    const amount = safeAmount(command.amountMinor);
    const canonical = buildMomoRefundCanonical({
      accessKey: this.config.accessKey,
      amount,
      description: command.description,
      orderId: command.orderId,
      partnerCode: this.config.partnerCode,
      requestId: command.requestId,
      transId: command.providerTransactionId,
    });
    const response = await this.transport.post(
      '/v2/gateway/api/refund',
      {
        partnerCode: this.config.partnerCode,
        orderId: command.orderId,
        requestId: command.requestId,
        amount,
        transId: command.providerTransactionId.toString(),
        lang: 'vi',
        description: command.description,
        signature: signMomoCanonical(this.config.secretKey, canonical),
      },
      this.config.httpTimeoutMs,
    );
    const payload = record(response);
    const operation = this.parseOperation(
      payload,
      command.orderId,
      command.requestId,
      command.amountMinor,
    );
    return {
      ...operation,
      observedAt: new Date(requiredInteger(payload.responseTime, 'responseTime')),
      originalProviderTransactionId: command.providerTransactionId,
    };
  }

  async queryRefund(command: QueryRefundCommand): Promise<QueryRefundResult> {
    validateMerchantIdentifier(command.orderId, 'orderId');
    validateMerchantIdentifier(command.requestId, 'requestId');
    if (command.provider !== 'MOMO' || command.environment !== 'SANDBOX') {
      throw new ProviderRejectedError('MoMo refund query is not for the sandbox provider');
    }
    const canonical = buildMomoQueryCanonical({
      accessKey: this.config.accessKey,
      orderId: command.orderId,
      partnerCode: this.config.partnerCode,
      requestId: command.requestId,
    });
    const response = record(
      await this.transport.post(
        '/v2/gateway/api/refund/query',
        {
          partnerCode: this.config.partnerCode,
          requestId: command.requestId,
          orderId: command.orderId,
          lang: 'vi',
          signature: signMomoCanonical(this.config.secretKey, canonical),
        },
        this.config.httpTimeoutMs,
      ),
    );
    if (requiredString(response.partnerCode, 'partnerCode') !== this.config.partnerCode) {
      throw new ProviderMismatchError('MoMo refund query partner correlation mismatch');
    }
    if (
      requiredString(response.orderId, 'orderId') !== command.orderId ||
      requiredString(response.requestId, 'requestId') !== command.requestId
    ) {
      throw new ProviderMismatchError('MoMo refund query correlation mismatch');
    }
    if (!Array.isArray(response.refundTrans)) {
      throw new ProviderMalformedResponseError('MoMo refund query is missing refundTrans');
    }
    const matched = response.refundTrans
      .map((entry) => record(entry))
      .find((entry) => entry.orderId === command.orderId);
    if (!matched)
      throw new ProviderMismatchError('MoMo refund query did not return the requested refund');

    return {
      provider: 'MOMO',
      environment: 'SANDBOX',
      orderId: command.orderId,
      requestId: command.requestId,
      amountMinor: BigInt(requiredInteger(matched.amount, 'refundTrans.amount')),
      currency: 'VND',
      resultCode: requiredInteger(matched.resultCode, 'refundTrans.resultCode'),
      message: typeof response.message === 'string' ? response.message : null,
      providerTransactionId: optionalBigInt(matched.transId, 'refundTrans.transId'),
      observedAt: new Date(requiredInteger(response.responseTime, 'responseTime')),
    };
  }

  verifyNotification(envelope: {
    fields: Readonly<Record<string, string | number | null>>;
    signature: string;
    receivedAt: Date;
  }): NotificationVerificationResult {
    try {
      const payload = record(envelope.fields);
      const partnerCode = requiredString(payload.partnerCode, 'partnerCode');
      if (partnerCode !== this.config.partnerCode) return { valid: false, reason: 'MALFORMED' };
      const amount = requiredInteger(payload.amount, 'amount');
      const orderId = requiredString(payload.orderId, 'orderId');
      const requestId = requiredString(payload.requestId, 'requestId');
      const resultCode = requiredInteger(payload.resultCode, 'resultCode');
      const transId = optionalBigInt(payload.transId, 'transId');
      if (transId === null) return { valid: false, reason: 'MALFORMED' };
      const canonical = buildMomoIpnCanonical({
        accessKey: this.config.accessKey,
        amount,
        extraData: typeof payload.extraData === 'string' ? payload.extraData : '',
        message: requiredString(payload.message, 'message'),
        orderId,
        orderInfo: requiredString(payload.orderInfo, 'orderInfo'),
        orderType: requiredString(payload.orderType, 'orderType'),
        partnerCode,
        payType: requiredString(payload.payType, 'payType'),
        requestId,
        responseTime: requiredInteger(payload.responseTime, 'responseTime'),
        resultCode,
        transId,
      });
      if (!verifyMomoSignature(this.config.secretKey, canonical, envelope.signature)) {
        return { valid: false, reason: 'INVALID_SIGNATURE' };
      }
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
          amountMinor: BigInt(amount),
          currency: 'VND',
          resultCode,
          message: null,
          providerTransactionId: transId,
          observedAt: envelope.receivedAt,
        },
        fingerprint,
        sanitizedMetadata: {
          resultCode,
          transId: transId.toString(),
          payType: typeof payload.payType === 'string' ? payload.payType : null,
          responseTime:
            typeof payload.responseTime === 'number' ? payload.responseTime : null,
        },
      };
    } catch {
      return { valid: false, reason: 'MALFORMED' };
    }
  }

  private parseOperation(
    value: unknown,
    expectedOrderId: string,
    expectedRequestId: string,
    expectedAmountMinor: bigint,
  ): ProviderOperationResult {
    const payload = record(value);
    if (requiredString(payload.partnerCode, 'partnerCode') !== this.config.partnerCode) {
      throw new ProviderMismatchError('MoMo response partner correlation mismatch');
    }
    const orderId = requiredString(payload.orderId, 'orderId');
    const requestId = requiredString(payload.requestId, 'requestId');
    const amountMinor = BigInt(requiredInteger(payload.amount, 'amount'));
    if (
      orderId !== expectedOrderId ||
      requestId !== expectedRequestId ||
      amountMinor !== expectedAmountMinor
    ) {
      throw new ProviderMismatchError('MoMo response correlation mismatch');
    }
    return {
      provider: 'MOMO',
      environment: 'SANDBOX',
      orderId,
      requestId,
      amountMinor,
      currency: 'VND',
      resultCode: requiredInteger(payload.resultCode, 'resultCode'),
      message: typeof payload.message === 'string' ? payload.message : null,
      providerTransactionId: optionalBigInt(payload.transId, 'transId'),
      observedAt: new Date(),
    };
  }

  private parseInstructions(
    payload: Record<string, unknown>,
    resultCode: number,
  ): SafePaymentInstructions {
    const payUrl = optionalInstruction(payload.payUrl, 'payUrl');
    const deeplink = optionalInstruction(payload.deeplink, 'deeplink');
    const qrCodeUrl = optionalInstruction(payload.qrCodeUrl, 'qrCodeUrl');
    if (payUrl && !sandboxHttpsUrl(payUrl)) {
      throw new ProviderMalformedResponseError('MoMo response payUrl is outside sandbox allowlist');
    }
    if (deeplink && !momoDeepLink(deeplink)) {
      throw new ProviderMalformedResponseError(
        'MoMo response deeplink is outside scheme allowlist',
      );
    }
    if (
      qrCodeUrl &&
      !sandboxHttpsUrl(qrCodeUrl) &&
      !momoDeepLink(qrCodeUrl) &&
      !(qrCodeUrl.startsWith('000201') && /^[\x20-\x7e]+$/.test(qrCodeUrl))
    ) {
      throw new ProviderMalformedResponseError(
        'MoMo response qrCodeUrl is outside payload allowlist',
      );
    }
    if (resultCode === 0 && payUrl === null && deeplink === null && qrCodeUrl === null) {
      throw new ProviderMalformedResponseError('MoMo accepted create without payment instructions');
    }
    return { payUrl, deeplink, qrCodeUrl };
  }
}
