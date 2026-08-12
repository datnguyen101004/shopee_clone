export const seedUsers = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'an.nguyen@shopee-clone.local',
    displayName: 'An Nguyen',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'binh.tran@shopee-clone.local',
    displayName: 'Binh Tran',
  },
] as const;

export const seedShops = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    ownerId: seedUsers[0].id,
    slug: 'shopee-tech-store',
    name: 'Shopee Tech Store',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    ownerId: seedUsers[1].id,
    slug: 'happy-home-store',
    name: 'Happy Home Store',
  },
] as const;

export const seedCategories = [
  {
    id: '00000000-0000-4000-8000-000000000201',
    parentId: null,
    slug: 'electronics',
    name: 'Electronics',
    sortOrder: 10,
  },
  {
    id: '00000000-0000-4000-8000-000000000202',
    parentId: '00000000-0000-4000-8000-000000000201',
    slug: 'mobile-accessories',
    name: 'Mobile & Accessories',
    sortOrder: 20,
  },
  {
    id: '00000000-0000-4000-8000-000000000203',
    parentId: null,
    slug: 'home-living',
    name: 'Home & Living',
    sortOrder: 30,
  },
  {
    id: '00000000-0000-4000-8000-000000000204',
    parentId: '00000000-0000-4000-8000-000000000203',
    slug: 'kitchen-appliances',
    name: 'Kitchen Appliances',
    sortOrder: 40,
  },
] as const;

export const seedProducts = [
  {
    id: '00000000-0000-4000-8000-000000000301',
    shopId: seedShops[0].id,
    categoryId: seedCategories[1].id,
    slug: 'smartphone-pro',
    name: 'Smartphone Pro',
    description: 'Demo flagship smartphone for marketplace development.',
  },
  {
    id: '00000000-0000-4000-8000-000000000302',
    shopId: seedShops[0].id,
    categoryId: seedCategories[1].id,
    slug: 'wireless-earbuds',
    name: 'Wireless Earbuds',
    description: 'Demo wireless earbuds with multiple color variants.',
  },
  {
    id: '00000000-0000-4000-8000-000000000303',
    shopId: seedShops[1].id,
    categoryId: seedCategories[3].id,
    slug: 'power-blender',
    name: 'Power Blender',
    description: 'Demo countertop blender for home catalog scenarios.',
  },
  {
    id: '00000000-0000-4000-8000-000000000304',
    shopId: seedShops[1].id,
    categoryId: seedCategories[3].id,
    slug: 'smart-rice-cooker',
    name: 'Smart Rice Cooker',
    description: 'Demo rice cooker with two capacity variants.',
  },
] as const;

export const seedVariants = [
  {
    id: '00000000-0000-4000-8000-000000000401',
    productId: seedProducts[0].id,
    sku: 'PHONE-PRO-128-BLK',
    name: '128GB - Black',
    priceMinor: 12_990_000n,
    compareAtPriceMinor: 14_990_000n,
    quantityOnHand: 50,
    quantityReserved: 5,
  },
  {
    id: '00000000-0000-4000-8000-000000000402',
    productId: seedProducts[0].id,
    sku: 'PHONE-PRO-256-SLV',
    name: '256GB - Silver',
    priceMinor: 14_990_000n,
    compareAtPriceMinor: null,
    quantityOnHand: 30,
    quantityReserved: 2,
  },
  {
    id: '00000000-0000-4000-8000-000000000403',
    productId: seedProducts[1].id,
    sku: 'EARBUDS-WHITE',
    name: 'White',
    priceMinor: 1_290_000n,
    compareAtPriceMinor: 1_590_000n,
    quantityOnHand: 120,
    quantityReserved: 12,
  },
  {
    id: '00000000-0000-4000-8000-000000000404',
    productId: seedProducts[2].id,
    sku: 'BLENDER-1500-BLK',
    name: '1.5L - Black',
    priceMinor: 890_000n,
    compareAtPriceMinor: null,
    quantityOnHand: 18,
    quantityReserved: 0,
  },
  {
    id: '00000000-0000-4000-8000-000000000405',
    productId: seedProducts[3].id,
    sku: 'RICE-COOKER-18L',
    name: '1.8L',
    priceMinor: 1_490_000n,
    compareAtPriceMinor: 1_790_000n,
    quantityOnHand: 25,
    quantityReserved: 3,
  },
  {
    id: '00000000-0000-4000-8000-000000000406',
    productId: seedProducts[3].id,
    sku: 'RICE-COOKER-22L',
    name: '2.2L',
    priceMinor: 1_790_000n,
    compareAtPriceMinor: null,
    quantityOnHand: 10,
    quantityReserved: 1,
  },
] as const;

export const seedImages = [
  {
    id: '00000000-0000-4000-8000-000000000501',
    productId: seedProducts[0].id,
    url: 'https://images.shopee-clone.local/products/smartphone-pro.webp',
    altText: 'Smartphone Pro',
    sortOrder: 0,
  },
  {
    id: '00000000-0000-4000-8000-000000000502',
    productId: seedProducts[1].id,
    url: 'https://images.shopee-clone.local/products/wireless-earbuds.webp',
    altText: 'Wireless Earbuds',
    sortOrder: 0,
  },
  {
    id: '00000000-0000-4000-8000-000000000503',
    productId: seedProducts[2].id,
    url: 'https://images.shopee-clone.local/products/power-blender.webp',
    altText: 'Power Blender',
    sortOrder: 0,
  },
  {
    id: '00000000-0000-4000-8000-000000000504',
    productId: seedProducts[3].id,
    url: 'https://images.shopee-clone.local/products/smart-rice-cooker.webp',
    altText: 'Smart Rice Cooker',
    sortOrder: 0,
  },
] as const;

export const seedExpectedCounts = {
  users: seedUsers.length,
  shops: seedShops.length,
  categories: seedCategories.length,
  products: seedProducts.length,
  variants: seedVariants.length,
  images: seedImages.length,
  inventory: seedVariants.length,
} as const;
