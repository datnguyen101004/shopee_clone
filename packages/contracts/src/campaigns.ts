/** Shared contracts for typed marketplace campaigns. */

export const CAMPAIGN_CONTRACT_VERSION = 'campaigns-v1' as const;
export const CAMPAIGN_TYPE_CODES = ['STANDARD', 'FLASH_SALE', 'CHEAPEST_DEALS'] as const;
export type CampaignTypeCode = (typeof CAMPAIGN_TYPE_CODES)[number] | (string & {});
export const CAMPAIGN_PRESENTATION_KEYS = ['STANDARD', 'FLASH_SALE', 'CHEAPEST_DEALS', 'GENERIC'] as const;
export type CampaignPresentationKey = (typeof CAMPAIGN_PRESENTATION_KEYS)[number];
export const CAMPAIGN_PRODUCT_ORDER_KEYS = ['CURATED', 'DISCOUNT_DESC', 'PRICE_ASC'] as const;
export type CampaignProductOrderKey = (typeof CAMPAIGN_PRODUCT_ORDER_KEYS)[number];
export const CAMPAIGN_RANKING_PROFILE_KEYS = ['NORMAL_V1', 'FEATURED_FLASH_SALE_V1', 'SAFE_FALLBACK_V1'] as const;
export type CampaignRankingProfileKey = (typeof CAMPAIGN_RANKING_PROFILE_KEYS)[number];
export const CAMPAIGN_IMPORTANCE_CLASSES = ['NORMAL', 'FEATURED'] as const;
export type CampaignImportanceClass = (typeof CAMPAIGN_IMPORTANCE_CLASSES)[number];
export const CAMPAIGN_LIFECYCLE_VALUES = [
  'DRAFT',
  'ANNOUNCED',
  'ENROLLMENT_OPEN',
  'SCHEDULED',
  'ACTIVE',
  'ENDED',
  'CANCELLED',
] as const;
export type CampaignLifecycle = (typeof CAMPAIGN_LIFECYCLE_VALUES)[number];
export const CAMPAIGN_PARTICIPATION_STATES = [
  'UNRESPONDED',
  'JOINED',
  'DECLINED',
  'WITHDRAWN',
  'LOCKED',
] as const;
export type CampaignParticipationState = (typeof CAMPAIGN_PARTICIPATION_STATES)[number];
export type CampaignProductGroup = 'ACTIVE' | 'UPCOMING_LOCKED' | 'HISTORY';

export interface CampaignTypeSummary {
  code: string;
  displayName: string;
  description: string;
  importanceClass: CampaignImportanceClass;
  policyVersion: number;
  presentationKey: CampaignPresentationKey;
  productOrderKey: CampaignProductOrderKey;
  rankingProfileKey: CampaignRankingProfileKey;
  enabled: boolean;
}

export interface CampaignProductSummary {
  id: string;
  name: string;
  slug: string;
  shopName: string;
  imageUrl: string | null;
  basePriceMinor: number;
  effectivePriceMinor: number;
  discountBasisPoints: number;
  soldCount: number;
  inventoryAvailable: number;
  href: string;
}

export interface CampaignSummary {
  id: string;
  type: CampaignTypeSummary;
  title: string;
  description: string | null;
  lifecycle: CampaignLifecycle;
  announceAt: string;
  enrollmentStartsAt: string;
  enrollmentEndsAt: string;
  startsAt: string;
  endsAt: string;
  minimumDiscountBasisPoints: number;
  sellerState?: CampaignParticipationState;
  submittedProductCount?: number;
  href: string;
}

export interface CampaignBannerDetail extends CampaignSummary {
  eyebrow: string | null;
  content: CampaignContentBlock[];
  imageUrl: string | null;
  altText: string;
  theme: string;
  products: CampaignProductSummary[];
  nextCursor: string | null;
  evaluatedAt: string;
}

export type CampaignContentBlock =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'link'; label: string; href: string };

export interface CampaignTypePolicyInput {
  minimumDiscountBasisPoints?: number;
  maximumProductsPerSeller?: number;
}

export interface CreateCampaignRequest {
  typeCode: string;
  title: string;
  eyebrow?: string | null;
  description?: string | null;
  content: CampaignContentBlock[];
  imageUrl?: string | null;
  altText: string;
  theme?: string;
  announceAt: string;
  enrollmentStartsAt: string;
  enrollmentEndsAt: string;
  startsAt: string;
  endsAt: string;
  minimumDiscountBasisPoints: number;
  categoryIds?: string[];
  policy?: CampaignTypePolicyInput;
}

export interface UpdateCampaignRequest extends Partial<CreateCampaignRequest> {
  version: number;
}

export interface CampaignAdminSummary extends CampaignSummary {
  version: number;
  sellerJoinedCount: number;
  sellerDeclinedCount: number;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignAdminPage {
  items: CampaignAdminSummary[];
  nextCursor: string | null;
}

export interface CampaignCollectionConfig {
  id: string;
  moduleId: string;
  campaignId: string;
  type: CampaignTypeSummary;
  sortOrder: number;
  enabled: boolean;
}

export interface CampaignPlacementRequest { moduleId: string; sortOrder?: number; enabled?: boolean; }
export interface CampaignParticipationReport { shopId: string; state: CampaignParticipationState; version: number; submittedProductCount: number; respondedAt: string | null; }
export interface CampaignParticipationPage { items: CampaignParticipationReport[]; nextCursor: string | null; }

export interface CampaignNotificationMetadata {
  campaignId: string;
  typeCode: string;
  lifecycle: Extract<CampaignLifecycle, 'ANNOUNCED' | 'ENROLLMENT_OPEN'>;
  enrollmentEndsAt: string;
  href: string;
}

export interface SellerCampaignPage {
  items: CampaignSummary[];
  nextCursor: string | null;
}

export interface SellerCampaignDetail extends CampaignSummary {
  type: CampaignTypeSummary;
  content: CampaignContentBlock[];
  imageUrl: string | null;
  altText: string;
  eligibleProducts: Array<CampaignProductSummary & {
    eligible: boolean;
    reason: string | null;
    submittedDiscountBasisPoints: number | null;
  }>;
  participationVersion: number | null;
}

export interface SellerCampaignParticipationRequest {
  decision: 'JOINED' | 'DECLINED';
  version: number | null;
  products?: Array<{ productId: string; discountBasisPoints: number }>;
}

export interface CampaignParticipationResponse {
  campaignId: string;
  state: CampaignParticipationState;
  version: number;
  products: Array<{ productId: string; discountBasisPoints: number }>;
  updatedAt: string;
}

export interface SellerProductCampaignEntry {
  campaignId: string;
  type: CampaignTypeSummary;
  title: string;
  state: CampaignParticipationState;
  group: CampaignProductGroup;
  startsAt: string;
  endsAt: string;
  discountBasisPoints: number;
  effectivePriceMinor: number | null;
  eligibility: 'ELIGIBLE' | 'INELIGIBLE' | 'WITHDRAWN' | 'ENDED' | 'CANCELLED';
  reason: string | null;
  href: string;
}

export interface SellerProductCampaignSummary {
  campaignId: string;
  typeCode: string;
  typeLabel: string;
  title: string;
  state: CampaignParticipationState;
  group: CampaignProductGroup;
  startsAt: string;
  endsAt: string;
  discountBasisPoints: number;
}

const campaignRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const canonicalCampaignDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** Runtime guard used by seller-product responses so optional campaign fields
 * can be rolled out without weakening the rest of the product contract. */
export function isCampaignTypeSummary(value: unknown): value is CampaignTypeSummary {
  if (!campaignRecord(value)) return false;
  return isCampaignTypeCode(value.code) && typeof value.displayName === 'string' &&
    typeof value.description === 'string' && isCampaignImportanceClass(value.importanceClass) &&
    Number.isSafeInteger(value.policyVersion) && typeof value.presentationKey === 'string' &&
    typeof value.productOrderKey === 'string' && typeof value.rankingProfileKey === 'string' &&
    typeof value.enabled === 'boolean';
}

export function isSellerProductCampaignSummary(value: unknown): value is SellerProductCampaignSummary {
  if (!campaignRecord(value)) return false;
  return typeof value.campaignId === 'string' &&
    isCampaignTypeCode(value.typeCode) && typeof value.typeLabel === 'string' &&
    typeof value.title === 'string' && isCampaignParticipationState(value.state) &&
    ['ACTIVE', 'UPCOMING_LOCKED', 'HISTORY'].includes(String(value.group)) &&
    canonicalCampaignDate(value.startsAt) && canonicalCampaignDate(value.endsAt) &&
    typeof value.discountBasisPoints === 'number' && Number.isSafeInteger(value.discountBasisPoints) && value.discountBasisPoints >= 1 && value.discountBasisPoints <= 9000;
}

export function isCampaignTypeCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(value);
}

export function isCampaignImportanceClass(value: unknown): value is CampaignImportanceClass {
  return typeof value === 'string' && (CAMPAIGN_IMPORTANCE_CLASSES as readonly string[]).includes(value);
}

export function isCampaignLifecycle(value: unknown): value is CampaignLifecycle {
  return typeof value === 'string' && (CAMPAIGN_LIFECYCLE_VALUES as readonly string[]).includes(value);
}

export function isCampaignParticipationState(value: unknown): value is CampaignParticipationState {
  return typeof value === 'string' && (CAMPAIGN_PARTICIPATION_STATES as readonly string[]).includes(value);
}

export function campaignLifecycleAt(input: {
  publishedAt: Date | string | null;
  cancelledAt: Date | string | null;
  announceAt: Date | string;
  enrollmentStartsAt: Date | string;
  enrollmentEndsAt: Date | string;
  startsAt: Date | string;
  endsAt: Date | string;
}, now: Date = new Date()): CampaignLifecycle {
  if (input.cancelledAt) return 'CANCELLED';
  if (!input.publishedAt) return 'DRAFT';
  const time = now.getTime();
  if (time < new Date(input.announceAt).getTime()) return 'DRAFT';
  if (time < new Date(input.enrollmentStartsAt).getTime()) return 'ANNOUNCED';
  if (time < new Date(input.enrollmentEndsAt).getTime()) return 'ENROLLMENT_OPEN';
  if (time < new Date(input.startsAt).getTime()) return 'SCHEDULED';
  if (time < new Date(input.endsAt).getTime()) return 'ACTIVE';
  return 'ENDED';
}
