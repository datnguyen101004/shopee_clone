import { RoleApiError, type AuthenticatedFetcher } from './role-api';
import type {
  FlashSaleSkuItem,
  SellerFlashSaleProductGroup,
  RegisterSellerFlashSaleSkusRequest,
  UpdateFlashSaleQuotaRequest,
  ReplenishFlashSaleQuotaRequest,
  EndFlashSaleSkuRequest,
  FlashSaleStatusResponse,
  CheckoutTicketResponse,
  CheckoutResultLookupResponse,
} from './flash-sale-types';

const apiBase = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

type RawSellerSku = {
  id: string;
  campaignId: string;
  productId: string;
  variantId: string;
  referencePriceMinor: number;
  salePriceMinor: number;
  allocatedQuantity: number;
  remainingQuantity: number | null;
  state: FlashSaleSkuItem['state'];
  stateVersion: number;
  endedAt: string | null;
  canPurchase: boolean;
  sku: string;
  variantName: string;
  stockAvailable: number;
};

type RawSellerSnapshot = { campaignId: string; version: number; items: RawSellerSku[] };
export type SellerFlashSaleProductMetadata = { name: string; slug: string; imageUrl: string | null };

export interface SellerFlashSaleSnapshotView {
  campaignId: string;
  version: number;
  groups: SellerFlashSaleProductGroup[];
}

function mapSellerSnapshot(
  snapshot: RawSellerSnapshot,
  metadata: Record<string, SellerFlashSaleProductMetadata> = {},
): SellerFlashSaleProductGroup[] {
  const grouped = new Map<string, SellerFlashSaleProductGroup>();
  for (const item of snapshot.items) {
    const group = grouped.get(item.productId) ?? {
      productId: item.productId,
      productName: metadata[item.productId]?.name ?? `Sản phẩm ${item.productId.slice(0, 8)}`,
      productSlug: metadata[item.productId]?.slug ?? item.productId,
      imageUrl: metadata[item.productId]?.imageUrl ?? null,
      skus: [],
    };
    group.skus.push({
      id: item.id,
      campaignId: item.campaignId,
      productId: item.productId,
      variantId: item.variantId,
      variantName: item.variantName,
      skuCode: item.sku,
      imageUrl: null,
      basePriceMinor: item.referencePriceMinor,
      salePriceMinor: item.salePriceMinor,
      availablePhysical: item.stockAvailable,
      allocatedQuantity: item.allocatedQuantity,
      remainingQuantity: item.remainingQuantity ?? 0,
      netConsumedQuantity: Math.max(0, item.allocatedQuantity - (item.remainingQuantity ?? 0)),
      version: item.stateVersion,
      state: item.state,
      canEditQuota: item.state === 'UPCOMING',
      canReplenish: item.state === 'SOLD_OUT',
      canEnd: item.state === 'SOLD_OUT',
      endedAt: item.endedAt,
      endedReason: null,
    });
    grouped.set(item.productId, group);
  }
  return [...grouped.values()];
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    let problem: { detail?: string; invalidParameters?: string[]; code?: string; retryAfterSeconds?: number; type?: string } | undefined = undefined;
    if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
      try {
        const parsed = await response.json();
        if (parsed && typeof parsed === 'object') {
          problem = parsed as { detail?: string; invalidParameters?: string[]; code?: string; retryAfterSeconds?: number; type?: string };
        }
      } catch {
        // ignore parse error
      }
    }
    const retryAfter = Number(response.headers.get('Retry-After'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      problem = { ...(problem ?? {}), retryAfterSeconds: retryAfter };
    }
    throw new RoleApiError(
      'status',
      response.status,
      problem,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function fetchSellerFlashSaleSkus(
  fetcher: AuthenticatedFetcher,
  campaignId: string,
): Promise<SellerFlashSaleProductGroup[]> {
  return (await fetchSellerFlashSaleSnapshot(fetcher, campaignId)).groups;
}

export async function fetchSellerFlashSaleSnapshot(
  fetcher: AuthenticatedFetcher,
  campaignId: string,
  metadata?: Record<string, SellerFlashSaleProductMetadata>,
): Promise<SellerFlashSaleSnapshotView> {
  const url = new URL(`/api/v1/seller/campaigns/${encodeURIComponent(campaignId)}/flash-sale`, apiBase());
  const res = await fetcher(url, { cache: 'no-store' });
  const snapshot = await handleResponse<RawSellerSnapshot>(res);
  return { campaignId: snapshot.campaignId, version: snapshot.version, groups: mapSellerSnapshot(snapshot, metadata) };
}

export async function registerSellerFlashSaleSkus(
  fetcher: AuthenticatedFetcher,
  campaignId: string,
  payload: RegisterSellerFlashSaleSkusRequest,
  idempotencyKey = crypto.randomUUID(),
): Promise<FlashSaleSkuItem[]> {
  const url = new URL(`/api/v1/seller/campaigns/${encodeURIComponent(campaignId)}/flash-sale/skus`, apiBase());
  const res = await fetcher(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<RawSellerSnapshot>(res).then(mapSellerSnapshot).then((groups) => groups.flatMap((group) => group.skus));
}

export async function updateSellerFlashSaleSkuQuota(
  fetcher: AuthenticatedFetcher,
  campaignId: string,
  variantId: string,
  payload: UpdateFlashSaleQuotaRequest,
  idempotencyKey = crypto.randomUUID(),
): Promise<FlashSaleSkuItem> {
  const url = new URL(
    `/api/v1/seller/campaigns/${encodeURIComponent(campaignId)}/flash-sale/skus/${encodeURIComponent(variantId)}/quota`,
    apiBase(),
  );
  const res = await fetcher(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<RawSellerSnapshot>(res).then(mapSellerSnapshot).then((groups) => groups.flatMap((group) => group.skus).find((sku) => sku.variantId === variantId) as FlashSaleSkuItem);
}

export async function replenishSellerFlashSaleSku(
  fetcher: AuthenticatedFetcher,
  campaignId: string,
  variantId: string,
  payload: ReplenishFlashSaleQuotaRequest,
  idempotencyKey = crypto.randomUUID(),
): Promise<FlashSaleSkuItem> {
  const url = new URL(
    `/api/v1/seller/campaigns/${encodeURIComponent(campaignId)}/flash-sale/skus/${encodeURIComponent(variantId)}/replenish`,
    apiBase(),
  );
  const res = await fetcher(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<RawSellerSnapshot>(res).then(mapSellerSnapshot).then((groups) => groups.flatMap((group) => group.skus).find((sku) => sku.variantId === variantId) as FlashSaleSkuItem);
}

export async function endSellerFlashSaleSku(
  fetcher: AuthenticatedFetcher,
  campaignId: string,
  variantId: string,
  payload: EndFlashSaleSkuRequest,
  idempotencyKey = crypto.randomUUID(),
): Promise<FlashSaleSkuItem> {
  const url = new URL(
    `/api/v1/seller/campaigns/${encodeURIComponent(campaignId)}/flash-sale/skus/${encodeURIComponent(variantId)}/end`,
    apiBase(),
  );
  const res = await fetcher(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<RawSellerSnapshot>(res).then(mapSellerSnapshot).then((groups) => groups.flatMap((group) => group.skus).find((sku) => sku.variantId === variantId) as FlashSaleSkuItem);
}

export async function fetchFlashSaleStatus(
  campaignId: string,
  variantIds: string[],
): Promise<FlashSaleStatusResponse> {
  const url = new URL(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/flash-sale/status`, apiBase());
  url.searchParams.set('variantIds', variantIds.join(','));
  const res = await fetch(url, { cache: 'no-store' });
  return handleResponse<FlashSaleStatusResponse>(res);
}

export async function requestCheckoutTicket(
  fetcher: AuthenticatedFetcher,
  idempotencyKey = crypto.randomUUID(),
): Promise<CheckoutTicketResponse> {
  const url = new URL('/api/v1/admission/checkout/tickets', apiBase());
  const res = await fetcher(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
  });
  const response = await handleResponse<{ gateId: string; ticketId: string; state: CheckoutTicketResponse['status']; retryAfterSeconds: number; leaseExpiresAt: string | null; message?: string }>(res);
  return { ticketId: response.ticketId, status: response.state, retryAfterSeconds: response.retryAfterSeconds, leaseExpiresAt: response.leaseExpiresAt, message: response.message };
}

export async function fetchCheckoutTicketStatus(
  fetcher: AuthenticatedFetcher,
  ticketId: string,
): Promise<CheckoutTicketResponse> {
  const url = new URL('/api/v1/admission/checkout/status', apiBase());
  url.searchParams.set('ticketId', ticketId);
  const res = await fetcher(url, { cache: 'no-store' });
  const response = await handleResponse<{ gateId: string; ticketId: string; state: CheckoutTicketResponse['status']; retryAfterSeconds: number; leaseExpiresAt: string | null; message?: string }>(res);
  return { ticketId: response.ticketId, status: response.state, retryAfterSeconds: response.retryAfterSeconds, leaseExpiresAt: response.leaseExpiresAt, message: response.message };
}

export async function leaveCheckoutQueue(
  fetcher: AuthenticatedFetcher,
  ticketId: string,
): Promise<{ success: boolean }> {
  const url = new URL('/api/v1/admission/checkout/ticket', apiBase());
  url.searchParams.set('ticketId', ticketId);
  const res = await fetcher(url, { method: 'DELETE' });
  await handleResponse<void>(res);
  return { success: true };
}

export type CheckoutLeaseRelinquishMode = 'EXPLICIT' | 'PAGE_LEAVE';

export async function relinquishCheckoutLease(
  fetcher: AuthenticatedFetcher,
  ticketId: string,
  browserInstanceId: string,
  mode: CheckoutLeaseRelinquishMode = 'EXPLICIT',
): Promise<void> {
  const url = new URL('/api/v1/admission/checkout/relinquish', apiBase());
  const res = await fetcher(url, {
    method: 'POST',
    keepalive: mode === 'PAGE_LEAVE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId, browserInstanceId, mode }),
  });
  await handleResponse<void>(res);
}

export async function heartbeatCheckoutLease(
  fetcher: AuthenticatedFetcher,
  ticketId: string,
  browserInstanceId: string,
): Promise<void> {
  const url = new URL('/api/v1/admission/checkout/heartbeat', apiBase());
  const res = await fetcher(url, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId, browserInstanceId }),
  });
  await handleResponse<void>(res);
}

export async function lookupCheckoutResult(
  fetcher: AuthenticatedFetcher,
  idempotencyKey: string,
): Promise<CheckoutResultLookupResponse> {
  const url = new URL(`/api/v1/admission/checkout/results/${encodeURIComponent(idempotencyKey)}`, apiBase());
  try {
    const res = await fetcher(url, { cache: 'no-store' });
    const purchase = await handleResponse<{ purchaseReference: string }>(res);
    return { idempotencyKey, purchaseReference: purchase.purchaseReference, status: 'CONFIRMED' };
  } catch (error) {
    if (error instanceof RoleApiError && error.status === 404) {
      return { idempotencyKey, purchaseReference: null, status: 'NOT_FOUND' };
    }
    throw error;
  }
}
