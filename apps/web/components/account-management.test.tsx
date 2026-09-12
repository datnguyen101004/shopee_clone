import type { BuyerProfile, ShippingAddress } from '@shopee-clone/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  createShippingAddress,
  deleteShippingAddress,
  getBuyerProfile,
  getShippingAddresses,
  selectDefaultShippingAddress,
  updateBuyerProfile,
  updateShippingAddress,
} from '../lib/account-api';
import { AddressManagement } from './address-management';
import { useAuthSession } from './auth-session-provider';
import { ProfileManagement } from './profile-management';

vi.mock('../lib/account-api', () => ({
  createShippingAddress: vi.fn(),
  deleteShippingAddress: vi.fn(),
  getBuyerProfile: vi.fn(),
  getShippingAddresses: vi.fn(),
  selectDefaultShippingAddress: vi.fn(),
  updateBuyerProfile: vi.fn(),
  updateShippingAddress: vi.fn(),
}));
vi.mock('./auth-session-provider', () => ({ useAuthSession: vi.fn() }));

const loadLegacyWards = vi.hoisted(() => vi.fn());

vi.mock('../lib/legacy-vietnam-ward-loader', () => ({ loadLegacyWards }));

const wardFixtures = {
  '001': [
    { code: '00001', name: 'Phường Phúc Xá' },
    { code: '00004', name: 'Phường Trúc Bạch' },
  ],
  '760': [{ code: '26740', name: 'Phường Bến Nghé' }],
} as const;

const profile: BuyerProfile = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer Example',
  phoneNumber: '0912345678',
  status: 'active',
  roles: ['buyer'],
};
const addresses: ShippingAddress[] = [
  {
    id: '00000000-0000-4000-8000-000000000801',
    recipientName: 'Nguyen Van A',
    phoneNumber: '0912345678',
    province: 'Ha Noi',
    district: 'Ba Dinh',
    ward: 'Phuc Xa',
    addressLine: '12 Hang Than',
    label: 'Nhà riêng',
    isDefault: true,
    createdAt: '2026-08-12T01:00:00.000Z',
    updatedAt: '2026-08-12T01:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000802',
    recipientName: 'Nguyen Van B',
    phoneNumber: '0987654321',
    province: 'TP. Ho Chi Minh',
    district: 'Quan 1',
    ward: 'Ben Nghe',
    addressLine: '20 Le Loi',
    label: 'Văn phòng',
    isDefault: false,
    createdAt: '2026-08-12T01:05:00.000Z',
    updatedAt: '2026-08-12T01:05:00.000Z',
  },
];

describe('account management experiences', () => {
  const authenticatedFetch = vi.fn();
  const synchronizeDisplayName = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    loadLegacyWards.mockImplementation(
      async (districtCode: keyof typeof wardFixtures) => wardFixtures[districtCode] ?? [],
    );
    vi.mocked(useAuthSession).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: profile.id,
          email: profile.email,
          displayName: profile.displayName,
          status: 'active',
          roles: ['buyer'],
        },
      },
      authenticatedFetch,
      sessionFetch: vi.fn(),
      synchronizeDisplayName,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      restore: vi.fn(),
      completeGoogleSignIn: vi.fn(),
      clickstreamFetch: vi.fn(),
    });
    vi.mocked(getBuyerProfile).mockResolvedValue(profile);
    vi.mocked(getShippingAddresses).mockResolvedValue({ items: addresses });
    vi.mocked(updateBuyerProfile).mockResolvedValue({
      ...profile,
      displayName: 'Buyer Updated',
      phoneNumber: '0911111111',
    });
    vi.mocked(createShippingAddress).mockResolvedValue(addresses[0]!);
    vi.mocked(updateShippingAddress).mockResolvedValue(addresses[0]!);
    vi.mocked(selectDefaultShippingAddress).mockResolvedValue({
      ...addresses[1]!,
      isDefault: true,
    });
    vi.mocked(deleteShippingAddress).mockResolvedValue();
  });

  it('shows read-only identity fields, validates phone, and synchronizes only the display name', async () => {
    const user = userEvent.setup();
    render(<ProfileManagement />);
    expect(await screen.findByText('buyer@example.test')).toBeInTheDocument();
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'Tên hiển thị' });
    const phone = screen.getByRole('textbox', { name: /Số điện thoại/ });
    await user.clear(name);
    await user.type(name, 'Buyer Updated');
    await user.clear(phone);
    await user.type(phone, '+84 911 111 111');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() =>
      expect(updateBuyerProfile).toHaveBeenCalledWith(
        { displayName: 'Buyer Updated', phoneNumber: '0911111111' },
        authenticatedFetch,
      ),
    );
    expect(synchronizeDisplayName).toHaveBeenCalledWith('Buyer Updated');
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu hồ sơ');
  });

  it('covers create validation, default selection, edit, and confirmed delete without duplicate actions', async () => {
    const user = userEvent.setup();
    render(<AddressManagement />);
    expect(await screen.findByText('Nguyen Van A')).toBeInTheDocument();
    expect(screen.getByText('Địa chỉ mặc định')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Thêm địa chỉ' }));
    await user.click(screen.getAllByRole('button', { name: 'Thêm địa chỉ' })[1]!);
    expect(
      await screen.findByText('Vui lòng kiểm tra các trường địa chỉ được đánh dấu.'),
    ).toBeInTheDocument();
    expect(createShippingAddress).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    await user.click(screen.getByRole('button', { name: 'Đặt làm mặc định' }));
    await waitFor(() =>
      expect(selectDefaultShippingAddress).toHaveBeenCalledWith(
        addresses[1]!.id,
        authenticatedFetch,
      ),
    );

    const editButtons = screen.getAllByRole('button', { name: 'Sửa' });
    await user.click(editButtons[0]!);
    const wardTrigger = screen.getByRole('button', { name: 'Phường/Xã' });
    await waitFor(() => expect(wardTrigger).toBeEnabled());
    await user.click(wardTrigger);
    await user.type(screen.getByLabelText('Tìm kiếm phường/xã'), 'truc bach');
    await user.click(screen.getByRole('option', { name: 'Phường Trúc Bạch' }));
    await user.click(screen.getByRole('button', { name: 'Lưu địa chỉ' }));
    await waitFor(() =>
      expect(updateShippingAddress).toHaveBeenCalledWith(
        addresses[0]!.id,
        expect.objectContaining({ ward: 'Phường Trúc Bạch' }),
        authenticatedFetch,
      ),
    );

    await user.click(screen.getAllByRole('button', { name: 'Xóa' })[0]!);
    expect(screen.getByRole('dialog', { name: 'Xóa địa chỉ này?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
    await waitFor(() =>
      expect(deleteShippingAddress).toHaveBeenCalledWith(addresses[0]!.id, authenticatedFetch),
    );
  });

  it('creates an address by selecting legacy province, district, and ward popups', async () => {
    const user = userEvent.setup();
    render(<AddressManagement />);
    await screen.findByText('Nguyen Van A');
    await user.click(screen.getByRole('button', { name: 'Thêm địa chỉ' }));

    const provinceTrigger = screen.getByLabelText('Tỉnh/Thành phố');
    const districtTrigger = screen.getByLabelText('Quận/Huyện');
    const wardTrigger = screen.getByLabelText('Phường/Xã');
    expect(districtTrigger).toBeDisabled();
    expect(wardTrigger).toBeDisabled();

    await user.click(provinceTrigger);
    expect(screen.getByRole('dialog', { name: 'Chọn tỉnh/thành phố' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tìm kiếm tỉnh/thành phố'), 'ho chi minh');
    await user.click(screen.getByRole('option', { name: 'Thành phố Hồ Chí Minh' }));
    expect(districtTrigger).toBeEnabled();

    await user.click(districtTrigger);
    await user.type(screen.getByLabelText('Tìm kiếm quận/huyện'), 'quan 1');
    await user.click(screen.getByRole('option', { name: 'Quận 1' }));
    expect(document.querySelector<HTMLInputElement>('input[name="district"]')).toHaveValue(
      'Quận 1',
    );

    await user.click(provinceTrigger);
    await user.type(screen.getByLabelText('Tìm kiếm tỉnh/thành phố'), 'ha noi');
    await user.click(screen.getByRole('option', { name: 'Thành phố Hà Nội' }));
    expect(document.querySelector<HTMLInputElement>('input[name="district"]')).toHaveValue('');

    await user.click(districtTrigger);
    await user.type(screen.getByLabelText('Tìm kiếm quận/huyện'), 'ba dinh');
    await user.click(screen.getByRole('option', { name: 'Quận Ba Đình' }));

    await waitFor(() => expect(wardTrigger).toBeEnabled());
    await user.click(wardTrigger);
    await user.type(screen.getByLabelText('Tìm kiếm phường/xã'), 'phuc xa');
    await user.click(screen.getByRole('option', { name: 'Phường Phúc Xá' }));

    await user.type(screen.getByLabelText('Họ và tên người nhận'), 'Nguyen Van C');
    await user.type(screen.getByLabelText('Số điện thoại'), '0912 345 678');
    await user.type(screen.getByLabelText('Địa chỉ cụ thể'), '12 Hàng Than');
    await user.click(screen.getAllByRole('button', { name: 'Thêm địa chỉ' })[1]!);

    await waitFor(() =>
      expect(createShippingAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          province: 'Thành phố Hà Nội',
          district: 'Quận Ba Đình',
          ward: 'Phường Phúc Xá',
        }),
        authenticatedFetch,
      ),
    );
    await waitFor(() => expect(getShippingAddresses).toHaveBeenCalledTimes(2));
  });

  it('shows restoration and guest states with a safe internal return path', () => {
    vi.mocked(useAuthSession).mockReturnValueOnce({
      ...vi.mocked(useAuthSession)(),
      state: { status: 'guest', user: null },
    });
    render(<ProfileManagement />);
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Faccount%2Fprofile',
    );
  });
});
