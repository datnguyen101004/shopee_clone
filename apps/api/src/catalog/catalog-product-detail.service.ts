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
} from './catalog-presentation';
import { CatalogProductDeletedError, CatalogProductNotFoundError } from './catalog-product-id';
import { CatalogRepository } from './catalog.repository';

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
    const priceMinor = safeMinor(variant.priceMinor);
    const stock = availableQuantity(variant.inventory);
    if (priceMinor === null || stock === null) return [];
    const preferredImageId =
      gallery.find((image) => image.variantId === variant.id)?.id ?? genericPrimary;
    return [
      {
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        priceMinor,
        ...(promotionFor(priceMinor, variant.compareAtPriceMinor) ?? {}),
        availableQuantity: stock,
        availability: stock > 0 ? 'in-stock' : 'unavailable',
        preferredImageId,
      },
    ];
  });
}

@Injectable()
export class CatalogProductDetailService {
  constructor(@Inject(CatalogRepository) private readonly repository: CatalogRepository) {}

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
