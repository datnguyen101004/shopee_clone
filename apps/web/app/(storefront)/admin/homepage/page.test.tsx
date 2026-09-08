import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminHomepageConfigPage, {
  bannerDateTimeInputToIso,
  isoToBannerDateTimeInput,
} from './page';

const authenticatedFetch = vi.fn();
const fetchAdminBanners = vi.fn();
const fetchAdminHomepageModules = vi.fn();
const fetchAllAdminCampaigns = vi.fn();
const createAdminBanner = vi.fn();
const updateAdminBanner = vi.fn();
const uploadAdminBannerMedia = vi.fn();

vi.mock('../../../../components/auth-session-provider', () => ({
  useAuthSession: () => ({ authenticatedFetch }),
}));

vi.mock('../../../../lib/campaigns-api', () => ({
  fetchAllAdminCampaigns: (...args: unknown[]) => fetchAllAdminCampaigns(...args),
}));

vi.mock('../../../../lib/admin-api', () => ({
  adminErrorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback),
  createAdminBanner: (...args: unknown[]) => createAdminBanner(...args),
  deleteAdminBanner: vi.fn(),
  fetchAdminBanners: (...args: unknown[]) => fetchAdminBanners(...args),
  fetchAdminHomepageModules: (...args: unknown[]) => fetchAdminHomepageModules(...args),
  updateAdminBanner: (...args: unknown[]) => updateAdminBanner(...args),
  updateAdminHomepageModule: vi.fn(),
  uploadAdminBannerMedia: (...args: unknown[]) => uploadAdminBannerMedia(...args),
}));

const existingBanner = {
  id: 'banner-1',
  title: 'Existing banner',
  imageUrl: '/media/existing-banner.png',
  altText: 'Existing banner',
  theme: 'brand',
  targetType: 'URL',
  targetId: null,
  targetQuery: '/',
  targetAvailable: true,
  isEnabled: true,
  priority: 0,
  sortOrder: 0,
  displayFrom: null,
  displayUntil: null,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
};

const unavailableBanner = {
  ...existingBanner,
  id: 'banner-ended',
  title: 'Ended campaign banner',
  targetType: 'CAMPAIGN',
  targetId: 'campaign-ended',
  targetQuery: null,
  targetAvailable: false,
};

describe('AdminHomepageConfigPage banner image upload', () => {
  beforeEach(() => {
    fetchAdminBanners.mockReset().mockResolvedValue({ items: [] });
    fetchAdminHomepageModules.mockReset().mockResolvedValue({ items: [] });
    fetchAllAdminCampaigns.mockReset().mockResolvedValue([]);
    createAdminBanner.mockReset().mockResolvedValue({});
    updateAdminBanner.mockReset().mockResolvedValue({});
    uploadAdminBannerMedia.mockReset();
    authenticatedFetch.mockReset();
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() });
    }
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:banner-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('round-trips banner times in the selected timezone instead of slicing UTC text', () => {
    const utcValue = '2026-09-09T16:25:00.000Z';
    expect(isoToBannerDateTimeInput(utcValue, 'Asia/Ho_Chi_Minh')).toBe('2026-09-09T23:25');
    expect(isoToBannerDateTimeInput(utcValue, 'UTC')).toBe('2026-09-09T16:25');
    expect(bannerDateTimeInputToIso('2026-09-09T23:25', 'Asia/Ho_Chi_Minh')).toBe(utcValue);
    expect(bannerDateTimeInputToIso('2026-09-09T16:25', 'UTC')).toBe(utcValue);
  });

  it('shows an English calendar with weekday and AM/PM controls', async () => {
    render(<AdminHomepageConfigPage />);
    await screen.findByText('Chưa có banner nào.');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm Banner mới' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hiển thị từ' }));

    expect(screen.getByRole('dialog')).toHaveClass('datetime-local-picker__popover--admin-modal');
    expect(screen.getByText('Mo')).toBeInTheDocument();
    expect(screen.getByText('Tu')).toBeInTheDocument();
    expect(screen.getByText('We')).toBeInTheDocument();
    expect(screen.getByText('Th')).toBeInTheDocument();
    expect(screen.getByText('Fr')).toBeInTheDocument();
    expect(screen.getByText('Sa')).toBeInTheDocument();
    expect(screen.getByText('Su')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'AM' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'PM' })).toBeInTheDocument();
  });

  it('lets a new banner choose a date and PM time when its fields start empty', async () => {
    render(<AdminHomepageConfigPage />);
    await screen.findByText('Chưa có banner nào.');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm Banner mới' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hiển thị từ' }));
    const picker = screen.getByRole('dialog');
    const currentMonthDay = Array.from(picker.querySelectorAll('button')).find(
      (button) => button.textContent === '1' && !button.hasAttribute('data-outside'),
    );
    expect(currentMonthDay).toBeTruthy();
    fireEvent.click(currentMonthDay!);
    fireEvent.click(screen.getByRole('option', { name: 'PM' }));

    expect(screen.getByRole('button', { name: 'Hiển thị từ' })).not.toHaveTextContent(
      'Select date and time',
    );
  });

  it('previews locally, uploads only on save, and retries without duplicating a completed upload', async () => {
    let rejectUpload!: (error: Error) => void;
    uploadAdminBannerMedia.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectUpload = reject;
      }),
    );
    render(<AdminHomepageConfigPage />);
    await screen.findByText('Chưa có banner nào.');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm Banner mới' }));
    fireEvent.change(screen.getByPlaceholderText('Siêu Sale Hè 2026'), {
      target: { value: 'New banner' },
    });

    const file = new File([new Uint8Array([1, 2])], 'banner.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Ảnh banner:'), { target: { files: [file], value: '' } });
    const saveButton = screen.getByRole('button', { name: 'Lưu Banner' });
    expect(uploadAdminBannerMedia).not.toHaveBeenCalled();
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);
    expect(saveButton).toBeDisabled();
    rejectUpload(new Error('S3 unavailable'));
    await waitFor(() => expect(screen.getAllByText('S3 unavailable').length).toBeGreaterThan(0));
    expect(saveButton).toBeEnabled();
    expect(createAdminBanner).not.toHaveBeenCalled();

    uploadAdminBannerMedia.mockResolvedValueOnce({
      id: 'asset-1',
      mimeType: 'image/png',
      byteSize: 2,
      width: 1200,
      height: 400,
      imageUrl: '/media/admin-banner-media/asset-1.png',
      expiresAt: '2026-09-09T10:00:00.000Z',
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(createAdminBanner).toHaveBeenCalledWith(
        authenticatedFetch,
        expect.objectContaining({
          imageAssetId: 'asset-1',
        }),
      );
    });
    expect(createAdminBanner.mock.calls[0]?.[1]).not.toHaveProperty('imageUrl');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Lưu Banner' })).not.toBeInTheDocument());
    expect(fetchAdminBanners).toHaveBeenCalledTimes(2);
  });

  it('keeps the existing image reference when an edit is saved without a replacement', async () => {
    fetchAdminBanners.mockResolvedValueOnce({ items: [existingBanner] });
    render(<AdminHomepageConfigPage />);
    await screen.findByText('Existing banner');
    fireEvent.click(screen.getByRole('button', { name: 'Sửa banner Existing banner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu Banner' }));

    await waitFor(() => {
      expect(updateAdminBanner).toHaveBeenCalledWith(
        authenticatedFetch,
        existingBanner.id,
        expect.objectContaining({ imageUrl: existingBanner.imageUrl }),
      );
    });
    expect(updateAdminBanner.mock.calls[0]?.[2]).not.toHaveProperty('imageAssetId');
  });

  it('reuses a completed upload when saving the banner is retried', async () => {
    const media = {
      id: 'asset-retry',
      mimeType: 'image/png',
      byteSize: 2,
      width: 1200,
      height: 400,
      imageUrl: '/media/admin-banner-media/asset-retry.png',
      expiresAt: '2026-09-09T10:00:00.000Z',
    };
    uploadAdminBannerMedia.mockResolvedValueOnce(media);
    createAdminBanner.mockRejectedValueOnce(new Error('save failed')).mockResolvedValueOnce({});
    render(<AdminHomepageConfigPage />);
    await screen.findByText('Chưa có banner nào.');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm Banner mới' }));
    fireEvent.change(screen.getByPlaceholderText('Siêu Sale Hè 2026'), {
      target: { value: 'Retry banner' },
    });
    const file = new File([new Uint8Array([1, 2])], 'retry.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Ảnh banner:'), { target: { files: [file], value: '' } });
    const saveButton = screen.getByRole('button', { name: 'Lưu Banner' });

    fireEvent.click(saveButton);
    await screen.findByText('save failed');
    expect(uploadAdminBannerMedia).toHaveBeenCalledTimes(1);
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);
    await waitFor(() => expect(createAdminBanner).toHaveBeenCalledTimes(2));
    expect(uploadAdminBannerMedia).toHaveBeenCalledTimes(1);
    expect(createAdminBanner.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ imageAssetId: media.id }),
    );
    expect(createAdminBanner.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ imageAssetId: media.id }),
    );
    expect(createAdminBanner.mock.calls[0]?.[1]).not.toHaveProperty('imageUrl');
    expect(createAdminBanner.mock.calls[1]?.[1]).not.toHaveProperty('imageUrl');
  });

  it('closes from the backdrop while keeping clicks inside the form open', async () => {
    render(<AdminHomepageConfigPage />);
    await screen.findByText('Chưa có banner nào.');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm Banner mới' }));

    const backdrop = document.querySelector('.admin-homepage-banner-backdrop');
    expect(backdrop).toBeInstanceOf(HTMLElement);
    fireEvent.mouseDown(screen.getByText('Tạo banner mới'));
    expect(screen.getByText('Tạo banner mới')).toBeInTheDocument();
    fireEvent.mouseDown(backdrop as HTMLElement);
    expect(screen.queryByText('Tạo banner mới')).not.toBeInTheDocument();
  });

  it('keeps an unavailable target badge on its own wrapped row', async () => {
    fetchAdminBanners.mockResolvedValueOnce({ items: [unavailableBanner] });
    render(<AdminHomepageConfigPage />);

    const badge = await screen.findByText('Mục tiêu không khả dụng');
    const targetCell = badge.closest('td');
    expect(targetCell).toHaveClass('admin-homepage-banner-target-cell');
    expect(badge.parentElement).toHaveClass('admin-homepage-banner-target');
    expect(targetCell?.querySelector('.admin-entity-link')).toBeInTheDocument();
  });
});
