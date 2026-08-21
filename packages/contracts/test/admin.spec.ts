import { describe, expect, it } from 'vitest';
import {
  ADMIN_DEFAULT_LIMIT,
  ADMIN_MAX_LIMIT,
  ADMIN_PRIVILEGED_ACTIONS,
  ADMIN_PRIVILEGED_TARGET_TYPES,
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  ADMIN_SHOP_ONBOARDING_STATUSES,
  ADMIN_SHOP_STATUSES,
  ADMIN_USER_STATUSES,
  ADMIN_VERSION,
  isAllowedMediaUrl,
  isCategorySlug,
  isValidAdminReason,
  isValidBannerDestination,
  parseAdminDashboardResponse,
} from '../src/admin';

describe('Admin Contracts', () => {
  it('defines valid enums and bounds', () => {
    expect(ADMIN_VERSION).toBe('admin-v1');
    expect(ADMIN_DEFAULT_LIMIT).toBe(20);
    expect(ADMIN_MAX_LIMIT).toBe(50);
    expect(ADMIN_REASON_MIN_LENGTH).toBe(8);
    expect(ADMIN_REASON_MAX_LENGTH).toBe(240);
    expect(ADMIN_USER_STATUSES).toEqual(['ACTIVE', 'SUSPENDED']);
    expect(ADMIN_SHOP_STATUSES).toEqual(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
    expect(ADMIN_SHOP_ONBOARDING_STATUSES).toEqual(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']);
    expect(ADMIN_PRIVILEGED_TARGET_TYPES).toEqual([
      'USER',
      'SHOP',
      'CATEGORY',
      'BANNER',
      'HOMEPAGE_MODULE',
      'PRODUCT',
      'REVIEW',
      'MODERATION_CASE',
    ]);

    expect(ADMIN_PRIVILEGED_ACTIONS).toEqual([
      'SUSPEND',
      'RESTORE',
      'CREATE',
      'UPDATE',
      'DELETE',
      'REORDER',
      'APPROVE',
      'REJECT',
      'HIDE',
      'NO_ACTION',
    ]);
  });

  it('validates admin reason length and trimming', () => {
    expect(isValidAdminReason('1234567')).toBe(false);
    expect(isValidAdminReason('  1234567  ')).toBe(false);
    expect(isValidAdminReason('12345678')).toBe(true);
    expect(isValidAdminReason('Valid suspension reason for violation')).toBe(true);
    expect(isValidAdminReason('a'.repeat(240))).toBe(true);
    expect(isValidAdminReason('a'.repeat(241))).toBe(false);
    expect(isValidAdminReason(null)).toBe(false);
    expect(isValidAdminReason(123)).toBe(false);
  });

  it('validates banner destination paths (same-origin only)', () => {
    expect(isValidBannerDestination('/promotions/summer-sale')).toBe(true);
    expect(isValidBannerDestination('/categories/electronics')).toBe(true);
    expect(isValidBannerDestination('https://evil.com/phishing')).toBe(false);
    expect(isValidBannerDestination('//evil.com')).toBe(false);
    expect(isValidBannerDestination('javascript:alert(1)')).toBe(false);
    expect(isValidBannerDestination('')).toBe(false);
    expect(isValidBannerDestination(null)).toBe(false);
  });

  it('validates allowed media URLs', () => {
    expect(isAllowedMediaUrl('/media/banners/banner1.jpg')).toBe(true);
    expect(isAllowedMediaUrl('https://my-bucket.s3.amazonaws.com/image.png')).toBe(true);
    expect(isAllowedMediaUrl('http://localhost:3000/test.png')).toBe(true);
    expect(isAllowedMediaUrl(null)).toBe(true);
    expect(isAllowedMediaUrl('ftp://invalidscheme.com')).toBe(false);
  });

  it('validates category slugs', () => {
    expect(isCategorySlug('dien-thoai-phu-kien')).toBe(true);
    expect(isCategorySlug('thoi-trang-nam')).toBe(true);
    expect(isCategorySlug('A')).toBe(false);
    expect(isCategorySlug('invalid slug with spaces')).toBe(false);
    expect(isCategorySlug('-invalid-start')).toBe(false);
  });

  it('parses valid admin dashboard response and rejects invalid payloads', () => {
    const valid = {
      adminVersion: 'admin-v1',
      generatedAt: '2026-08-20T12:00:00.000Z',
      counts: {
        usersCount: 100,
        activeUsersCount: 95,
        suspendedUsersCount: 5,
        shopsCount: 20,
        pendingShopApprovalsCount: 2,
        categoriesCount: 15,
        activeCategoriesCount: 14,
        homepageBannersCount: 5,
        enabledHomepageModulesCount: 4,
        recentAuditEventsCount: 12,
      },
    };
    expect(parseAdminDashboardResponse(valid)).toEqual(valid);

    // Invalid version
    expect(parseAdminDashboardResponse({ ...valid, adminVersion: 'admin-v2' })).toBeNull();
    // Missing counts field
    expect(
      parseAdminDashboardResponse({
        ...valid,
        counts: { ...valid.counts, usersCount: undefined },
      }),
    ).toBeNull();
    // Floating point count
    expect(
      parseAdminDashboardResponse({
        ...valid,
        counts: { ...valid.counts, usersCount: 12.5 },
      }),
    ).toBeNull();
  });
});
