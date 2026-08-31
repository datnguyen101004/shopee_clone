import { Inject, Injectable } from '@nestjs/common';
import {
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  type CartAdjustment,
  type CartLine,
  type CartLineIssue,
  type CartMutationResponse,
  type CartResponse,
  type CartShopGroup,
} from '@shopee-clone/contracts';

import type { Prisma } from '../generated/prisma/client';
import { VariantStatus } from '../generated/prisma/enums';
import { isSellableProduct } from '../catalog/sellable-product';
import { isSellableShop } from '../catalog/sellable-shop';
import { PrismaService } from '../prisma/prisma.service';
import {
  CartCapacityError,
  CartConflictError,
  CartItemUnavailableError,
  CartLineNotFoundError,
  CartSelfPurchaseError,
  CartUnavailableError,
} from './cart.errors';

const cartInclude = {
  lines: {
    include: {
      variant: {
        include: {
          inventory: true,
          images: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
          product: {
            include: {
              shop: true,
              category: true,
              images: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.CartInclude;

type CartTransaction = Prisma.TransactionClient;
type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
type CartLineRow = CartRow['lines'][number];

interface MutationResult {
  response: CartMutationResponse;
}

function emptyCart(): CartResponse {
  return {
    owner: 'authenticated',
    version: 0,
    groups: [],
    summary: {
      distinctLineCount: 0,
      selectedValidLineCount: 0,
      selectedValidQuantity: 0,
      selectedMerchandiseSubtotalMinor: 0,
    },
  };
}

function safeMoney(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new CartUnavailableError();
  return result;
}

function currentFacts(line: CartLineRow) {
  const { variant } = line;
  const { product } = variant;
  const availableQuantity = Math.max(
    0,
    (variant.inventory?.quantityOnHand ?? 0) - (variant.inventory?.quantityReserved ?? 0),
  );
  const contentAvailable =
    variant.status === VariantStatus.ACTIVE &&
    variant.deletedAt === null &&
    isSellableProduct(product) &&
    product.category.isActive &&
    product.category.deletedAt === null &&
    isSellableShop(product.shop);
  const maxPurchaseQuantity = Math.min(
    CART_MAX_QUANTITY,
    availableQuantity,
    variant.maxPurchaseQuantity ?? CART_MAX_QUANTITY,
  );
  return {
    availableQuantity,
    eligible: contentAvailable && availableQuantity > 0,
    maxPurchaseQuantity,
    unitPriceMinor: safeMoney(variant.priceMinor),
  };
}

@Injectable()
export class CartService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(userId: string): Promise<CartResponse> {
    const cart = await this.prisma.cart.findUnique({ where: { userId }, include: cartInclude });
    return cart ? this.project(cart) : emptyCart();
  }

  async add(
    userId: string,
    expectedVersion: number,
    variantId: string,
    quantity: number,
  ): Promise<MutationResult> {
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const variant = await transaction.productVariant.findUnique({
        where: { id: variantId },
        include: {
          inventory: true,
          images: true,
          product: { include: { shop: true, category: true, images: true } },
        },
      });
      if (!variant) throw new CartItemUnavailableError();
      if (variant.product.shop.ownerId === userId) throw new CartSelfPurchaseError();

      const owner = await this.ensureUserCart(transaction, userId, now);
      await this.lockCart(transaction, owner.id);
      const cart = await transaction.cart.findUniqueOrThrow({ where: { id: owner.id } });
      this.expectVersion(cart.version, expectedVersion);

      const pseudoLine = {
        id: '',
        cartId: cart.id,
        variantId,
        quantity,
        isSelected: true,
        lastObservedUnitPriceMinor: variant.priceMinor,
        createdAt: now,
        updatedAt: now,
        variant,
      } as CartLineRow;
      const facts = currentFacts(pseudoLine);
      if (!facts.eligible || facts.maxPurchaseQuantity < 1) throw new CartItemUnavailableError();

      const existing = await transaction.cartLine.findUnique({
        where: { cartId_variantId: { cartId: cart.id, variantId } },
      });
      if (!existing) {
        const count = await transaction.cartLine.count({ where: { cartId: cart.id } });
        if (count >= CART_MAX_LINES) throw new CartCapacityError();
      }

      const requestedQuantity = (existing?.quantity ?? 0) + quantity;
      const acceptedQuantity = Math.min(requestedQuantity, facts.maxPurchaseQuantity);
      const priceChanged =
        existing !== null && existing.lastObservedUnitPriceMinor !== variant.priceMinor;
      const line = existing
        ? await transaction.cartLine.update({
            where: { id: existing.id },
            data: {
              quantity: acceptedQuantity,
              lastObservedUnitPriceMinor: variant.priceMinor,
            },
          })
        : await transaction.cartLine.create({
            data: {
              cartId: cart.id,
              variantId,
              quantity: acceptedQuantity,
              isSelected: true,
              lastObservedUnitPriceMinor: variant.priceMinor,
            },
          });

      await transaction.cart.update({
        where: { id: cart.id },
        data: { version: { increment: 1 } },
      });

      const adjustments: CartAdjustment[] = [];
      if (acceptedQuantity !== requestedQuantity) {
        adjustments.push({
          code: 'quantity-capped',
          variantId,
          lineId: line.id,
          requestedQuantity,
          acceptedQuantity,
          message: 'Số lượng đã được điều chỉnh theo giới hạn mua hiện tại.',
        });
      }
      if (priceChanged) {
        adjustments.push({
          code: 'price-changed',
          variantId,
          lineId: line.id,
          requestedQuantity: null,
          acceptedQuantity: null,
          message: 'Giá sản phẩm đã thay đổi và giỏ hàng đang dùng giá hiện tại.',
        });
      }

      return {
        response: {
          cart: await this.projectById(transaction, cart.id),
          adjustments,
        },
      };
    });
  }

  async updateQuantity(
    userId: string,
    expectedVersion: number,
    lineId: string,
    quantity: number,
  ): Promise<MutationResult> {
    return this.prisma.$transaction(async (transaction) => {
      const owner = await this.requireCart(transaction, userId);
      await this.lockCart(transaction, owner.id);
      const line = await transaction.cartLine.findFirst({
        where: { id: lineId, cartId: owner.id },
        include: cartInclude.lines.include,
      });
      if (!line) throw new CartLineNotFoundError();

      const cart = await transaction.cart.findUniqueOrThrow({ where: { id: owner.id } });
      this.expectVersion(cart.version, expectedVersion);
      const facts = currentFacts(line as CartLineRow);
      if (!facts.eligible || facts.maxPurchaseQuantity < 1) throw new CartItemUnavailableError();

      const acceptedQuantity = Math.min(quantity, facts.maxPurchaseQuantity);
      const priceChanged = line.lastObservedUnitPriceMinor !== line.variant.priceMinor;
      await transaction.cartLine.update({
        where: { id: line.id },
        data: {
          quantity: acceptedQuantity,
          lastObservedUnitPriceMinor: line.variant.priceMinor,
        },
      });
      await transaction.cart.update({
        where: { id: cart.id },
        data: { version: { increment: 1 } },
      });

      const adjustments: CartAdjustment[] = [];
      if (acceptedQuantity !== quantity) {
        adjustments.push({
          code: 'quantity-capped',
          variantId: line.variantId,
          lineId: line.id,
          requestedQuantity: quantity,
          acceptedQuantity,
          message: 'Số lượng đã được điều chỉnh theo giới hạn mua hiện tại.',
        });
      }
      if (priceChanged) {
        adjustments.push({
          code: 'price-changed',
          variantId: line.variantId,
          lineId: line.id,
          requestedQuantity: null,
          acceptedQuantity: null,
          message: 'Giá sản phẩm đã thay đổi và giỏ hàng đang dùng giá hiện tại.',
        });
      }

      return {
        response: {
          cart: await this.projectById(transaction, cart.id),
          adjustments,
        },
      };
    });
  }

  async remove(userId: string, expectedVersion: number, lineId: string): Promise<MutationResult> {
    return this.prisma.$transaction(async (transaction) => {
      const owner = await this.findCart(transaction, userId);
      if (!owner) return { response: { cart: emptyCart(), adjustments: [] } };

      await this.lockCart(transaction, owner.id);
      const line = await transaction.cartLine.findFirst({
        where: { id: lineId, cartId: owner.id },
        select: { id: true },
      });
      if (!line) {
        const addressedElsewhere = await transaction.cartLine.findUnique({
          where: { id: lineId },
          select: { id: true },
        });
        if (addressedElsewhere) throw new CartLineNotFoundError();
        return {
          response: { cart: await this.projectById(transaction, owner.id), adjustments: [] },
        };
      }

      const cart = await transaction.cart.findUniqueOrThrow({ where: { id: owner.id } });
      this.expectVersion(cart.version, expectedVersion);
      await transaction.cartLine.delete({ where: { id: line.id } });
      await transaction.cart.update({
        where: { id: cart.id },
        data: { version: { increment: 1 } },
      });
      return {
        response: { cart: await this.projectById(transaction, cart.id), adjustments: [] },
      };
    });
  }

  async selectLine(
    userId: string,
    expectedVersion: number,
    lineId: string,
    selected: boolean,
  ): Promise<MutationResult> {
    return this.mutateSelection(userId, expectedVersion, async (transaction, cartId) => {
      const line = await transaction.cartLine.findFirst({ where: { id: lineId, cartId } });
      if (!line) throw new CartLineNotFoundError();
      await transaction.cartLine.update({ where: { id: line.id }, data: { isSelected: selected } });
    });
  }

  async selectShop(
    userId: string,
    expectedVersion: number,
    shopId: string,
    selected: boolean,
  ): Promise<MutationResult> {
    return this.mutateSelection(userId, expectedVersion, async (transaction, cartId) => {
      const lines = await transaction.cartLine.findMany({
        where: { cartId, variant: { product: { shopId } } },
        include: cartInclude.lines.include,
      });
      if (lines.length === 0) throw new CartLineNotFoundError();
      for (const line of lines) {
        const facts = currentFacts(line as CartLineRow);
        await transaction.cartLine.update({
          where: { id: line.id },
          data: {
            isSelected: selected && facts.eligible && line.quantity <= facts.maxPurchaseQuantity,
          },
        });
      }
    });
  }

  async selectAll(
    userId: string,
    expectedVersion: number,
    selected: boolean,
  ): Promise<MutationResult> {
    return this.mutateSelection(userId, expectedVersion, async (transaction, cartId) => {
      const lines = await transaction.cartLine.findMany({
        where: { cartId },
        include: cartInclude.lines.include,
      });
      for (const line of lines) {
        const facts = currentFacts(line as CartLineRow);
        await transaction.cartLine.update({
          where: { id: line.id },
          data: {
            isSelected: selected && facts.eligible && line.quantity <= facts.maxPurchaseQuantity,
          },
        });
      }
    });
  }

  private async mutateSelection(
    userId: string,
    expectedVersion: number,
    work: (transaction: CartTransaction, cartId: string) => Promise<void>,
  ): Promise<MutationResult> {
    return this.prisma.$transaction(async (transaction) => {
      const owner = await this.requireCart(transaction, userId);
      await this.lockCart(transaction, owner.id);
      const cart = await transaction.cart.findUniqueOrThrow({ where: { id: owner.id } });
      this.expectVersion(cart.version, expectedVersion);
      await work(transaction, cart.id);
      await transaction.cart.update({
        where: { id: cart.id },
        data: { version: { increment: 1 } },
      });
      return {
        response: { cart: await this.projectById(transaction, cart.id), adjustments: [] },
      };
    });
  }

  private async ensureUserCart(transaction: CartTransaction, userId: string, now: Date) {
    return transaction.cart.upsert({
      where: { userId },
      create: { userId, createdAt: now, updatedAt: now },
      update: {},
    });
  }

  private async findCart(client: CartTransaction | PrismaService, userId: string) {
    return client.cart.findUnique({ where: { userId } });
  }

  private async requireCart(client: CartTransaction | PrismaService, userId: string) {
    const cart = await this.findCart(client, userId);
    if (!cart) throw new CartLineNotFoundError();
    return cart;
  }

  private expectVersion(current: number, expected: number): void {
    if (current !== expected) throw new CartConflictError();
  }

  private async lockCart(transaction: CartTransaction, cartId: string): Promise<void> {
    await transaction.$queryRawUnsafe(
      'SELECT id FROM carts WHERE id = $1::uuid FOR UPDATE',
      cartId,
    );
  }

  private async projectById(
    client: CartTransaction | PrismaService,
    cartId: string,
  ): Promise<CartResponse> {
    const cart = await client.cart.findUnique({ where: { id: cartId }, include: cartInclude });
    if (!cart) throw new CartUnavailableError();
    return this.project(cart);
  }

  private project(cart: CartRow): CartResponse {
    const ordered = [...cart.lines].sort((left, right) => {
      const shopTime =
        left.variant.product.shop.createdAt.getTime() -
        right.variant.product.shop.createdAt.getTime();
      if (shopTime !== 0) return shopTime;
      const shopId = left.variant.product.shop.id.localeCompare(right.variant.product.shop.id);
      if (shopId !== 0) return shopId;
      const lineTime = left.createdAt.getTime() - right.createdAt.getTime();
      return lineTime !== 0 ? lineTime : left.id.localeCompare(right.id);
    });

    const groups = new Map<string, CartShopGroup>();
    for (const row of ordered) {
      const product = row.variant.product;
      const shop = product.shop;
      const facts = currentFacts(row);
      const previousUnitPriceMinor =
        row.lastObservedUnitPriceMinor === row.variant.priceMinor
          ? null
          : safeMoney(row.lastObservedUnitPriceMinor);
      const issues: CartLineIssue[] = [];
      if (!facts.eligible) {
        issues.push({
          code: 'unavailable',
          message: 'Sản phẩm hiện không còn khả dụng.',
          previousUnitPriceMinor: null,
          currentUnitPriceMinor: facts.unitPriceMinor,
          availableQuantity: facts.availableQuantity,
        });
      } else if (row.quantity > facts.maxPurchaseQuantity) {
        issues.push({
          code: 'insufficient-stock',
          message: 'Số lượng trong giỏ vượt quá giới hạn mua hiện tại.',
          previousUnitPriceMinor: null,
          currentUnitPriceMinor: facts.unitPriceMinor,
          availableQuantity: facts.maxPurchaseQuantity,
        });
      }
      if (previousUnitPriceMinor !== null) {
        issues.push({
          code: 'price-changed',
          message: 'Giá sản phẩm đã thay đổi kể từ lần cập nhật trước.',
          previousUnitPriceMinor,
          currentUnitPriceMinor: facts.unitPriceMinor,
          availableQuantity: null,
        });
      }

      const lineSubtotalMinor = facts.unitPriceMinor * row.quantity;
      if (!Number.isSafeInteger(lineSubtotalMinor)) throw new CartUnavailableError();
      const effectivelySelected =
        row.isSelected && facts.eligible && row.quantity <= facts.maxPurchaseQuantity;
      const media = row.variant.images[0] ?? product.images[0];
      const line: CartLine = {
        id: row.id,
        product: {
          id: product.id,
          name: product.name,
          href: facts.eligible ? `/products/${product.id}` : null,
          imageUrl: media?.url ?? null,
          imageAlt: media?.altText || product.name,
        },
        variant: { id: row.variant.id, name: row.variant.name },
        unitPriceMinor: facts.unitPriceMinor,
        previousUnitPriceMinor,
        availableQuantity: facts.availableQuantity,
        maxPurchaseQuantity: facts.maxPurchaseQuantity,
        quantity: row.quantity,
        selected: row.isSelected,
        effectivelySelected,
        eligible: facts.eligible,
        lineSubtotalMinor,
        issues,
      };

      let group = groups.get(shop.id);
      if (!group) {
        group = {
          shop: {
            id: shop.id,
            slug: shop.slug,
            name: shop.name,
            href: isSellableShop(shop) ? `/shops/${shop.slug}` : null,
          },
          lines: [],
          selectedEligibleLineCount: 0,
          eligibleLineCount: 0,
        };
        groups.set(shop.id, group);
      }
      group.lines.push(line);
      if (line.eligible) group.eligibleLineCount += 1;
      if (line.effectivelySelected) group.selectedEligibleLineCount += 1;
    }

    const groupList = [...groups.values()];
    const lines = groupList.flatMap((group) => group.lines);
    const selected = lines.filter((line) => line.effectivelySelected);
    const selectedValidQuantity = selected.reduce((total, line) => total + line.quantity, 0);
    const selectedMerchandiseSubtotalMinor = selected.reduce(
      (total, line) => total + line.lineSubtotalMinor,
      0,
    );
    if (!Number.isSafeInteger(selectedMerchandiseSubtotalMinor)) throw new CartUnavailableError();

    return {
      owner: 'authenticated',
      version: cart.version,
      groups: groupList,
      summary: {
        distinctLineCount: lines.length,
        selectedValidLineCount: selected.length,
        selectedValidQuantity,
        selectedMerchandiseSubtotalMinor,
      },
    };
  }
}

export type { MutationResult };
