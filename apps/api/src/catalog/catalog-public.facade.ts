import type {
  CatalogProductCard,
  CatalogProductsResponse,
  CatalogSearchSuggestionsResponse,
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
  abstract getProducts(
    query: NormalizedCatalogQuery,
    buyerId?: string | null,
  ): Promise<CatalogProductsResponse>;
  abstract getSearchSuggestions(
    query: string,
    limit: number,
  ): Promise<CatalogSearchSuggestionsResponse>;
  abstract getShopSummary(
    shopId: string,
    buyerId?: string | null,
  ): Promise<PublicShopCatalogSummary>;
  abstract getShopProducts(
    shopId: string,
    query: ShopCatalogQuery,
    buyerId?: string | null,
  ): Promise<PublicShopCatalogPage>;
}
