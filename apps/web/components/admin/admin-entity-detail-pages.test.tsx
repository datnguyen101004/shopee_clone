import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  AdminCampaignDetailPage,
  AdminProductDetailPage,
  AdminShopDetailPage,
} from './admin-entity-detail-pages';

const api = vi.hoisted(() => ({
  fetchAdminShop: vi.fn(),
  executeAdminShopAction: vi.fn(),
  lookupAdminProduct: vi.fn(),
  applyAdminProductAction: vi.fn(),
  fetchAdminUser: vi.fn(),
  fetchAdminCampaign: vi.fn(),
  fetchAdminCampaignParticipantDetails: vi.fn(),
  publishAdminCampaign: vi.fn(),
  cancelAdminCampaign: vi.fn(),
  authenticatedFetch: vi.fn(),
}));

vi.mock('../auth-session-provider', () => ({
  useAuthSession: () => ({ authenticatedFetch: api.authenticatedFetch }),
}));

vi.mock('../../lib/admin-api', () => ({
  adminErrorMessage: (_error: unknown, fallback: string) => fallback,
  fetchAdminShop: (...args: unknown[]) => api.fetchAdminShop(...args),
  executeAdminShopAction: (...args: unknown[]) => api.executeAdminShopAction(...args),
  lookupAdminProduct: (...args: unknown[]) => api.lookupAdminProduct(...args),
  applyAdminProductAction: (...args: unknown[]) => api.applyAdminProductAction(...args),
  fetchAdminUser: (...args: unknown[]) => api.fetchAdminUser(...args),
}));

vi.mock('../../lib/campaigns-api', () => ({
  fetchAdminCampaign: (...args: unknown[]) => api.fetchAdminCampaign(...args),
  fetchAdminCampaignParticipantDetails: (...args: unknown[]) => api.fetchAdminCampaignParticipantDetails(...args),
  publishAdminCampaign: (...args: unknown[]) => api.publishAdminCampaign(...args),
  cancelAdminCampaign: (...args: unknown[]) => api.cancelAdminCampaign(...args),
}));

const activeShop = {
  id: '00000000-0000-4000-8000-000000000101',
  ownerUserId: '00000000-0000-4000-8000-000000000201',
  slug: 'detail-shop',
  name: 'Detail Shop',
  status: 'ACTIVE' as const,
  onboardingStatus: 'APPROVED' as const,
  onboardingReason: null,
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
};

const activeProduct = {
  id: '00000000-0000-4000-8000-000000000301',
  shopId: activeShop.id,
  shopName: activeShop.name,
  shopSlug: activeShop.slug,
  categoryId: '00000000-0000-4000-8000-000000000401',
  categoryName: 'Thời trang',
  categorySlug: 'thoi-trang',
  slug: 'detail-product',
  name: 'Detail Product',
  description: 'Product description',
  status: 'ACTIVE' as const,
  moderationStatus: 'ACTIVE' as const,
  ratingAverageBasisPoints: 0,
  ratingCount: 0,
  soldCount: 3,
  images: [],
  variants: [],
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
};

const draftCampaign = {
  id: '00000000-0000-0000-0000-000000000501',
  type: {
    code: 'FLASH_SALE',
    displayName: 'Flash Sale',
    description: 'Flash Sale campaign',
    importanceClass: 'FEATURED' as const,
    policyVersion: 1,
    presentationKey: 'FLASH_SALE' as const,
    productOrderKey: 'DISCOUNT_DESC' as const,
    rankingProfileKey: 'FEATURED_FLASH_SALE_V1' as const,
    enabled: true,
  },
  title: 'Flash Sale tháng 9',
  description: 'Ưu đãi tháng 9',
  lifecycle: 'DRAFT' as const,
  announceAt: '2026-09-10T08:00:00.000Z',
  enrollmentStartsAt: '2026-09-10T09:00:00.000Z',
  enrollmentEndsAt: '2026-09-11T09:00:00.000Z',
  startsAt: '2026-09-12T09:00:00.000Z',
  endsAt: '2026-09-12T12:00:00.000Z',
  minimumDiscountBasisPoints: 1000,
  href: '/campaigns/flash-sale-thang-9',
  version: 3,
  sellerJoinedCount: 7,
  sellerDeclinedCount: 1,
  productCount: 12,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('Admin detail lock actions', () => {
  beforeEach(() => {
    api.fetchAdminShop.mockReset();
    api.executeAdminShopAction.mockReset();
    api.lookupAdminProduct.mockReset();
    api.applyAdminProductAction.mockReset();
    api.fetchAdminCampaign.mockReset();
    api.fetchAdminCampaignParticipantDetails.mockReset();
    api.publishAdminCampaign.mockReset();
    api.cancelAdminCampaign.mockReset();
  });

  it('locks a shop with the paired lifecycle action and refreshes detail state', async () => {
    const suspendedShop = { ...activeShop, status: 'SUSPENDED' as const };
    api.fetchAdminShop
      .mockResolvedValueOnce(activeShop)
      .mockResolvedValueOnce(suspendedShop);
    api.executeAdminShopAction.mockResolvedValue(suspendedShop);

    render(<AdminShopDetailPage shopId={activeShop.id} />);
    await screen.findByRole('heading', { name: activeShop.name });
    fireEvent.click(screen.getByRole('button', { name: `Khóa cửa hàng ${activeShop.name}` }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Lý do (8–240 ký tự)' }), {
      target: { value: 'Policy violation' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    await waitFor(() =>
      expect(api.executeAdminShopAction).toHaveBeenCalledWith(
        api.authenticatedFetch,
        activeShop.id,
        { action: 'SUSPEND', reason: 'Policy violation' },
      ),
    );
    await waitFor(() =>
      expect(api.fetchAdminShop).toHaveBeenLastCalledWith(api.authenticatedFetch, activeShop.id),
    );
    expect(await screen.findByRole('button', { name: `Mở khóa cửa hàng ${activeShop.name}` })).toBeInTheDocument();
  });

  it('rejects an invalid shop reason before calling the API', async () => {
    api.fetchAdminShop.mockResolvedValue(activeShop);

    render(<AdminShopDetailPage shopId={activeShop.id} />);
    await screen.findByRole('heading', { name: activeShop.name });
    fireEvent.click(screen.getByRole('button', { name: `Khóa cửa hàng ${activeShop.name}` }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Lý do (8–240 ký tự)' }), {
      target: { value: 'short' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('8 đến 240');
    expect(api.executeAdminShopAction).not.toHaveBeenCalled();
  });

  it('closes after a successful shop mutation even when the detail refresh fails', async () => {
    const suspendedShop = { ...activeShop, status: 'SUSPENDED' as const };
    api.fetchAdminShop.mockResolvedValueOnce(activeShop).mockRejectedValueOnce(new Error('Refresh failed'));
    api.executeAdminShopAction.mockResolvedValue(suspendedShop);

    render(<AdminShopDetailPage shopId={activeShop.id} />);
    await screen.findByRole('heading', { name: activeShop.name });
    fireEvent.click(screen.getByRole('button', { name: `Khóa cửa hàng ${activeShop.name}` }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Lý do (8–240 ký tự)' }), {
      target: { value: 'Policy violation' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    await waitFor(() => expect(api.executeAdminShopAction).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: `Mở khóa cửa hàng ${activeShop.name}` })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh failed');
  });

  it('restores a suspended product and refreshes the unlock state', async () => {
    const suspendedProduct = { ...activeProduct, moderationStatus: 'SUSPENDED' as const };
    api.lookupAdminProduct
      .mockResolvedValueOnce({ adminVersion: 'admin-v1', product: suspendedProduct })
      .mockResolvedValueOnce({ adminVersion: 'admin-v1', product: activeProduct });
    api.applyAdminProductAction.mockResolvedValue({
      adminVersion: 'admin-v1',
      productId: activeProduct.id,
      moderationStatus: 'ACTIVE',
      updatedAt: activeProduct.updatedAt,
    });

    render(<AdminProductDetailPage productId={activeProduct.id} />);
    await screen.findByRole('heading', { name: activeProduct.name });
    fireEvent.click(screen.getByRole('button', { name: `Mở khóa sản phẩm ${activeProduct.name}` }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Lý do (8–240 ký tự)' }), {
      target: { value: 'Policy resolved' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    await waitFor(() =>
      expect(api.applyAdminProductAction).toHaveBeenCalledWith(
        api.authenticatedFetch,
        activeProduct.id,
        { action: 'RESTORE', reason: 'Policy resolved' },
      ),
    );
    expect(await screen.findByRole('button', { name: `Khóa sản phẩm ${activeProduct.name}` })).toBeInTheDocument();
  });

  it('keeps the action dialog and reason when a mutation fails', async () => {
    api.fetchAdminShop.mockResolvedValue(activeShop);
    api.executeAdminShopAction.mockRejectedValue(new Error('Permission denied'));

    render(<AdminShopDetailPage shopId={activeShop.id} />);
    await screen.findByRole('heading', { name: activeShop.name });
    fireEvent.click(screen.getByRole('button', { name: `Khóa cửa hàng ${activeShop.name}` }));
    const reason = screen.getByRole('textbox', { name: 'Lý do (8–240 ký tự)' });
    fireEvent.change(reason, { target: { value: 'Policy violation' } });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    await screen.findByRole('alert');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(reason).toHaveValue('Policy violation');
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled();
  });

  it('does not offer shop lock actions before onboarding approval', async () => {
    api.fetchAdminShop.mockResolvedValue({
      ...activeShop,
      onboardingStatus: 'PENDING_APPROVAL' as const,
      status: 'INACTIVE' as const,
    });

    render(<AdminShopDetailPage shopId={activeShop.id} />);
    await screen.findByRole('heading', { name: activeShop.name });
    expect(
      screen.queryByRole('button', { name: /(?:Khóa|Mở khóa) cửa hàng/ }),
    ).not.toBeInTheDocument();
  });

  it('locks a product through the product action API and refreshes detail state', async () => {
    const suspendedProduct = { ...activeProduct, moderationStatus: 'SUSPENDED' as const };
    api.lookupAdminProduct
      .mockResolvedValueOnce({ adminVersion: 'admin-v1', product: activeProduct })
      .mockResolvedValueOnce({ adminVersion: 'admin-v1', product: suspendedProduct });
    api.applyAdminProductAction.mockResolvedValue({
      adminVersion: 'admin-v1',
      productId: activeProduct.id,
      moderationStatus: 'SUSPENDED',
      updatedAt: suspendedProduct.updatedAt,
    });

    render(<AdminProductDetailPage productId={activeProduct.id} />);
    await screen.findByRole('heading', { name: activeProduct.name });
    fireEvent.click(screen.getByRole('button', { name: `Khóa sản phẩm ${activeProduct.name}` }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Lý do (8–240 ký tự)' }), {
      target: { value: 'Policy violation' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    await waitFor(() =>
      expect(api.applyAdminProductAction).toHaveBeenCalledWith(
        api.authenticatedFetch,
        activeProduct.id,
        { action: 'SUSPEND', reason: 'Policy violation' },
      ),
    );
    await waitFor(() =>
      expect(api.lookupAdminProduct).toHaveBeenLastCalledWith(api.authenticatedFetch, {
        id: activeProduct.id,
      }),
    );
    expect(await screen.findByRole('button', { name: `Mở khóa sản phẩm ${activeProduct.name}` })).toBeInTheDocument();
  });
});

describe('Admin campaign detail actions', () => {
  beforeEach(() => {
    api.fetchAdminCampaign.mockReset();
    api.fetchAdminCampaignParticipantDetails.mockReset();
    api.publishAdminCampaign.mockReset();
    api.cancelAdminCampaign.mockReset();
    api.fetchAdminCampaignParticipantDetails.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
    });
  });

  it('shows participating shop SKU facts including options, prices, quota and available inventory', async () => {
    api.fetchAdminCampaign.mockResolvedValue(draftCampaign);
    api.fetchAdminCampaignParticipantDetails.mockResolvedValue({
      items: [{
        participationId: '00000000-0000-4000-8000-000000000601',
        shopId: activeShop.id,
        shopName: activeShop.name,
        shopSlug: activeShop.slug,
        state: 'LOCKED',
        version: 2,
        respondedAt: '2026-09-10T00:00:00.000Z',
        products: [{
          productId: activeProduct.id,
          productName: activeProduct.name,
          productSlug: activeProduct.slug,
          variantId: '00000000-0000-4000-8000-000000000602',
          variantName: 'Màu đỏ / Size M',
          sku: 'RED-M-001',
          options: ['Màu: Đỏ', 'Kích cỡ: M'],
          regularPriceMinor: 120000,
          salePriceMinor: 99000,
          discountBasisPoints: null,
          allocatedQuantity: 10,
          remainingQuantity: 7,
          physicalInventoryAvailable: 25,
        }],
      }],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });

    render(<AdminCampaignDetailPage campaignId={draftCampaign.id} />);

    expect(await screen.findByText(activeShop.name)).toBeInTheDocument();
    expect(screen.getByText('Màu: Đỏ · Kích cỡ: M')).toBeInTheDocument();
    expect(screen.getByText('SKU: RED-M-001')).toBeInTheDocument();
    expect(screen.getByText('₫120.000')).toBeInTheDocument();
    expect(screen.getByText('₫99.000')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('publishes a draft with the current version and refreshes the detail', async () => {
    const publishedCampaign = { ...draftCampaign, lifecycle: 'ANNOUNCED' as const, version: 4 };
    api.fetchAdminCampaign.mockResolvedValueOnce(draftCampaign).mockResolvedValueOnce(publishedCampaign);
    api.publishAdminCampaign.mockResolvedValue(publishedCampaign);

    render(<AdminCampaignDetailPage campaignId={draftCampaign.id} />);
    await screen.findByRole('heading', { name: draftCampaign.title });
    fireEvent.click(screen.getByRole('button', { name: `Đăng chiến dịch ${draftCampaign.title}` }));
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    await waitFor(() =>
      expect(api.publishAdminCampaign).toHaveBeenCalledWith(
        api.authenticatedFetch,
        draftCampaign.id,
        draftCampaign.version,
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: `Hủy chiến dịch ${draftCampaign.title}` })).toBeInTheDocument();
  });

  it('requires a cancel reason and sends the trimmed value', async () => {
    const announcedCampaign = { ...draftCampaign, lifecycle: 'ANNOUNCED' as const };
    const cancelledCampaign = { ...announcedCampaign, lifecycle: 'CANCELLED' as const, version: 4 };
    api.fetchAdminCampaign.mockResolvedValueOnce(announcedCampaign).mockResolvedValueOnce(cancelledCampaign);
    api.cancelAdminCampaign.mockResolvedValue(cancelledCampaign);

    render(<AdminCampaignDetailPage campaignId={draftCampaign.id} />);
    await screen.findByRole('heading', { name: draftCampaign.title });
    fireEvent.click(screen.getByRole('button', { name: `Hủy chiến dịch ${draftCampaign.title}` }));
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('không được để trống');
    expect(api.cancelAdminCampaign).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Lý do (tối đa 240 ký tự)' }), {
      target: { value: '  Điều chỉnh lịch chương trình  ' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
    await waitFor(() =>
      expect(api.cancelAdminCampaign).toHaveBeenCalledWith(
        api.authenticatedFetch,
        draftCampaign.id,
        draftCampaign.version,
        'Điều chỉnh lịch chương trình',
      ),
    );
  });

  it('hides actions for ended and cancelled campaigns', async () => {
    api.fetchAdminCampaign.mockResolvedValue({ ...draftCampaign, lifecycle: 'ENDED' as const });

    render(<AdminCampaignDetailPage campaignId={draftCampaign.id} />);
    await screen.findByRole('heading', { name: draftCampaign.title });

    expect(screen.queryByRole('button', { name: /Đăng chiến dịch/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hủy chiến dịch/ })).not.toBeInTheDocument();
  });

  it('keeps the publish dialog open when the mutation fails', async () => {
    api.fetchAdminCampaign.mockResolvedValue(draftCampaign);
    api.publishAdminCampaign.mockRejectedValue(new Error('Publish failed'));

    render(<AdminCampaignDetailPage campaignId={draftCampaign.id} />);
    await screen.findByRole('heading', { name: draftCampaign.title });
    fireEvent.click(screen.getByRole('button', { name: `Đăng chiến dịch ${draftCampaign.title}` }));
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    await screen.findByRole('alert');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled();
  });

  it('keeps the successful state when the authoritative refresh fails', async () => {
    const publishedCampaign = { ...draftCampaign, lifecycle: 'ANNOUNCED' as const, version: 4 };
    api.fetchAdminCampaign.mockResolvedValueOnce(draftCampaign).mockRejectedValueOnce(new Error('Refresh failed'));
    api.publishAdminCampaign.mockResolvedValue(publishedCampaign);

    render(<AdminCampaignDetailPage campaignId={draftCampaign.id} />);
    await screen.findByRole('heading', { name: draftCampaign.title });
    fireEvent.click(screen.getByRole('button', { name: `Đăng chiến dịch ${draftCampaign.title}` }));
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: `Hủy chiến dịch ${draftCampaign.title}` })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh failed');
  });
});
