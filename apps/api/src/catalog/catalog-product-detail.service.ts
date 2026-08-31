import { Inject, Injectable } from '@nestjs/common';
import type {
  ProductDetailResponse,
  ProductDetailVariant,
  ProductGalleryMedia,
} from '@shopee-clone/contracts';

import {
  availableQuantity,
  applyScheduledPrice,
  mapCatalogProductCard,
  promotionFor,
  safeMinor,
} from './catalog-presentation';
import { CatalogProductDeletedError, CatalogProductNotFoundError } from './catalog-product-id';
import { CatalogRepository } from './catalog.repository';
import { ScheduledDiscountService } from '../pricing/scheduled-discount.service';
import { BuyerBestPriceService } from '../pricing/buyer-best-price.service';
import { representativeOffer } from './catalog-presentation';

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
    const enriched = variant as typeof variant & {
      scheduledPrice?: ProductDetailVariant['scheduledPrice'];
      buyerBestPrice?: ProductDetailVariant['buyerBestPrice'];
    };
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
        ...(enriched.buyerBestPrice ? { buyerBestPrice: enriched.buyerBestPrice } : {}),
        availableQuantity: stock,
        availability: stock > 0 ? 'in-stock' : 'unavailable',
        preferredImageId,
      },
    ];
  });
}

@Injectable()
export class CatalogProductDetailService {
  constructor(
    @Inject(CatalogRepository) private readonly repository: CatalogRepository,
    @Inject(ScheduledDiscountService)
    private readonly scheduledDiscounts?: ScheduledDiscountService,
    @Inject(BuyerBestPriceService)
    private readonly buyerPrices?: BuyerBestPriceService,
  ) {}

  async getProduct(
    productId: string,
    buyerId: string | null = null,
  ): Promise<ProductDetailResponse> {
    const product = await this.repository.findPublicProduct(productId);
    if (!product) {
      if (await this.repository.findDeletedProduct(productId))
        throw new CatalogProductDeletedError();
      throw new CatalogProductNotFoundError();
    }

    const [activeProductCount, relatedCandidates] = await Promise.all([
      this.repository.countPublicProductsForShop(product.shopId),
      this.repository.findRelatedCandidates(product.categoryId, product.id),
    ]);
    const evaluatedAt = new Date();
    const discounts = this.scheduledDiscounts
      ? await this.scheduledDiscounts.resolveVariants(
          undefined,
          [product, ...relatedCandidates].flatMap((candidate) =>
            candidate.variants.map((variant) => ({
              id: variant.id,
              productId: candidate.id,
              priceMinor: variant.priceMinor,
              compareAtPriceMinor: variant.compareAtPriceMinor,
            })),
          ),
          evaluatedAt,
        )
      : new Map();
    const enrichedProduct = {
      ...product,
      variants: product.variants.map((variant) =>
        applyScheduledPrice(variant, discounts.get(variant.id)),
      ),
    };
    const enrichedRelated = relatedCandidates.map((candidate) => ({
      ...candidate,
      variants: candidate.variants.map((variant) =>
        applyScheduledPrice(variant, discounts.get(variant.id)),
      ),
    }));
    const previewSnapshots = [
      ...enrichedProduct.variants.flatMap((variant) => {
        const effectivePriceMinor = safeMinor(variant.priceMinor);
        return effectivePriceMinor === null
          ? []
          : [
              {
                productId: enrichedProduct.id,
                variantId: variant.id,
                effectivePriceMinor,
                weightGrams: variant.weightGrams,
                shop: {
                  id: enrichedProduct.shop.id,
                  ownerUserId: enrichedProduct.shop.ownerId,
                  slug: enrichedProduct.shop.slug,
                  name: enrichedProduct.shop.name,
                  location: enrichedProduct.shop.location,
                  pickupProvince: enrichedProduct.shop.pickupProvince,
                },
              },
            ];
      }),
      ...enrichedRelated.flatMap((candidate) => {
        const representative = representativeOffer(candidate.variants);
        return representative
          ? [
              {
                productId: candidate.id,
                variantId: representative.offer.id,
                effectivePriceMinor: representative.priceMinor,
              weightGrams: representative.offer.weightGrams ?? 0,
                shop: {
                  id: candidate.shop.id,
                  ownerUserId: candidate.shop.ownerId,
                  slug: candidate.shop.slug,
                  name: candidate.shop.name,
                  location: candidate.shop.location,
                  pickupProvince: candidate.shop.pickupProvince,
                },
              },
            ]
          : [];
      }),
    ];
    const buyerPreviews = this.buyerPrices
      ? await this.buyerPrices.previews(buyerId, previewSnapshots, evaluatedAt)
      : new Map();
    enrichedProduct.variants = enrichedProduct.variants.map((variant) => {
      const buyerBestPrice = buyerPreviews.get(variant.id);
      return buyerBestPrice ? { ...variant, buyerBestPrice } : variant;
    });
    const personalizedRelated = enrichedRelated.map((candidate) => ({
      ...candidate,
      variants: candidate.variants.map((variant) => {
        const buyerBestPrice = buyerPreviews.get(variant.id);
        return buyerBestPrice ? { ...variant, buyerBestPrice } : variant;
      }),
    }));
    const gallery = mapGallery(enrichedProduct);
    const variants = mapVariants(enrichedProduct, gallery);
    const purchasableVariants = variants.filter((variant) => variant.availability === 'in-stock');
    const initialVariantId = purchasableVariants[0]?.id ?? variants[0]?.id ?? null;
    const relatedProducts = personalizedRelated
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
