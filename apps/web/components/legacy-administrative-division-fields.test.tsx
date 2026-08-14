import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  LEGACY_NO_WARD_SENTINEL,
  type LegacyWard,
} from '../lib/legacy-vietnam-administrative-divisions';
import { LEGACY_WARDS_BY_DISTRICT } from '../lib/legacy-vietnam-wards.generated';
import { LegacyAdministrativeDivisionFields } from './legacy-administrative-division-fields';

const loadLegacyWards = vi.hoisted(() => vi.fn());

vi.mock('../lib/legacy-vietnam-ward-loader', () => ({ loadLegacyWards }));

async function chooseDivision(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  searchLabel: string,
  query: string,
  optionName: string,
) {
  await user.click(screen.getByRole('button', { name: label }));
  const search = screen.getByRole('searchbox', { name: searchLabel });
  await user.type(search, query);
  await user.click(screen.getByRole('option', { name: optionName }));
}

describe('LegacyAdministrativeDivisionFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadLegacyWards.mockImplementation(
      async (districtCode: string) => LEGACY_WARDS_BY_DISTRICT[districtCode] ?? [],
    );
  });

  it('loads dependent wards, searches without accents, and supports keyboard selection', async () => {
    let resolveWards!: (wards: readonly LegacyWard[]) => void;
    loadLegacyWards.mockImplementationOnce(
      () =>
        new Promise<readonly LegacyWard[]>((resolve) => {
          resolveWards = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<LegacyAdministrativeDivisionFields />);

    const districtTrigger = screen.getByRole('button', { name: 'Quận/Huyện' });
    const wardTrigger = screen.getByRole('button', { name: 'Phường/Xã' });
    expect(districtTrigger).toBeDisabled();
    expect(wardTrigger).toBeDisabled();

    await chooseDivision(
      user,
      'Tỉnh/Thành phố',
      'Tìm kiếm tỉnh/thành phố',
      'ha noi',
      'Thành phố Hà Nội',
    );
    await chooseDivision(user, 'Quận/Huyện', 'Tìm kiếm quận/huyện', 'ba dinh', 'Quận Ba Đình');

    expect(loadLegacyWards).toHaveBeenCalledWith('001');
    expect(screen.getByText('Đang tải danh sách phường/xã…')).toBeInTheDocument();
    expect(wardTrigger).toBeDisabled();

    await act(async () => {
      resolveWards(LEGACY_WARDS_BY_DISTRICT['001'] ?? []);
    });
    await waitFor(() => expect(wardTrigger).toBeEnabled());

    wardTrigger.focus();
    await user.keyboard('{Enter}');
    const search = screen.getByRole('searchbox', { name: 'Tìm kiếm phường/xã' });
    expect(search).toHaveFocus();
    await user.type(search, 'khong ton tai');
    expect(screen.getByText('Không tìm thấy lựa chọn phù hợp.')).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'TRUC BACH');
    const option = screen.getByRole('option', { name: 'Phường Trúc Bạch' });
    await user.tab();
    expect(option).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(document.querySelector<HTMLInputElement>('input[name="ward"]')).toHaveValue(
      'Phường Trúc Bạch',
    );
  });

  it('shows a retry action without losing a stored ward when the lazy chunk fails', async () => {
    loadLegacyWards
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValueOnce(LEGACY_WARDS_BY_DISTRICT['001'] ?? []);
    const user = userEvent.setup();
    render(
      <LegacyAdministrativeDivisionFields
        initialProvince="Ha Noi"
        initialDistrict="Ba Dinh"
        initialWard="Phuc Xa"
      />,
    );

    expect(await screen.findByText('Không thể tải danh sách phường/xã.')).toBeInTheDocument();
    expect(document.querySelector<HTMLInputElement>('input[name="ward"]')).toHaveValue('Phuc Xa');
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Phường/Xã' })).toBeEnabled());
    expect(loadLegacyWards).toHaveBeenCalledTimes(2);
    expect(document.querySelector<HTMLInputElement>('input[name="ward"]')).toHaveValue('Phuc Xa');
  });

  it('preserves wards for the same parent and resets descendants when parents change', async () => {
    const user = userEvent.setup();
    render(
      <LegacyAdministrativeDivisionFields
        initialProvince="Ha Noi"
        initialDistrict="Ba Dinh"
        initialWard="Ward cũ ngoài snapshot"
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Phường/Xã' })).toBeEnabled());

    await chooseDivision(user, 'Quận/Huyện', 'Tìm kiếm quận/huyện', 'ba dinh', 'Quận Ba Đình');
    expect(document.querySelector<HTMLInputElement>('input[name="ward"]')).toHaveValue(
      'Ward cũ ngoài snapshot',
    );

    await chooseDivision(user, 'Quận/Huyện', 'Tìm kiếm quận/huyện', 'hoan kiem', 'Quận Hoàn Kiếm');
    expect(document.querySelector<HTMLInputElement>('input[name="ward"]')).toHaveValue('');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Phường/Xã' })).toBeEnabled());
    await chooseDivision(user, 'Phường/Xã', 'Tìm kiếm phường/xã', 'hang bac', 'Phường Hàng Bạc');

    await chooseDivision(
      user,
      'Tỉnh/Thành phố',
      'Tìm kiếm tỉnh/thành phố',
      'ho chi minh',
      'Thành phố Hồ Chí Minh',
    );
    expect(document.querySelector<HTMLInputElement>('input[name="district"]')).toHaveValue('');
    expect(document.querySelector<HTMLInputElement>('input[name="ward"]')).toHaveValue('');
  });

  it('uses the sentinel for a district that does not organize commune-level units', async () => {
    render(
      <LegacyAdministrativeDivisionFields
        initialProvince="Hai Phong"
        initialDistrict="Bach Long Vi"
        initialWard="Giá trị cũ"
      />,
    );

    await waitFor(() =>
      expect(document.querySelector<HTMLInputElement>('input[name="ward"]')).toHaveValue(
        LEGACY_NO_WARD_SENTINEL,
      ),
    );
    expect(screen.getByRole('button', { name: 'Phường/Xã' })).toBeDisabled();
    expect(
      screen.getByText('Quận/huyện này không tổ chức đơn vị hành chính cấp xã.'),
    ).toBeInTheDocument();
    expect(loadLegacyWards).not.toHaveBeenCalled();
  });
});
