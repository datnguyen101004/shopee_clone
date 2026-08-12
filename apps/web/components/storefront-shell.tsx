'use client';

import { Container, PageShell } from '@shopee-clone/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  MarketplaceCategoryNavigation,
  MarketplaceHeader,
  useMarketplaceNavigation,
} from './marketplace-header';

function StorefrontFooter() {
  return (
    <Container className="market-footer">
      <strong>Shopee Clone</strong>
      <span>Project học tập · Không liên kết với Shopee</span>
      <Link href="/design-system">Design system</Link>
    </Container>
  );
}

export function StorefrontShell({ children }: { children: ReactNode }) {
  const navigation = useMarketplaceNavigation();
  return (
    <PageShell
      header={
        <MarketplaceHeader
          categoriesOpen={navigation.categoriesOpen}
          onCategoriesToggle={navigation.toggleCategories}
          menuButtonRef={navigation.menuButtonRef}
        />
      }
      navigation={
        <MarketplaceCategoryNavigation
          open={navigation.categoriesOpen}
          onNavigate={navigation.closeCategories}
        />
      }
      footer={<StorefrontFooter />}
    >
      {children}
    </PageShell>
  );
}
