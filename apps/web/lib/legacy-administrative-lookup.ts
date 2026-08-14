import {
  normalizeVietnameseAdministrativeName,
  resolveLegacyVietnamProvince,
} from '@shopee-clone/contracts';
import {
  LEGACY_VIETNAM_PROVINCES,
  type LegacyDistrict,
  type LegacyProvince,
  type LegacyWard,
} from './legacy-vietnam-administrative-divisions';

export function normalizeAdministrativeLookup(value: string): string {
  return normalizeVietnameseAdministrativeName(value).replace(
    /^(?:quan|huyen|thi xa|phuong|xa|thi tran)\s+/u,
    '',
  );
}

function resolveUnique<T extends { name: string }>(items: readonly T[], value: string): T | null {
  const target = normalizeAdministrativeLookup(value);
  if (!target) return null;
  const matches = items.filter((item) => normalizeAdministrativeLookup(item.name) === target);
  return matches.length === 1 ? matches[0]! : null;
}

export function resolveLegacyProvince(value: string): LegacyProvince | null {
  const identity = resolveLegacyVietnamProvince(value);
  return identity
    ? (LEGACY_VIETNAM_PROVINCES.find((province) => province.code === identity.code) ?? null)
    : null;
}

export function resolveLegacyDistrict(
  province: LegacyProvince | null,
  value: string,
): LegacyDistrict | null {
  return province ? resolveUnique(province.districts, value) : null;
}

export function resolveLegacyWard(wards: readonly LegacyWard[], value: string): LegacyWard | null {
  return resolveUnique(wards, value);
}

export function matchesAdministrativeSearch(name: string, query: string): boolean {
  return normalizeAdministrativeLookup(name).includes(normalizeAdministrativeLookup(query));
}
