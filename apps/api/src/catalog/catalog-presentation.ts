import type { CatalogProductCard } from '@shopee-clone/contracts';

export interface CatalogueOffer {
  id: string;
  priceMinor: bigint;
  compareAtPriceMinor: bigint | null;
  inventory: { quantityOnHand: number; quantityReserved: number } | null;
}

export interface CatalogueCandidate {
  id: string;
  name: string;
  categoryId: string;
  description: string;
  createdAt: Date;
  ratingAverageBasisPoints: number;
  ratingCount: number;
  soldCount: number;
  shop: { name: string; location: string };
  category: { slug: string; name: string };
  images: Array<{ url: string; altText: string | null }>;
  variants: CatalogueOffer[];
}

export function safeMinor(value: bigint): number | null {
  const converted = Number(value);
  return Number.isSafeInteger(converted) && converted >= 0 ? converted : null;
}

export function availableQuantity(inventory: CatalogueOffer['inventory']): number | null {
  if (
    !inventory ||
    !Number.isSafeInteger(inventory.quantityOnHand) ||
    !Number.isSafeInteger(inventory.quantityReserved)
  )
    return null;
  const available = inventory.quantityOnHand - inventory.quantityReserved;
  return Number.isSafeInteger(available) && available >= 0 ? available : null;
}

export function promotionFor(
  priceMinor: number,
  compareAtPriceMinor: bigint | null,
): { compareAtPriceMinor: number; discountPercent: number } | null {
  const compareAt = compareAtPriceMinor === null ? null : safeMinor(compareAtPriceMinor);
  if (compareAt === null || compareAt <= priceMinor) return null;
  const discountPercent = Number((BigInt(compareAt - priceMinor) * 100n) / BigInt(compareAt));
  return Number.isSafeInteger(discountPercent) && discountPercent >= 1 && discountPercent <= 100
    ? { compareAtPriceMinor: compareAt, discountPercent }
    : null;
}

export function representativeOffer(variants: CatalogueOffer[]): {
  offer: CatalogueOffer;
  priceMinor: number;
  availableQuantity: number;
} | null {
  for (const offer of variants) {
    const priceMinor = safeMinor(offer.priceMinor);
    const stock = availableQuantity(offer.inventory);
    if (priceMinor !== null && stock !== null && stock > 0)
      return { offer, priceMinor, availableQuantity: stock };
  }
  return null;
}

export function mapCatalogProductCard(product: CatalogueCandidate): CatalogProductCard | null {
  const representative = representativeOffer(product.variants);
  if (!representative) return null;
  const promotion = promotionFor(
    representative.priceMinor,
    representative.offer.compareAtPriceMinor,
  );
  const image = product.images[0];
  return {
    id: product.id,
    name: product.name,
    href: `/products/${product.id}`,
    imageUrl: image?.url ?? null,
    imageAlt: image?.altText ?? product.name,
    priceMinor: representative.priceMinor,
    ...(promotion ?? {}),
    ratingAverageBasisPoints: product.ratingAverageBasisPoints,
    ratingCount: product.ratingCount,
    soldCount: product.soldCount,
    shop: { name: product.shop.name, location: product.shop.location },
    category: { slug: product.category.slug, name: product.category.name },
  };
}
