import { describe, expect, it } from 'vitest';

import {
  isCreateSellerShopRequest,
  isSellerShop,
  isSellerShopProfile,
  isSellerShopWorkspace,
  isShopApprovalRequest,
  isUpdateSellerShopRequest,
  normalizeShopMediaUrl,
  normalizeShopSlug,
  shopCanSell,
} from '../src';

const address = {
  recipientName: 'An Nguyen',
  phoneNumber: '0912345678',
  province: 'TP. Hồ Chí Minh',
  district: 'Quận 1',
  ward: 'Phường Bến Nghé',
  addressLine: '12 Nguyễn Huệ',
};

const createBody = {
  slug: 'an-tech-shop',
  name: 'An Tech Shop',
  description: 'Linh kiện chính hãng',
  logoUrl: 'https://cdn.example.test/logo.png',
  bannerUrl: null,
  location: 'TP. Hồ Chí Minh',
  contactPhone: '0912345678',
  contactEmail: 'shop@example.test',
  pickupAddress: address,
  returnAddress: address,
};

const profile = {
  id: '00000000-0000-4000-8000-000000000101',
  slug: 'an-tech-shop',
  name: 'An Tech Shop',
  description: 'Linh kiện chính hãng',
  logoUrl: 'https://cdn.example.test/logo.png',
  bannerUrl: null,
  location: 'TP. Hồ Chí Minh',
  contactPhone: '0912345678',
  contactEmail: 'shop@example.test',
  pickupAddress: address,
  returnAddress: address,
  status: 'inactive',
  onboardingStatus: 'pending_approval',
  onboardingReason: null,
  canSell: false,
  createdAt: '2026-08-15T01:00:00.000Z',
  updatedAt: '2026-08-15T01:00:00.000Z',
};

describe('seller onboarding contracts', () => {
  it('normalizes kebab slugs and HTTPS media URLs', () => {
    expect(normalizeShopSlug(' An-Tech-Shop ')).toBe('an-tech-shop');
    expect(normalizeShopSlug('An Tech')).toBeNull();
    expect(normalizeShopMediaUrl('https://cdn.example.test/banner.jpg')).toBe(
      'https://cdn.example.test/banner.jpg',
    );
    expect(normalizeShopMediaUrl('http://cdn.example.test/banner.jpg')).toBeNull();
    expect(normalizeShopMediaUrl('https://user:pass@cdn.example.test/banner.jpg')).toBeNull();
  });

  it('accepts only documented create and update bodies', () => {
    expect(isCreateSellerShopRequest(createBody)).toBe(true);
    expect(isCreateSellerShopRequest({ ...createBody, ownerId: profile.id })).toBe(false);
    expect(isCreateSellerShopRequest({ ...createBody, slug: 'Bad Slug' })).toBe(false);
    expect(isUpdateSellerShopRequest({ name: 'An Tech Store', status: 'active' })).toBe(true);
    expect(isUpdateSellerShopRequest({ status: 'suspended' })).toBe(false);
    expect(isUpdateSellerShopRequest({})).toBe(false);
  });

  it('accepts workspace, profile, and approval shapes', () => {
    expect(isSellerShopProfile(profile)).toBe(true);
    expect(isSellerShopWorkspace({ shop: null, defaultAddress: null })).toBe(true);
    expect(isSellerShopWorkspace({ shop: profile, defaultAddress: address })).toBe(true);
    expect(
      isSellerShopWorkspace({ shop: { ...profile, ownerId: profile.id }, defaultAddress: address }),
    ).toBe(false);
    expect(isSellerShopWorkspace({ shop: null })).toBe(false);
    expect(
      isShopApprovalRequest({ decision: 'approve', reason: 'Shop identity looks complete' }),
    ).toBe(true);
    expect(isShopApprovalRequest({ decision: 'approve', reason: 'short' })).toBe(false);
    expect(
      isSellerShop({ id: profile.id, slug: profile.slug, name: profile.name, status: 'suspended' }),
    ).toBe(true);
    expect(
      isSellerShop({
        id: profile.id,
        slug: profile.slug,
        name: profile.name,
        status: 'active',
        ownerId: profile.id,
      }),
    ).toBe(false);
  });

  it('derives sellability from approved plus active only', () => {
    expect(shopCanSell({ status: 'active', onboardingStatus: 'approved' })).toBe(true);
    expect(shopCanSell({ status: 'inactive', onboardingStatus: 'approved' })).toBe(false);
    expect(shopCanSell({ status: 'suspended', onboardingStatus: 'approved' })).toBe(false);
    expect(shopCanSell({ status: 'active', onboardingStatus: 'pending_approval' })).toBe(false);
  });
});
