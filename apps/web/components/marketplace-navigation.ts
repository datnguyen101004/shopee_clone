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
    label: 'Nội thất',
    slug: 'noi-that',
    href: '/search?category=noi-that',
  },
  { label: 'Mỹ phẩm', slug: 'my-pham', href: '/search?category=my-pham' },
  { label: 'Bách hoá', slug: 'bach-hoa', href: '/search?category=bach-hoa' },
  { label: 'Thể thao', slug: 'the-thao', href: '/search?category=the-thao' },
] as const;
