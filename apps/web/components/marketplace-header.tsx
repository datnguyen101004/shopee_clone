'use client';

import { hasMarketplaceRole } from '@shopee-clone/contracts';
import { Container, Search, ShoppingCart, Store, UserRound } from '@shopee-clone/ui';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';

import type { AuthSessionState } from './auth-session-provider';
import { fetchCatalogSuggestions } from '../lib/catalog-suggestions-api';
import type { CatalogSearchSuggestion } from '@shopee-clone/contracts';
import { marketplaceCategories } from './marketplace-navigation';
import { NotificationBell } from './notifications/notification-bell';

const mobileNavigationId = 'marketplace-mobile-categories';

type MarketplaceHeaderProps = {
  account?: AuthSessionState;
  onLogout?: () => void;
  cartCount?: number;
  categoriesOpen: boolean;
  onCategoriesToggle: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
};

export function MarketplaceHeader({
  account = { status: 'guest', user: null },
  onLogout,
  cartCount = 0,
  categoriesOpen,
  onCategoriesToggle,
  menuButtonRef,
}: MarketplaceHeaderProps) {
  const [searchError, setSearchError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CatalogSearchSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const userMenuId = 'marketplace-user-menu';
  const suggestionsId = 'market-search-suggestions';

  useEffect(() => {
    if (!searchError) return;
    const timer = setTimeout(() => {
      setSearchError('');
    }, 3000);
    return () => clearTimeout(timer);
  }, [searchError]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchCatalogSuggestions(query, fetch, undefined, undefined, controller.signal)
        .then((nextSuggestions) => {
          if (controller.signal.aborted) return;
          setSuggestions(nextSuggestions);
          setSuggestionsOpen(nextSuggestions.length > 0);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setSuggestions([]);
          setSuggestionsOpen(false);
        });
    }, 500);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const input = form.elements.namedItem('q');
    if (!(input instanceof HTMLInputElement)) return;
    const query = input.value.trim();
    if (!query) {
      event.preventDefault();
      setSearchError('Vui lòng nhập từ khoá cần tìm.');
      input.focus();
      return;
    }
    input.value = query;
    setSearchQuery(query);
    setSuggestionsOpen(false);
    setSearchError('');
  }

  return (
    <Container className="market-header">
      <div className="market-topline">
        {account.status === 'authenticated' && hasMarketplaceRole(account.user, 'seller') ? (
          <Link href="/seller">Kênh người bán</Link>
        ) : null}
        {account.status === 'authenticated' && hasMarketplaceRole(account.user, 'admin') ? (
          <Link href="/admin">Quản trị</Link>
        ) : null}
        {account.status === 'authenticated' &&
        hasMarketplaceRole(account.user, 'buyer') &&
        !hasMarketplaceRole(account.user, 'seller') &&
        !hasMarketplaceRole(account.user, 'admin') ? (
          <Link className="market-topline__seller-registration" href="/account/shop-registration">
            Đăng ký thành shop
          </Link>
        ) : null}
        <span className="market-topline__meta">Kết nối · Hỗ trợ</span>
      </div>
      <div className="market-header__main">
        <Link className="market-logo" href="/" aria-label="Shopee Clone - Trang chủ">
          <Store aria-hidden="true" />
          <strong>Shopee Clone</strong>
        </Link>
        <form
          className="market-search"
          role="search"
          action="/search"
          method="get"
          noValidate
          onSubmit={handleSearchSubmit}
        >
          <label className="sc-visually-hidden" htmlFor="site-search">
            Tìm kiếm sản phẩm
          </label>
          <input
            id="site-search"
            name="q"
            type="search"
            value={searchQuery}
            placeholder="Tìm sản phẩm, thương hiệu và tên shop"
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls={suggestionsId}
            aria-invalid={Boolean(searchError) || undefined}
            aria-describedby={searchError ? 'site-search-error' : undefined}
            onInput={(event) => {
              const nextValue = event.currentTarget.value;
              setSearchQuery(nextValue);
              if (!nextValue.trim()) {
                setSuggestions([]);
                setSuggestionsOpen(false);
              } else {
                setSuggestionsOpen(true);
              }
              if (searchError) setSearchError('');
            }}
            onFocus={() => {
              if (suggestions.length) setSuggestionsOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSuggestionsOpen(false);
            }}
          />
          <button aria-label="Tìm kiếm" type="submit">
            <Search aria-hidden="true" size={20} />
          </button>
          {searchError ? (
            <span className="market-search__error" id="site-search-error" role="alert">
              {searchError}
            </span>
          ) : null}
          {suggestionsOpen && suggestions.length ? (
            <ul className="market-search__suggestions" id={suggestionsId} role="listbox">
              {suggestions.map((suggestion) => (
                <li key={suggestion.text} role="option" aria-selected="false">
                  <Link href={`/search?q=${encodeURIComponent(suggestion.text)}`} onClick={() => setSuggestionsOpen(false)}>
                    <Search aria-hidden="true" size={16} />
                    <span>{suggestion.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </form>
        <div className="market-actions">
          {account.status === 'authenticated' ? <NotificationBell /> : null}
          <Link className="market-cart" href="/cart" aria-label={`Giỏ hàng, ${cartCount} sản phẩm`}>
            <span className="market-cart-icon">
              <ShoppingCart aria-hidden="true" />
              <b aria-hidden="true">{cartCount}</b>
            </span>
          </Link>
          {account.status === 'authenticated' ? (
            <div className="market-user-menu">
              <button
                type="button"
                className="market-user"
                aria-label={`Tài khoản ${account.user.displayName}`}
                aria-haspopup="menu"
                aria-controls={userMenuId}
              >
                <UserRound aria-hidden="true" />
                <span>{account.user.displayName}</span>
              </button>
              <div className="market-user-menu__popup" id={userMenuId} role="menu">
                {hasMarketplaceRole(account.user, 'seller') ? (
                  <Link role="menuitem" href="/seller">
                    Kênh người bán
                  </Link>
                ) : null}
                {hasMarketplaceRole(account.user, 'admin') ? (
                  <Link role="menuitem" href="/admin">
                    Quản trị
                  </Link>
                ) : null}
                <Link role="menuitem" href="/account/profile">
                  Tài khoản của tôi
                </Link>
                <button role="menuitem" type="button" onClick={() => onLogout?.()}>
                  Đăng xuất
                </button>
              </div>
            </div>
          ) : account.status === 'loading' ? (
            <span className="market-account__loading">Đang kiểm tra phiên…</span>
          ) : (
            <Link href="/login" aria-label="Đăng nhập · Chưa đăng nhập">
              <UserRound aria-hidden="true" />
              <span className="market-action-label">Đăng nhập</span>
            </Link>
          )}
          <button
            ref={menuButtonRef}
            className="market-menu-button"
            type="button"
            aria-expanded={categoriesOpen}
            aria-controls={mobileNavigationId}
            onClick={onCategoriesToggle}
          >
            <span className="market-menu-button__icon" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>Danh mục</span>
          </button>
        </div>
      </div>
    </Container>
  );
}

function CategoryLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul>
      {marketplaceCategories.map((category) => (
        <li key={category.slug}>
          <Link href={category.href} onClick={onNavigate}>
            {category.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MarketplaceCategoryNavigation({
  open,
  onNavigate,
}: {
  open: boolean;
  onNavigate: () => void;
}) {
  return (
    <Container className="market-category-navigation">
      <div className="market-category-navigation__desktop">
        <CategoryLinks />
      </div>
      <div id={mobileNavigationId} className="market-category-navigation__mobile" hidden={!open}>
        <CategoryLinks onNavigate={onNavigate} />
      </div>
    </Container>
  );
}

export function useMarketplaceNavigation() {
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!categoriesOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCategoriesOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [categoriesOpen]);

  return {
    categoriesOpen,
    menuButtonRef,
    toggleCategories: () => setCategoriesOpen((current) => !current),
    closeCategories: () => setCategoriesOpen(false),
  };
}
