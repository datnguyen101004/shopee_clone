export const FLASH_SALE_CONTRACT_VERSION = 'flash-sale-v1' as const;
export const FLASH_SALE_SKU_STATES = ['UPCOMING', 'ACTIVE', 'SOLD_OUT', 'ENDED'] as const;
export type FlashSaleSkuState = (typeof FLASH_SALE_SKU_STATES)[number];

export interface FlashSaleSkuSummary {
  id: string;
  campaignId: string;
  participationId: string;
  productId: string;
  variantId: string;
  referencePriceMinor: number;
  salePriceMinor: number;
  allocatedQuantity: number;
  remainingQuantity: number | null;
  state: FlashSaleSkuState;
  stateVersion: number;
  managementEpoch: number;
  startsAt: string;
  endsAt: string;
  endedAt: string | null;
  canPurchase: boolean;
  allowedPaymentMethods: ['COD'] | [];
}

export interface FlashSalePublicSkuStatus {
  variantId: string;
  productId: string;
  state: FlashSaleSkuState;
  stateVersion: number;
  salePriceMinor: number | null;
  canPurchase: boolean;
  startsAt: string;
  endsAt: string;
}

export interface FlashSaleStatusResponse {
  contractVersion: typeof FLASH_SALE_CONTRACT_VERSION;
  campaignId: string;
  serverTime: string;
  startsAt: string;
  endsAt: string;
  items: FlashSalePublicSkuStatus[];
}

export interface FlashSaleSellerSkuRow extends FlashSaleSkuSummary {
  sku: string;
  variantName: string;
  stockAvailable: number;
}

export interface FlashSaleSellerSnapshot {
  campaignId: string;
  version: number;
  items: FlashSaleSellerSkuRow[];
}

export interface FlashSaleRegisterRequest {
  version: number;
  items: Array<{ variantId: string; salePriceMinor: number; quota: number }>;
}
export interface FlashSaleQuotaRequest { version: number; quota: number; }
export interface FlashSaleReplenishRequest { version: number; additionalQuantity: number; }
export interface FlashSaleEndRequest { version: number; }

export function isFlashSaleSkuState(value: unknown): value is FlashSaleSkuState {
  return typeof value === 'string' && (FLASH_SALE_SKU_STATES as readonly string[]).includes(value);
}
