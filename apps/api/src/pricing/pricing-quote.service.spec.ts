import { ProductStatus, ShopStatus, VariantStatus } from '../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';
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
          status: VariantStatus.ACTIVE,
          deletedAt: null,
          priceMinor: 90_000n,
          compareAtPriceMinor: 100_000n,
          weightGrams: 300,
          maxPurchaseQuantity: null,
          inventory: { quantityOnHand: 10, quantityReserved: 0 },
          product: {
            id: '00000000-0000-4000-8000-000000000007',
            status: ProductStatus.ACTIVE,
            deletedAt: null,
            category: { isActive: true, deletedAt: null },
            shop: {
              id: shopId,
              slug: 'fixture-shop',
              name: 'Fixture Shop',
              location: 'Hà Nội',
              status: ShopStatus.ACTIVE,
              deletedAt: null,
            },
          },
        },
      },
    ],
  };
}

function serviceWith(options?: { address?: unknown; cart?: unknown }) {
  const transaction = {
    shippingAddress: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options && 'address' in options
            ? options.address
            : { id: addressId, province: 'Hà Nội', district: 'Ba Đình' },
        ),
    },
    cart: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options && 'cart' in options ? options.cart : fixtureCart()),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (client: typeof transaction) => unknown) =>
      work(transaction),
    ),
  } as unknown as PrismaService;
  return new PricingQuoteService(
    prisma,
    new CommercePricingCalculator(new MockShippingCalculator()),
  );
}

describe('pricing quote orchestration', () => {
  it('loads authoritative selected facts and performs no persistence write', async () => {
    const quote = await serviceWith().quote(userId, 2, addressId, []);
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

  it('supports a valid zero cart only at version zero', async () => {
    const quote = await serviceWith({ cart: null }).quote(userId, 0, addressId, []);
    expect(quote.summary.payableTotalMinor).toBe(0);
    await expect(
      serviceWith({ cart: null }).quote(userId, 1, addressId, []),
    ).rejects.toBeInstanceOf(PricingConflictError);
  });
});
