'use client';

import { Container, PageShell } from '@shopee-clone/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { useAuthSession } from './auth-session-provider';
import { useCart } from './cart/cart-provider';
import { ChatProvider } from './chat/chat-provider';
import { FloatingChat } from './chat/floating-chat';
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
  const auth = useAuthSession();
  const cart = useCart();
  return (
    <ChatProvider><PageShell
      header={
        <MarketplaceHeader
          categoriesOpen={navigation.categoriesOpen}
          onCategoriesToggle={navigation.toggleCategories}
          menuButtonRef={navigation.menuButtonRef}
          account={auth.state}
          cartCount={
            auth.state.status === 'authenticated'
              ? (cart.state.cart?.summary.distinctLineCount ?? 0)
              : 0
          }
          onLogout={() => void auth.logout()}
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
    </PageShell><FloatingChat /></ChatProvider>
  );
}
