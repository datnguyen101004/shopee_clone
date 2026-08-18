import { formatInventoryVersionEtag, isInventoryAdjustment, parseInventoryAdjustmentPage, isInventoryPage, type InventoryAdjustment, type InventoryAdjustmentPage, type InventoryAdjustmentRequest, type InventoryPage } from '@shopee-clone/contracts';
import { RoleApiError, type AuthenticatedFetcher } from './role-api';

const endpoint = (path: string) => new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001');

export async function fetchSellerInventory(fetcher: AuthenticatedFetcher, input: { cursor?: string; lowStock?: boolean } = {}): Promise<InventoryPage> {
  const url = endpoint('/api/v1/seller/inventory');
  if (input.cursor) url.searchParams.set('cursor', input.cursor);
  if (input.lowStock !== undefined) url.searchParams.set('lowStock', String(input.lowStock));
  const response = await fetcher(url, { cache: 'no-store', headers: { Accept: 'application/json, application/problem+json' } });
  let body: unknown;
  try { body = await response.json(); } catch { throw new RoleApiError(response.ok ? 'contract' : 'status', response.status); }
  if (!response.ok || !isInventoryPage(body)) {
    const problem = body && typeof body === 'object' ? body as { detail?: unknown; invalidParameters?: unknown } : {};
    throw new RoleApiError(response.ok ? 'contract' : 'status', response.status, { detail: typeof problem.detail === 'string' ? problem.detail : undefined, invalidParameters: Array.isArray(problem.invalidParameters) ? problem.invalidParameters.filter((item): item is string => typeof item === 'string') : undefined });
  }
  return body;
}

export async function adjustSellerInventory(fetcher: AuthenticatedFetcher, variantId: string, version: number, input: InventoryAdjustmentRequest): Promise<InventoryAdjustment> {
  const response = await fetcher(endpoint(`/api/v1/seller/inventory/${variantId}/adjustments`), { method: 'POST', cache: 'no-store', headers: { Accept: 'application/json, application/problem+json', 'Content-Type': 'application/json', 'If-Match': formatInventoryVersionEtag(version), 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(input) });
  let body: unknown;
  try { body = await response.json(); } catch { throw new RoleApiError(response.ok ? 'contract' : 'status', response.status); }
  if (!response.ok || !isInventoryAdjustment(body)) {
    const problem = body && typeof body === 'object' ? body as { detail?: unknown; invalidParameters?: unknown } : {};
    throw new RoleApiError(response.ok ? 'contract' : 'status', response.status, { detail: typeof problem.detail === 'string' ? problem.detail : undefined, invalidParameters: Array.isArray(problem.invalidParameters) ? problem.invalidParameters.filter((item): item is string => typeof item === 'string') : undefined });
  }
  return body;
}

export async function fetchSellerInventoryHistory(fetcher: AuthenticatedFetcher, variantId: string, cursor?: string): Promise<InventoryAdjustmentPage> {
  const url = endpoint(`/api/v1/seller/inventory/${variantId}/adjustments`);
  if (cursor) url.searchParams.set('cursor', cursor);
  const response = await fetcher(url, { cache: 'no-store', headers: { Accept: 'application/json, application/problem+json' } });
  let body: unknown;
  try { body = await response.json(); } catch { throw new RoleApiError(response.ok ? 'contract' : 'status', response.status); }
  const parsed = parseInventoryAdjustmentPage(body);
  if (!response.ok || !parsed) throw new RoleApiError(response.ok ? 'contract' : 'status', response.status);
  return parsed;
}
