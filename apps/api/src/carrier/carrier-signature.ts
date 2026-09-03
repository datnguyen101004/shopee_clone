import { createHmac, timingSafeEqual } from 'node:crypto';

export interface CarrierSignatureHeaders {
  timestamp: string | undefined;
  keyId: string | undefined;
  signature: string | undefined;
}

export function carrierSigningInput(
  timestamp: string,
  method: string,
  path: string,
  body: Buffer,
): string {
  return `${timestamp}.${method.toUpperCase()}.${path}.${body.toString('utf8')}`;
}

export function createCarrierSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: Buffer,
): string {
  return createHmac('sha256', secret)
    .update(carrierSigningInput(timestamp, method, path, body))
    .digest('hex');
}

export function verifyCarrierSignature(
  secret: string,
  headers: CarrierSignatureHeaders,
  method: string,
  path: string,
  body: Buffer,
  nowSeconds = Math.floor(Date.now() / 1_000),
): boolean {
  if (!headers.timestamp || !headers.keyId || !headers.signature) return false;
  if (!/^\d{10}$/.test(headers.timestamp)) return false;
  const timestamp = Number(headers.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;
  if (!/^[a-f0-9]{64}$/i.test(headers.signature)) return false;
  const expected = Buffer.from(createCarrierSignature(secret, headers.timestamp, method, path, body), 'hex');
  const actual = Buffer.from(headers.signature, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
