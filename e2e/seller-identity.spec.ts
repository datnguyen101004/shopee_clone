import { expect, test, type Page, type Route } from '@playwright/test';

const shopId = '40000000-0000-4000-8000-000000000101';
const ownerId = '40000000-0000-4000-8000-000000000001';

const address = {
  recipientName: 'Seller Test',
  phoneNumber: '0912345678',
  province: 'Province',
  district: 'District',
  ward: 'Ward',
  addressLine: '1 Test Street',
};

const profile = {
  id: shopId,
  slug: 'seller-identity-test',
  name: 'Seller Identity Test Shop',
  description: 'Profile submitted during seller onboarding.',
  logoUrl: null,
  bannerUrl: null,
  location: 'Viet Nam',
  contactPhone: '0912345678',
  contactEmail: 'seller.identity@example.test',
  pickupAddress: address,
  returnAddress: address,
  status: 'inactive',
  onboardingStatus: 'pending_approval',
  onboardingReason: null,
  canSell: false,
  createdAt: '2026-08-26T00:00:00.000Z',
  updatedAt: '2026-08-26T00:00:00.000Z',
};

const adminShop = {
  id: shopId,
  ownerId,
  slug: profile.slug,
  name: profile.name,
  status: 'ACTIVE',
  onboardingStatus: 'PENDING_APPROVAL',
  onboardingReason: null,
  ownerEmail: 'seller.identity@example.test',
  ownerDisplayName: 'Seller Identity',
  updatedAt: profile.updatedAt,
};

const adminUser = {
  id: ownerId,
  email: 'seller.identity@example.test',
  displayName: 'Seller Identity',
  phoneNumber: profile.contactPhone,
  status: 'ACTIVE',
  roles: ['buyer', 'seller'],
  createdAt: profile.createdAt,
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installCommonApi(page: Page, user: unknown) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
      return json(route, {
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-26T00:00:00.000Z',
        user,
      });
    }
    if (request.method() === 'GET' && path === '/api/v1/cart') {
      return route.fulfill({ status: 404 });
    }
    return route.fulfill({ status: 404 });
  });
}

async function fillCompleteRequest(page: Page) {
  await page.locator('input[name="slug"]').fill(profile.slug);
  await page.locator('input[name="name"]').fill(profile.name);
  await page.locator('textarea[name="description"]').fill(profile.description);
  await page.locator('input[name="contactPhone"]').fill(profile.contactPhone);
  await page.locator('input[name="contactEmail"]').fill(profile.contactEmail);
  await page.locator('input[name="location"]').fill(profile.location);
}

test('seller request accepts a complete profile and reports incomplete submissions', async ({
  page,
}) => {
  let createCount = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
      return json(route, {
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-26T00:00:00.000Z',
        user: {
          id: ownerId,
          email: 'buyer@example.test',
          displayName: 'Buyer Test',
          status: 'active',
          roles: ['buyer'],
        },
      });
    }
    if (request.method() === 'GET' && path === '/api/v1/cart')
      return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/seller/shop/workspace') {
      return json(route, { shop: null, defaultAddress: address });
    }
    if (request.method() === 'POST' && path === '/api/v1/seller/shop') {
      createCount += 1;
      return json(route, profile, 201);
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto('/seller/shop');
  await expect(page.locator('form.seller-shop-form')).toBeVisible();
  await page
    .locator('form.seller-shop-form')
    .evaluate((form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
  await expect(page.locator('[role="status"]')).toBeVisible();

  await fillCompleteRequest(page);
  await page.locator('.seller-shop-submit').click();
  await expect(page.locator('[data-testid="seller-shop-profile-view"]')).toBeVisible();
  expect(createCount).toBe(1);
});

test('duplicate seller request keeps the completed form available for correction', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
      return json(route, {
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-26T00:00:00.000Z',
        user: {
          id: ownerId,
          email: 'buyer@example.test',
          displayName: 'Buyer Test',
          status: 'active',
          roles: ['buyer'],
        },
      });
    }
    if (request.method() === 'GET' && path === '/api/v1/cart')
      return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/seller/shop/workspace') {
      return json(route, { shop: null, defaultAddress: address });
    }
    if (request.method() === 'POST' && path === '/api/v1/seller/shop') {
      return json(
        route,
        {
          type: 'https://shopee-clone.local/problems/seller-shop-conflict',
          title: 'Seller shop conflict',
          status: 409,
          detail: 'A shop already exists for this account.',
          code: 'SELLER_SHOP_CONFLICT',
        },
        409,
      );
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto('/seller/shop');
  await fillCompleteRequest(page);
  await page.locator('.seller-shop-submit').click();
  await expect(page.locator('form.seller-shop-form')).toBeVisible();
  await expect(page.locator('[role="status"]')).toBeVisible();
});

test('approval activates the submitted profile and direct shop navigation has no second creation step', async ({
  page,
}) => {
  let approved = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
      return json(route, {
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-26T00:00:00.000Z',
        user: {
          id: ownerId,
          email: 'admin@example.test',
          displayName: 'Admin Test',
          status: 'active',
          roles: ['buyer', 'admin'],
        },
      });
    }
    if (request.method() === 'GET' && path === '/api/v1/cart')
      return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/admin/shops') {
      return json(route, {
        items: [
          {
            ...adminShop,
            onboardingStatus: approved ? 'APPROVED' : 'PENDING_APPROVAL',
            status: approved ? 'ACTIVE' : 'INACTIVE',
          },
        ],
        nextCursor: null,
      });
    }
    if (request.method() === 'POST' && path === `/api/v1/admin/shops/${shopId}/approval`) {
      approved = true;
      return json(route, {
        ...profile,
        onboardingStatus: 'approved',
        status: 'active',
        canSell: true,
      });
    }
    if (request.method() === 'GET' && path === '/api/v1/seller/shop/workspace') {
      return json(route, {
        shop: approved
          ? { ...profile, onboardingStatus: 'approved', status: 'active', canSell: true }
          : null,
        defaultAddress: null,
      });
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto('/admin/shops');
  await expect(page.locator('table tbody tr')).toHaveCount(1);
  await page.locator('button.admin-btn-success-outline').click();
  await page.locator('textarea').fill('Approve complete seller profile');
  await page.locator('form').last().locator('button[type="submit"]').click();
  await expect(page.locator('button.admin-btn-danger-outline')).toBeVisible();

  await page.goto('/seller/shop');
  await expect(page.locator('[data-testid="seller-shop-profile-view"]')).toBeVisible();
  await expect(
    page
      .locator('[data-testid="seller-shop-profile-view"]')
      .getByText(profile.name, { exact: true }),
  ).toBeVisible();
  await expect(page.locator('form.seller-shop-form')).toHaveCount(0);
});

test('shop suspension, owner denial, and coordinated restore require a fresh session', async ({
  page,
}) => {
  let status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE';
  let session: 'admin' | 'owner' = 'admin';
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
      const owner = session === 'owner';
      return json(route, {
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-26T00:00:00.000Z',
        user: owner
          ? {
              id: ownerId,
              email: 'seller.identity@example.test',
              displayName: 'Seller Identity',
              status: status === 'SUSPENDED' ? 'suspended' : 'active',
              roles: ['buyer', 'seller'],
            }
          : {
              id: '40000000-0000-4000-0000-000000000999',
              email: 'admin@example.test',
              displayName: 'Admin Test',
              status: 'active',
              roles: ['buyer', 'admin'],
            },
      });
    }
    if (request.method() === 'GET' && path === '/api/v1/cart')
      return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/admin/shops') {
      return json(route, {
        items: [{ ...adminShop, onboardingStatus: 'APPROVED', status }],
        nextCursor: null,
      });
    }
    if (request.method() === 'POST' && path === `/api/v1/admin/shops/${shopId}/actions`) {
      const body = request.postDataJSON() as { action: 'SUSPEND' | 'RESTORE' };
      status = body.action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';
      return json(route, { ...adminShop, onboardingStatus: 'APPROVED', status });
    }
    if (request.method() === 'GET' && path === '/api/v1/seller/shop/workspace') {
      if (status === 'SUSPENDED') return route.fulfill({ status: 403 });
      return json(route, {
        shop: { ...profile, onboardingStatus: 'approved', status: 'active', canSell: true },
        defaultAddress: null,
      });
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto('/admin/shops');
  await page.locator('button.admin-btn-danger-outline').click();
  await page.locator('textarea').fill('Policy violation requires suspension');
  await page.locator('form').last().locator('button[type="submit"]').click();
  await expect(page.locator('button.admin-btn-success-outline')).toBeVisible();

  session = 'owner';
  await page.goto('/seller/shop');
  await expect(page.locator('.operational-panel[role="alert"]')).toBeVisible();

  session = 'admin';
  await page.goto('/admin/shops');
  await page.locator('button.admin-btn-success-outline').click();
  await page.locator('textarea').fill('Restore after review completed');
  await page.locator('form').last().locator('button[type="submit"]').click();
  await expect(page.locator('button.admin-btn-danger-outline')).toBeVisible();

  session = 'owner';
  await page.goto('/seller/shop');
  await expect(page.locator('[data-testid="seller-shop-profile-view"]')).toBeVisible();
});

test('direct seller-account suspension produces the same unavailable shop result', async ({
  page,
}) => {
  let suspended = false;
  let session: 'admin' | 'owner' = 'admin';
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
      return json(route, {
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-26T00:00:00.000Z',
        user:
          session === 'owner'
            ? {
                id: ownerId,
                email: 'seller.identity@example.test',
                displayName: 'Seller Identity',
                status: suspended ? 'suspended' : 'active',
                roles: ['buyer', 'seller'],
              }
            : {
                id: '40000000-0000-4000-0000-000000000999',
                email: 'admin@example.test',
                displayName: 'Admin Test',
                status: 'active',
                roles: ['buyer', 'admin'],
              },
      });
    }
    if (request.method() === 'GET' && path === '/api/v1/cart')
      return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/admin/users') {
      return json(route, {
        items: [{ ...adminUser, status: suspended ? 'SUSPENDED' : 'ACTIVE' }],
        nextCursor: null,
      });
    }
    if (request.method() === 'POST' && path === `/api/v1/admin/users/${ownerId}/actions`) {
      suspended =
        (request.postDataJSON() as { action: 'SUSPEND' | 'RESTORE' }).action === 'SUSPEND';
      return json(route, { ...adminUser, status: suspended ? 'SUSPENDED' : 'ACTIVE' });
    }
    if (request.method() === 'GET' && path === '/api/v1/seller/shop/workspace') {
      if (suspended) return route.fulfill({ status: 403 });
      return json(route, {
        shop: { ...profile, onboardingStatus: 'approved', status: 'active', canSell: true },
        defaultAddress: null,
      });
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto('/admin/users');
  await page.locator('button.admin-btn-danger-outline').click();
  await page.locator('textarea').fill('Account policy suspension');
  await page.locator('form').last().locator('button[type="submit"]').click();
  await expect(page.locator('button.admin-btn-success-outline')).toBeVisible();

  session = 'owner';
  await page.goto('/seller/shop');
  await expect(page.locator('.operational-panel[role="alert"]')).toBeVisible();
});
