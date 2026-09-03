const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const cloudFrontBaseUrl = (
  process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_BASE_URL ??
  process.env.AWS_CLOUDFRONT_BASE_URL ??
  'https://cdn.videod.me'
).replace(/\/$/, '');
const s3Prefix = (
  process.env.NEXT_PUBLIC_AWS_S3_PREFIX ??
  process.env.AWS_S3_PREFIX ??
  'seller-product-media'
).replace(/^\/|\/$/g, '');

const uuidOrKeyPattern = /^[0-9a-fA-F-]{36}(\.[a-zA-Z0-9]+)?$/;

/**
 * Format product media URL:
 * - If value is already absolute (http/https/blob/data), returns as is.
 * - If value is a local static path (/media, /assets), returns as is.
 * - If value is an S3 key or managed filename or media ID, constructs AWS_CLOUDFRONT_BASE_URL/AWS_S3_PREFIX/id.
 * - If value is an API-relative URL (/api/v1/product-media/...), resolves against API host.
 */
export function marketplaceMediaUrl(value: string | null | undefined): string {
  if (!value) return '';
  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('blob:') ||
    value.startsWith('data:')
  ) {
    return value;
  }
  if (value.startsWith('/media/') || value.startsWith('/assets/')) {
    return value;
  }
  if (value.startsWith('/api/v1/product-media/')) {
    try {
      return new URL(value, apiBaseUrl).toString();
    } catch {
      return value;
    }
  }
  if (value.startsWith(`${s3Prefix}/`)) {
    return `${cloudFrontBaseUrl}/${value}`;
  }
  if (uuidOrKeyPattern.test(value)) {
    return `${cloudFrontBaseUrl}/${s3Prefix}/${value}`;
  }
  try {
    return new URL(value, apiBaseUrl).toString();
  } catch {
    return value;
  }
}

export function isApiMediaUrl(value: string): boolean {
  return value.startsWith(`${apiBaseUrl.replace(/\/$/, '')}/api/v1/product-media/`);
}

