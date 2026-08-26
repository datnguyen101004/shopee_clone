import { isPricingQuoteResponse } from '@shopee-clone/contracts';

import {
  ProductModerationStatus,
  ProductStatus,
  ShopOnboardingStatus,
  ShopStatus,
  VariantStatus,
} from '../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';
import type { SystemUtcClock } from '../vouchers/utc-clock';
import { VoucherPricingCalculator } from '../vouchers/voucher-pricing.calculator';
import { CommercePricingCalculator } from './commerce-pricing.calculator';
import { MockShippingCalculator } from './mock-shipping.calculator';
import {
  PricingAddressNotFoundError,
  PricingConflictError,
  PricingValidationError,
} from './pricing.errors';
import { PricingQuoteService } from './pricing-quote.service';

const userId = '00000000-0000-4000-8000-000000000001';
const addressId = '00000000-0000-4000-8000-000000000002';
const shopId = '00000000-0000-4000-8000-000000000003';

function fixtureCart() {
  return {
    id: '00000000-0000-4000-8000-000000000004',
    version: 2,
    lines: [
      {
        id: '00000000-0000-4000-8000-000000000005',
        quantity: 2,
        variant: {
          id: '00000000-0000-4000-8000-000000000006',
          name: 'Fixture variant',
          sku: 'FIXTURE-SKU',
          status: VariantStatus.ACTIVE,
          deletedAt: null,
          priceMinor: 90_000n,
          compareAtPriceMinor: 100_000n,
          weightGrams: 300,
          maxPurchaseQuantity: null,
          inventory: { quantityOnHand: 10, quantityReserved: 0 },
          product: {
            id: '00000000-0000-4000-8000-000000000007',
            name: 'Fixture product',
            status: ProductStatus.ACTIVE,
            moderationStatus: ProductModerationStatus.ACTIVE as ProductModerationStatus,
            deletedAt: null,
            category: { isActive: true, deletedAt: null },
            images: [{ url: '/media/products/fixture.webp' }],
            shop: {
              id: shopId,
              ownerId: '00000000-0000-4000-8000-000000000008',
              slug: 'fixture-shop',
              name: 'Fixture Shop',
              location: 'Hà Nội',
              status: ShopStatus.ACTIVE,
              onboardingStatus: ShopOnboardingStatus.APPROVED as ShopOnboardingStatus,
              deletedAt: null,
            },
          },
        },
      },
    ],
  };
}

function serviceWith(options?: { address?: unknown; cart?: unknown; vouchers?: unknown[] }) {
  const transaction = {
    shippingAddress: {
      findFirst: jest.fn().mockResolvedValue(
        options && 'address' in options
          ? options.address
          : {
              id: addressId,
              recipientName: 'Fixture Buyer',
              phoneNumber: '0900000000',
              province: 'Hà Nội',
              district: 'Ba Đình',
              ward: 'Phúc Xá',
              addressLine: '1 Hồng Hà',
              label: null,
            },
      ),
    },
    cart: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options && 'cart' in options ? options.cart : fixtureCart()),
    },
    voucher: { findMany: jest.fn().mockResolvedValue(options?.vouchers ?? []) },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (client: typeof transaction) => unknown) =>
      work(transaction),
    ),
  } as unknown as PrismaService;
  return new PricingQuoteService(
    prisma,
    new CommercePricingCalculator(new MockShippingCalculator()),
    new VoucherPricingCalculator(),
    { now: () => new Date('2026-08-14T05:00:00.000Z') } as SystemUtcClock,
  );
}

describe('pricing quote orchestration', () => {
  it('loads authoritative selected facts and performs no persistence write', async () => {
    const quote = await serviceWith().quote(userId, 2, addressId, []);
    expect(isPricingQuoteResponse(quote)).toBe(true);
    expect(quote.address).toEqual({
      id: addressId,
      province: 'Hà Nội',
      district: 'Ba Đình',
    });
    expect(quote.cartVersion).toBe(2);
    expect(quote.shops[0]?.lines[0]).toMatchObject({
      sellingUnitPriceMinor: 90_000,
      listUnitPriceMinor: 100_000,
      productDiscountMinor: 20_000,
      shipmentWeightGrams: 600,
    });
    expect(quote.shops[0]?.shipping.service).toBe('STANDARD');
  });

  it('keeps missing address and stale cart outcomes private and typed', async () => {
    await expect(
      serviceWith({ address: null }).quote(userId, 2, addressId, []),
    ).rejects.toBeInstanceOf(PricingAddressNotFoundError);
    await expect(serviceWith().quote(userId, 1, addressId, [])).rejects.toBeInstanceOf(
      PricingConflictError,
    );
  });

  it('excludes invalid quantities and rejects a service for an absent shop', async () => {
    const cart = fixtureCart();
    cart.lines[0]!.quantity = 20;
    cart.lines[0]!.variant.inventory.quantityOnHand = 1;
    const quote = await serviceWith({ cart }).quote(userId, 2, addressId, []);
    expect(quote.shops).toEqual([]);
    expect(quote.exclusions).toEqual([expect.objectContaining({ code: 'insufficient-stock' })]);
    await expect(
      serviceWith().quote(userId, 2, addressId, [
        {
          shopId: '00000000-0000-4000-8000-000000000099',
          service: 'EXPRESS',
        },
      ]),
    ).rejects.toBeInstanceOf(PricingValidationError);
  });

  it('revalidates a once-sellable cart line after its shop approval is withdrawn', async () => {
    const cart = fixtureCart();
    cart.lines[0]!.variant.product.shop.onboardingStatus = ShopOnboardingStatus.REJECTED;

    const quote = await serviceWith({ cart }).quote(userId, 2, addressId, []);

    expect(quote.shops).toEqual([]);
    expect(quote.exclusions).toEqual([
      expect.objectContaining({ lineId: cart.lines[0]!.id, code: 'unavailable' }),
    ]);
  });

  it('rejects checkout of a cart line after product moderation suspends it', async () => {
    const cart = fixtureCart();
    cart.lines[0]!.variant.product.moderationStatus = ProductModerationStatus.SUSPENDED;

    const quote = await serviceWith({ cart }).quote(userId, 2, addressId, []);

    expect(quote.shops).toEqual([]);
    expect(quote.exclusions).toEqual([
      expect.objectContaining({ lineId: cart.lines[0]!.id, code: 'unavailable' }),
    ]);
  });

  it('supports a valid zero cart only at version zero', async () => {
    const quote = await serviceWith({ cart: null }).quote(userId, 0, addressId, []);
    expect(quote.summary.payableTotalMinor).toBe(0);
    await expect(
      serviceWith({ cart: null }).quote(userId, 1, addressId, []),
    ).rejects.toBeInstanceOf(PricingConflictError);
  });

  it('reloads current definitions and returns mixed applied and rejected evidence', async () => {
    const active = {
      id: '00000000-0000-4000-8000-000000000020',
      code: 'PLATFORM-10',
      name: 'Sàn giảm 10%',
      issuer: 'PLATFORM',
      shopId: null,
      benefitType: 'PERCENTAGE',
      fixedAmountMinor: null,
      percentageBasisPoints: 1_000,
      maximumDiscountMinor: 50_000n,
      minimumSpendMinor: 100_000n,
      startsAt: new Date('2020-01-01T00:00:00.000Z'),
      endsAt: new Date('2999-01-01T00:00:00.000Z'),
      isEnabled: true,
      usageLimit: 100,
      usedCount: 0,
      perBuyerLimit: 1,
      productScopes: [],
      userUsages: [],
    };
    const quote = await serviceWith({ vouchers: [active] }).quote(userId, 2, addressId, [], {
      platformCode: 'PLATFORM-10',
      freeShippingCode: 'UNKNOWN-CODE',
    });
    expect(quote.vouchers).toEqual([
      expect.objectContaining({ code: 'PLATFORM-10', status: 'APPLIED', discountMinor: 18_000 }),
      expect.objectContaining({
        code: 'UNKNOWN-CODE',
        status: 'REJECTED',
        rejectionReason: 'NOT_FOUND',
      }),
    ]);
    expect(quote.summary.platformVoucherDiscountMinor).toBe(18_000);
  });
});
