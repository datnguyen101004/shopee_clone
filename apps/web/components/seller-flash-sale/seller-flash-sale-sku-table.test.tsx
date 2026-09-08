import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SellerFlashSaleSkuTable } from './seller-flash-sale-sku-table';
import type { SellerFlashSaleProductGroup } from '../../lib/flash-sale-types';

describe('SellerFlashSaleSkuTable', () => {
  const mockGroups: SellerFlashSaleProductGroup[] = [
    {
      productId: 'prod-1',
      productName: 'Áo thun thể thao nam',
      productSlug: 'ao-thun-the-thao-nam',
      imageUrl: null,
      skus: [
        {
          id: 'sku-1',
          campaignId: 'camp-1',
          productId: 'prod-1',
          variantId: 'var-1',
          variantName: 'Xanh dương / L',
          skuCode: 'SHIRT-BLUE-L',
          imageUrl: null,
          basePriceMinor: 200000,
          salePriceMinor: 100000,
          availablePhysical: 50,
          allocatedQuantity: 20,
          remainingQuantity: 10,
          netConsumedQuantity: 10,
          version: 1,
          state: 'ACTIVE',
          canEditQuota: false,
          canReplenish: false,
          canEnd: false,
        },
        {
          id: 'sku-2',
          campaignId: 'camp-1',
          productId: 'prod-1',
          variantId: 'var-2',
          variantName: 'Đỏ / M',
          skuCode: 'SHIRT-RED-M',
          imageUrl: null,
          basePriceMinor: 200000,
          salePriceMinor: 100000,
          availablePhysical: 30,
          allocatedQuantity: 15,
          remainingQuantity: 0,
          netConsumedQuantity: 15,
          version: 2,
          state: 'SOLD_OUT',
          canEditQuota: false,
          canReplenish: true,
          canEnd: true,
        },
        {
          id: 'sku-3',
          campaignId: 'camp-1',
          productId: 'prod-1',
          variantId: 'var-3',
          variantName: 'Trắng / S',
          skuCode: 'SHIRT-WHITE-S',
          imageUrl: null,
          basePriceMinor: 200000,
          salePriceMinor: 100000,
          availablePhysical: 40,
          allocatedQuantity: 10,
          remainingQuantity: 10,
          netConsumedQuantity: 0,
          version: 1,
          state: 'UPCOMING',
          canEditQuota: true,
          canReplenish: false,
          canEnd: false,
        },
      ],
    },
  ];

  it('renders product-grouped SKU list with correct badges and prices', () => {
    render(
      <SellerFlashSaleSkuTable
        campaignId="camp-1"
        campaignTitle="Flash Sale 9.9"
        campaignLifecycle="ACTIVE"
        minimumDiscountBasisPoints={1000}
        groups={mockGroups}
        canEnroll={true}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText('Áo thun thể thao nam')).toBeInTheDocument();
    expect(screen.getByText('Xanh dương / L')).toBeInTheDocument();
    expect(screen.getByText('Đang diễn ra')).toBeInTheDocument();
    expect(screen.getByText('Hết suất')).toBeInTheDocument();
    expect(screen.getByText('Sắp diễn ra')).toBeInTheDocument();
  });

  it('renders action buttons according to SKU state permissions', () => {
    render(
      <SellerFlashSaleSkuTable
        campaignId="camp-1"
        campaignTitle="Flash Sale 9.9"
        campaignLifecycle="ACTIVE"
        minimumDiscountBasisPoints={1000}
        groups={mockGroups}
        canEnroll={true}
        onRefresh={vi.fn()}
      />
    );

    // Active sku without permissions shows 'Đang mở bán'
    expect(screen.getByText('Đang mở bán')).toBeInTheDocument();

    // Sold out sku with canReplenish and canEnd
    expect(screen.getByRole('button', { name: /^Thêm số lượng / })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kết thúc chiến dịch cho SKU Đỏ / M' })).toHaveAttribute('title', 'Kết thúc chiến dịch');

    // Upcoming sku with canEditQuota
    expect(screen.getByRole('button', { name: /^Chỉnh quota / })).toBeInTheDocument();
  });

  it('opens registration modal when clicking "+ Thêm SKU"', async () => {
    const user = userEvent.setup();
    render(
      <SellerFlashSaleSkuTable
        campaignId="camp-1"
        campaignTitle="Flash Sale 9.9"
        campaignLifecycle="ACTIVE"
        minimumDiscountBasisPoints={1000}
        groups={mockGroups}
        canEnroll={true}
        onRefresh={vi.fn()}
      />
    );

    const registerBtn = screen.getByRole('button', { name: '+ Thêm SKU' });
    await user.click(registerBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Đăng ký SKU tham gia Flash Sale')).toBeInTheDocument();
  });

  it('hides SKU registration until the seller has joined', () => {
    render(
      <SellerFlashSaleSkuTable
        campaignId="camp-1"
        campaignTitle="Flash Sale 9.9"
        campaignLifecycle="ENROLLMENT_OPEN"
        minimumDiscountBasisPoints={1000}
        groups={[]}
        canEnroll={false}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '+ Thêm SKU' })).not.toBeInTheDocument();
    expect(screen.getByText('Chưa có SKU nào tham gia chiến dịch này')).toBeInTheDocument();
  });

  it('renders empty card when no SKUs are enrolled', () => {
    render(
      <SellerFlashSaleSkuTable
        campaignId="camp-1"
        campaignTitle="Flash Sale 9.9"
        campaignLifecycle="ACTIVE"
        minimumDiscountBasisPoints={1000}
        groups={[]}
        canEnroll={true}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText('Chưa có SKU nào tham gia chiến dịch này')).toBeInTheDocument();
  });
});
