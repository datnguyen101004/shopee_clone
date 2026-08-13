import {
  LEGACY_ADMINISTRATIVE_SNAPSHOT_DATE,
  LEGACY_VIETNAM_PROVINCES,
} from './legacy-vietnam-administrative-divisions';
import {
  matchesAdministrativeSearch,
  resolveLegacyDistrict,
  resolveLegacyProvince,
} from './legacy-administrative-lookup';

describe('legacy Vietnamese administrative snapshot', () => {
  it('pins the complete 63-province and 696-district snapshot before consolidation', () => {
    expect(LEGACY_ADMINISTRATIVE_SNAPSHOT_DATE).toBe('2025-06-30');
    expect(LEGACY_VIETNAM_PROVINCES).toHaveLength(63);
    expect(new Set(LEGACY_VIETNAM_PROVINCES.map((province) => province.code)).size).toBe(63);
    expect(
      LEGACY_VIETNAM_PROVINCES.reduce((total, province) => total + province.districts.length, 0),
    ).toBe(696);
    expect(LEGACY_VIETNAM_PROVINCES.every((province) => province.districts.length > 0)).toBe(true);
    const districts = LEGACY_VIETNAM_PROVINCES.flatMap((province) => province.districts);
    expect(new Set(districts.map((district) => district.code)).size).toBe(696);
    expect(
      LEGACY_VIETNAM_PROVINCES.every(
        (province) =>
          new Set(province.districts.map((district) => district.name)).size ===
          province.districts.length,
      ),
    ).toBe(true);
  });

  it('resolves abbreviated and unaccented existing address values without mutating them', () => {
    const haNoi = resolveLegacyProvince('Ha Noi');
    const hoChiMinhCity = resolveLegacyProvince('TP. Ho Chi Minh');
    expect(haNoi?.name).toBe('Thành phố Hà Nội');
    expect(resolveLegacyDistrict(haNoi, 'Ba Dinh')?.name).toBe('Quận Ba Đình');
    expect(hoChiMinhCity?.name).toBe('Thành phố Hồ Chí Minh');
    expect(resolveLegacyDistrict(hoChiMinhCity, 'Quan 1')?.name).toBe('Quận 1');
  });

  it('searches case-insensitively with or without Vietnamese accents', () => {
    expect(matchesAdministrativeSearch('Tỉnh Bà Rịa - Vũng Tàu', 'vung tau')).toBe(true);
    expect(matchesAdministrativeSearch('Quận Cầu Giấy', 'CẦU GIẤY')).toBe(true);
    expect(matchesAdministrativeSearch('Tỉnh Bắc Ninh', 'dong nai')).toBe(false);
  });
});
