import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SellerShopManagement } from './seller-shop-management';
import { RoleApiError } from '../lib/role-api';

const fetchWorkspace = vi.fn();
const createShop = vi.fn();
const updateRegistration = vi.fn();
const updateShop = vi.fn();
const authenticatedFetch = vi.fn();
let accountRoles = ['buyer'];
const defaultAddress = {
  recipientName: 'An Nguyen',
  phoneNumber: '0912345678',
  province: 'TP. Hồ Chí Minh',
  district: 'Quận 1',
  ward: 'Phường Bến Nghé',
  addressLine: '12 Nguyễn Huệ',
};

vi.mock('./auth-session-provider', () => ({
  useAuthSession: () => ({
    authenticatedFetch,
    state: { status: 'authenticated', user: { roles: accountRoles } },
  }),
}));

vi.mock('../lib/seller-shop-api', () => ({
  fetchSellerShopWorkspace: (...args: unknown[]) => fetchWorkspace(...args),
  createSellerShop: (...args: unknown[]) => createShop(...args),
  updateSellerRegistration: (...args: unknown[]) => updateRegistration(...args),
  updateSellerShop: (...args: unknown[]) => updateShop(...args),
}));

describe('SellerShopManagement', () => {
  beforeEach(() => {
    fetchWorkspace.mockReset();
    createShop.mockReset();
    updateRegistration.mockReset();
    updateShop.mockReset();
    accountRoles = ['buyer'];
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
      configurable: true,
    });
  });

  it('renders the onboarding form when the seller has no shop', async () => {
    fetchWorkspace.mockResolvedValue({ shop: null, defaultAddress });
    render(<SellerShopManagement surface="buyer-registration" />);
    expect(
      await screen.findByRole('heading', { name: 'Thông tin đăng ký shop' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Các bước đăng ký shop' })).toBeInTheDocument();
    expect(screen.queryByText('Seller Center')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi đăng ký' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mở bán' })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Người nhận')).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: defaultAddress.recipientName })]),
    );
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('shows pending state without an activation control', async () => {
    fetchWorkspace.mockResolvedValue({
      shop: {
        id: '00000000-0000-4000-8000-000000000101',
        slug: 'an-tech-shop',
        name: 'An Tech Shop',
        description: 'Linh kiện',
        logoUrl: null,
        bannerUrl: null,
        location: 'TP. Hồ Chí Minh',
        contactPhone: '0912345678',
        contactEmail: 'shop@example.test',
        pickupAddress: {
          recipientName: 'An Nguyen',
          phoneNumber: '0912345678',
          province: 'TP. Hồ Chí Minh',
          district: 'Quận 1',
          ward: 'Phường Bến Nghé',
          addressLine: '12 Nguyễn Huệ',
        },
        returnAddress: {
          recipientName: 'An Nguyen',
          phoneNumber: '0912345678',
          province: 'TP. Hồ Chí Minh',
          district: 'Quận 1',
          ward: 'Phường Bến Nghé',
          addressLine: '12 Nguyễn Huệ',
        },
        status: 'inactive',
        onboardingStatus: 'pending_approval',
        onboardingReason: null,
        canSell: false,
        createdAt: '2026-08-15T01:00:00.000Z',
        updatedAt: '2026-08-15T01:00:00.000Z',
      },
      defaultAddress: { ...defaultAddress, addressLine: '99 Lê Lợi' },
    });
    render(<SellerShopManagement surface="buyer-registration" />);
    expect((await screen.findAllByText(/Chờ duyệt/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/không được bán/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mở bán' })).not.toBeInTheDocument();
    expect(screen.getByTestId('seller-shop-profile-view')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cập nhật hồ sơ' }));
    expect(
      screen.getAllByLabelText('Địa chỉ chi tiết').map((input) => input.getAttribute('value')),
    ).toEqual(['12 Nguyễn Huệ', '12 Nguyễn Huệ']);
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('lets a rejected buyer correct and resubmit without seller controls', async () => {
    const rejected = {
      id: '00000000-0000-4000-8000-000000000102',
      slug: 'rejected-shop',
      name: 'Rejected Shop',
      description: 'Linh kiện',
      logoUrl: null,
      bannerUrl: null,
      location: 'TP. Hồ Chí Minh',
      contactPhone: '0912345678',
      contactEmail: 'shop@example.test',
      pickupAddress: {
        recipientName: 'An Nguyen',
        phoneNumber: '0912345678',
        province: 'TP. Hồ Chí Minh',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        addressLine: '12 Nguyễn Huệ',
      },
      returnAddress: {
        recipientName: 'An Nguyen',
        phoneNumber: '0912345678',
        province: 'TP. Hồ Chí Minh',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        addressLine: '12 Nguyễn Huệ',
      },
      status: 'inactive' as const,
      onboardingStatus: 'rejected' as const,
      onboardingReason: 'Thiếu thông tin địa chỉ hợp lệ',
      canSell: false,
      createdAt: '2026-08-15T01:00:00.000Z',
      updatedAt: '2026-08-15T01:00:00.000Z',
    };
    fetchWorkspace.mockResolvedValue({ shop: rejected, defaultAddress: null });
    updateRegistration.mockResolvedValue({
      ...rejected,
      onboardingStatus: 'pending_approval',
      onboardingReason: null,
    });
    render(<SellerShopManagement surface="buyer-registration" />);
    expect(await screen.findByText(/Lý do từ chối/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cập nhật hồ sơ' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sửa và gửi lại đăng ký' }));
    expect(updateRegistration).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Mở bán' })).not.toBeInTheDocument();
  });

  it('explains missing legacy shop contact and address fields before sending an update', async () => {
    fetchWorkspace.mockResolvedValue({
      shop: {
        id: '00000000-0000-4000-8000-000000000103',
        slug: 'legacy-shop',
        name: 'Legacy Shop',
        description: '',
        logoUrl: null,
        bannerUrl: null,
        location: 'Việt Nam',
        contactPhone: null,
        contactEmail: null,
        pickupAddress: null,
        returnAddress: null,
        status: 'active',
        onboardingStatus: 'approved',
        onboardingReason: null,
        canSell: true,
        createdAt: '2026-08-15T01:00:00.000Z',
        updatedAt: '2026-08-15T01:00:00.000Z',
      },
      defaultAddress,
    });
    accountRoles = ['buyer', 'seller'];
    render(<SellerShopManagement surface="seller-management" />);
    await screen.findByRole('heading', { name: 'Legacy Shop' });

    await userEvent.click(screen.getByRole('button', { name: 'Cập nhật hồ sơ' }));

    expect(screen.getAllByLabelText('Người nhận')).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: defaultAddress.recipientName })]),
    );
    expect(
      screen.getAllByLabelText('Địa chỉ chi tiết').map((input) => input.getAttribute('value')),
    ).toEqual([defaultAddress.addressLine, defaultAddress.addressLine]);

    fireEvent.submit(screen.getByRole('button', { name: 'Lưu hồ sơ' }).closest('form')!);

    expect(await screen.findByRole('status')).toHaveTextContent('điện thoại liên hệ');
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('pauses and resumes an approved shop without changing seller access', async () => {
    const approved = {
      id: '00000000-0000-4000-8000-000000000104',
      slug: 'approved-shop',
      name: 'Approved Shop',
      description: 'Linh kiá»‡n',
      logoUrl: null,
      bannerUrl: null,
      location: 'TP. Há»“ ChÃ­ Minh',
      contactPhone: '0912345678',
      contactEmail: 'shop@example.test',
      pickupAddress: defaultAddress,
      returnAddress: defaultAddress,
      status: 'active' as const,
      onboardingStatus: 'approved' as const,
      onboardingReason: null,
      canSell: true,
      createdAt: '2026-08-15T01:00:00.000Z',
      updatedAt: '2026-08-15T01:00:00.000Z',
    };
    fetchWorkspace.mockResolvedValue({ shop: approved, defaultAddress });
    updateShop
      .mockResolvedValueOnce({ ...approved, status: 'inactive', canSell: false })
      .mockResolvedValueOnce({ ...approved, status: 'active', canSell: true });

    accountRoles = ['buyer', 'seller'];
    render(<SellerShopManagement surface="seller-management" />);

    const pauseButton = await screen.findByRole('button', { name: 'Tạm ngừng bán' });
    await userEvent.click(pauseButton);
    expect(updateShop).toHaveBeenNthCalledWith(1, expect.anything(), { status: 'inactive' });
    expect(await screen.findByRole('button', { name: 'Mở bán' })).toBeInTheDocument();
    expect(screen.getByText('Shop đã tạm ngừng bán.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Mở bán' }));
    expect(updateShop).toHaveBeenNthCalledWith(2, expect.anything(), { status: 'active' });
    expect(await screen.findByRole('button', { name: 'Tạm ngừng bán' })).toBeInTheDocument();
    expect(screen.getByText('Shop đã mở bán.')).toBeInTheDocument();
  });
  it('recovers from a duplicate registration response without losing the form', async () => {
    fetchWorkspace.mockResolvedValue({ shop: null, defaultAddress });
    createShop.mockRejectedValue(new RoleApiError('status', 409));
    render(<SellerShopManagement surface="buyer-registration" />);

    await waitFor(() => expect(document.querySelector('form.seller-shop-form')).toBeTruthy());
    const form = document.querySelector('form.seller-shop-form')!;
    await userEvent.type(form.querySelector('input[name="slug"]')!, 'duplicate-shop');
    await userEvent.type(form.querySelector('input[name="name"]')!, 'Duplicate Shop');
    await userEvent.type(form.querySelector('input[name="contactPhone"]')!, '0912345678');
    await userEvent.type(
      form.querySelector('input[name="contactEmail"]')!,
      'duplicate@example.test',
    );
    fireEvent.submit(form);

    expect(await screen.findByRole('status')).toHaveTextContent('Slug');
    expect(createShop).toHaveBeenCalledTimes(1);
  });
});
