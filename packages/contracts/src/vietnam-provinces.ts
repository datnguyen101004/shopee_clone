export type VietnamMacroRegion = 'NORTH' | 'CENTRAL' | 'SOUTH';

export interface LegacyVietnamProvinceIdentity {
  code: string;
  name: string;
  region: VietnamMacroRegion;
}

const north = [
  ['01', 'Thành phố Hà Nội'],
  ['02', 'Tỉnh Hà Giang'],
  ['04', 'Tỉnh Cao Bằng'],
  ['06', 'Tỉnh Bắc Kạn'],
  ['08', 'Tỉnh Tuyên Quang'],
  ['10', 'Tỉnh Lào Cai'],
  ['11', 'Tỉnh Điện Biên'],
  ['12', 'Tỉnh Lai Châu'],
  ['14', 'Tỉnh Sơn La'],
  ['15', 'Tỉnh Yên Bái'],
  ['17', 'Tỉnh Hoà Bình'],
  ['19', 'Tỉnh Thái Nguyên'],
  ['20', 'Tỉnh Lạng Sơn'],
  ['22', 'Tỉnh Quảng Ninh'],
  ['24', 'Tỉnh Bắc Giang'],
  ['25', 'Tỉnh Phú Thọ'],
  ['26', 'Tỉnh Vĩnh Phúc'],
  ['27', 'Tỉnh Bắc Ninh'],
  ['30', 'Tỉnh Hải Dương'],
  ['31', 'Thành phố Hải Phòng'],
  ['33', 'Tỉnh Hưng Yên'],
  ['34', 'Tỉnh Thái Bình'],
  ['35', 'Tỉnh Hà Nam'],
  ['36', 'Tỉnh Nam Định'],
  ['37', 'Tỉnh Ninh Bình'],
] as const;

const central = [
  ['38', 'Tỉnh Thanh Hóa'],
  ['40', 'Tỉnh Nghệ An'],
  ['42', 'Tỉnh Hà Tĩnh'],
  ['44', 'Tỉnh Quảng Bình'],
  ['45', 'Tỉnh Quảng Trị'],
  ['46', 'Thành phố Huế'],
  ['48', 'Thành phố Đà Nẵng'],
  ['49', 'Tỉnh Quảng Nam'],
  ['51', 'Tỉnh Quảng Ngãi'],
  ['52', 'Tỉnh Bình Định'],
  ['54', 'Tỉnh Phú Yên'],
  ['56', 'Tỉnh Khánh Hòa'],
  ['58', 'Tỉnh Ninh Thuận'],
  ['60', 'Tỉnh Bình Thuận'],
  ['62', 'Tỉnh Kon Tum'],
  ['64', 'Tỉnh Gia Lai'],
  ['66', 'Tỉnh Đắk Lắk'],
  ['67', 'Tỉnh Đắk Nông'],
  ['68', 'Tỉnh Lâm Đồng'],
] as const;

const south = [
  ['70', 'Tỉnh Bình Phước'],
  ['72', 'Tỉnh Tây Ninh'],
  ['74', 'Tỉnh Bình Dương'],
  ['75', 'Tỉnh Đồng Nai'],
  ['77', 'Tỉnh Bà Rịa - Vũng Tàu'],
  ['79', 'Thành phố Hồ Chí Minh'],
  ['80', 'Tỉnh Long An'],
  ['82', 'Tỉnh Tiền Giang'],
  ['83', 'Tỉnh Bến Tre'],
  ['84', 'Tỉnh Trà Vinh'],
  ['86', 'Tỉnh Vĩnh Long'],
  ['87', 'Tỉnh Đồng Tháp'],
  ['89', 'Tỉnh An Giang'],
  ['91', 'Tỉnh Kiên Giang'],
  ['92', 'Thành phố Cần Thơ'],
  ['93', 'Tỉnh Hậu Giang'],
  ['94', 'Tỉnh Sóc Trăng'],
  ['95', 'Tỉnh Bạc Liêu'],
  ['96', 'Tỉnh Cà Mau'],
] as const;

function withRegion(
  entries: ReadonlyArray<readonly [string, string]>,
  region: VietnamMacroRegion,
): LegacyVietnamProvinceIdentity[] {
  return entries.map(([code, name]) => ({ code, name, region }));
}

export const LEGACY_VIETNAM_PROVINCE_REGIONS: readonly LegacyVietnamProvinceIdentity[] = [
  ...withRegion(north, 'NORTH'),
  ...withRegion(central, 'CENTRAL'),
  ...withRegion(south, 'SOUTH'),
];

const ADMINISTRATIVE_PREFIX = /^(?:thanh pho trung uong|thanh pho|tp|tinh)\s+/u;

export function normalizeVietnameseAdministrativeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, (character) => (character === 'Đ' ? 'D' : 'd'))
    .toLocaleLowerCase('vi-VN')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(ADMINISTRATIVE_PREFIX, '');
}

export function resolveLegacyVietnamProvince(value: string): LegacyVietnamProvinceIdentity | null {
  const target = normalizeVietnameseAdministrativeName(value);
  if (!target) return null;
  const matches = LEGACY_VIETNAM_PROVINCE_REGIONS.filter(
    (province) => normalizeVietnameseAdministrativeName(province.name) === target,
  );
  return matches.length === 1 ? matches[0]! : null;
}
