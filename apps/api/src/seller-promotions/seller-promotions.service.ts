import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  type SellerDiscountCreateRequest,
  type SellerDiscountPage,
  type SellerDiscountSummary,
  type SellerDiscountUpdateRequest,
  type SellerPromotionAction,
  type SellerPromotionState,
  type SellerVoucherCreateRequest,
  type SellerVoucherPage,
  type SellerVoucherSummary,
  type SellerVoucherState,
  type SellerVoucherUpdateRequest,
} from '@shopee-clone/contracts';
import { SellerPromotionConflictError, SellerPromotionIdempotencyConflictError, SellerPromotionNotFoundError, SellerPromotionStaleError, SellerPromotionUnavailableError, SellerPromotionValidationError } from './seller-promotions.errors';
import { SellerShopScopeNotFoundError, SellerShopScopeService } from '../seller-scope/seller-shop-scope.service';

type ShopRef = { id: string };
type VoucherGraph = Prisma.VoucherGetPayload<{ include: { productScopes: { select: { productId: true } } } }>;
type CampaignGraph = Prisma.ShopDiscountCampaignGetPayload<{ include: { products: { select: { productId: true; discountBasisPoints: true } } } }>;
const jsonDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const toNumber = (value: bigint | number | null): number | null => value === null ? null : Number(value);

function voucherState(voucher: Pick<VoucherGraph, 'isEnabled' | 'startsAt' | 'endsAt' | 'usedCount' | 'usageLimit'>, now: Date): SellerVoucherState {
  if (!voucher.isEnabled) return 'PAUSED';
  if (voucher.usedCount >= voucher.usageLimit) return 'EXHAUSTED';
  if (now >= voucher.endsAt) return 'EXPIRED';
  return now < voucher.startsAt ? 'SCHEDULED' : 'ACTIVE';
}

function campaignState(campaign: Pick<CampaignGraph, 'isEnabled' | 'startsAt' | 'endsAt' | 'archivedAt'>, now: Date): SellerPromotionState {
  if (campaign.archivedAt) return 'ARCHIVED';
  if (!campaign.isEnabled) return 'PAUSED';
  if (now >= campaign.endsAt) return 'EXPIRED';
  return now < campaign.startsAt ? 'SCHEDULED' : 'ACTIVE';
}

function cursorFor(createdAt: Date, id: string): string { return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), 'utf8').toString('base64url'); }
function decodeCursor(value: string | null): { createdAt: Date; id: string } | null {
  if (!value) return null;
  try { const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { createdAt?: string; id?: string }; const createdAt = new Date(parsed.createdAt ?? ''); if (!parsed.id || Number.isNaN(createdAt.getTime())) throw new Error(); return { createdAt, id: parsed.id }; } catch { throw new SellerPromotionValidationError(['cursor']); }
}

@Injectable()
export class SellerPromotionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(SellerShopScopeService) private readonly sellerScope?: SellerShopScopeService) {}

  private async shopFor(userId: string): Promise<ShopRef> {
    if (this.sellerScope) {
      try { return await this.sellerScope.resolve(userId); }
      catch (error) { if (error instanceof SellerShopScopeNotFoundError) throw new SellerPromotionNotFoundError(); throw error; }
    }
    const shop = await this.prisma.shop.findFirst({ where: { ownerId: userId, deletedAt: null, status: 'ACTIVE', onboardingStatus: 'APPROVED' }, select: { id: true } });
    if (!shop) throw new SellerPromotionNotFoundError();
    return shop;
  }

  private async now(tx: Prisma.TransactionClient): Promise<Date> {
    const rows = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
    const value = rows[0]?.now;
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new SellerPromotionUnavailableError();
    return value;
  }

  private async databaseNow(): Promise<Date> {
    const rows = await this.prisma.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
    const value = rows[0]?.now;
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new SellerPromotionUnavailableError();
    return value;
  }

  private voucherStateWhere(state: SellerPromotionState | 'ALL', now: Date): Prisma.VoucherWhereInput {
    if (state === 'ALL') return {};
    if (state === 'ARCHIVED' || state === 'PAUSED') return { isEnabled: false };
    if (state === 'SCHEDULED') return { isEnabled: true, startsAt: { gt: now } };
    if (state === 'EXHAUSTED') return { isEnabled: true };
    if (state === 'EXPIRED') return { isEnabled: true, endsAt: { lte: now } };
    return { isEnabled: true, startsAt: { lte: now }, endsAt: { gt: now } };
  }

  private voucherSummary(voucher: VoucherGraph, now: Date): SellerVoucherSummary {
    return { id: voucher.id, issuer: 'SHOP', code: voucher.code, name: voucher.name, benefitType: voucher.benefitType === 'FIXED_AMOUNT' ? 'FIXED_AMOUNT' : 'PERCENTAGE', fixedAmountMinor: toNumber(voucher.fixedAmountMinor), percentageBasisPoints: voucher.percentageBasisPoints, maximumDiscountMinor: toNumber(voucher.maximumDiscountMinor), minimumSpendMinor: Number(voucher.minimumSpendMinor), startsAt: voucher.startsAt.toISOString(), endsAt: voucher.endsAt.toISOString(), usageLimit: voucher.usageLimit, perBuyerLimit: voucher.perBuyerLimit, productIds: voucher.productScopes.map((scope) => scope.productId), state: voucherState(voucher, now), usedCount: voucher.usedCount, version: voucher.version, createdAt: voucher.createdAt.toISOString(), updatedAt: voucher.updatedAt.toISOString() };
  }

  private discountSummary(campaign: CampaignGraph, now: Date): SellerDiscountSummary {
    return { id: campaign.id, name: campaign.name, startsAt: campaign.startsAt.toISOString(), endsAt: campaign.endsAt.toISOString(), products: campaign.products.map((product) => ({ productId: product.productId, discountBasisPoints: product.discountBasisPoints })), state: campaignState(campaign, now), version: campaign.version, archivedAt: campaign.archivedAt?.toISOString() ?? null, createdAt: campaign.createdAt.toISOString(), updatedAt: campaign.updatedAt.toISOString() };
  }

  private voucherInclude = { productScopes: { select: { productId: true } } } satisfies Prisma.VoucherInclude;
  private campaignInclude = { products: { select: { productId: true, discountBasisPoints: true } } } satisfies Prisma.ShopDiscountCampaignInclude;

  async listVouchers(userId: string, filter: { state: SellerPromotionState | 'ALL'; limit: number; cursor: string | null }): Promise<SellerVoucherPage> {
    const shop = await this.shopFor(userId); const cursor = decodeCursor(filter.cursor); const now = await this.databaseNow();
    const rows = await this.prisma.voucher.findMany({ where: { issuer: 'SHOP', shopId: shop.id, ...this.voucherStateWhere(filter.state, now), ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: filter.limit + 1, include: this.voucherInclude });
    const filtered = filter.state === 'EXHAUSTED' ? rows.filter((row) => voucherState(row, now) === filter.state) : rows; const items = filtered.slice(0, filter.limit).map((row) => this.voucherSummary(row, now)); const last = filtered.at(-1);
    return { sellerPromotionVersion: 'seller-promotions-v1', items, nextCursor: filtered.length > filter.limit && last ? cursorFor(last.createdAt, last.id) : null };
  }

  async getVoucher(userId: string, id: string): Promise<SellerVoucherSummary> {
    const shop = await this.shopFor(userId); const row = await this.prisma.voucher.findFirst({ where: { id, shopId: shop.id, issuer: 'SHOP' }, include: this.voucherInclude }); if (!row) throw new SellerPromotionNotFoundError(); return this.voucherSummary(row, new Date());
  }

  async createVoucher(userId: string, input: SellerVoucherCreateRequest, idempotencyKey: string): Promise<SellerVoucherSummary> {
    const shop = await this.shopFor(userId); const digest = jsonDigest(input);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.sellerPromotionCommand.findUnique({ where: { shopId_idempotencyKey: { shopId: shop.id, idempotencyKey } } });
      if (existing) { if (existing.requestDigest !== digest) throw new SellerPromotionIdempotencyConflictError(); return existing.response as unknown as SellerVoucherSummary; }
      const products = await tx.product.findMany({ where: { id: { in: input.productIds }, shopId: shop.id, deletedAt: null }, select: { id: true } });
      if (products.length !== input.productIds.length) throw new SellerPromotionValidationError(['productIds'], 'One or more product IDs are invalid for this shop.');
      const voucher = await tx.voucher.create({ data: { code: input.code, name: input.name, issuer: 'SHOP', shopId: shop.id, benefitType: input.benefitType, fixedAmountMinor: input.fixedAmountMinor === null ? null : BigInt(input.fixedAmountMinor), percentageBasisPoints: input.percentageBasisPoints, maximumDiscountMinor: input.maximumDiscountMinor === null ? null : BigInt(input.maximumDiscountMinor), minimumSpendMinor: BigInt(input.minimumSpendMinor), startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), isEnabled: true, usageLimit: input.usageLimit, perBuyerLimit: input.perBuyerLimit, productScopes: { createMany: { data: input.productIds.map((productId) => ({ productId })) } } }, include: this.voucherInclude });
      const summary = this.voucherSummary(voucher, new Date());
      await tx.sellerPromotionCommand.create({ data: { id: randomUUID(), shopId: shop.id, resource: 'VOUCHER', resourceId: voucher.id, idempotencyKey, requestDigest: digest, response: summary as unknown as Prisma.InputJsonValue } });
      return summary;
    }).catch((error) => { if (error instanceof SellerPromotionValidationError || error instanceof SellerPromotionConflictError || error instanceof SellerPromotionIdempotencyConflictError) throw error; if (error?.code === 'P2002') throw new SellerPromotionConflictError('VOUCHER_CODE_CONFLICT', 'Voucher code is already in use.'); throw new SellerPromotionUnavailableError(); });
  }

  async updateVoucher(userId: string, id: string, expectedVersion: number, input: SellerVoucherUpdateRequest): Promise<SellerVoucherSummary> {
    const shop = await this.shopFor(userId);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.voucher.findFirst({ where: { id, shopId: shop.id, issuer: 'SHOP' }, include: this.voucherInclude }); if (!current) throw new SellerPromotionNotFoundError(); if (current.version !== expectedVersion) throw new SellerPromotionStaleError(current.version); if (current.usedCount > 0 && ['code', 'benefitType', 'fixedAmountMinor', 'percentageBasisPoints', 'maximumDiscountMinor', 'minimumSpendMinor', 'productIds'].some((key) => Object.hasOwn(input, key))) throw new SellerPromotionConflictError('REDEEMED_FIELDS_IMMUTABLE', 'Redeemed voucher economics cannot be edited.');
      const startsAt = input.startsAt ? new Date(input.startsAt) : current.startsAt; const endsAt = input.endsAt ? new Date(input.endsAt) : current.endsAt; if (!(startsAt < endsAt)) throw new SellerPromotionValidationError(['startsAt', 'endsAt'], 'Start time must be before end time.'); const usageLimit = input.usageLimit ?? current.usageLimit; if (usageLimit < current.usedCount || usageLimit < 1) throw new SellerPromotionValidationError(['usageLimit'], 'Usage limit cannot be lower than already redeemed uses.');
      const productIds = input.productIds ?? current.productScopes.map((scope) => scope.productId); const products = await tx.product.findMany({ where: { id: { in: productIds }, shopId: shop.id, deletedAt: null }, select: { id: true } }); if (products.length !== productIds.length) throw new SellerPromotionValidationError(['productIds'], 'One or more product IDs are invalid for this shop.');
      const updated = await tx.voucher.updateMany({ where: { id, shopId: shop.id, issuer: 'SHOP', version: expectedVersion, usedCount: { lte: usageLimit } }, data: { ...(input.code === undefined ? {} : { code: input.code }), ...(input.name === undefined ? {} : { name: input.name }), ...(input.benefitType === undefined ? {} : { benefitType: input.benefitType }), ...(input.fixedAmountMinor === undefined ? {} : { fixedAmountMinor: input.fixedAmountMinor === null ? null : BigInt(input.fixedAmountMinor) }), ...(input.percentageBasisPoints === undefined ? {} : { percentageBasisPoints: input.percentageBasisPoints }), ...(input.maximumDiscountMinor === undefined ? {} : { maximumDiscountMinor: input.maximumDiscountMinor === null ? null : BigInt(input.maximumDiscountMinor) }), ...(input.minimumSpendMinor === undefined ? {} : { minimumSpendMinor: BigInt(input.minimumSpendMinor) }), startsAt, endsAt, usageLimit, ...(input.perBuyerLimit === undefined ? {} : { perBuyerLimit: input.perBuyerLimit }), version: { increment: 1 } } });
      if (updated.count !== 1) {
        const latest = await tx.voucher.findFirst({ where: { id, shopId: shop.id, issuer: 'SHOP' }, select: { version: true } });
        if (!latest) throw new SellerPromotionNotFoundError();
        throw new SellerPromotionStaleError(latest.version);
      }
      await tx.voucherProductScope.deleteMany({ where: { voucherId: id } });
      if (productIds.length) await tx.voucherProductScope.createMany({ data: productIds.map((productId) => ({ voucherId: id, productId })) });
      const saved = await tx.voucher.findFirst({ where: { id, shopId: shop.id, issuer: 'SHOP' }, include: this.voucherInclude });
      if (!saved) throw new SellerPromotionNotFoundError();
      return this.voucherSummary(saved, new Date());
    }).catch((error) => { if (error instanceof SellerPromotionNotFoundError || error instanceof SellerPromotionValidationError || error instanceof SellerPromotionConflictError || error instanceof SellerPromotionStaleError) throw error; if (error?.code === 'P2002') throw new SellerPromotionConflictError('VOUCHER_CODE_CONFLICT', 'Voucher code is already in use.'); throw new SellerPromotionUnavailableError(); });
  }

  async actionVoucher(userId: string, id: string, expectedVersion: number, action: SellerPromotionAction, idempotencyKey: string): Promise<SellerVoucherSummary> {
    const shop = await this.shopFor(userId); const digest = jsonDigest({ id, expectedVersion, action });
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.sellerPromotionCommand.findUnique({ where: { shopId_idempotencyKey: { shopId: shop.id, idempotencyKey } } }); if (existing) { if (existing.requestDigest !== digest) throw new SellerPromotionIdempotencyConflictError(); return existing.response as unknown as SellerVoucherSummary; }
      const current = await tx.voucher.findFirst({ where: { id, shopId: shop.id, issuer: 'SHOP' }, include: this.voucherInclude }); if (!current) throw new SellerPromotionNotFoundError(); if (current.version !== expectedVersion) throw new SellerPromotionStaleError(current.version); const state = voucherState(current, new Date());
      if (action === 'ARCHIVE') throw new SellerPromotionConflictError('INVALID_ACTION', 'Voucher archiving is no longer supported. Pause the voucher and delete it instead.');
      if (action === 'RESUME' && !['PAUSED', 'SCHEDULED'].includes(state)) throw new SellerPromotionConflictError('INVALID_ACTION'); if (action === 'PAUSE' && !['ACTIVE', 'SCHEDULED'].includes(state)) throw new SellerPromotionConflictError('INVALID_ACTION');
      const updated = await tx.voucher.update({ where: { id }, data: action === 'PAUSE' ? { archivedAt: null, isEnabled: false, version: { increment: 1 } } : { archivedAt: null, isEnabled: true, version: { increment: 1 } }, include: this.voucherInclude }); const summary = this.voucherSummary(updated, new Date()); await tx.sellerPromotionCommand.create({ data: { id: randomUUID(), shopId: shop.id, resource: 'VOUCHER', resourceId: id, idempotencyKey, requestDigest: digest, response: summary as unknown as Prisma.InputJsonValue } }); return summary;
    }).catch((error) => { if (error instanceof SellerPromotionNotFoundError || error instanceof SellerPromotionConflictError || error instanceof SellerPromotionStaleError || error instanceof SellerPromotionIdempotencyConflictError) throw error; throw new SellerPromotionUnavailableError(); });
  }

  async deleteVoucher(userId: string, id: string, expectedVersion: number): Promise<{ deleted: true }> {
    const shop = await this.shopFor(userId);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.voucher.findFirst({ where: { id, shopId: shop.id, issuer: 'SHOP' }, select: { id: true, version: true, isEnabled: true, usedCount: true } });
      if (!current) throw new SellerPromotionNotFoundError();
      if (current.version !== expectedVersion) throw new SellerPromotionStaleError(current.version);
      if (current.isEnabled) throw new SellerPromotionConflictError('PAUSED_REQUIRED', 'Only paused vouchers can be deleted.');
      const [userUsageCount, redemptionCount, purchaseSnapshotCount] = await Promise.all([
        tx.voucherUserUsage.count({ where: { voucherId: id } }),
        tx.voucherRedemption.count({ where: { voucherId: id } }),
        tx.purchaseVoucher.count({ where: { voucherId: id } }),
      ]);
      if (current.usedCount > 0 || userUsageCount > 0 || redemptionCount > 0 || purchaseSnapshotCount > 0) {
        throw new SellerPromotionConflictError('VOUCHER_IN_USE', 'This voucher has usage or order history and cannot be deleted.');
      }
      try {
        const deleted = await tx.voucher.deleteMany({ where: { id, shopId: shop.id, issuer: 'SHOP', version: expectedVersion, isEnabled: false } });
        if (deleted.count !== 1) {
          const latest = await tx.voucher.findFirst({ where: { id, shopId: shop.id, issuer: 'SHOP' }, select: { version: true, isEnabled: true } });
          if (!latest) throw new SellerPromotionNotFoundError();
          if (latest.version !== expectedVersion) throw new SellerPromotionStaleError(latest.version);
          throw new SellerPromotionConflictError('PAUSED_REQUIRED', 'Only paused vouchers can be deleted.');
        }
      } catch (error) {
        if ((error as { code?: string } | null)?.code === 'P2003') throw new SellerPromotionConflictError('VOUCHER_IN_USE', 'This voucher has usage or order history and cannot be deleted.');
        throw error;
      }
      return { deleted: true as const };
    }).catch((error) => {
      if (error instanceof SellerPromotionNotFoundError || error instanceof SellerPromotionConflictError || error instanceof SellerPromotionStaleError) throw error;
      throw new SellerPromotionUnavailableError();
    });
  }

  async listDiscounts(userId: string, filter: { state: SellerPromotionState | 'ALL'; limit: number; cursor: string | null }): Promise<SellerDiscountPage> {
    const shop = await this.shopFor(userId); const cursor = decodeCursor(filter.cursor); const now = await this.databaseNow(); const rows = await this.prisma.shopDiscountCampaign.findMany({ where: { shopId: shop.id, ...(filter.state === 'ARCHIVED' ? { archivedAt: { not: null } } : filter.state === 'PAUSED' ? { archivedAt: null, isEnabled: false } : filter.state === 'SCHEDULED' ? { archivedAt: null, isEnabled: true, startsAt: { gt: now } } : filter.state === 'EXPIRED' ? { archivedAt: null, isEnabled: true, endsAt: { lte: now } } : filter.state === 'ACTIVE' ? { archivedAt: null, isEnabled: true, startsAt: { lte: now }, endsAt: { gt: now } } : { archivedAt: null }), ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: filter.limit + 1, include: this.campaignInclude }); const items = rows.slice(0, filter.limit).map((row) => this.discountSummary(row, now)); const last = rows[filter.limit - 1]; return { sellerPromotionVersion: 'seller-promotions-v1', items, nextCursor: rows.length > filter.limit && last ? cursorFor(last.createdAt, last.id) : null };
  }

  async getDiscount(userId: string, id: string): Promise<SellerDiscountSummary> { const shop = await this.shopFor(userId); const row = await this.prisma.shopDiscountCampaign.findFirst({ where: { id, shopId: shop.id }, include: this.campaignInclude }); if (!row) throw new SellerPromotionNotFoundError(); return this.discountSummary(row, new Date()); }

  async updateDiscount(userId: string, id: string, expectedVersion: number, input: SellerDiscountUpdateRequest): Promise<SellerDiscountSummary> {
    const shop = await this.shopFor(userId);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.shopDiscountCampaign.findFirst({ where: { id, shopId: shop.id }, include: this.campaignInclude });
      if (!current) throw new SellerPromotionNotFoundError();
      if (current.version !== expectedVersion) throw new SellerPromotionStaleError(current.version);
      const now = await this.now(tx);
      const started = now >= current.startsAt;
      const immutableStarted = ['startsAt', 'products'].some((field) => Object.hasOwn(input, field));
      if (started && immutableStarted) throw new SellerPromotionConflictError('STARTED_FIELDS_IMMUTABLE', 'Started campaigns cannot change start time or products.');
      const startsAt = input.startsAt ? new Date(input.startsAt) : current.startsAt;
      const endsAt = input.endsAt ? new Date(input.endsAt) : current.endsAt;
      if (!(startsAt < endsAt) || endsAt <= now) throw new SellerPromotionValidationError(['startsAt', 'endsAt']);
      const products = input.products ?? current.products.map((product) => ({ productId: product.productId, discountBasisPoints: product.discountBasisPoints }));
      await this.lockProducts(tx, products.map((product) => product.productId));
      await this.validateCampaignProducts(tx, shop.id, products);
      if (!started) {
        const conflict = await tx.shopDiscountProduct.findFirst({
          where: {
            productId: { in: products.map((product) => product.productId) },
            campaign: { id: { not: id }, shopId: shop.id, isEnabled: true, archivedAt: null, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
          },
        });
        if (conflict) throw new SellerPromotionConflictError('DISCOUNT_OVERLAP');
      }
      const updated = await tx.shopDiscountCampaign.update({ where: { id }, data: { ...(input.name === undefined ? {} : { name: input.name }), startsAt, endsAt, products: { deleteMany: {}, create: products } , version: { increment: 1 } }, include: this.campaignInclude });
      return this.discountSummary(updated, now);
    }).catch((error) => {
      if (error instanceof SellerPromotionNotFoundError || error instanceof SellerPromotionValidationError || error instanceof SellerPromotionConflictError || error instanceof SellerPromotionStaleError) throw error;
      throw new SellerPromotionUnavailableError();
    });
  }

  private async validateCampaignProducts(tx: Prisma.TransactionClient, shopId: string, products: SellerDiscountCreateRequest['products']): Promise<void> { const rows = await tx.product.findMany({ where: { id: { in: products.map((product) => product.productId) }, shopId, deletedAt: null, status: 'ACTIVE', moderationStatus: 'ACTIVE' }, select: { id: true, variants: { where: { deletedAt: null, status: 'ACTIVE' }, select: { priceMinor: true, compareAtPriceMinor: true } } } }); if (rows.length !== products.length || rows.some((row) => row.variants.length === 0 || row.variants.some((variant) => variant.priceMinor <= 0n))) throw new SellerPromotionValidationError(['products']); }

  private async lockProducts(tx: Prisma.TransactionClient, productIds: readonly string[]): Promise<void> {
    for (const productId of [...new Set(productIds)].sort()) await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${productId}, 0))`);
  }

  async createDiscount(userId: string, input: SellerDiscountCreateRequest, idempotencyKey: string): Promise<SellerDiscountSummary> {
    const shop = await this.shopFor(userId); const digest = jsonDigest(input); return this.prisma.$transaction(async (tx) => { const existing = await tx.sellerPromotionCommand.findUnique({ where: { shopId_idempotencyKey: { shopId: shop.id, idempotencyKey } } }); if (existing) { if (existing.requestDigest !== digest) throw new SellerPromotionIdempotencyConflictError(); return existing.response as unknown as SellerDiscountSummary; } await this.lockProducts(tx, input.products.map((product) => product.productId)); await this.validateCampaignProducts(tx, shop.id, input.products); const conflict = await tx.shopDiscountProduct.findFirst({ where: { productId: { in: input.products.map((product) => product.productId) }, campaign: { shopId: shop.id, isEnabled: true, archivedAt: null, startsAt: { lt: new Date(input.endsAt) }, endsAt: { gt: new Date(input.startsAt) } } } }); if (conflict) throw new SellerPromotionConflictError('DISCOUNT_OVERLAP'); const campaign = await tx.shopDiscountCampaign.create({ data: { id: randomUUID(), shopId: shop.id, name: input.name, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), products: { create: input.products } }, include: this.campaignInclude }); const summary = this.discountSummary(campaign, new Date()); await tx.sellerPromotionCommand.create({ data: { id: randomUUID(), shopId: shop.id, resource: 'DISCOUNT', resourceId: campaign.id, idempotencyKey, requestDigest: digest, response: summary as unknown as Prisma.InputJsonValue } }); return summary; }).catch((error) => { if (error instanceof SellerPromotionValidationError || error instanceof SellerPromotionConflictError || error instanceof SellerPromotionIdempotencyConflictError) throw error; throw new SellerPromotionUnavailableError(); });
  }

  async actionDiscount(userId: string, id: string, expectedVersion: number, action: SellerPromotionAction, idempotencyKey: string): Promise<SellerDiscountSummary> {
    const shop = await this.shopFor(userId); const digest = jsonDigest({ id, expectedVersion, action });
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.sellerPromotionCommand.findUnique({ where: { shopId_idempotencyKey: { shopId: shop.id, idempotencyKey } } });
      if (existing) { if (existing.requestDigest !== digest) throw new SellerPromotionIdempotencyConflictError(); return existing.response as unknown as SellerDiscountSummary; }
      const current = await tx.shopDiscountCampaign.findFirst({ where: { id, shopId: shop.id }, include: this.campaignInclude });
      if (!current) throw new SellerPromotionNotFoundError();
      if (current.version !== expectedVersion) throw new SellerPromotionStaleError(current.version);
      const now = await this.now(tx); const state = campaignState(current, now);
      if (action === 'RESUME' && state !== 'PAUSED') throw new SellerPromotionConflictError('INVALID_ACTION');
      if (action === 'PAUSE' && !['ACTIVE', 'SCHEDULED'].includes(state)) throw new SellerPromotionConflictError('INVALID_ACTION');
      if (action === 'RESUME') {
        await this.lockProducts(tx, current.products.map((product) => product.productId));
        const conflict = await tx.shopDiscountProduct.findFirst({ where: { productId: { in: current.products.map((product) => product.productId) }, campaign: { id: { not: id }, shopId: shop.id, isEnabled: true, archivedAt: null, startsAt: { lt: current.endsAt }, endsAt: { gt: current.startsAt } } } });
        if (conflict) throw new SellerPromotionConflictError('DISCOUNT_OVERLAP');
      }
      const updated = await tx.shopDiscountCampaign.update({ where: { id }, data: action === 'ARCHIVE' ? { archivedAt: now, isEnabled: false, version: { increment: 1 } } : action === 'PAUSE' ? { isEnabled: false, version: { increment: 1 } } : { isEnabled: true, version: { increment: 1 } }, include: this.campaignInclude });
      const summary = this.discountSummary(updated, now);
      await tx.sellerPromotionCommand.create({ data: { id: randomUUID(), shopId: shop.id, resource: 'DISCOUNT', resourceId: id, idempotencyKey, requestDigest: digest, response: summary as unknown as Prisma.InputJsonValue } });
      return summary;
    }).catch((error) => { if (error instanceof SellerPromotionNotFoundError || error instanceof SellerPromotionConflictError || error instanceof SellerPromotionStaleError || error instanceof SellerPromotionIdempotencyConflictError) throw error; throw new SellerPromotionUnavailableError(); });
  }
}
