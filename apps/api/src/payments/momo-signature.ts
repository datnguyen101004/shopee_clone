import { createHmac, timingSafeEqual } from 'node:crypto';

type CanonicalValue = string | number | bigint;

function joinCanonical(fields: readonly (readonly [string, CanonicalValue])[]): string {
  return fields.map(([key, value]) => `${key}=${value}`).join('&');
}

export interface MomoCreateSignatureInput {
  accessKey: string;
  amount: number;
  extraData: string;
  ipnUrl: string;
  orderId: string;
  orderInfo: string;
  partnerCode: string;
  redirectUrl: string;
  requestId: string;
  requestType: 'captureWallet';
}

export function buildMomoCreateCanonical(input: MomoCreateSignatureInput): string {
  return joinCanonical([
    ['accessKey', input.accessKey],
    ['amount', input.amount],
    ['extraData', input.extraData],
    ['ipnUrl', input.ipnUrl],
    ['orderId', input.orderId],
    ['orderInfo', input.orderInfo],
    ['partnerCode', input.partnerCode],
    ['redirectUrl', input.redirectUrl],
    ['requestId', input.requestId],
    ['requestType', input.requestType],
  ]);
}

export interface MomoCreateResponseSignatureInput {
  accessKey: string;
  amount: number;
  message: string;
  orderId: string;
  partnerCode: string;
  payUrl: string;
  requestId: string;
  responseTime: number;
  resultCode: number;
}

export function buildMomoCreateResponseCanonical(input: MomoCreateResponseSignatureInput): string {
  return joinCanonical([
    ['accessKey', input.accessKey],
    ['amount', input.amount],
    ['message', input.message],
    ['orderId', input.orderId],
    ['partnerCode', input.partnerCode],
    ['payUrl', input.payUrl],
    ['requestId', input.requestId],
    ['responseTime', input.responseTime],
    ['resultCode', input.resultCode],
  ]);
}

export interface MomoIpnSignatureInput {
  accessKey: string;
  amount: number;
  extraData: string;
  message: string;
  orderId: string;
  orderInfo: string;
  orderType: string;
  partnerCode: string;
  payType: string;
  requestId: string;
  responseTime: number;
  resultCode: number;
  transId: bigint;
}

export function buildMomoIpnCanonical(input: MomoIpnSignatureInput): string {
  return joinCanonical([
    ['accessKey', input.accessKey],
    ['amount', input.amount],
    ['extraData', input.extraData],
    ['message', input.message],
    ['orderId', input.orderId],
    ['orderInfo', input.orderInfo],
    ['orderType', input.orderType],
    ['partnerCode', input.partnerCode],
    ['payType', input.payType],
    ['requestId', input.requestId],
    ['responseTime', input.responseTime],
    ['resultCode', input.resultCode],
    ['transId', input.transId],
  ]);
}

export interface MomoQuerySignatureInput {
  accessKey: string;
  orderId: string;
  partnerCode: string;
  requestId: string;
}

export function buildMomoQueryCanonical(input: MomoQuerySignatureInput): string {
  return joinCanonical([
    ['accessKey', input.accessKey],
    ['orderId', input.orderId],
    ['partnerCode', input.partnerCode],
    ['requestId', input.requestId],
  ]);
}

export interface MomoRefundSignatureInput {
  accessKey: string;
  amount: number;
  description: string;
  orderId: string;
  partnerCode: string;
  requestId: string;
  transId: bigint;
}

export function buildMomoRefundCanonical(input: MomoRefundSignatureInput): string {
  return joinCanonical([
    ['accessKey', input.accessKey],
    ['amount', input.amount],
    ['description', input.description],
    ['orderId', input.orderId],
    ['partnerCode', input.partnerCode],
    ['requestId', input.requestId],
    ['transId', input.transId],
  ]);
}

export function signMomoCanonical(secretKey: string, canonical: string): string {
  return createHmac('sha256', secretKey).update(canonical, 'utf8').digest('hex');
}

export function verifyMomoSignature(
  secretKey: string,
  canonical: string,
  candidateSignature: string,
): boolean {
  if (!/^[0-9a-fA-F]{64}$/.test(candidateSignature)) return false;
  const expected = Buffer.from(signMomoCanonical(secretKey, canonical), 'hex');
  const candidate = Buffer.from(candidateSignature, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
