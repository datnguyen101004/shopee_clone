import { Inject, Injectable } from '@nestjs/common';
import type {
  ProductDetailResponse,
  ProductDetailVariant,
  ProductGalleryMedia,
} from '@shopee-clone/contracts';

import {
  availableQuantity,
  mapCatalogProductCard,
  promotionFor,
  safeMinor,
  publicScheduledPrice,
} from './catalog-presentation';
import { CatalogProductDeletedError, CatalogProductNotFoundError } from './catalog-product-id';
import { CatalogRepository } from './catalog.repository';
import { ScheduledDiscountService } from '../pricing/scheduled-discount.service';

type ProductDetailCandidate = NonNullable<
  Awaited<ReturnType<CatalogRepository['findPublicProduct']>>
>;

function isSafeProductImageUrl(value: string): boolean {
  if (value.startsWith('/')) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function mapGallery(product: ProductDetailCandidate): ProductGalleryMedia[] {
  return product.images
    .filter((image) => isSafeProductImageUrl(image.url))
    .map((image, index) => ({
      id: image.id,
      url: image.url,
      altText: image.altText ?? product.name,
      sortOrder: image.sortOrder,
      variantId: image.variantId,
      isPrimary: index === 0,
    }));
}

function mapVariants(
  product: ProductDetailCandidate,
  gallery: ProductGalleryMedia[],
): ProductDetailVariant[] {
  const genericPrimary =
    gallery.find((image) => image.variantId === null)?.id ?? gallery[0]?.id ?? null;
  return product.variants.flatMap((variant) => {
    const enriched = variant as typeof variant & { scheduledPrice?: ProductDetailVariant['scheduledPrice'] };
    const priceMinor = safeMinor(enriched.priceMinor);
    const stock = availableQuantity(enriched.inventory);
    if (priceMinor === null || stock === null) return [];
    const preferredImageId =
      gallery.find((image) => image.variantId === enriched.id)?.id ?? genericPrimary;
    return [
      {
        id: enriched.id,
        name: enriched.name,
        sku: enriched.sku,
        priceMinor,
        ...(promotionFor(priceMinor, enriched.compareAtPriceMinor) ?? {}),
        ...(enriched.scheduledPrice ? { scheduledPrice: enriched.scheduledPrice } : {}),
        availableQuantity: stock,
        availability: stock > 0 ? 'in-stock' : 'unavailable',
        preferredImageId,
      },
    ];
  });
}

@Injectable()
export class CatalogProductDetailService {
  constructor(@Inject(CatalogRepository) private readonly repository: CatalogRepository, @Inject(ScheduledDiscountService) private readonly scheduledDiscounts?: ScheduledDiscountService) {}

  async getProduct(productId: string): Promise<ProductDetailResponse> {
    const product = await this.repository.findPublicProduct(productId);
    if (!product) {
      if (await this.repository.findDeletedProduct(productId)) throw new CatalogProductDeletedError();
      throw new CatalogProductNotFoundError();
    }

    const [activeProductCount, relatedCandidates] = await Promise.all([
      this.repository.countPublicProductsForShop(product.shopId),
      this.repository.findRelatedCandidates(product.categoryId, product.id),
    ]);
    if (this.scheduledDiscounts) {
      const discounts = await this.scheduledDiscounts.resolveVariants(undefined, product.variants.map((variant) => ({ id: variant.id, productId: product.id, priceMinor: variant.priceMinor, compareAtPriceMinor: variant.compareAtPriceMinor })), new Date());
      for (const variant of product.variants) {
        const discount = discounts.get(variant.id);
        if (discount && discount.effectivePriceMinor !== discount.basePriceMinor) {
          variant.compareAtPriceMinor = variant.compareAtPriceMinor === null || variant.compareAtPriceMinor < discount.basePriceMinor ? discount.basePriceMinor : variant.compareAtPriceMinor;
          variant.priceMinor = discount.effectivePriceMinor;
          (variant as typeof variant & { scheduledPrice?: unknown }).scheduledPrice = publicScheduledPrice(discount);
        }
      }
    }
    const gallery = mapGallery(product);
    const variants = mapVariants(product, gallery);
    const purchasableVariants = variants.filter((variant) => variant.availability === 'in-stock');
    const initialVariantId = purchasableVariants[0]?.id ?? variants[0]?.id ?? null;
    const relatedProducts = relatedCandidates
      .map(mapCatalogProductCard)
      .filter((card): card is NonNullable<typeof card> => card !== null)
      .slice(0, 6);

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,

      category: { slug: product.category.slug, name: product.category.name },
      ratingAverageBasisPoints: product.ratingAverageBasisPoints,
      ratingCount: product.ratingCount,
      soldCount: product.soldCount,
      gallery,
      variants,
      purchasable: purchasableVariants.length > 0,
      initialVariantId,
      shop: {
        id: product.shop.id,
        ownerUserId: product.shop.ownerId,
        slug: product.shop.slug,
        name: product.shop.name,
        location: product.shop.location,
        activeProductCount,
        ratingAverageBasisPoints: product.shop.ratingAverageBasisPoints,
        ratingCount: product.shop.ratingCount,
      },
      shippingPreview: {
        origin: product.shop.location,
        destinationLabel: 'Toàn quốc',
        feeMinor: null,
        deliveryTimeLabel: null,
        message: 'Phí và thời gian giao hàng sẽ được xác nhận sau khi có địa chỉ giao hàng.',
      },
      relatedProducts,
    };
  }
}
