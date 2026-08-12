export type MarketplaceCategory = {
  label: string;
  slug: string;
  href: string;
};

export const marketplaceCategories: readonly MarketplaceCategory[] = [
  {
    label: 'Thiết bị điện tử',
    slug: 'thiet-bi-dien-tu',
    href: '/search?category=thiet-bi-dien-tu',
  },
  { label: 'Thời trang', slug: 'thoi-trang', href: '/search?category=thoi-trang' },
  {
    label: 'Nhà cửa & đời sống',
    slug: 'nha-cua-doi-song',
    href: '/search?category=nha-cua-doi-song',
  },
  { label: 'Sắc đẹp', slug: 'sac-dep', href: '/search?category=sac-dep' },
  { label: 'Bách hoá', slug: 'bach-hoa', href: '/search?category=bach-hoa' },
  { label: 'Thể thao', slug: 'the-thao', href: '/search?category=the-thao' },
] as const;
