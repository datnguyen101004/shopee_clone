const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/**
 * Catalog APIs return seller-uploaded media as an API-relative URL. The web
 * app runs on a different origin, so resolve those URLs against the API host
 * before rendering them in the storefront.
 */
export function marketplaceMediaUrl(value: string): string {
  if (!value.startsWith('/api/v1/product-media/')) return value;
  try {
    return new URL(value, apiBaseUrl).toString();
  } catch {
    return value;
  }
}

export function isApiMediaUrl(value: string): boolean {
  return value.startsWith(`${apiBaseUrl.replace(/\/$/, '')}/api/v1/product-media/`);
}
