import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

import type { VnpayConfig } from './vnpay.config';
import { canonicalVnpayQuery, signVnpay, verifyVnpay, vnpayTimestamp } from './vnpay-signature';
import type {
  CreatePaymentCommand,
  CreatePaymentResult,
  NotificationVerificationResult,
  PaymentProvider,
  ProviderNotificationEnvelope,
  QueryPaymentCommand,
  QueryPaymentResult,
  QueryRefundResult,
  RefundPaymentResult,
  SafePaymentInstructions,
} from './payment-provider.port';
import {
  ProviderMalformedResponseError,
  ProviderMismatchError,
  ProviderRejectedError,
  ProviderTemporaryError,
  ProviderTimeoutError,
} from './payment-result';

type EnabledVnpayConfig = VnpayConfig & {
  enabled: true;
  tmnCode: string;
  hashSecret: string;
  returnUrl: string;
  ipnUrl: string;
};

function enabledConfig(config: VnpayConfig): EnabledVnpayConfig {
  if (
    !config.enabled ||
    !config.tmnCode ||
    !config.hashSecret ||
    !config.returnUrl ||
    !config.ipnUrl
  ) {
    throw new ProviderRejectedError('VNPAY sandbox provider is disabled or incomplete');
  }
  return config as EnabledVnpayConfig;
}

function identifier(value: string, field: string, max: number): void {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length < 1 || value.length > max) {
    throw new ProviderRejectedError(`VNPAY ${field} is not a valid opaque identifier`);
  }
}

function amount(value: bigint): string {
  const minor = Number(value);
  if (!Number.isSafeInteger(minor) || minor < 5_000 || minor > 500_000_000) {
    throw new ProviderRejectedError('VNPAY amount is outside the sandbox limit');
  }
  return String(minor * 100);
}

function optionalTransaction(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value) || value === '') return null;
  try {
    const transaction = BigInt(value);
    // VNPAY uses transaction number 0 for cancelled/failed transactions.
    // It is not a provider transaction identity and must not conflict with
    // an identity previously observed through QueryDR.
    return transaction === 0n ? null : transaction;
  } catch {
    return null;
  }
}

function clientIp(value: string | undefined): string {
  return value && isIP(value) !== 0 ? value : '127.0.0.1';
}

function queryRequestId(command: QueryPaymentCommand, requestedAt: Date): string {
  return createHash('sha256')
    .update(`${command.orderId}:${command.requestId}:${requestedAt.toISOString()}`)
    .digest('hex')
    .slice(0, 32);
}

function responseRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProviderMalformedResponseError('VNPAY QueryDR returned a malformed response');
  }
  return value as Record<string, unknown>;
}

function responseString(
  payload: Readonly<Record<string, unknown>>,
  key: string,
  required = true,
): string {
  const value = payload[key];
  if (value === undefined || value === null || value === '') {
    if (!required) return '';
    throw new ProviderMalformedResponseError(`VNPAY QueryDR response is missing ${key}`);
  }
  if (typeof value !== 'string' || value.length > 512) {
    throw new ProviderMalformedResponseError(`VNPAY QueryDR response has invalid ${key}`);
  }
  return value;
}

function queryResponseCanonical(payload: Readonly<Record<string, unknown>>): string {
  return [
    'vnp_ResponseId',
    'vnp_Command',
    'vnp_ResponseCode',
    'vnp_Message',
    'vnp_TmnCode',
    'vnp_TxnRef',
    'vnp_Amount',
    'vnp_BankCode',
    'vnp_PayDate',
    'vnp_TransactionNo',
    'vnp_TransactionType',
    'vnp_TransactionStatus',
    'vnp_OrderInfo',
    'vnp_PromotionCode',
    'vnp_PromotionAmount',
  ]
    .map((key) => responseString(payload, key, false))
    .join('|');
}

function queryResultCode(responseCode: string, transactionStatus: string): number {
  if (responseCode !== '00') return 1_000 + Number(responseCode);
  if (transactionStatus === '00') return 0;
  if (transactionStatus === '02' || transactionStatus === '07' || transactionStatus === '09') {
    return Number(transactionStatus);
  }
  return 1_100 + Number(transactionStatus);
}

function providerDate(value: string, fallback: Date): Date {
  if (!/^\d{14}$/.test(value)) return fallback;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  const parsed = new Date(Date.UTC(year, month - 1, day, hour - 7, minute, second));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export class VnpayPaymentProvider implements PaymentProvider {
  private readonly config: EnabledVnpayConfig;

  constructor(config: VnpayConfig) {
    this.config = enabledConfig(config);
  }

  async createPayment(command: CreatePaymentCommand): Promise<CreatePaymentResult> {
    if (
      command.provider !== 'VNPAY' ||
      command.environment !== 'SANDBOX' ||
      command.currency !== 'VND'
    ) {
      throw new ProviderRejectedError('VNPAY command is not a sandbox VND payment');
    }
    if (command.redirectUrl !== this.config.returnUrl || command.ipnUrl !== this.config.ipnUrl) {
      throw new ProviderRejectedError('VNPAY callback URL differs from configured sandbox URL');
    }
    identifier(command.orderId, 'orderId', 100);
    identifier(command.requestId, 'requestId', 100);
    const now = command.createdAt
      ? new Date(command.createdAt.getTime())
      : new Date(command.expiresAt.getTime() - this.config.paymentTtlSeconds * 1_000);
    if (Number.isNaN(now.getTime())) {
      throw new ProviderRejectedError('VNPAY attempt timestamp is invalid');
    }
    const fields: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.config.tmnCode,
      vnp_Amount: amount(command.amountMinor),
      vnp_CreateDate: vnpayTimestamp(now),
      vnp_CurrCode: 'VND',
      vnp_Locale: 'vn',
      vnp_OrderInfo: command.orderInfo.slice(0, 255),
      vnp_OrderType: 'other',
      vnp_ReturnUrl: this.config.returnUrl,
      vnp_TxnRef: command.orderId,
      vnp_ExpireDate: vnpayTimestamp(command.expiresAt),
      vnp_IpAddr: clientIp(command.clientIp),
    };
    const canonical = canonicalVnpayQuery(fields);
    const payUrl = `${this.config.payUrl}?${canonical}&vnp_SecureHashType=HMACSHA512&vnp_SecureHash=${signVnpay(this.config.hashSecret, canonical)}`;
    const instructions: SafePaymentInstructions = { payUrl, deeplink: null, qrCodeUrl: null };
    return {
      provider: 'VNPAY',
      environment: 'SANDBOX',
      orderId: command.orderId,
      requestId: command.requestId,
      amountMinor: command.amountMinor,
      currency: 'VND',
      resultCode: 0,
      message: 'Created',
      providerTransactionId: null,
      observedAt: now,
      instructions,
      paymentStatus: 'PENDING',
    };
  }

  async queryPayment(command: QueryPaymentCommand): Promise<QueryPaymentResult> {
    if (command.provider !== 'VNPAY' || command.environment !== 'SANDBOX') {
      throw new ProviderRejectedError('VNPAY QueryDR is not for the sandbox provider');
    }
    identifier(command.orderId, 'orderId', 100);
    if (!command.transactionDate || Number.isNaN(command.transactionDate.getTime())) {
      throw new ProviderRejectedError('VNPAY QueryDR requires the original transaction date');
    }
    const requestedAt = command.queryRequestedAt ?? new Date();
    if (Number.isNaN(requestedAt.getTime())) {
      throw new ProviderRejectedError('VNPAY QueryDR request timestamp is invalid');
    }
    const requestId = queryRequestId(command, requestedAt);
    const orderInfo = 'Truy van giao dich';
    const fields: Record<string, string> = {
      vnp_RequestId: requestId,
      vnp_Version: '2.1.0',
      vnp_Command: 'querydr',
      vnp_TmnCode: this.config.tmnCode,
      vnp_TxnRef: command.orderId,
      vnp_TransactionDate: vnpayTimestamp(command.transactionDate),
      vnp_CreateDate: vnpayTimestamp(requestedAt),
      vnp_IpAddr: clientIp(command.clientIp),
      vnp_OrderInfo: orderInfo,
    };
    const signingInput = [
      fields.vnp_RequestId,
      fields.vnp_Version,
      fields.vnp_Command,
      fields.vnp_TmnCode,
      fields.vnp_TxnRef,
      fields.vnp_TransactionDate,
      fields.vnp_CreateDate,
      fields.vnp_IpAddr,
      fields.vnp_OrderInfo,
    ].join('|');
    const body = { ...fields, vnp_SecureHash: signVnpay(this.config.hashSecret, signingInput) };
    let raw: unknown;
    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.httpTimeoutMs),
      });
      if (!response.ok) throw new ProviderTemporaryError('VNPAY QueryDR is unavailable');
      raw = await response.json();
    } catch (error) {
      if (error instanceof ProviderTemporaryError) throw error;
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new ProviderTimeoutError('VNPAY QueryDR timed out');
      }
      throw new ProviderTemporaryError('VNPAY QueryDR request failed');
    }
    const payload = responseRecord(raw);
    const unsignedResponseCode = responseString(payload, 'vnp_ResponseCode', false);
    if (!payload.vnp_SecureHash) {
      throw new ProviderMalformedResponseError(
        `VNPAY QueryDR returned an unsigned response${/^\d{2}$/.test(unsignedResponseCode) ? ` (${unsignedResponseCode})` : ''}`,
      );
    }
    const signature = responseString(payload, 'vnp_SecureHash');
    if (!verifyVnpay(this.config.hashSecret, queryResponseCanonical(payload), signature)) {
      throw new ProviderMalformedResponseError('VNPAY QueryDR response signature is invalid');
    }
    const tmnCode = responseString(payload, 'vnp_TmnCode');
    const transactionReference = responseString(payload, 'vnp_TxnRef');
    const commandName = responseString(payload, 'vnp_Command', false);
    if (
      tmnCode !== this.config.tmnCode ||
      transactionReference !== command.orderId ||
      (commandName !== '' && commandName !== 'querydr')
    ) {
      throw new ProviderMismatchError('VNPAY QueryDR correlation mismatch');
    }
    const responseCode = responseString(payload, 'vnp_ResponseCode');
    const transactionStatus = responseString(payload, 'vnp_TransactionStatus', false) || '99';
    if (!/^\d{2}$/.test(responseCode) || !/^\d{2}$/.test(transactionStatus)) {
      throw new ProviderMalformedResponseError('VNPAY QueryDR response status is invalid');
    }
    const amountRaw = responseString(payload, 'vnp_Amount');
    if (!/^\d+$/.test(amountRaw) || BigInt(amountRaw) % 100n !== 0n) {
      throw new ProviderMalformedResponseError('VNPAY QueryDR response amount is invalid');
    }
    const transactionNo = optionalTransaction(responseString(payload, 'vnp_TransactionNo', false));
    const resultCode = queryResultCode(responseCode, transactionStatus);
    if (resultCode === 0 && transactionNo === null) {
      throw new ProviderMalformedResponseError('VNPAY QueryDR success has no transaction number');
    }
    return {
      provider: 'VNPAY',
      environment: 'SANDBOX',
      orderId: transactionReference,
      requestId,
      amountMinor: BigInt(amountRaw) / 100n,
      currency: 'VND',
      resultCode,
      message: responseString(payload, 'vnp_Message', false) || null,
      providerTransactionId: transactionNo,
      observedAt: providerDate(responseString(payload, 'vnp_PayDate', false), requestedAt),
    };
  }

  async refundPayment(): Promise<RefundPaymentResult> {
    throw new ProviderRejectedError('VNPAY refunds are outside the sandbox change scope');
  }

  async queryRefund(): Promise<QueryRefundResult> {
    throw new ProviderRejectedError('VNPAY refund queries are outside the sandbox change scope');
  }

  verifyNotification(envelope: ProviderNotificationEnvelope): NotificationVerificationResult {
    try {
      const fields = Object.fromEntries(
        Object.entries(envelope.fields).map(([key, value]) => [key, String(value ?? '')]),
      );
      if (
        Object.keys(fields).length > 64 ||
        Object.entries(fields).some(
          ([key, value]) => !/^vnp_[A-Za-z0-9_]{1,64}$/.test(key) || value.length > 512,
        )
      ) {
        return { valid: false, reason: 'MALFORMED' };
      }
      const signature = envelope.signature;
      const canonicalFields = Object.fromEntries(
        Object.entries(fields).filter(
          ([key]) => key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType',
        ),
      );
      const terminalCode = fields.vnp_TmnCode;
      const transactionReference = fields.vnp_TxnRef;
      const amountRaw = fields.vnp_Amount;
      if (!terminalCode || !transactionReference || !amountRaw)
        return { valid: false, reason: 'MALFORMED' };
      // VNPAY includes command and currency in the merchant payment request,
      // but its documented Return/IPN payload does not include either field.
      // Validate them when present without rejecting an official callback that
      // omits them. Currency remains correlated against the VND attempt below.
      if (
        (fields.vnp_Command !== undefined && fields.vnp_Command !== 'pay') ||
        (fields.vnp_CurrCode !== undefined && fields.vnp_CurrCode !== 'VND')
      ) {
        return { valid: false, reason: 'MALFORMED' };
      }
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(transactionReference)) {
        return { valid: false, reason: 'MALFORMED' };
      }
      if (!verifyVnpay(this.config.hashSecret, canonicalVnpayQuery(canonicalFields), signature)) {
        return { valid: false, reason: 'INVALID_SIGNATURE' };
      }
      if (terminalCode !== this.config.tmnCode) return { valid: false, reason: 'MALFORMED' };
      if (!/^[0-9]+$/.test(amountRaw) || BigInt(amountRaw) % 100n !== 0n)
        return { valid: false, reason: 'INVALID_AMOUNT' };
      const responseCode = fields.vnp_ResponseCode;
      const transactionStatus = fields.vnp_TransactionStatus;
      if (
        typeof responseCode !== 'string' ||
        !/^\d{2}$/.test(responseCode) ||
        !/^\d{2}$/.test(transactionStatus || '')
      ) {
        return { valid: false, reason: 'MALFORMED' };
      }
      const parsedResponseCode = Number(responseCode);
      // VNPAY reports both fields; a nominal response code 00 is successful only
      // when the transaction status is also 00.
      const resultCode =
        parsedResponseCode === 0 && transactionStatus !== '00' ? 99 : parsedResponseCode;
      const transaction = optionalTransaction(fields.vnp_TransactionNo);
      if (resultCode === 0 && transaction === null) {
        return { valid: false, reason: 'MALFORMED' };
      }
      const fingerprint = createHash('sha256')
        .update(canonicalVnpayQuery(canonicalFields))
        .digest('hex');
      return {
        valid: true,
        observation: {
          provider: 'VNPAY',
          environment: 'SANDBOX',
          orderId: transactionReference,
          requestId: transactionReference,
          amountMinor: BigInt(amountRaw) / 100n,
          currency: 'VND',
          resultCode,
          message: fields.vnp_Message || null,
          providerTransactionId: transaction,
          observedAt: envelope.receivedAt,
        },
        fingerprint,
        sanitizedMetadata: {
          responseCode: resultCode,
          transactionStatus: fields.vnp_TransactionStatus || null,
          transactionNo: fields.vnp_TransactionNo || null,
        },
      };
    } catch {
      return { valid: false, reason: 'MALFORMED' };
    }
  }
}
