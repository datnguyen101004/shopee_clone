import type { ProductDetailResponse, ProductDetailVariant } from '@shopee-clone/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProductGallery } from './product-detail-gallery';
import { ProductDetailFacts, ProductPriceDisplay } from './product-detail-info';
import { ProductQuantityStepper } from './product-detail-quantity-stepper';
import {
  ProductCartToast,
  ProductPurchaseActions,
  SelfPurchaseWarningModal,
} from './product-detail-purchase-actions';
import { ProductVariantSelector } from './product-detail-variant-selector';

const sampleVariant: ProductDetailVariant = {
  id: 'var-1',
  name: 'Màu đỏ - Size L',
  sku: 'SHIRT-RED-L',
  priceMinor: 250_000,
  compareAtPriceMinor: 300_000,
  discountPercent: 17,
  availableQuantity: 5,
  availability: 'in-stock',
  preferredImageId: 'img-1',
};

const sampleProduct: ProductDetailResponse = {
  id: '00000000-0000-4000-8000-000000000101',
  name: 'Áo thun thể thao Shopee',
  description: 'Chất liệu thoáng mát, thấm hút mồ hôi tốt',
  category: { slug: 'thoi-trang', name: 'Thời trang' },
  ratingAverageBasisPoints: 480,
  ratingCount: 150,
  soldCount: 1200,
  gallery: [
    {
      id: 'img-1',
      url: '/media/shirt-red.jpg',
      altText: 'Áo thun màu đỏ',
      sortOrder: 0,
      variantId: 'var-1',
      isPrimary: true,
    },
    {
      id: 'img-2',
      url: '/media/shirt-blue.jpg',
      altText: 'Áo thun màu xanh',
      sortOrder: 1,
      variantId: 'var-2',
      isPrimary: false,
    },
  ],
  variants: [
    sampleVariant,
    {
      id: 'var-2',
      name: 'Màu xanh - Size M',
      sku: 'SHIRT-BLU-M',
      priceMinor: 260_000,
      availableQuantity: 0,
      availability: 'unavailable',
      preferredImageId: 'img-2',
    },
  ],
  initialVariantId: 'var-1',
  purchasable: true,
  shop: {
    id: 'shop-1',
    name: 'Official Store',
    slug: 'official-store',
    location: 'Hà Nội',
    ownerUserId: 'owner-1',
    activeProductCount: 10,
  },
  shippingPreview: {
    origin: 'Hà Nội',
    destinationLabel: 'Toàn quốc',
    feeMinor: null,
    deliveryTimeLabel: null,
    message: 'Xác nhận sau.',
  },
  relatedProducts: [],
};

describe('Product Detail Decomposed Components', () => {
  describe('ProductGallery', () => {
    it('renders main image and thumbnail list, triggering callback on click', async () => {
      const user = userEvent.setup();
      const onSelectImage = vi.fn();

      render(
        <ProductGallery
          product={sampleProduct}
          activeImageId="img-1"
          onSelectImage={onSelectImage}
        />,
      );

      const mainImg = screen.getByRole('img', { name: 'Áo thun màu đỏ' });
      expect(mainImg).toBeInTheDocument();

      const thumbnails = screen.getByLabelText('Ảnh sản phẩm');
      expect(thumbnails).toBeInTheDocument();

      const thumbnail2 = screen.getByRole('button', { name: 'Xem Áo thun màu xanh' });
      await user.click(thumbnail2);

      expect(onSelectImage).toHaveBeenCalledWith('img-2');
    });

    it('renders fallback placeholder when no gallery images exist', () => {
      const productNoMedia: ProductDetailResponse = {
        ...sampleProduct,
        gallery: [],
      };

      render(
        <ProductGallery
          product={productNoMedia}
          activeImageId={null}
          onSelectImage={vi.fn()}
        />,
      );

      expect(
        screen.getByRole('img', { name: `Chưa có ảnh cho ${sampleProduct.name}` }),
      ).toBeInTheDocument();
    });
  });

  describe('ProductPriceDisplay and ProductDetailFacts', () => {
    it('renders formatted current price, compareAt price, discount and facts', () => {
      render(
        <>
          <ProductPriceDisplay selectedVariant={sampleVariant} />
          <ProductDetailFacts selectedVariant={sampleVariant} />
        </>,
      );

      expect(screen.getByText('₫250.000')).toBeInTheDocument();
      expect(screen.getByText('₫300.000')).toBeInTheDocument();
      expect(screen.getByText('-17%')).toBeInTheDocument();

      expect(screen.getByText('SHIRT-RED-L')).toBeInTheDocument();
      expect(screen.getByText('5 sản phẩm')).toBeInTheDocument();
    });

    it('renders contact shop and Hết hàng for zero quantity', () => {
      const unavailableVariant: ProductDetailVariant = {
        ...sampleVariant,
        priceMinor: 0,
        availableQuantity: 0,
      };

      render(
        <>
          <ProductPriceDisplay selectedVariant={null} />
          <ProductDetailFacts selectedVariant={unavailableVariant} />
        </>,
      );

      expect(screen.getByText('Liên hệ shop')).toBeInTheDocument();
      expect(screen.getByText('Hết hàng')).toBeInTheDocument();
    });
  });

  describe('ProductVariantSelector', () => {
    it('renders variants and identifies selected variant and unavailable status', async () => {
      const user = userEvent.setup();
      const onSelectVariant = vi.fn();

      render(
        <ProductVariantSelector
          variants={sampleProduct.variants}
          selectedVariantId="var-1"
          onSelectVariant={onSelectVariant}
        />,
      );

      const var1Btn = screen.getByRole('button', { name: 'Màu đỏ - Size L' });
      expect(var1Btn).toHaveClass('is-selected');
      expect(var1Btn).toHaveAttribute('aria-pressed', 'true');

      const var2Btn = screen.getByRole('button', { name: 'Màu xanh - Size M · Hết hàng' });
      expect(var2Btn).not.toHaveClass('is-selected');

      await user.click(var2Btn);
      expect(onSelectVariant).toHaveBeenCalledWith('var-2');
    });
  });

  describe('ProductQuantityStepper', () => {
    it('disables decrease at 1 and increase at available quantity', async () => {
      const user = userEvent.setup();
      const onStepQuantity = vi.fn();
      const onQuantityChange = vi.fn();

      const { rerender } = render(
        <ProductQuantityStepper
          quantity="1"
          selectedVariant={sampleVariant}
          purchasable={true}
          statusMessage="Đã chọn Màu đỏ - Size L."
          isError={false}
          onQuantityChange={onQuantityChange}
          onStepQuantity={onStepQuantity}
        />,
      );

      const decreaseBtn = screen.getByRole('button', { name: 'Giảm số lượng' });
      const increaseBtn = screen.getByRole('button', { name: 'Tăng số lượng' });
      const input = screen.getByRole('textbox', { name: 'Số lượng' });

      expect(decreaseBtn).toBeDisabled();
      expect(increaseBtn).not.toBeDisabled();

      await user.click(increaseBtn);
      expect(onStepQuantity).toHaveBeenCalledWith(1);

      fireEvent.change(input, { target: { value: '5' } });
      expect(onQuantityChange).toHaveBeenCalledWith('5');

      rerender(
        <ProductQuantityStepper
          quantity="5"
          selectedVariant={sampleVariant}
          purchasable={true}
          statusMessage="Đã chọn Màu đỏ - Size L."
          isError={false}
          onQuantityChange={onQuantityChange}
          onStepQuantity={onStepQuantity}
        />,
      );

      expect(increaseBtn).toBeDisabled();
      expect(decreaseBtn).not.toBeDisabled();
    });
  });

  describe('ProductPurchaseActions, Modal & Toast', () => {
    it('renders guest handoff links with login redirection', () => {
      render(
        <ProductPurchaseActions
          handoffs={{ add: '/login?intent=add-to-cart', buy: '/login?intent=buy-now' }}
          authStatus="guest"
          cartPending={false}
          cartStatus="ready"
          canMutateCart={false}
          onAddToCart={vi.fn()}
          onBuyNow={vi.fn()}
        />,
      );

      const addLink = screen.getByRole('link', { name: /Thêm vào giỏ · Đăng nhập/i });
      expect(addLink).toHaveAttribute('href', '/login?intent=add-to-cart');

      const buyLink = screen.getByRole('link', { name: /Mua ngay · Đăng nhập/i });
      expect(buyLink).toHaveAttribute('href', '/login?intent=buy-now');
    });

    it('renders authenticated action buttons and handles clicks', async () => {
      const user = userEvent.setup();
      const onAddToCart = vi.fn();
      const onBuyNow = vi.fn();

      render(
        <ProductPurchaseActions
          handoffs={{ add: '/login', buy: '/login' }}
          authStatus="authenticated"
          cartPending={false}
          cartStatus="ready"
          canMutateCart={true}
          onAddToCart={onAddToCart}
          onBuyNow={onBuyNow}
        />,
      );

      const addBtn = screen.getByRole('button', { name: /Thêm vào giỏ hàng/i });
      const buyBtn = screen.getByRole('button', { name: /Mua ngay/i });

      await user.click(addBtn);
      expect(onAddToCart).toHaveBeenCalledOnce();

      await user.click(buyBtn);
      expect(onBuyNow).toHaveBeenCalledOnce();
    });

    it('renders self purchase warning modal and dismisses on button click', async () => {
      const user = userEvent.setup();
      const onDismiss = vi.fn();

      render(<SelfPurchaseWarningModal isOpen={true} onDismiss={onDismiss} />);

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText('Bạn không thể mua sản phẩm từ cửa hàng của chính mình.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Đã hiểu' }));
      expect(onDismiss).toHaveBeenCalledOnce();
    });

    it('renders toast notification overlay with message', () => {
      render(<ProductCartToast message="Đã thêm sản phẩm vào giỏ hàng thành công!" />);
      expect(screen.getByRole('status')).toHaveTextContent('Đã thêm sản phẩm vào giỏ hàng thành công!');
    });
  });
});
