import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthService } from '../src/auth/auth.service';
import { AuthTokenService } from '../src/auth/auth-token.service';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { configureApplication } from '../src/configure-application';
import {
  ProductStatus,
  ShopStatus,
  UserStatus,
  VariantStatus,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest = process.env.RUN_CART_DATABASE_TESTS === '1' ? describe : describe.skip;
const userId = '00000000-0000-4000-8000-000000009970';
const bearer = 'Bearer valid.cart.session';
const addressId = '00000000-0000-4000-8000-000000009972';
const foreignUserId = '00000000-0000-4000-8000-000000009973';
const foreignAddressId = '00000000-0000-4000-8000-000000009974';

interface CatalogFixtureSnapshot {
  variantId: string;
  priceMinor: bigint;
  compareAtPriceMinor: bigint | null;
  weightGrams: number;
  maxPurchaseQuantity: number | null;
  quantityOnHand: number;
  quantityReserved: number;
  shopId: string;
  shopLocation: string;
}

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('Authenticated cart HTTP and browser security with isolated PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let variantId: string;
  let secondVariantId: string;
  let firstShopId: string;
  let secondShopId: string;
  let catalogSnapshots: CatalogFixtureSnapshot[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthTokenService)
      .useValue({
        verifyAccess(token: string) {
          if (token !== 'valid.cart.session') throw new Error('invalid token');
          return { sub: userId, sid: '00000000-0000-4000-8000-000000009971' };
        },
      })
      .overrideProvider(AuthService)
      .useValue({
        authenticateAccess: jest.fn().mockResolvedValue({
          id: userId,
          email: 't16-http@example.test',
          displayName: 'T16 HTTP',
          status: 'active',
          roles: ['buyer'],
        }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test' }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.shippingAddress.deleteMany({
      where: { id: { in: [addressId, foreignAddressId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userId, foreignUserId] } } });
    await prisma.user.createMany({
      data: [
        {
          id: userId,
          email: 't16-http@example.test',
          displayName: 'T16 HTTP',
          status: UserStatus.ACTIVE,
        },
        {
          id: foreignUserId,
          email: 't17-foreign-address@example.test',
          displayName: 'T17 Foreign Address',
          status: UserStatus.ACTIVE,
        },
      ],
    });
    await prisma.shippingAddress.createMany({
      data: [
        {
          id: addressId,
          userId,
          recipientName: 'T17 Buyer',
          phoneNumber: '0900000000',
          province: 'Thành phố Hồ Chí Minh',
          district: 'Quận 1',
          ward: 'Phường Bến Nghé',
          addressLine: '1 Nguyễn Huệ',
          isDefault: true,
        },
        {
          id: foreignAddressId,
          userId: foreignUserId,
          recipientName: 'Foreign Buyer',
          phoneNumber: '0910000000',
          province: 'Hà Nội',
          district: 'Ba Đình',
          ward: 'Phúc Xá',
          addressLine: '1 Hồng Hà',
          isDefault: true,
        },
      ],
    });
    const candidates = await prisma.productVariant.findMany({
      take: 100,
      orderBy: { id: 'asc' },
      where: {
        status: VariantStatus.ACTIVE,
        deletedAt: null,
        inventory: { quantityOnHand: { gt: 0 } },
        product: {
          status: ProductStatus.ACTIVE,
          deletedAt: null,
          category: { isActive: true, deletedAt: null },
          shop: { status: ShopStatus.ACTIVE, deletedAt: null },
        },
      },
      select: {
        id: true,
        priceMinor: true,
        compareAtPriceMinor: true,
        weightGrams: true,
        maxPurchaseQuantity: true,
        inventory: { select: { quantityOnHand: true, quantityReserved: true } },
        product: { select: { shop: { select: { id: true, location: true } } } },
      },
    });
    const first = candidates[0];
    const second = candidates.find(
      (candidate) => candidate.product.shop.id !== first?.product.shop.id,
    );
    if (!first?.inventory || !second?.inventory) {
      throw new Error('T17 PostgreSQL fixtures require variants from two active shops.');
    }
    variantId = first.id;
    secondVariantId = second.id;
    firstShopId = first.product.shop.id;
    secondShopId = second.product.shop.id;
    catalogSnapshots = [first, second].map((candidate) => ({
      variantId: candidate.id,
      priceMinor: candidate.priceMinor,
      compareAtPriceMinor: candidate.compareAtPriceMinor,
      weightGrams: candidate.weightGrams,
      maxPurchaseQuantity: candidate.maxPurchaseQuantity,
      quantityOnHand: candidate.inventory!.quantityOnHand,
      quantityReserved: candidate.inventory!.quantityReserved,
      shopId: candidate.product.shop.id,
      shopLocation: candidate.product.shop.location,
    }));
  });

  async function restoreCatalogFixtures() {
    await prisma.$transaction(
      catalogSnapshots.flatMap((snapshot) => [
        prisma.productVariant.update({
          where: { id: snapshot.variantId },
          data: {
            priceMinor: snapshot.priceMinor,
            compareAtPriceMinor: snapshot.compareAtPriceMinor,
            weightGrams: snapshot.weightGrams,
            maxPurchaseQuantity: snapshot.maxPurchaseQuantity,
          },
        }),
        prisma.inventory.update({
          where: { variantId: snapshot.variantId },
          data: {
            quantityOnHand: snapshot.quantityOnHand,
            quantityReserved: snapshot.quantityReserved,
          },
        }),
        prisma.shop.update({
          where: { id: snapshot.shopId },
          data: { location: snapshot.shopLocation },
        }),
      ]),
    );
  }

  beforeEach(async () => {
    await prisma.cart.deleteMany({ where: { userId } });
    if (catalogSnapshots.length > 0) await restoreCatalogFixtures();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cart.deleteMany({ where: { userId } });
      if (catalogSnapshots.length > 0) await restoreCatalogFixtures();
      await prisma.shippingAddress.deleteMany({
        where: { id: { in: [addressId, foreignAddressId] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [userId, foreignUserId] } } });
    }
    await app?.close();
  });

  it('requires a valid bearer session for reads and mutations', async () => {
    const read = await request(app.getHttpServer()).get('/api/v1/cart').expect(401);
    expect(read.headers['cache-control']).toBe('private, no-store');
    expect(read.body).toMatchObject({
      type: 'https://shopee-clone.local/problems/authentication-failed',
      status: 401,
    });
    await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ variantId, quantity: 1 })
      .expect(401);
    expect(await prisma.cart.count({ where: { userId } })).toBe(0);
  });

  it('returns a private authenticated empty read without creating a cookie', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', bearer)
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.etag).toBe('"cart-0"');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).toMatchObject({ owner: 'authenticated', version: 0, groups: [] });
  });

  it('denies missing/untrusted Origin and form-compatible payloads before mutation', async () => {
    const body = { variantId, quantity: 1 };
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('If-Match', '"cart-0"')
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'https://attacker.test')
      .set('If-Match', '"cart-0"')
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .type('form')
      .send(body)
      .expect(415);
  });

  it('persists only the account cart and validates ETag versions', async () => {
    const added = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ variantId, quantity: 1 })
      .expect(200);
    expect(added.headers['set-cookie']).toBeUndefined();
    expect(added.body.cart).toMatchObject({ owner: 'authenticated', version: 1 });
    expect(added.headers.etag).toBe('"cart-1"');
    expect(await prisma.cart.count({ where: { userId } })).toBe(1);

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ variantId, quantity: 1 })
      .expect(409);
    const restored = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', bearer)
      .expect(200);
    expect(restored.body.summary.distinctLineCount).toBe(1);
    expect(restored.body.groups[0].lines[0].quantity).toBe(1);
  });

  it('rejects unknown JSON fields through the global strict DTO boundary', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ variantId, quantity: 1, userId })
      .expect(400);
  });

  it('quotes current database money and rejects stale ETags or browser money fields', async () => {
    const added = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ variantId, quantity: 2 })
      .expect(200);
    const before = await prisma.cart.findUniqueOrThrow({
      where: { userId },
      select: { updatedAt: true, lines: { select: { id: true, updatedAt: true } } },
    });
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      select: { priceMinor: true, compareAtPriceMinor: true, weightGrams: true },
    });
    const quoted = await request(app.getHttpServer())
      .post('/api/v1/cart/quote')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', added.headers.etag as string)
      .send({ shippingAddressId: addressId })
      .expect(200);
    expect(quoted.headers['cache-control']).toBe('private, no-store');
    expect(quoted.headers.etag).toBe(added.headers.etag);
    expect(quoted.body).toMatchObject({
      pricingVersion: 'pricing-v1',
      shippingVersion: 'mock-v1',
      currency: 'VND',
      cartVersion: added.body.cart.version,
    });
    expect(quoted.body.shops[0].lines[0]).toMatchObject({
      sellingUnitPriceMinor: Number(variant.priceMinor),
      shipmentWeightGrams: variant.weightGrams * 2,
    });
    const expectedList = Number(
      variant.compareAtPriceMinor && variant.compareAtPriceMinor > variant.priceMinor
        ? variant.compareAtPriceMinor
        : variant.priceMinor,
    );
    expect(quoted.body.shops[0].lines[0].listUnitPriceMinor).toBe(expectedList);
    expect(
      await prisma.cart.findUniqueOrThrow({
        where: { userId },
        select: { updatedAt: true, lines: { select: { id: true, updatedAt: true } } },
      }),
    ).toEqual(before);

    await request(app.getHttpServer())
      .post('/api/v1/cart/quote')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ shippingAddressId: addressId })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/cart/quote')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', added.headers.etag as string)
      .send({ shippingAddressId: addressId, totalMinor: 1 })
      .expect(400);
  });

  it('reconciles deterministic multi-shop rates and excludes a line after stock changes', async () => {
    await prisma.$transaction([
      prisma.productVariant.update({
        where: { id: variantId },
        data: {
          priceMinor: 90_000n,
          compareAtPriceMinor: 100_000n,
          weightGrams: 300,
          maxPurchaseQuantity: 10,
        },
      }),
      prisma.inventory.update({
        where: { variantId },
        data: { quantityOnHand: 10, quantityReserved: 0 },
      }),
      prisma.shop.update({
        where: { id: firstShopId },
        data: { location: 'Thành phố Hồ Chí Minh' },
      }),
      prisma.productVariant.update({
        where: { id: secondVariantId },
        data: {
          priceMinor: 50_000n,
          compareAtPriceMinor: 40_000n,
          weightGrams: 1_200,
          maxPurchaseQuantity: 10,
        },
      }),
      prisma.inventory.update({
        where: { variantId: secondVariantId },
        data: { quantityOnHand: 10, quantityReserved: 0 },
      }),
      prisma.shop.update({ where: { id: secondShopId }, data: { location: 'Hà Nội' } }),
    ]);

    const firstAdded = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ variantId, quantity: 2 })
      .expect(200);
    const secondAdded = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', firstAdded.headers.etag as string)
      .send({ variantId: secondVariantId, quantity: 1 })
      .expect(200);
    const before = await prisma.cart.findUniqueOrThrow({
      where: { userId },
      select: {
        updatedAt: true,
        lines: { orderBy: { id: 'asc' }, select: { id: true, updatedAt: true } },
      },
    });
    const quoteBody = {
      shippingAddressId: addressId,
      services: [
        { shopId: secondShopId, service: 'ECONOMY' },
        { shopId: firstShopId, service: 'STANDARD' },
      ],
    };
    const quoted = await request(app.getHttpServer())
      .post('/api/v1/cart/quote')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', secondAdded.headers.etag as string)
      .send(quoteBody)
      .expect(200);
    expect(quoted.body.summary).toEqual({
      selectedLineCount: 2,
      selectedQuantity: 3,
      listSubtotalMinor: 250_000,
      productDiscountMinor: 20_000,
      merchandiseSubtotalMinor: 230_000,
      shippingTotalMinor: 59_000,
      payableTotalMinor: 289_000,
    });
    expect(
      quoted.body.shops.find(({ shop }: { shop: { id: string } }) => shop.id === firstShopId),
    ).toMatchObject({
      shipping: {
        service: 'STANDARD',
        zone: 'SAME_PROVINCE',
        shipmentWeightGrams: 600,
        baseFeeMinor: 22_000,
        zoneSurchargeMinor: 0,
        weightSurchargeMinor: 4_000,
        shippingFeeMinor: 26_000,
      },
      listSubtotalMinor: 200_000,
      productDiscountMinor: 20_000,
      merchandiseSubtotalMinor: 180_000,
      payableTotalMinor: 206_000,
    });
    expect(
      quoted.body.shops.find(({ shop }: { shop: { id: string } }) => shop.id === secondShopId),
    ).toMatchObject({
      shipping: {
        service: 'ECONOMY',
        zone: 'CROSS_REGION',
        shipmentWeightGrams: 1_200,
        baseFeeMinor: 15_000,
        zoneSurchargeMinor: 12_000,
        weightSurchargeMinor: 6_000,
        shippingFeeMinor: 33_000,
      },
      listSubtotalMinor: 50_000,
      productDiscountMinor: 0,
      merchandiseSubtotalMinor: 50_000,
      payableTotalMinor: 83_000,
    });

    const reordered = await request(app.getHttpServer())
      .post('/api/v1/cart/quote')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', secondAdded.headers.etag as string)
      .send({ ...quoteBody, services: [...quoteBody.services].reverse() })
      .expect(200);
    expect(reordered.body).toEqual(quoted.body);
    expect(
      await prisma.cart.findUniqueOrThrow({
        where: { userId },
        select: {
          updatedAt: true,
          lines: { orderBy: { id: 'asc' }, select: { id: true, updatedAt: true } },
        },
      }),
    ).toEqual(before);

    await request(app.getHttpServer())
      .post('/api/v1/cart/quote')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', secondAdded.headers.etag as string)
      .send({ shippingAddressId: foreignAddressId })
      .expect(404);

    await prisma.inventory.update({
      where: { variantId: secondVariantId },
      data: { quantityOnHand: 0, quantityReserved: 0 },
    });
    const stockChanged = await request(app.getHttpServer())
      .post('/api/v1/cart/quote')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', secondAdded.headers.etag as string)
      .send({
        shippingAddressId: addressId,
        services: [{ shopId: firstShopId, service: 'STANDARD' }],
      })
      .expect(200);
    expect(stockChanged.body.shops).toHaveLength(1);
    expect(stockChanged.body.exclusions).toEqual([
      expect.objectContaining({ code: 'unavailable' }),
    ]);
    expect(stockChanged.body.summary).toMatchObject({
      selectedLineCount: 1,
      selectedQuantity: 2,
      payableTotalMinor: 206_000,
    });
  });

  it('preserves origin and authentication precedence and hides address ownership', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/quote')
      .set('If-Match', '"cart-0"')
      .send({ shippingAddressId: addressId })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/cart/quote')
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ shippingAddressId: addressId })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/cart/quote')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ shippingAddressId: '00000000-0000-4000-8000-000000009999' })
      .expect(404);
  });
});
