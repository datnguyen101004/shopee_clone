import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyInternalSignature(
  secret: string | undefined,
  input: { timestamp?: string; keyId?: string; signature?: string },
  method: string,
  path: string,
  body: Buffer,
): boolean {
  if (!input.timestamp || !input.keyId || !input.signature) return false;
  const activeKeyId = process.env.DEMO_CARRIER_HMAC_ACTIVE_KEY_ID ?? 'local-demo-carrier-v1';
  const signingSecret = input.keyId === activeKeyId
    ? secret
    : input.keyId === process.env.DEMO_CARRIER_HMAC_PREVIOUS_KEY_ID
      ? process.env.DEMO_CARRIER_HMAC_PREVIOUS_SECRET
      : undefined;
  if (!signingSecret) return false;
  if (!/^\d{10}$/.test(input.timestamp) || !/^[0-9a-f]{64}$/i.test(input.signature)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1_000) - Number(input.timestamp));
  if (age > 300) return false;
  const expected = createHmac('sha256', signingSecret)
    .update(`${input.timestamp}.${method.toUpperCase()}.${path}.`)
    .update(body)
    .digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(input.signature, 'hex'));
}
