/** Types and contracts for T35 SKU-level Flash Sale */

export type FlashSaleSkuState = 'UPCOMING' | 'ACTIVE' | 'SOLD_OUT' | 'ENDED';

export interface FlashSaleSkuItem {
  id: string;
  campaignId: string;
  productId: string;
  variantId: string;
  variantName: string;
  skuCode: string;
  imageUrl: string | null;
  basePriceMinor: number;
  salePriceMinor: number;
  availablePhysical: number;
  allocatedQuantity: number;
  remainingQuantity: number;
  netConsumedQuantity: number;
  version: number;
  state: FlashSaleSkuState;
  canEditQuota: boolean;
  canReplenish: boolean;
  canEnd: boolean;
  endedAt?: string | null;
  endedReason?: string | null;
}

export interface SellerFlashSaleProductGroup {
  productId: string;
  productName: string;
  productSlug: string;
  imageUrl: string | null;
  skus: FlashSaleSkuItem[];
}

export interface RegisterSellerFlashSaleSkuInput {
  variantId: string;
  salePriceMinor: number;
  quota: number;
}

export interface RegisterSellerFlashSaleSkusRequest {
  version: number;
  items: RegisterSellerFlashSaleSkuInput[];
}

export interface UpdateFlashSaleQuotaRequest {
  version: number;
  quota: number;
}

export interface ReplenishFlashSaleQuotaRequest {
  version: number;
  additionalQuantity: number;
}

export interface EndFlashSaleSkuRequest {
  version: number;
}

export interface FlashSaleSkuStatusItem {
  variantId: string;
  productId?: string;
  state: FlashSaleSkuState;
  stateVersion: number;
  salePriceMinor: number | null;
  canPurchase: boolean;
  startsAt?: string;
  endsAt?: string;
}

export interface FlashSaleStatusResponse {
  contractVersion?: string;
  campaignId?: string;
  serverTime: string;
  startsAt: string;
  endsAt: string;
  items: FlashSaleSkuStatusItem[];
}

export type CheckoutAdmissionState = 'WAITING' | 'ADMITTED' | 'EXPIRED' | 'CLOSED';

export interface CheckoutTicketResponse {
  ticketId: string;
  status: CheckoutAdmissionState;
  retryAfterSeconds: number;
  leaseExpiresAt?: string | null;
  message?: string;
}

export interface CheckoutResultLookupResponse {
  idempotencyKey: string;
  purchaseReference: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'NOT_FOUND';
}

export const FLASH_SALE_ERROR_CODES = {
  SOLD_OUT: 'FLASH_SALE_SOLD_OUT',
  LIMIT_REACHED: 'FLASH_SALE_LIMIT_REACHED',
  COD_ONLY: 'FLASH_SALE_COD_ONLY',
  QUOTA_LOCKED: 'FLASH_SALE_QUOTA_LOCKED',
  ENDED: 'FLASH_SALE_ENDED',
  STOCK_INSUFFICIENT: 'FLASH_SALE_STOCK_INSUFFICIENT',
  BUSY: 'FLASH_SALE_BUSY',
  ADMISSION_REQUIRED: 'ADMISSION_REQUIRED',
  ADMISSION_INVALID: 'ADMISSION_INVALID',
  ADMISSION_EXPIRED: 'ADMISSION_EXPIRED',
  WAITING_ROOM_FULL: 'WAITING_ROOM_FULL',
} as const;
