import {
  LEGACY_VIETNAM_PROVINCES,
  type LegacyDistrict,
  type LegacyProvince,
} from './legacy-vietnam-administrative-divisions';

const ADMINISTRATIVE_PREFIX = /^(?:thanh pho trung uong|thanh pho|tp|tinh|quan|huyen|thi xa)\s+/u;

export function normalizeAdministrativeLookup(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, (character) => (character === 'Đ' ? 'D' : 'd'))
    .toLocaleLowerCase('vi-VN')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(ADMINISTRATIVE_PREFIX, '');
}

function resolveUnique<T extends { name: string }>(items: readonly T[], value: string): T | null {
  const target = normalizeAdministrativeLookup(value);
  if (!target) return null;
  const matches = items.filter((item) => normalizeAdministrativeLookup(item.name) === target);
  return matches.length === 1 ? matches[0]! : null;
}

export function resolveLegacyProvince(value: string): LegacyProvince | null {
  return resolveUnique(LEGACY_VIETNAM_PROVINCES, value);
}

export function resolveLegacyDistrict(
  province: LegacyProvince | null,
  value: string,
): LegacyDistrict | null {
  return province ? resolveUnique(province.districts, value) : null;
}

export function matchesAdministrativeSearch(name: string, query: string): boolean {
  return normalizeAdministrativeLookup(name).includes(normalizeAdministrativeLookup(query));
}
