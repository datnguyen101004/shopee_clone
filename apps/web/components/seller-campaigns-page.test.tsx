import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SellerCampaignsPage } from './seller-campaigns-page';

const authenticatedFetch = vi.fn();
const fetchSellerCampaign = vi.fn();
const fetchSellerCampaigns = vi.fn();
const decideSellerCampaign = vi.fn();
const withdrawSellerCampaign = vi.fn();
const fetchSellerFlashSaleSnapshot = vi.fn();

vi.mock('./auth-session-provider', () => ({
  useAuthSession: () => ({
    authenticatedFetch,
    state: {
      status: 'authenticated',
      user: { roles: ['seller'] },
    },
  }),
}));

vi.mock('../lib/campaigns-api', () => ({
  decideSellerCampaign: (...args: unknown[]) => decideSellerCampaign(...args),
  fetchSellerCampaign: (...args: unknown[]) => fetchSellerCampaign(...args),
  fetchSellerCampaigns: (...args: unknown[]) => fetchSellerCampaigns(...args),
  withdrawSellerCampaign: (...args: unknown[]) => withdrawSellerCampaign(...args),
}));

vi.mock('../lib/flash-sale-api', () => ({
  fetchSellerFlashSaleSnapshot: (...args: unknown[]) => fetchSellerFlashSaleSnapshot(...args),
}));

const type = {
  code: 'FLASH_SALE',
  displayName: 'Flash Sale',
  description: 'Khung giờ giảm sâu',
  importanceClass: 'FEATURED',
  policyVersion: 1,
  presentationKey: 'FLASH_SALE',
  productOrderKey: 'DISCOUNT_DESC',
  rankingProfileKey: 'FEATURED_FLASH_SALE_V1',
  enabled: true,
};

function detail(sellerState?: 'JOINED' | 'LOCKED') {
  return {
    id: 'campaign-1',
    type,
    title: 'Flash Sale tháng 9',
    description: 'Khung giờ giảm sâu',
    lifecycle: 'ENROLLMENT_OPEN',
    announceAt: '2026-09-08T00:00:00.000Z',
    enrollmentStartsAt: '2026-09-08T01:00:00.000Z',
    enrollmentEndsAt: '2026-09-09T00:00:00.000Z',
    startsAt: '2026-09-10T00:00:00.000Z',
    endsAt: '2026-09-11T00:00:00.000Z',
    minimumDiscountBasisPoints: 1000,
    ...(sellerState ? { sellerState } : {}),
    participationVersion: sellerState ? 1 : null,
    content: [],
    imageUrl: null,
    altText: 'Flash Sale tháng 9',
    eligibleProducts: [],
  };
}

describe('SellerCampaignsPage Flash Sale participation flow', () => {
  beforeEach(() => {
    fetchSellerCampaign.mockReset();
    fetchSellerCampaigns.mockReset().mockResolvedValue({ items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 1 });
    decideSellerCampaign.mockReset().mockResolvedValue({});
    withdrawSellerCampaign.mockReset();
    fetchSellerFlashSaleSnapshot.mockReset().mockResolvedValue({ campaignId: 'campaign-1', version: 1, groups: [] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('confirms a Flash Sale join with no products, then exposes Add SKU', async () => {
    fetchSellerCampaign
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail('JOINED'));
    render(<SellerCampaignsPage campaignId="campaign-1" />);

    const joinButton = await screen.findByRole('button', { name: 'Xác nhận tham gia chiến dịch' });
    fireEvent.click(joinButton);
    expect(joinButton).toBeDisabled();

    await waitFor(() => {
      expect(decideSellerCampaign).toHaveBeenCalledWith(
        authenticatedFetch,
        'campaign-1',
        { decision: 'JOINED', version: null, products: [] },
        expect.any(String),
      );
    });
    expect(window.confirm).toHaveBeenCalledWith('Xác nhận cho shop tham gia chiến dịch Flash Sale?');
    await waitFor(() => expect(screen.getByText('Thêm SKU tham gia')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '+ Thêm SKU' })).toBeInTheDocument();
  });

  it('does not expose Add SKU before the seller joins', async () => {
    fetchSellerCampaign.mockResolvedValueOnce(detail());
    render(<SellerCampaignsPage campaignId="campaign-1" />);

    await screen.findByRole('button', { name: 'Xác nhận tham gia chiến dịch' });
    expect(screen.queryByRole('button', { name: '+ Thêm SKU' })).not.toBeInTheDocument();
  });

  it('shows accessible confirm and decline icons in an open campaign row', async () => {
    fetchSellerCampaigns.mockResolvedValueOnce({
      items: [detail()],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    render(<SellerCampaignsPage />);

    expect(await screen.findByRole('button', { name: 'Xác nhận tham gia chiến dịch Flash Sale tháng 9' })).toHaveAttribute('title', 'Xác nhận tham gia');
    expect(screen.getByRole('button', { name: 'Từ chối chiến dịch Flash Sale tháng 9' })).toHaveAttribute('title', 'Từ chối');
    expect(screen.getByRole('button', { name: 'Xem chi tiết chiến dịch Flash Sale tháng 9' })).toHaveAttribute('title', 'Xem chi tiết');
  });

  it('only shows the view action after the seller has joined', async () => {
    fetchSellerCampaigns.mockResolvedValueOnce({
      items: [detail('JOINED')],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    render(<SellerCampaignsPage />);

    expect(await screen.findByRole('button', { name: 'Xem chi tiết chiến dịch Flash Sale tháng 9' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận tham gia chiến dịch Flash Sale tháng 9' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Từ chối chiến dịch Flash Sale tháng 9' })).not.toBeInTheDocument();
  });

  it('declines from the campaign row with the latest participation version', async () => {
    fetchSellerCampaigns.mockResolvedValueOnce({
      items: [detail()],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    fetchSellerCampaign.mockResolvedValueOnce({ ...detail(), participationVersion: 3 });
    render(<SellerCampaignsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Từ chối chiến dịch Flash Sale tháng 9' }));

    expect(window.confirm).toHaveBeenCalledWith('Xác nhận từ chối chiến dịch Flash Sale tháng 9?');
    await waitFor(() => {
      expect(decideSellerCampaign).toHaveBeenCalledWith(
        authenticatedFetch,
        'campaign-1',
        { decision: 'DECLINED', version: 3 },
        expect.any(String),
      );
    });
    expect(await screen.findByText('Đã từ chối chiến dịch Flash Sale tháng 9.')).toBeInTheDocument();
  });
});
