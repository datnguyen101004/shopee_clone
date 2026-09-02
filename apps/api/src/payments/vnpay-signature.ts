import { createHmac, timingSafeEqual } from 'node:crypto';

export function vnpayTimestamp(value: Date): string {
  const shifted = new Date(value.getTime() + 7 * 60 * 60 * 1_000);
  const iso = shifted
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  return iso;
}

export function encodeVnpay(value: string): string {
  // VNPAY's reference integrations use application/x-www-form-urlencoded spaces.
  return encodeURIComponent(value).replace(/%20/g, '+');
}

export function canonicalVnpayQuery(fields: Readonly<Record<string, string>>): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== '')
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${encodeVnpay(key)}=${encodeVnpay(value)}`)
    .join('&');
}

export function signVnpay(secret: string, canonical: string): string {
  return createHmac('sha512', secret).update(canonical, 'utf8').digest('hex');
}

export function verifyVnpay(secret: string, canonical: string, signature: string): boolean {
  if (!/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = Buffer.from(signVnpay(secret, canonical), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
