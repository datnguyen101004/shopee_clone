import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AdminCampaignsPage, isoDateTime, localDateTime } from './admin-campaigns-page';

const api = vi.hoisted(() => ({
  fetchCampaignTypes: vi.fn(),
  fetchAdminCampaigns: vi.fn(),
  createAdminCampaign: vi.fn(),
  previewAdminCampaign: vi.fn(),
  publishAdminCampaign: vi.fn(),
  cancelAdminCampaign: vi.fn(),
  authenticatedFetch: vi.fn(),
}));

vi.mock('../auth-session-provider', () => ({
  useAuthSession: () => ({ authenticatedFetch: api.authenticatedFetch }),
}));

vi.mock('../../lib/campaigns-api', () => ({
  fetchCampaignTypes: (...args: unknown[]) => api.fetchCampaignTypes(...args),
  fetchAdminCampaigns: (...args: unknown[]) => api.fetchAdminCampaigns(...args),
  createAdminCampaign: (...args: unknown[]) => api.createAdminCampaign(...args),
  previewAdminCampaign: (...args: unknown[]) => api.previewAdminCampaign(...args),
  publishAdminCampaign: (...args: unknown[]) => api.publishAdminCampaign(...args),
  cancelAdminCampaign: (...args: unknown[]) => api.cancelAdminCampaign(...args),
}));

const campaignType = {
  code: 'FLASH_SALE',
  displayName: 'Flash Sale',
  description: 'Flash Sale campaign',
  importanceClass: 'FEATURED' as const,
  policyVersion: 1,
  presentationKey: 'FLASH_SALE' as const,
  productOrderKey: 'DISCOUNT_DESC' as const,
  rankingProfileKey: 'FEATURED_FLASH_SALE_V1' as const,
  enabled: true,
};

const campaign = {
  id: '00000000-0000-4000-8000-000000000501',
  type: campaignType,
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

const campaignPage = (page = 1, totalItems = 200) => ({
  items: [campaign],
  page,
  pageSize: 10,
  totalItems,
  totalPages: Math.ceil(totalItems / 10),
});

describe('AdminCampaignsPage management table', () => {
  beforeEach(() => {
    api.fetchCampaignTypes.mockReset();
    api.fetchAdminCampaigns.mockReset();
    api.createAdminCampaign.mockReset();
    api.previewAdminCampaign.mockReset();
    api.publishAdminCampaign.mockReset();
    api.cancelAdminCampaign.mockReset();
    api.fetchCampaignTypes.mockResolvedValue([campaignType]);
    api.fetchAdminCampaigns.mockResolvedValue(campaignPage());
  });

  it('keeps the creation form hidden until the toolbar button opens its dialog', async () => {
    render(<AdminCampaignsPage />);
    await screen.findByText(campaign.title);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo chiến dịch' }));

    expect(screen.getByRole('dialog', { name: 'Tạo chiến dịch' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu đề')).toBeInTheDocument();
  });

  it('closes the creation dialog without submitting when cancelled', async () => {
    render(<AdminCampaignsPage />);
    await screen.findByText(campaign.title);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo chiến dịch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.createAdminCampaign).not.toHaveBeenCalled();
  });

  it('closes on Escape and returns focus to the toolbar trigger', async () => {
    render(<AdminCampaignsPage />);
    await screen.findByText(campaign.title);
    const trigger = screen.getByRole('button', { name: 'Tạo chiến dịch' });
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Đóng form tạo chiến dịch' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes the dialog and refreshes the first page after creating a draft', async () => {
    api.createAdminCampaign.mockResolvedValue({ ...campaign, title: 'Bản nháp mới' });
    render(<AdminCampaignsPage />);
    await screen.findByText(campaign.title);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo chiến dịch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));

    await waitFor(() => expect(api.createAdminCampaign).toHaveBeenCalledWith(
      api.authenticatedFetch,
      expect.objectContaining({ typeCode: 'STANDARD' }),
    ));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.fetchAdminCampaigns).toHaveBeenCalledWith(api.authenticatedFetch, '?page=1');
  });

  it('keeps the dialog open and shows the API error when draft creation fails', async () => {
    api.createAdminCampaign.mockRejectedValue(new Error('Timeline không hợp lệ.'));
    render(<AdminCampaignsPage />);
    await screen.findByText(campaign.title);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo chiến dịch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Timeline không hợp lệ.'));
    expect(screen.getByRole('dialog', { name: 'Tạo chiến dịch' })).toBeInTheDocument();
  });

  it('renders a management table with accessible row actions and numeric pages', async () => {
    render(<AdminCampaignsPage />);
    await screen.findByText(campaign.title);

    expect(screen.getByRole('table')).toHaveClass('admin-management-table', 'admin-campaign-table');
    expect(screen.getByRole('columnheader', { name: 'Lịch chương trình' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Đăng chiến dịch ${campaign.title}` }),
    ).toHaveClass('admin-icon-btn');
    expect(screen.getByRole('button', { name: `Hủy chiến dịch ${campaign.title}` })).toHaveClass(
      'admin-icon-btn',
    );
    expect(
      screen.getByRole('link', { name: `Xem chi tiết chiến dịch ${campaign.title}` }),
    ).toHaveClass('admin-icon-btn');
    [1, 2, 3, 4, 5, 20].forEach((pageNumber) => {
      expect(screen.getByRole('button', { name: `Trang ${pageNumber}` })).toBeInTheDocument();
    });
  });

  it('loads the selected numeric page through the existing page query', async () => {
    api.fetchAdminCampaigns
      .mockResolvedValueOnce(campaignPage(1))
      .mockResolvedValueOnce(campaignPage(2));

    render(<AdminCampaignsPage />);
    await screen.findByText(campaign.title);
    fireEvent.click(screen.getByRole('button', { name: 'Trang 2' }));

    await waitFor(() =>
      expect(api.fetchAdminCampaigns).toHaveBeenLastCalledWith(
        api.authenticatedFetch,
        expect.stringContaining('page=2'),
      ),
    );
  });

  it('converts ISO schedule values to local datetime inputs before sending them back as ISO', () => {
    const source =
      new Date('2026-09-08T02:15:00.000Z').getTimezoneOffset() === 0
        ? '2026-09-08T02:15:00.000+01:00'
        : '2026-09-08T02:15:00.000Z';
    const parsed = new Date(source);
    const expectedLocal = [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, '0'),
      String(parsed.getDate()).padStart(2, '0'),
    ].join('-') +
      `T${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;

    expect(localDateTime(source)).toBe(expectedLocal);
    expect(isoDateTime(localDateTime(source))).toBe(parsed.toISOString());
  });
});
