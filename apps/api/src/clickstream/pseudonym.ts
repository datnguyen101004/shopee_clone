import { createHmac } from 'node:crypto';

/**
 * Analytics identifiers use the same domain-separated HMAC as clickstream
 * capture. Keeping this helper small makes snapshot export auditable and
 * prevents raw account identifiers from crossing the S3 boundary.
 */
export function pseudonymize(
  secret: string,
  keyId: string,
  namespace: 'buyer' | 'session',
  value: string,
): { pseudonym: string; pseudonymKeyId: string } {
  if (!secret.trim() || !keyId.trim() || !value.trim()) {
    throw new Error('Pseudonymisation requires a secret, key id and value.');
  }
  return {
    pseudonym: createHmac('sha256', secret)
      .update(`${namespace}:${value}`, 'utf8')
      .digest('hex'),
    pseudonymKeyId: keyId,
  };
}

export function isPlaceholderPseudonymConfig(
  secret: string | null | undefined,
  keyId: string | null | undefined,
): boolean {
  if (!secret?.trim() || !keyId?.trim()) return true;
  return /^(?:local-disabled|change[-_]?me|replace[-_]?me|your[-_]|example(?:[-_]|$))/iu.test(
    keyId,
  );
}
