'use client';

import type { CatalogProductsResponse } from '@shopee-clone/contracts';

import { ActiveFilters } from './catalog-active-filters';
import { CatalogFilterPanel } from './catalog-filter-panel';
import { CatalogPagination } from './catalog-pagination';
import { ProductCard } from './catalog-product-card';
import { CatalogProductGrid } from './catalog-product-grid';
import { CatalogSortBar } from './catalog-sort-bar';
import {
  catalogPageHref,
  type CatalogRouteContext,
} from './catalog-utils';
import { usePersonalizedCatalog } from './use-personalized-catalog';
import { FavoriteStateProvider } from '../engagement/favorite-state-provider';

export type { CatalogRouteContext };
export {
  ActiveFilters,
  CatalogFilterPanel,
  CatalogPagination,
  CatalogProductGrid,
  CatalogSortBar,
  ProductCard,
  catalogPageHref,
};

export function DiscoveryControls({
  response,
  context,
}: {
  response: CatalogProductsResponse;
  context: CatalogRouteContext;
}) {
  return (
    <FavoriteStateProvider productIds={response.items.map(({ id }) => id)}>
      <CatalogFilterPanel response={response} context={context} />
      <CatalogSortBar response={response} context={context} />
      <ActiveFilters context={context} />
    </FavoriteStateProvider>
  );
}

export function CatalogContent({
  response,
  context,
  pageHrefBuilder,
  personalizedPath,
}: {
  response: Pick<CatalogProductsResponse, 'items' | 'pagination'>;
  context?: CatalogRouteContext;
  pageHrefBuilder?: (page: number) => string;
  personalizedPath?: string;
}) {
  const activeResponse = usePersonalizedCatalog({ response, context, personalizedPath });

  return (
    <div className="shopee-catalog-content">
      <CatalogProductGrid products={activeResponse.items} />
      <CatalogPagination
        response={activeResponse}
        context={context}
        pageHrefBuilder={pageHrefBuilder}
      />
    </div>
  );
}
