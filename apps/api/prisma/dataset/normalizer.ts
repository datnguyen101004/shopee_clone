import { DATASET_POLICY_VERSION } from './manifest';
import { deterministicInteger, deterministicUuid, sha256, slugifyVietnamese } from './identifiers';
import type {
  CanonicalDatasetPlan,
  GeneratedFieldMetadata,
  LoadedDatasetSource,
  NormalizedDatasetProduct,
  NormalizedDatasetSource,
  RawDatasetRecord,
} from './types';

const PRODUCT_PLACEHOLDER_PATH = '/media/products/product-placeholder.svg';
const DATASET_CREATED_AT = Date.parse('2026-08-13T00:00:00.000Z');

function optionalString(record: RawDatasetRecord, key: keyof RawDatasetRecord): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalNumber(record: RawDatasetRecord, key: keyof RawDatasetRecord): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function generated(field: string, method: string): GeneratedFieldMetadata {
  return { field, policyVersion: DATASET_POLICY_VERSION, method };
}

function numericToken(value: string): number | null {
  const parsed = Number(value.replaceAll('.', '').replaceAll(',', '').trim());
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseOriginalPrice(notes: string | null): number | null {
  if (!notes) return null;
  const match = /Giá gốc:\s*([\d.,]+)/iu.exec(notes);
  return match?.[1] ? numericToken(match[1]) : null;
}

export function parseRatingCount(notes: string | null): number | null {
  if (!notes) return null;
  const match = /([\d.,]+)\s*(?:lượt\s*)?đánh giá/iu.exec(notes);
  return match?.[1] ? numericToken(match[1]) : null;
}

export function parseSoldCount(notes: string | null): number | null {
  if (!notes) return null;
  const match = /Đã bán\s*([\d.,]+)/iu.exec(notes);
  return match?.[1] ? numericToken(match[1]) : null;
}

export function categoryMedianPrice(records: RawDatasetRecord[]): number {
  const prices = records
    .map((record) => optionalNumber(record, 'price'))
    .filter((price): price is number => price !== null && Number.isSafeInteger(price) && price > 0)
    .sort((left, right) => left - right);
  if (!prices.length)
    throw new Error('A dataset category needs at least one positive source price.');
  const middle = Math.floor(prices.length / 2);
  return prices.length % 2 === 1
    ? prices[middle]!
    : Math.round((prices[middle - 1]! + prices[middle]!) / 2);
}

function sourceIdentity(record: RawDatasetRecord, sourceKey: string, sourceIndex: number): string {
  const productUrl = optionalString(record, 'product_url');
  if (productUrl) return `product_url:${productUrl}`;
  const productId = record.product_id;
  if (typeof productId === 'string' && productId.trim()) return `product_id:${productId.trim()}`;
  if (typeof productId === 'number' && Number.isFinite(productId)) return `product_id:${productId}`;
  const id = record.id;
  if (typeof id === 'string' && id.trim()) return `id:${id.trim()}`;
  if (typeof id === 'number' && Number.isFinite(id)) return `id:${id}`;
  const fallbackMaterial = [
    sourceKey,
    String(sourceIndex),
    optionalString(record, 'name') ?? '',
    optionalString(record, 'image_url') ?? '',
  ].join(':');
  return `fallback:${sha256(fallbackMaterial)}`;
}

function normalizeProduct(
  source: LoadedDatasetSource,
  record: RawDatasetRecord,
  sourceIndex: number,
  globalIndex: number,
  medianPrice: number,
): NormalizedDatasetProduct {
  const identity = sourceIdentity(record, source.manifest.key, sourceIndex);
  if (!identity.trim())
    throw new Error(`${source.manifest.fileName}[${sourceIndex}] has no identity.`);
  const stableRecordKey = sha256(`${source.manifest.key}:${identity}`);
  const generatedFields: GeneratedFieldMetadata[] = [];
  const digest = stableRecordKey.slice(0, 12);

  const sourceName = optionalString(record, 'name');
  const name =
    sourceName ?? `${source.manifest.category.name} ${sourceIndex + 1} ${digest.slice(0, 6)}`;
  if (!sourceName) generatedFields.push(generated('name', 'category-ordinal-and-digest'));

  const notes = optionalString(record, 'notes');
  const description =
    notes ?? `Thông tin sản phẩm ${name} thuộc danh mục ${source.manifest.category.name}.`;
  if (!notes) generatedFields.push(generated('description', 'category-aware-sentence'));

  const sourcePrice = optionalNumber(record, 'price');
  const priceMinor = sourcePrice ?? medianPrice;
  if (sourcePrice === null) generatedFields.push(generated('priceMinor', 'category-median'));

  const sourceRating = optionalNumber(record, 'rating');
  const ratingAverageBasisPoints =
    sourceRating === null
      ? deterministicInteger('dataset-rating', stableRecordKey, 400, 500)
      : Math.round(sourceRating * 100);
  if (sourceRating === null) generatedFields.push(generated('rating', 'stable-hash-4.00-to-5.00'));

  const parsedRatingCount = parseRatingCount(notes);
  const ratingCount =
    parsedRatingCount ?? deterministicInteger('dataset-rating-count', stableRecordKey, 1, 500);
  if (parsedRatingCount === null)
    generatedFields.push(generated('ratingCount', 'stable-hash-1-to-500'));

  const parsedSoldCount = parseSoldCount(notes);
  const soldCount =
    parsedSoldCount ?? deterministicInteger('dataset-sold-count', stableRecordKey, 0, 2_000);
  if (parsedSoldCount === null)
    generatedFields.push(generated('soldCount', 'stable-hash-0-to-2000'));

  const imageUrl = optionalString(record, 'image_url') ?? PRODUCT_PLACEHOLDER_PATH;
  if (!optionalString(record, 'image_url'))
    generatedFields.push(generated('image', 'local-placeholder'));

  const quantityOnHand = /Hết hàng/iu.test(notes ?? '')
    ? 0
    : deterministicInteger('dataset-inventory', stableRecordKey, 10, 209);
  generatedFields.push(
    generated('inventory', quantityOnHand === 0 ? 'parsed-out-of-stock' : 'stable-hash-10-to-209'),
  );

  const originalPrice = parseOriginalPrice(notes);
  const compareAtPriceMinor =
    originalPrice !== null && originalPrice > priceMinor ? BigInt(originalPrice) : null;
  const sourceWeightGrams = optionalNumber(record, 'weight_grams');
  const weightGrams =
    sourceWeightGrams ?? deterministicInteger('dataset-weight-grams', stableRecordKey, 1, 20) * 250;
  if (sourceWeightGrams === null)
    generatedFields.push(generated('weightGrams', 'stable-hash-250-to-5000-grams'));
  const productId = deterministicUuid(`dataset-product:${source.manifest.key}:${stableRecordKey}`);
  const productSlugBase = slugifyVietnamese(name).slice(0, 140) || 'san-pham';
  const productSlug = `${productSlugBase}-${digest}`;
  const variantId = deterministicUuid(`dataset-variant:${source.manifest.key}:${stableRecordKey}`);

  return {
    id: productId,
    sourceRecordId: deterministicUuid(
      `dataset-product-record:${source.manifest.key}:${stableRecordKey}`,
    ),
    sourceId: deterministicUuid(`dataset-source:${source.manifest.key}`),
    sourceKey: source.manifest.key,
    stableRecordKey,
    sourceIdentity: identity,
    sourceIndex,
    sourceProductUrl: optionalString(record, 'product_url'),
    sourcePageUrl: optionalString(record, 'source_page'),
    rawNotes: notes,
    rawPayload: record,
    generatedFields,
    categoryId: deterministicUuid(`dataset-category:${source.manifest.key}`),
    shopId: deterministicUuid(`dataset-shop:${source.manifest.key}`),
    slug: productSlug,
    name,
    description,
    ratingAverageBasisPoints,
    ratingCount,
    soldCount,
    createdAt: new Date(DATASET_CREATED_AT - globalIndex * 1_000),
    variant: {
      id: variantId,
      sku: `DS-${source.manifest.key.toUpperCase()}-${digest.toUpperCase()}`,
      name: 'Mặc định',
      priceMinor: BigInt(priceMinor),
      compareAtPriceMinor,
      weightGrams,
      quantityOnHand,
      quantityReserved: 0,
    },
    image: {
      id: deterministicUuid(`dataset-image:${source.manifest.key}:${stableRecordKey}`),
      url: imageUrl,
      altText: name,
    },
  };
}

function assertPlan(plan: CanonicalDatasetPlan): void {
  const stableKeys = new Set<string>();
  const productIds = new Set<string>();
  const slugs = new Set<string>();
  const skus = new Set<string>();
  for (const source of plan.sources) {
    const pickupProvince = source.shop.pickupProvince.trim();
    const pickupDistrict = source.shop.pickupDistrict.trim();
    if (
      !/^\d{2}$/.test(pickupProvince) ||
      !new RegExp(`^${pickupProvince}-\\d{3}$`).test(pickupDistrict)
    ) {
      throw new Error(`Invalid dataset shop pickup location for ${source.key}.`);
    }
    for (const product of source.products) {
      const scopedStableKey = `${source.key}:${product.stableRecordKey}`;
      const scopedSlug = `${source.shop.id}:${product.slug}`;
      if (stableKeys.has(scopedStableKey))
        throw new Error(`Duplicate stable key ${scopedStableKey}.`);
      if (productIds.has(product.id)) throw new Error(`Duplicate product ID ${product.id}.`);
      if (slugs.has(scopedSlug)) throw new Error(`Duplicate product slug ${product.slug}.`);
      if (skus.has(product.variant.sku)) throw new Error(`Duplicate SKU ${product.variant.sku}.`);
      stableKeys.add(scopedStableKey);
      productIds.add(product.id);
      slugs.add(scopedSlug);
      skus.add(product.variant.sku);
      if (!product.name.trim() || product.name.length > 240)
        throw new Error('Invalid product name.');
      if (!product.slug || product.slug.length > 160) throw new Error('Invalid product slug.');
      if (product.variant.priceMinor <= 0n) throw new Error('Invalid product price.');
      if (
        !Number.isSafeInteger(product.variant.weightGrams) ||
        product.variant.weightGrams < 1 ||
        product.variant.weightGrams > 1_000_000
      ) {
        throw new Error('Invalid product weight.');
      }
      if (product.variant.sku.length > 80) throw new Error('Invalid product SKU.');
      if (
        product.ratingAverageBasisPoints < 0 ||
        product.ratingAverageBasisPoints > 500 ||
        product.ratingCount < 0 ||
        product.soldCount < 0
      ) {
        throw new Error('Invalid product commerce metrics.');
      }
      if (
        product.variant.quantityOnHand < 0 ||
        product.variant.quantityReserved < 0 ||
        product.variant.quantityReserved > product.variant.quantityOnHand
      ) {
        throw new Error('Invalid product inventory.');
      }
    }
  }
}

export function createCanonicalDatasetPlan(loaded: LoadedDatasetSource[]): CanonicalDatasetPlan {
  let globalIndex = 0;
  const sources: NormalizedDatasetSource[] = loaded.map((source) => {
    const medianPrice = categoryMedianPrice(source.records);
    const sourceId = deterministicUuid(`dataset-source:${source.manifest.key}`);
    const categoryId = deterministicUuid(`dataset-category:${source.manifest.key}`);
    const ownerId = deterministicUuid(`dataset-owner:${source.manifest.key}`);
    const shopId = deterministicUuid(`dataset-shop:${source.manifest.key}`);
    const products = source.records.map((record, sourceIndex) =>
      normalizeProduct(source, record, sourceIndex, globalIndex++, medianPrice),
    );
    return {
      id: sourceId,
      key: source.manifest.key,
      fileName: source.manifest.fileName,
      sourceUrl: source.sourceUrl,
      checksum: source.checksum,
      recordCount: source.records.length,
      rootMetadata: source.rootMetadata,
      policyVersion: DATASET_POLICY_VERSION,
      category: { ...source.manifest.category, id: categoryId },
      owner: {
        id: ownerId,
        email: `dataset.${source.manifest.key}@shopee-clone.local`,
        displayName: `${source.manifest.shop.name} Dataset Owner`,
      },
      shop: { ...source.manifest.shop, id: shopId, ownerId },
      products,
    };
  });
  const products = sources.flatMap((source) => source.products);
  const plan: CanonicalDatasetPlan = {
    policyVersion: DATASET_POLICY_VERSION,
    totalRecords: products.length,
    generatedPriceCount: products.filter((product) =>
      product.generatedFields.some(({ field }) => field === 'priceMinor'),
    ).length,
    generatedRatingCount: products.filter((product) =>
      product.generatedFields.some(({ field }) => field === 'rating'),
    ).length,
    sources,
  };
  assertPlan(plan);
  return plan;
}
