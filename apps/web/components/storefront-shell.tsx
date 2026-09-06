'use client';

import { PageShell, StorefrontContainer } from '@shopee-clone/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';

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
    <StorefrontContainer className="market-footer">
      <strong>Shopee Clone</strong>
      <span>Project học tập · Không liên kết với Shopee</span>
      <Link href="/design-system">Design system</Link>
    </StorefrontContainer>
  );
}

export function StorefrontShell({ children }: { children: ReactNode }) {
  const navigation = useMarketplaceNavigation();
  const auth = useAuthSession();
  const cart = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const isAdminRoute = pathname === '/admin' || pathname?.startsWith('/admin/');
  const isSellerRoute = pathname === '/seller' || pathname?.startsWith('/seller/');
  const handleLogout = useCallback(async () => {
    await auth.logout();

    // A homepage navigation/refetch drops the authenticated RSC payload and
    // makes the server request the anonymous homepage aggregate again.
    if (pathname === '/') {
      router.refresh();
      return;
    }
    router.replace('/');
  }, [auth, pathname, router]);

  // Admin is a standalone console. The route still lives beside the
  // storefront pages for URL and provider compatibility, but it must not
  // render the marketplace header, category navigation, footer, or floating
  // chat widget around its own shell.
  if (isAdminRoute) {
    return <>{children}</>;
  }

  return (
    <ChatProvider>
      <PageShell
        header={
          isSellerRoute ? undefined : (
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
              onLogout={() => void handleLogout()}
            />
          )
        }
        navigation={
          isSellerRoute ? undefined : (
            <MarketplaceCategoryNavigation
              open={navigation.categoriesOpen}
              onNavigate={navigation.closeCategories}
            />
          )
        }
        footer={isSellerRoute ? undefined : <StorefrontFooter />}
      >
        {children}
      </PageShell>
      {isSellerRoute ? null : <FloatingChat />}
    </ChatProvider>
  );
}
