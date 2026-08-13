import type {
  CatalogProductCard,
  CatalogProductsResponse,
  PublicShopCatalogPage,
  PublicShopCategoryFacet,
  ShopCatalogQuery,
} from '@shopee-clone/contracts';

import type { NormalizedCatalogQuery } from './catalog-query';

export interface PublicShopCatalogSummary {
  products: CatalogProductCard[];
  categories: PublicShopCategoryFacet[];
}

export abstract class CatalogPublicFacade {
  abstract getProducts(query: NormalizedCatalogQuery): Promise<CatalogProductsResponse>;
  abstract getShopSummary(shopId: string): Promise<PublicShopCatalogSummary>;
  abstract getShopProducts(shopId: string, query: ShopCatalogQuery): Promise<PublicShopCatalogPage>;
}
