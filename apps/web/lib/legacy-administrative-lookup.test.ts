import {
  LEGACY_VIETNAM_PROVINCE_REGIONS,
  resolveLegacyVietnamProvince,
} from '@shopee-clone/contracts';
import {
  LEGACY_ADMINISTRATIVE_SNAPSHOT_DATE,
  LEGACY_ADMINISTRATIVE_SOURCE,
  LEGACY_NO_WARD_DISTRICT_CODES,
  LEGACY_NO_WARD_SENTINEL,
  LEGACY_VIETNAM_PROVINCES,
} from './legacy-vietnam-administrative-divisions';
import {
  LEGACY_WARDS_BY_DISTRICT,
  LEGACY_WARD_DISTRICT_COUNT,
  LEGACY_WARD_SNAPSHOT_COUNT,
} from './legacy-vietnam-wards.generated';
import {
  matchesAdministrativeSearch,
  resolveLegacyDistrict,
  resolveLegacyProvince,
  resolveLegacyWard,
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
    expect(LEGACY_VIETNAM_PROVINCE_REGIONS).toHaveLength(63);
    expect(
      LEGACY_VIETNAM_PROVINCES.every((province) => {
        const shared = resolveLegacyVietnamProvince(province.name);
        return shared?.code === province.code;
      }),
    ).toBe(true);
    const districts = LEGACY_VIETNAM_PROVINCES.reduce<Array<{ code: string; name: string }>>(
      (items, province) => [...items, ...province.districts],
      [],
    );
    expect(new Set(districts.map((district) => district.code)).size).toBe(696);
    expect(
      LEGACY_VIETNAM_PROVINCES.every(
        (province) =>
          new Set(province.districts.map((district) => district.name)).size ===
          province.districts.length,
      ),
    ).toBe(true);
  });

  it('pins 10,035 wards under 691 districts and the five districts without ward level', () => {
    expect(LEGACY_ADMINISTRATIVE_SOURCE).toBe('https://danhmuchanhchinh.nso.gov.vn/DMDVHC.asmx');
    expect(LEGACY_WARD_SNAPSHOT_COUNT).toBe(10_035);
    expect(LEGACY_WARD_DISTRICT_COUNT).toBe(691);
    expect(Object.keys(LEGACY_WARDS_BY_DISTRICT)).toHaveLength(691);
    expect(LEGACY_NO_WARD_DISTRICT_CODES).toEqual(['318', '471', '498', '536', '755']);
    expect(LEGACY_NO_WARD_SENTINEL).toBe('Không có đơn vị hành chính cấp xã');

    const districtCodes = new Set<string>(
      LEGACY_VIETNAM_PROVINCES.flatMap((province) =>
        province.districts.map((district) => district.code),
      ),
    );
    const wardDistrictCodes = Object.keys(LEGACY_WARDS_BY_DISTRICT);
    expect(wardDistrictCodes.every((code) => districtCodes.has(code))).toBe(true);
    expect(
      [...districtCodes].filter((code) => !Object.hasOwn(LEGACY_WARDS_BY_DISTRICT, code)).sort(),
    ).toEqual([...LEGACY_NO_WARD_DISTRICT_CODES]);
    expect(
      wardDistrictCodes.every((code) => (LEGACY_WARDS_BY_DISTRICT[code]?.length ?? 0) > 0),
    ).toBe(true);

    const wards = Object.values(LEGACY_WARDS_BY_DISTRICT).flat();
    expect(wards).toHaveLength(10_035);
    expect(new Set(wards.map((ward) => ward.code)).size).toBe(10_035);
    expect(wards.every((ward) => ward.code.length === 5 && ward.name.trim().length > 0)).toBe(true);
    expect(wards.some((ward) => ward.name === LEGACY_NO_WARD_SENTINEL)).toBe(false);
  });

  it('resolves abbreviated and unaccented existing address values without mutating them', () => {
    const haNoi = resolveLegacyProvince('Ha Noi');
    const hoChiMinhCity = resolveLegacyProvince('TP. Ho Chi Minh');
    expect(haNoi?.name).toBe('Thành phố Hà Nội');
    expect(resolveLegacyDistrict(haNoi, 'Ba Dinh')?.name).toBe('Quận Ba Đình');
    expect(hoChiMinhCity?.name).toBe('Thành phố Hồ Chí Minh');
    expect(resolveLegacyDistrict(hoChiMinhCity, 'Quan 1')?.name).toBe('Quận 1');
    expect(resolveLegacyWard(LEGACY_WARDS_BY_DISTRICT['001'] ?? [], 'Phuc Xa')?.name).toBe(
      'Phường Phúc Xá',
    );
    expect(resolveLegacyWard(LEGACY_WARDS_BY_DISTRICT['760'] ?? [], 'Ben Nghe')?.name).toBe(
      'Phường Bến Nghé',
    );
  });

  it('resolves wards only inside the selected district', () => {
    expect(resolveLegacyWard(LEGACY_WARDS_BY_DISTRICT['461'] ?? [], 'Phường 1')?.code).toBe(
      '19333',
    );
    expect(resolveLegacyWard(LEGACY_WARDS_BY_DISTRICT['760'] ?? [], 'Phường 1')).toBeNull();
    expect(resolveLegacyWard(LEGACY_WARDS_BY_DISTRICT['001'] ?? [], 'Không tồn tại')).toBeNull();
  });

  it('searches case-insensitively with or without Vietnamese accents', () => {
    expect(matchesAdministrativeSearch('Tỉnh Bà Rịa - Vũng Tàu', 'vung tau')).toBe(true);
    expect(matchesAdministrativeSearch('Quận Cầu Giấy', 'CẦU GIẤY')).toBe(true);
    expect(matchesAdministrativeSearch('Tỉnh Bắc Ninh', 'dong nai')).toBe(false);
  });
});
