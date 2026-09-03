import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { NestFactory } from '@nestjs/core';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { ProductSearchProjectionBuilder } from '../src/search/product-search-projection.builder';
import { ProductSearchProjectionRepository } from '../src/search/product-search-projection.repository';
import {
  canonicalSnapshotProducts,
  type RelevanceDataset,
  type RelevanceJudgment,
  type RelevanceQueryDefinition,
  type RelevanceSnapshotProduct,
  snapshotSha256,
} from '../src/search/search-evaluation';
import { SearchModule } from '../src/search/search.module';
import { normalizeProductSearchText } from '../src/search/product-search-document';

const DATASET_VERSION = 'v1';

function repositoryRoot(startDirectory = process.cwd()): string {
  let current = path.resolve(startDirectory);
  while (true) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error('Could not locate repository root.');
    current = parent;
  }
}

const OUTPUT_DIRECTORY = path.join(repositoryRoot(), 'data/search/relevance', DATASET_VERSION);

type IndexedDocument = Extract<
  Awaited<ReturnType<ProductSearchProjectionBuilder['buildMany']>>[number],
  { kind: 'index' }
>['document'];

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function normalizedTokens(value: string): string[] {
  return normalizeProductSearchText(value).split(' ').filter(Boolean);
}

function hasDiacritics(value: string): boolean {
  return /[À-ỹĐđ]/u.test(value);
}

function snapshotProduct(document: IndexedDocument): RelevanceSnapshotProduct {
  return {
    id: document.product_id,
    name: document.name,
    description: document.description,
    categorySlug: document.category_slug,
    categoryName: document.category_name,
    categoryPathSlugs: document.category_path_slugs,
    categoryPathNames: document.category_path_names,
    shopSlug: document.shop_slug,
    shopName: document.shop_name,
    location: document.shop_location,
    effectivePriceMinor: document.effective_price_minor,
    soldCount: document.sold_count,
    ratingAverageBasisPoints: document.rating_average_basis_points,
    ratingCount: document.rating_count,
    inventoryAvailable: document.inventory_available,
    promotionActive: document.promotion_active,
    productCreatedAt: document.product_created_at,
    productUpdatedAt: document.product_updated_at,
    displayable: true,
  };
}

function allTokensMatch(value: string, query: string): boolean {
  const words = new Set(normalizedTokens(value));
  return normalizedTokens(query).every((token) => words.has(token) || value.includes(token));
}

function lexicalLabel(product: RelevanceSnapshotProduct, query: string): 0 | 1 | 2 | 3 {
  const normalizedQuery = normalizeProductSearchText(query);
  if (!normalizedQuery) return 0;
  const normalizedName = normalizeProductSearchText(product.name);
  const normalizedCategory = normalizeProductSearchText(product.categoryName);
  const normalizedShop = normalizeProductSearchText(product.shopName);
  const normalizedDescription = normalizeProductSearchText(product.description);
  if (normalizedName === normalizedQuery) return 3;
  if (normalizedName.includes(normalizedQuery) || allTokensMatch(product.name, query)) return 2;
  if (normalizedCategory.includes(normalizedQuery) || normalizedShop.includes(normalizedQuery))
    return 2;
  if (allTokensMatch(product.categoryName, query) || allTokensMatch(product.shopName, query))
    return 2;
  if (normalizedDescription.includes(normalizedQuery) || allTokensMatch(product.description, query))
    return 1;
  return 0;
}

function labelFor(
  query: RelevanceQueryDefinition,
  product: RelevanceSnapshotProduct,
): 0 | 1 | 2 | 3 {
  if (query.expectedZero || query.group === 'irrelevant' || !query.query) return 0;
  const filters = query.filters;
  if (
    (filters.category && filters.category !== product.categorySlug) ||
    (filters.minPrice !== null &&
      filters.minPrice !== undefined &&
      product.effectivePriceMinor < filters.minPrice) ||
    (filters.maxPrice !== null &&
      filters.maxPrice !== undefined &&
      product.effectivePriceMinor > filters.maxPrice) ||
    (filters.rating !== null &&
      filters.rating !== undefined &&
      product.ratingAverageBasisPoints < filters.rating * 100) ||
    (filters.location &&
      normalizeProductSearchText(filters.location) !==
        normalizeProductSearchText(product.location)) ||
    (filters.availability === 'in-stock' && product.inventoryAvailable <= 0) ||
    (filters.promotion === 'discounted' && !product.promotionActive)
  )
    return 0;

  const lexical = lexicalLabel(product, query.query);
  if (
    query.group === 'category' &&
    query.filters.category &&
    product.categoryPathSlugs.includes(query.filters.category)
  )
    return 3;
  if (
    query.group === 'shop' &&
    normalizeProductSearchText(product.shopName) === normalizeProductSearchText(query.query)
  )
    return 3;
  if (query.targetProductIds?.includes(product.id)) return 3;
  return lexical;
}

function buildQueries(products: readonly RelevanceSnapshotProduct[]): RelevanceQueryDefinition[] {
  const categories = uniqueBy(products, (product) => product.categorySlug).sort((left, right) =>
    left.categoryName.localeCompare(right.categoryName, 'vi'),
  );
  const shops = uniqueBy(products, (product) => product.shopSlug).sort((left, right) =>
    left.shopName.localeCompare(right.shopName, 'vi'),
  );
  const selectedExact = uniqueBy(
    products.filter(
      (product) => product.name.length <= 100 && normalizedTokens(product.name).length >= 2,
    ),
    (product) => product.categorySlug,
  ).slice(0, 12);
  const accented = products
    .filter(
      (product) =>
        product.name.length <= 100 &&
        normalizeProductSearchText(product.name).length <= 120 &&
        hasDiacritics(product.name) &&
        normalizeProductSearchText(product.name) !== product.name.toLowerCase(),
    )
    .slice(0, 8);
  const queries: RelevanceQueryDefinition[] = [];

  selectedExact.forEach((product, index) => {
    queries.push({
      id: `exact-name-${String(index + 1).padStart(2, '0')}`,
      group: 'exact-name',
      query: product.name,
      sort: 'relevance',
      filters: {},
      expectedZero: false,
      targetProductIds: [product.id],
      benchmark: index < 2,
    });
  });

  accented.forEach((product, index) => {
    queries.push({
      id: `accented-unaccented-${String(index + 1).padStart(2, '0')}`,
      group: 'accented-unaccented',
      query: normalizeProductSearchText(product.name),
      sort: 'relevance',
      filters: {},
      expectedZero: false,
      targetProductIds: [product.id],
      benchmark: index < 2,
    });
  });

  categories.forEach((category, index) => {
    queries.push({
      id: `category-${String(index + 1).padStart(2, '0')}`,
      group: 'category',
      query: category.categoryName,
      sort: 'relevance',
      filters: { category: category.categorySlug },
      expectedZero: false,
      benchmark: index === 0,
    });
  });

  shops.slice(0, 8).forEach((shop, index) => {
    queries.push({
      id: `shop-${String(index + 1).padStart(2, '0')}`,
      group: 'shop',
      query: shop.shopName,
      sort: 'relevance',
      filters: {},
      expectedZero: false,
      benchmark: index === 0,
    });
  });

  const filterProducts = products
    .filter((product) => product.effectivePriceMinor > 0)
    .filter((product) => normalizedTokens(product.name).length >= 2)
    .slice(0, 8);
  filterProducts.forEach((product, index) => {
    const filters: RelevanceQueryDefinition['filters'] = {
      minPrice: Math.max(0, Math.floor(product.effectivePriceMinor * 0.5)),
      maxPrice: product.effectivePriceMinor,
      availability: 'in-stock',
    };
    if (product.ratingAverageBasisPoints >= 200) {
      filters.rating = Math.max(1, Math.floor(product.ratingAverageBasisPoints / 100));
    }
    if (index === 0) filters.location = product.location;
    if (index === 1 && product.promotionActive) filters.promotion = 'discounted';
    queries.push({
      id: `filter-${String(index + 1).padStart(2, '0')}`,
      group: 'filter',
      query: product.name,
      sort: 'relevance',
      filters,
      expectedZero: false,
      targetProductIds: [product.id],
      benchmark: index < 2,
    });
  });

  const sortCategory = categories[0]?.categorySlug ?? null;
  (['price-asc', 'price-desc', 'best-selling', 'newest'] as const).forEach((sort) => {
    queries.push({
      id: `explicit-sort-${sort}`,
      group: 'explicit-sort',
      query: null,
      sort,
      filters: sortCategory ? { category: sortCategory } : {},
      expectedZero: false,
      benchmark: true,
      evaluateRelevance: false,
    });
  });

  ['zzzxqv-expected-zero', 'product-does-not-exist-991', 'qwerty-no-catalogue-match'].forEach(
    (query, index) => {
      queries.push({
        id: `expected-zero-${String(index + 1).padStart(2, '0')}`,
        group: 'expected-zero',
        query,
        sort: 'relevance',
        filters: {},
        expectedZero: true,
        benchmark: index === 0,
      });
    },
  );

  ['áo thun dành cho phi hành gia trên sao hỏa', 'bàn ăn cho robot dưới biển'].forEach(
    (query, index) => {
      queries.push({
        id: `irrelevant-${String(index + 1).padStart(2, '0')}`,
        group: 'irrelevant',
        query,
        sort: 'relevance',
        filters: {},
        expectedZero: false,
      });
    },
  );
  return queries;
}

function reasonFor(
  query: RelevanceQueryDefinition,
  product: RelevanceSnapshotProduct,
  label: number,
): string {
  if (query.targetProductIds?.includes(product.id)) return 'Target product for the query.';
  if (query.group === 'category') return 'Product belongs to the queried category.';
  if (query.group === 'shop') return 'Product belongs to the queried shop.';
  if (query.group === 'filter') return 'Product matches the query and active filters.';
  if (label === 2) return 'Strong partial lexical or metadata match.';
  return 'Weak description or metadata match.';
}

async function main(): Promise<void> {
  loadRepositoryEnvironment();
  const app = await NestFactory.createApplicationContext(SearchModule, {
    logger: ['error', 'warn'],
  });
  try {
    const repository = app.get(ProductSearchProjectionRepository);
    const builder = app.get(ProductSearchProjectionBuilder);
    const capturedAt = new Date();
    const projections = await builder.buildMany(
      await repository.findSellableProducts(),
      capturedAt,
    );
    const products = canonicalSnapshotProducts(
      projections.flatMap((projection) =>
        projection.kind === 'index' ? [snapshotProduct(projection.document)] : [],
      ),
    );
    if (products.length === 0)
      throw new Error('Cannot create relevance dataset: catalogue snapshot is empty.');
    const sha256 = snapshotSha256(products);
    const snapshotId = `catalogue-${DATASET_VERSION}-${capturedAt
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14)}`;
    const queries = buildQueries(products);
    const judgments: RelevanceJudgment[] = [];
    for (const query of queries) {
      for (const product of products) {
        const relevance = labelFor(query, product);
        if (relevance > 0) {
          judgments.push({
            queryId: query.id,
            productId: product.id,
            relevance,
            reason: reasonFor(query, product, relevance),
          });
        }
      }
    }
    const snapshot = {
      version: DATASET_VERSION,
      snapshotId,
      capturedAt: capturedAt.toISOString(),
      productCount: products.length,
      sha256,
      products,
    };
    const dataset: RelevanceDataset = {
      datasetVersion: DATASET_VERSION,
      generatedAt: capturedAt.toISOString(),
      source: { kind: 'postgresql-catalogue', snapshotId, snapshotSha256: sha256 },
      queries,
      judgments,
    };
    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    await writeFile(
      path.join(OUTPUT_DIRECTORY, 'catalogue-snapshot.json'),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(OUTPUT_DIRECTORY, 'dataset.json'),
      `${JSON.stringify(dataset, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(OUTPUT_DIRECTORY, 'README.md'),
      `# Search relevance dataset ${DATASET_VERSION}\n\n` +
        `Generated from the PostgreSQL displayable catalogue snapshot ${snapshotId} at ${capturedAt.toISOString()}.\n\n` +
        `- Products: ${products.length}\n` +
        `- Queries: ${queries.length}\n` +
        `- Positive judgments: ${judgments.length}\n` +
        `- Snapshot SHA-256: ${sha256}\n\n` +
        'Missing judgments are treated as relevance `0`. Labels use `0` (irrelevant), `1` (weak), `2` (relevant), and `3` (strong/target). The fixture is a local, manually reviewable baseline evaluation set; it is not buyer training data.\n\n' +
        'Regenerate with `pnpm search:relevance:dataset` after a deliberate catalogue snapshot change. Do not overwrite a version used in a previous benchmark.\n',
      'utf8',
    );
    console.log(
      JSON.stringify({
        datasetVersion: DATASET_VERSION,
        snapshotId,
        productCount: products.length,
        queryCount: queries.length,
        judgmentCount: judgments.length,
        sha256,
      }),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Search relevance dataset generation failed.',
  );
  process.exitCode = 1;
});
