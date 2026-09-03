import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { CartConflictError, CartLineNotFoundError } from '../src/cart/cart.errors';
import { CartService } from '../src/cart/cart.service';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import {
  ProductStatus,
  ShopStatus,
  UserStatus,
  VariantStatus,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest = process.env.RUN_CART_DATABASE_TESTS === '1' ? describe : describe.skip;
const firstUserId = '00000000-0000-4000-8000-000000009961';
const secondUserId = '00000000-0000-4000-8000-000000009962';

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('Persistent authenticated multi-shop cart with isolated PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cart: CartService;
  let variantIds: string[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    cart = app.get(CartService);
    await prisma.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId] } } });
    await prisma.user.createMany({
      data: [
        {
          id: firstUserId,
          email: 't16-first@example.test',
          displayName: 'T16 First',
          status: UserStatus.ACTIVE,
        },
        {
          id: secondUserId,
          email: 't16-second@example.test',
          displayName: 'T16 Second',
          status: UserStatus.ACTIVE,
        },
      ],
    });
    variantIds = (
      await prisma.productVariant.findMany({
        where: {
          status: VariantStatus.ACTIVE,
          deletedAt: null,
          inventory: { quantityOnHand: { gt: 10 } },
          product: {
            status: ProductStatus.ACTIVE,
            deletedAt: null,
            category: { isActive: true, deletedAt: null },
            shop: { status: ShopStatus.ACTIVE, deletedAt: null },
          },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 2,
      })
    ).map(({ id }) => id);
    expect(variantIds).toHaveLength(2);
  });

  beforeEach(async () => {
    await prisma.cart.deleteMany({ where: { userId: { in: [firstUserId, secondUserId] } } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cart.deleteMany({ where: { userId: { in: [firstUserId, secondUserId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId] } } });
    }
    await app?.close();
  });

  it('persists one user cart, merges duplicate additions and detects stale versions', async () => {
    const first = await cart.add(firstUserId, 0, variantIds[0]!, 2);
    expect(first.response.cart).toMatchObject({ owner: 'authenticated', version: 1 });
    const second = await cart.add(firstUserId, first.response.cart.version, variantIds[0]!, 2);
    expect(second.response.cart.summary.distinctLineCount).toBe(1);
    expect(second.response.cart.groups[0]!.lines[0]!.quantity).toBe(4);
    await expect(
      cart.updateQuantity(
        firstUserId,
        first.response.cart.version,
        second.response.cart.groups[0]!.lines[0]!.id,
        3,
      ),
    ).rejects.toBeInstanceOf(CartConflictError);
    expect((await cart.read(firstUserId)).groups[0]!.lines[0]!.quantity).toBe(4);
    expect(await prisma.cart.count({ where: { userId: firstUserId } })).toBe(1);
    expect(await prisma.cart.count({ where: { userId: null } })).toBe(0);
  });

  it('reconciles price changes and keeps line ownership private', async () => {
    const first = await cart.add(firstUserId, 0, variantIds[0]!, 2);
    const second = await cart.add(secondUserId, 0, variantIds[1]!, 1);
    const secondLineId = second.response.cart.groups[0]!.lines[0]!.id;
    await expect(
      cart.remove(firstUserId, first.response.cart.version, secondLineId),
    ).rejects.toBeInstanceOf(CartLineNotFoundError);

    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantIds[0]! },
      select: { priceMinor: true },
    });
    try {
      await prisma.productVariant.update({
        where: { id: variantIds[0]! },
        data: { priceMinor: variant.priceMinor + 1n },
      });
      const changed = await cart.read(firstUserId);
      expect(changed.groups[0]!.lines[0]!.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'price-changed' })]),
      );
      const corrected = await cart.updateQuantity(
        firstUserId,
        changed.version,
        changed.groups[0]!.lines[0]!.id,
        2,
      );
      expect(corrected.response.adjustments).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'price-changed' })]),
      );
      expect(corrected.response.cart.groups[0]!.lines[0]!.issues).toHaveLength(0);
    } finally {
      await prisma.productVariant.update({
        where: { id: variantIds[0]! },
        data: { priceMinor: variant.priceMinor },
      });
    }
  });

  it('serializes concurrent duplicate writes without creating duplicate lines', async () => {
    const initial = await cart.add(firstUserId, 0, variantIds[0]!, 1);
    const writes = await Promise.allSettled([
      cart.add(firstUserId, initial.response.cart.version, variantIds[0]!, 1),
      cart.add(firstUserId, initial.response.cart.version, variantIds[0]!, 1),
    ]);
    expect(writes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(writes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const confirmed = await cart.read(firstUserId);
    expect(confirmed.groups[0]!.lines).toHaveLength(1);
    expect(confirmed.groups[0]!.lines[0]!.quantity).toBe(2);
    expect(await prisma.cartLine.count({ where: { cart: { userId: firstUserId } } })).toBe(1);
  });

  it('updates line, shop and whole-cart selection within one account', async () => {
    const first = await cart.add(firstUserId, 0, variantIds[0]!, 1);
    const second = await cart.add(firstUserId, first.response.cart.version, variantIds[1]!, 1);
    const line = second.response.cart.groups[0]!.lines[0]!;
    const unselected = await cart.selectLine(
      firstUserId,
      second.response.cart.version,
      line.id,
      false,
    );
    expect(unselected.response.cart.summary.selectedValidLineCount).toBe(1);
    const none = await cart.selectAll(firstUserId, unselected.response.cart.version, false);
    expect(none.response.cart.summary.selectedValidLineCount).toBe(0);
    const all = await cart.selectAll(firstUserId, none.response.cart.version, true);
    expect(all.response.cart.summary.selectedValidLineCount).toBe(2);
  });
});
