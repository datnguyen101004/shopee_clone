export const homepageModuleTypes = [
  'campaign-banner',
  'category-shortcuts',
  'flash-sale',
  'top-selling',
  'mall',
  'daily-recommendations',
] as const;

export type HomepageModuleType = (typeof homepageModuleTypes)[number];

interface HomepageModuleBase {
  id: string;
  key: string;
  type: HomepageModuleType;
  title: string;
  subtitle?: string;
  sortOrder: number;
}

export interface HomepageBanner {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  imageUrl: string | null;
  altText: string;
  href: string;
  theme: string;
}

export interface HomepageCategoryShortcut {
  id: string;
  label: string;
  icon: string;
  href: string;
}

export interface HomepageProductSummary {
  id: string;
  name: string;
  shopName: string;
  href: string;
  imageUrl: string | null;
  imageAlt: string;
  priceMinor: number;
  compareAtPriceMinor?: number;
  label?: string;
  soldCount?: number;
}

export interface HomepageCampaignModule extends HomepageModuleBase {
  type: 'campaign-banner';
  banners: HomepageBanner[];
}

export interface HomepageCategoryModule extends HomepageModuleBase {
  type: 'category-shortcuts';
  categories: HomepageCategoryShortcut[];
}

export interface HomepageProductModule extends HomepageModuleBase {
  type: 'flash-sale' | 'top-selling' | 'mall' | 'daily-recommendations';
  products: HomepageProductSummary[];
  endsAt?: string;
}

export type HomepageModule =
  HomepageCampaignModule | HomepageCategoryModule | HomepageProductModule;

export interface HomepageResponse {
  evaluatedAt: string;
  modules: HomepageModule[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isString = (value: unknown): value is string => typeof value === 'string';
const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || isString(value);
const isSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value);
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value);

const hasBase = (value: Record<string, unknown>): boolean =>
  isString(value.id) &&
  isString(value.key) &&
  isString(value.title) &&
  isOptionalString(value.subtitle) &&
  isSafeInteger(value.sortOrder);

const isBanner = (value: unknown): value is HomepageBanner =>
  isRecord(value) &&
  isString(value.id) &&
  isOptionalString(value.eyebrow) &&
  isString(value.title) &&
  isOptionalString(value.description) &&
  isNullableString(value.imageUrl) &&
  isString(value.altText) &&
  isString(value.href) &&
  isString(value.theme);

const isCategory = (value: unknown): value is HomepageCategoryShortcut =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.label) &&
  isString(value.icon) &&
  isString(value.href);

const isProduct = (value: unknown): value is HomepageProductSummary =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isString(value.shopName) &&
  isString(value.href) &&
  isNullableString(value.imageUrl) &&
  isString(value.imageAlt) &&
  isSafeInteger(value.priceMinor) &&
  value.priceMinor >= 0 &&
  (value.compareAtPriceMinor === undefined || isSafeInteger(value.compareAtPriceMinor)) &&
  isOptionalString(value.label) &&
  (value.soldCount === undefined || isSafeInteger(value.soldCount));

export function isKnownHomepageModule(value: unknown): value is HomepageModule {
  if (!isRecord(value) || !hasBase(value) || !isString(value.type)) return false;
  if (value.type === 'campaign-banner') {
    return Array.isArray(value.banners) && value.banners.every(isBanner);
  }
  if (value.type === 'category-shortcuts') {
    return Array.isArray(value.categories) && value.categories.every(isCategory);
  }
  if (['flash-sale', 'top-selling', 'mall', 'daily-recommendations'].includes(value.type)) {
    return (
      Array.isArray(value.products) &&
      value.products.every(isProduct) &&
      isOptionalString(value.endsAt)
    );
  }
  return false;
}

export function parseHomepageResponse(value: unknown): HomepageResponse | null {
  if (
    !isRecord(value) ||
    !isString(value.evaluatedAt) ||
    Number.isNaN(Date.parse(value.evaluatedAt))
  ) {
    return null;
  }
  if (!Array.isArray(value.modules)) return null;
  return { evaluatedAt: value.evaluatedAt, modules: value.modules.filter(isKnownHomepageModule) };
}

export function isHomepageResponse(value: unknown): value is HomepageResponse {
  const parsed = parseHomepageResponse(value);
  return (
    parsed !== null &&
    isRecord(value) &&
    parsed.modules.length === (value.modules as unknown[]).length
  );
}
