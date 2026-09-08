'use client';

import type { ProductDetailResponse } from '@shopee-clone/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { useAuthSession } from '../auth-session-provider';
import { useCart } from '../cart/cart-provider';
import { CartApiError } from '../../lib/cart-api';
import {
  activeProductImage,
  canPurchase,
  getVariant,
  initialProductDetailSelection,
  productLoginHandoff,
  quantityError,
  selectProductVariant,
} from './product-detail-interactions';

import { useFlashSaleStatusPolling } from '../../lib/use-flash-sale-status-polling';
import { getVariantFlashSaleOffer } from './product-detail-flash-sale';

function isSelfPurchaseError(error: unknown): boolean {
  return (
    error instanceof CartApiError &&
    error.problem?.type === 'https://shopee-clone.local/problems/self-purchase-forbidden'
  );
}

export function useProductDetailFlow({ product }: { product: ProductDetailResponse }) {
  const auth = useAuthSession();
  const cart = useCart();
  const router = useRouter();

  const [selection, setSelection] = useState(() => initialProductDetailSelection(product));
  const [cartMessage, setCartMessage] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selfPurchaseWarningOpen, setSelfPurchaseWarningOpen] = useState(false);

  // Detect if any variant is tied to a Flash Sale campaign
  const flashSaleCampaignId = product.variants.find(
    (v) => v.scheduledPrice?.campaignTypeCode === 'FLASH_SALE',
  )?.scheduledPrice?.campaignId ?? '';

  const flashSaleVariantIds = useMemo(
    () => product.variants
      .filter((variant) => variant.scheduledPrice?.campaignTypeCode === 'FLASH_SALE')
      .map((variant) => variant.id),
    [product.variants],
  );
  const polling = useFlashSaleStatusPolling({
    campaignId: flashSaleCampaignId,
    variantIds: flashSaleVariantIds,
    enabled: Boolean(flashSaleCampaignId),
  });

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 2000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const selectedVariant = getVariant(product, selection.variantId);
  const flashSaleOffer = getVariantFlashSaleOffer(selectedVariant, polling.statusMap);

  const image = activeProductImage(product, selection.activeImageId);

  // If Flash Sale sold out, purchase is strictly blocked
  const isFsSoldOut = flashSaleOffer.isFlashSale && flashSaleOffer.state === 'SOLD_OUT';
  const isFsActive = flashSaleOffer.isFlashSale && flashSaleOffer.state === 'ACTIVE' && flashSaleOffer.canPurchase;

  let rawError = quantityError(selection.quantity, selectedVariant);
  if (isFsSoldOut) {
    rawError = 'Biến thể Flash Sale này đã hết suất.';
  }

  const purchaseReady = !isFsSoldOut && canPurchase(isFsActive ? '1' : selection.quantity, selectedVariant);
  const ownsShop =
    auth.state.status === 'authenticated' && auth.state.user.id === product.shop.ownerUserId;

  const liveMessage =
    cartMessage ||
    rawError ||
    (isFsActive
      ? `Đã chọn ${selectedVariant?.name} (Flash Sale). Số lượng mua cố định là 1.`
      : selectedVariant
        ? `Đã chọn ${selectedVariant.name}.`
        : 'Chưa có biến thể để chọn.');

  const effectiveQuantity = isFsActive ? '1' : selection.quantity;

  const handoffs =
    selectedVariant && purchaseReady
      ? {
          add: productLoginHandoff(product, selectedVariant.id, effectiveQuantity, 'add-to-cart'),
          buy: productLoginHandoff(product, selectedVariant.id, effectiveQuantity, 'buy-now'),
        }
      : null;
  const canMutateCart =
    auth.state.status === 'authenticated' &&
    Boolean(selectedVariant) &&
    purchaseReady &&
    !cart.pending &&
    cart.state.status === 'ready';

  const handleSelectVariant = (variantId: string) => {
    setSelection((current) => selectProductVariant(product, current, variantId));
  };

  const handleSelectImage = (imageId: string) => {
    setSelection((current) => ({ ...current, activeImageId: imageId }));
  };

  const handleQuantityChange = (quantity: string) => {
    setSelection((current) => ({ ...current, quantity }));
  };

  const handleStepQuantity = (delta: number) => {
    setSelection((current) => {
      const currentVal = Number(current.quantity);
      if (delta < 0) {
        return { ...current, quantity: String(Math.max(1, currentVal - 1)) };
      }
      return { ...current, quantity: String(currentVal + 1) };
    });
  };

  const handleAddToCart = async () => {
    if (!canMutateCart || !selectedVariant) return;
    if (ownsShop) {
      setSelfPurchaseWarningOpen(true);
      return;
    }
    setCartMessage('');
    try {
      const result = await cart.addItem(selectedVariant.id, Number(effectiveQuantity));
      const message =
        result.adjustments[0]?.message ?? `Đã thêm ${effectiveQuantity} sản phẩm vào giỏ hàng.`;
      setCartMessage(message);
      setToastMessage(message);
    } catch (caught: unknown) {
      if (isSelfPurchaseError(caught)) {
        setSelfPurchaseWarningOpen(true);
        return;
      }
      setCartMessage('Không thể thêm vào giỏ hàng. Vui lòng thử lại.');
      setToastMessage('Không thể thêm vào giỏ hàng. Vui lòng thử lại.');
    }
  };

  const handleBuyNow = async () => {
    if (!purchaseReady || !selectedVariant) return;
    if (auth.state.status !== 'authenticated') {
      if (handoffs?.buy) router.push(handoffs.buy);
      return;
    }
    if (ownsShop) {
      setSelfPurchaseWarningOpen(true);
      return;
    }
    setCartMessage('');
    try {
      await cart.addItem(selectedVariant.id, Number(effectiveQuantity));
      router.push('/cart');
    } catch (caught: unknown) {
      if (isSelfPurchaseError(caught)) {
        setSelfPurchaseWarningOpen(true);
        return;
      }
      setCartMessage('Không thể mua ngay. Vui lòng thử lại.');
    }
  };

  const dismissSelfPurchaseWarning = () => {
    setSelfPurchaseWarningOpen(false);
  };

  return {
    selection,
    selectedVariant,
    flashSaleOffer,
    statusMap: polling.statusMap,
    image,
    error: rawError,
    purchaseReady,
    liveMessage,
    handoffs,
    authStatus: auth.state.status,
    cartPending: cart.pending,
    cartStatus: cart.state.status,
    canMutateCart,
    toastMessage,
    selfPurchaseWarningOpen,
    handleSelectVariant,
    handleSelectImage,
    handleQuantityChange,
    handleStepQuantity,
    handleAddToCart,
    handleBuyNow,
    dismissSelfPurchaseWarning,
  };
}
