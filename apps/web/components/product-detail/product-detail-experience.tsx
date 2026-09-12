'use client';

import {
  parseProductDetailResponse,
  type ProductDetailResponse,
} from '@shopee-clone/contracts';
import { useEffect, useRef, useState } from 'react';

import { FavoriteStateProvider } from '../engagement/favorite-state-provider';
import { useAuthSession } from '../auth-session-provider';
import { ProductReviews } from './product-reviews';

import { ProductGallery } from './product-detail-gallery';
import {
  ProductDetailFacts,
  ProductEngagementActions,
  ProductPriceDisplay,
} from './product-detail-info';
import { ProductVariantSelector } from './product-detail-variant-selector';
import { ProductQuantityStepper } from './product-detail-quantity-stepper';
import {
  ProductCartToast,
  ProductPurchaseActions,
  SelfPurchaseWarningModal,
} from './product-detail-purchase-actions';
import { useProductDetailFlow } from './use-product-detail-flow';
import { submitClickstreamEvent } from '../../lib/clickstream';

export { ProductGallery } from './product-detail-gallery';
export {
  ProductDetailFacts,
  ProductEngagementActions,
  ProductPriceDisplay,
  formatCurrency,
} from './product-detail-info';
export { ProductVariantSelector } from './product-detail-variant-selector';
export { ProductQuantityStepper } from './product-detail-quantity-stepper';
export {
  ProductCartToast,
  ProductPurchaseActions,
  SelfPurchaseWarningModal,
} from './product-detail-purchase-actions';
export { useProductDetailFlow } from './use-product-detail-flow';

function ProductDetailInner({ product }: { product: ProductDetailResponse }) {
  const flow = useProductDetailFlow({ product });

  return (
    <>
      <section className="product-detail-offer" aria-label="Lựa chọn sản phẩm">
        <ProductGallery
          product={product}
          activeImageId={flow.selection.activeImageId}
          onSelectImage={flow.handleSelectImage}
        />

        <div className="product-detail-offer__selection">
          <ProductEngagementActions productId={product.id} productName={product.name} />
          <ProductPriceDisplay
            selectedVariant={flow.selectedVariant}
            flashSaleOffer={flow.flashSaleOffer}
          />
          <ProductVariantSelector
            variants={product.variants}
            selectedVariantId={flow.selection.variantId}
            statusMap={flow.statusMap}
            onSelectVariant={flow.handleSelectVariant}
          />
          <ProductDetailFacts
            selectedVariant={flow.selectedVariant}
            flashSaleOffer={flow.flashSaleOffer}
          />
          <ProductQuantityStepper
            quantity={flow.selection.quantity}
            selectedVariant={flow.selectedVariant}
            flashSaleOffer={flow.flashSaleOffer}
            purchasable={product.purchasable}
            statusMessage={flow.liveMessage}
            isError={Boolean(flow.error)}
            onQuantityChange={flow.handleQuantityChange}
            onStepQuantity={flow.handleStepQuantity}
          />
          <ProductPurchaseActions
            handoffs={flow.handoffs}
            authStatus={flow.authStatus}
            cartPending={flow.cartPending}
            cartStatus={flow.cartStatus}
            canMutateCart={flow.canMutateCart}
            onAddToCart={() => void flow.handleAddToCart()}
            onBuyNow={() => void flow.handleBuyNow()}
          />
        </div>
      </section>

      <SelfPurchaseWarningModal
        isOpen={flow.selfPurchaseWarningOpen}
        onDismiss={flow.dismissSelfPurchaseWarning}
      />

      <ProductCartToast message={flow.toastMessage} />

      <ProductReviews product={product} />
    </>
  );
}

function ProductViewCapture({ productId }: { productId: string }) {
  const { sessionFetch } = useAuthSession();
  const capturedProductId = useRef<string | null>(null);
  useEffect(() => {
    if (capturedProductId.current === productId) return;
    capturedProductId.current = productId;
    submitClickstreamEvent({
      eventType: 'product_viewed',
      surface: 'product_detail',
      productId,
      properties: {},
    }, 1_500, sessionFetch);
  }, [productId, sessionFetch]);
  return null;
}

export function ProductDetailExperience({ product }: { product: ProductDetailResponse }) {
  const { state: authState, authenticatedFetch } = useAuthSession();
  const [personalizedProduct, setPersonalizedProduct] = useState<{
    source: ProductDetailResponse;
    product: ProductDetailResponse;
  } | null>(null);

  const displayProduct =
    personalizedProduct?.source === product ? personalizedProduct.product : product;

  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    const controller = new AbortController();
    const endpoint = new URL(
      `/api/v1/catalog/products/${encodeURIComponent(product.slug ?? product.id)}`,
      process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
    );
    void authenticatedFetch(endpoint, { cache: 'no-store', signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) return;
        const parsed = parseProductDetailResponse(await result.json());
        if (parsed) setPersonalizedProduct({ source: product, product: parsed });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [authState.status, authenticatedFetch, product]);

  return (
    <FavoriteStateProvider
      productIds={[displayProduct.id, ...displayProduct.relatedProducts.map(({ id }) => id)]}
    >
      <ProductViewCapture productId={displayProduct.id} />
      <ProductDetailInner product={displayProduct} />
    </FavoriteStateProvider>
  );
}
