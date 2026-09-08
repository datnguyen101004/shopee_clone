import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  FlashSaleEndRequest,
  FlashSalePublicSkuStatus,
  FlashSaleQuotaRequest,
  FlashSaleRegisterRequest,
  FlashSaleReplenishRequest,
  FlashSaleSellerSnapshot,
  FlashSaleSellerSkuRow,
  FlashSaleSkuState,
  FlashSaleStatusResponse,
} from '@shopee-clone/contracts';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { SellerShopScopeService } from '../seller-scope/seller-shop-scope.service';
import {
  FlashSaleConflictError,
  FlashSaleNotFoundError,
  FlashSaleStaleError,
  FlashSaleValidationError,
} from './marketplace-campaigns.errors';

const FLASH_SALE = 'FLASH_SALE';
const PUBLIC_CACHE_TTL_MS = 750;
const PUBLIC_CACHE_MAX_AGE_MS = 2_000;
const PUBLIC_CACHE_MAX_ENTRIES = 1_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function asNumber(value: bigint | number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new FlashSaleValidationError(['quantity'], 'Flash Sale quantity is outside safe numeric bounds.');
  return result;
}
function stateOf(row: { remainingQuantity: number; endedAt: Date | null; campaign: { startsAt: Date; endsAt: Date; cancelledAt: Date | null } }, now: Date): FlashSaleSkuState {
  if (row.endedAt || row.campaign.cancelledAt || now.getTime() >= row.campaign.endsAt.getTime()) return 'ENDED';
  if (now.getTime() < row.campaign.startsAt.getTime()) return 'UPCOMING';
  return row.remainingQuantity > 0 ? 'ACTIVE' : 'SOLD_OUT';
}

type SkuRow = Prisma.FlashSaleSkuGetPayload<{ include: { campaign: true; variant: { include: { inventory: true } }; product: true } }>;
type PublicPayload = { startsAt: string; endsAt: string; items: FlashSalePublicSkuStatus[] };
type PublicCacheRecord = { payload: PublicPayload; authoritativeAt: number; maxStateVersion: number };

@Injectable()
export class FlashSaleService {
  private readonly localPublicCache = new Map<string, { expiresAt: number; record: PublicCacheRecord }>();
  private readonly publicFills = new Map<string, Promise<PublicCacheRecord>>();
  private publicFillCount = 0;

  private cacheLocally(key: string, record: PublicCacheRecord): void {
    const existing = this.localPublicCache.get(key);
    if (existing && existing.record.maxStateVersion > record.maxStateVersion) return;
    this.localPublicCache.delete(key);
    this.localPublicCache.set(key, { expiresAt: Math.min(Date.now() + PUBLIC_CACHE_TTL_MS, record.authoritativeAt + PUBLIC_CACHE_MAX_AGE_MS), record });
    while (this.localPublicCache.size > PUBLIC_CACHE_MAX_ENTRIES) this.localPublicCache.delete(this.localPublicCache.keys().next().value!);
  }

  private async invalidatePublicCache(campaignId: string): Promise<void> {
    for (const key of [...this.localPublicCache.keys()]) if (key.startsWith(`flash-sale:status:${campaignId}:`)) this.localPublicCache.delete(key);
    await this.cache.delByPrefix(`flash-sale:status:${campaignId}:`);
  }

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SellerShopScopeService) private readonly sellerScope: SellerShopScopeService,
    @Inject(RedisCacheService) private readonly cache: RedisCacheService,
  ) {}

  private skuFeatureEnabled(): boolean { return process.env.FLASH_SALE_SKU_ENABLED !== 'false'; }

  private assertSkuFeatureEnabled(): void {
    if (!this.skuFeatureEnabled()) throw new FlashSaleConflictError('FLASH_SALE_DISABLED', 'SKU Flash Sale is disabled by configuration.', 503, 30);
  }

  private async requireShop(userId: string): Promise<string> { return (await this.sellerScope.resolve(userId)).id; }

  private assertVersion(actual: number, expected: number): void {
    if (actual !== expected) throw new FlashSaleStaleError(actual);
  }

  private assertUuid(value: string, field: string): void {
    if (!uuidPattern.test(value)) throw new FlashSaleValidationError([field]);
  }

  private assertCampaign(campaign: { type: { code: string }; cancelledAt: Date | null; startsAt: Date; endsAt: Date; minimumDiscountBasisPoints: number }): void {
    if (campaign.type.code !== FLASH_SALE) throw new FlashSaleValidationError(['campaignId'], 'The campaign is not a Flash Sale campaign.');
    if (campaign.cancelledAt) throw new FlashSaleConflictError('FLASH_SALE_ENDED', 'The campaign has been cancelled.');
  }

  private available(inventory: { quantityOnHand: number; quantityReserved: number } | null): number {
    return Math.max(0, (inventory?.quantityOnHand ?? 0) - (inventory?.quantityReserved ?? 0));
  }

  private snapshot(row: SkuRow, now = new Date(), includePrivate = false): FlashSaleSellerSkuRow {
    const state = stateOf(row, now);
    return {
      id: row.id,
      campaignId: row.campaignId,
      participationId: row.participationId,
      productId: row.productId,
      variantId: row.variantId,
      referencePriceMinor: asNumber(row.referencePriceMinor),
      salePriceMinor: asNumber(row.salePriceMinor),
      allocatedQuantity: row.allocatedQuantity,
      remainingQuantity: includePrivate ? row.remainingQuantity : null,
      state,
      stateVersion: row.version,
      managementEpoch: row.managementEpoch,
      startsAt: row.campaign.startsAt.toISOString(),
      endsAt: row.campaign.endsAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      canPurchase: state === 'ACTIVE' && row.remainingQuantity > 0,
      allowedPaymentMethods: state === 'ACTIVE' ? ['COD'] : [],
      sku: row.variant.sku,
      variantName: row.variant.name,
      stockAvailable: this.available(row.variant.inventory),
    };
  }

  private async sellerRows(shopId: string, campaignId: string, tx: PrismaService | Prisma.TransactionClient = this.prisma): Promise<SkuRow[]> {
    return tx.flashSaleSku.findMany({
      where: { campaignId, participation: { shopId } },
      include: { campaign: true, variant: { include: { inventory: true } }, product: true },
      orderBy: [{ productId: 'asc' }, { variantId: 'asc' }],
    });
  }

  async sellerSnapshot(userId: string, campaignId: string): Promise<FlashSaleSellerSnapshot> {
    this.assertUuid(campaignId, 'campaignId');
    const shopId = await this.requireShop(userId);
    const rows = await this.sellerRows(shopId, campaignId);
    if (!rows.length) {
      const campaign = await this.prisma.marketplaceCampaign.findUnique({ where: { id: campaignId }, include: { type: true } });
      if (!campaign) throw new FlashSaleNotFoundError();
      this.assertCampaign(campaign);
    }
    const campaign = rows[0]?.campaign ?? await this.prisma.marketplaceCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    return { campaignId, version: campaign.version, items: rows.map((row) => this.snapshot(row, new Date(), true)) };
  }

  async register(userId: string, campaignId: string, input: FlashSaleRegisterRequest, idempotencyKey?: string): Promise<FlashSaleSellerSnapshot> {
    this.assertSkuFeatureEnabled();
    this.assertUuid(campaignId, 'campaignId');
    if (!idempotencyKey || !uuidPattern.test(idempotencyKey)) throw new FlashSaleValidationError(['idempotencyKey'], 'A UUID idempotency key is required.');
    if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) throw new FlashSaleValidationError(['items']);
    const shopId = await this.requireShop(userId);
    const requestDigest = digest(input);
    const replay = await this.prisma.marketplaceCampaignCommand.findUnique({ where: { actorUserId_idempotencyKey: { actorUserId: userId, idempotencyKey } } });
    if (replay) {
      if (replay.requestDigest !== requestDigest) throw new FlashSaleConflictError('IDEMPOTENCY_CONFLICT', 'Idempotency key was used for different input.');
      return replay.response as unknown as FlashSaleSellerSnapshot;
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.marketplaceCampaign.findUnique({ where: { id: campaignId }, include: { type: true, participations: { where: { shopId } } } });
      if (!campaign) throw new FlashSaleNotFoundError();
      this.assertCampaign(campaign);
      this.assertVersion(campaign.version, input.version);
      const now = new Date();
      if (now >= campaign.startsAt) throw new FlashSaleConflictError('FLASH_SALE_QUOTA_LOCKED', 'SKU registration is closed after the campaign starts.');
      const participation = campaign.participations[0];
      if (!participation || participation.state !== 'JOINED') throw new FlashSaleConflictError('CAMPAIGN_FORBIDDEN', 'Seller must join the campaign first.');
      const variantIds = input.items.map((item) => item.variantId);
      if (new Set(variantIds).size !== variantIds.length || variantIds.some((id) => !uuidPattern.test(id))) throw new FlashSaleValidationError(['items.variantId']);
      const existing = await tx.flashSaleSku.findMany({ where: { campaignId, variantId: { in: variantIds } }, select: { variantId: true } });
      if (existing.length) throw new FlashSaleConflictError('FLASH_SALE_DUPLICATE_SKU', 'One or more variants already participate in this campaign.');
      const variants = await tx.productVariant.findMany({ where: { id: { in: variantIds }, product: { shopId, deletedAt: null }, status: 'ACTIVE', deletedAt: null }, include: { inventory: true, product: true } });
      if (variants.length !== variantIds.length) throw new FlashSaleValidationError(['items.variantId'], 'One or more variants are not owned or sellable.');
      const competing = await tx.flashSaleSku.findMany({
        where: { variantId: { in: variantIds }, campaignId: { not: campaignId }, endedAt: null, campaign: { cancelledAt: null, startsAt: { lt: campaign.endsAt }, endsAt: { gt: campaign.startsAt } } },
        select: { variantId: true, remainingQuantity: true },
      });
      const competingByVariant = new Map<string, number>();
      for (const row of competing) competingByVariant.set(row.variantId, (competingByVariant.get(row.variantId) ?? 0) + row.remainingQuantity);
      const productIds = new Set(variants.map((variant) => variant.productId));
      if (competing.length) throw new FlashSaleConflictError('FLASH_SALE_DUPLICATE_SKU', 'A variant cannot participate in overlapping Flash Sale campaigns.');
      const existingProducts = await tx.flashSaleSku.count({ where: { campaignId, participationId: participation.id, productId: { in: [...productIds] } } });
      if (existingProducts + productIds.size > 20) throw new FlashSaleConflictError('FLASH_SALE_PRODUCT_LIMIT', 'A seller may enroll at most 20 distinct products.');
      for (const item of input.items) {
        const variant = variants.find((candidate) => candidate.id === item.variantId)!;
        const available = this.available(variant.inventory);
        const otherQuota = competingByVariant.get(item.variantId) ?? 0;
        if (!Number.isSafeInteger(item.quota) || item.quota < 1 || item.quota + otherQuota > available) throw new FlashSaleConflictError('FLASH_SALE_STOCK_INSUFFICIENT', 'Quota exceeds available physical stock.');
        if (!Number.isSafeInteger(item.salePriceMinor) || item.salePriceMinor < 1) throw new FlashSaleValidationError(['items.salePriceMinor']);
        const reference = Number(variant.priceMinor);
        const discount = Math.floor(((reference - item.salePriceMinor) * 10_000) / reference);
        if (item.salePriceMinor >= reference || discount < campaign.minimumDiscountBasisPoints) throw new FlashSaleValidationError(['items.salePriceMinor'], 'Sale price does not satisfy campaign discount policy.');
      }
      for (const item of input.items) {
        const variant = variants.find((candidate) => candidate.id === item.variantId)!;
        const created = await tx.flashSaleSku.create({ data: { id: randomUUID(), campaignId, participationId: participation.id, productId: variant.productId, variantId: variant.id, referencePriceMinor: variant.priceMinor, salePriceMinor: BigInt(item.salePriceMinor), allocatedQuantity: item.quota, remainingQuantity: item.quota } });
        await tx.flashSaleOutbox.create({ data: { id: randomUUID(), eventId: randomUUID(), flashSaleSkuId: created.id, sequence: 1, managementEpoch: created.managementEpoch, admissionDelta: item.quota, publicSnapshot: { state: 'UPCOMING', stateVersion: created.version, salePriceMinor: item.salePriceMinor } } });
      }
      const rows = await this.sellerRows(shopId, campaignId, tx);
      const response: FlashSaleSellerSnapshot = { campaignId, version: campaign.version, items: rows.map((row) => this.snapshot(row, now, true)) };
      await tx.marketplaceCampaignCommand.create({ data: { id: randomUUID(), actorUserId: userId, campaignId, scope: 'FLASH_SALE_REGISTER', idempotencyKey, requestDigest, response: response as unknown as Prisma.InputJsonValue } });
      return response;
    });
    for (const item of result.items) {
      if (input.items.some((candidate) => candidate.variantId === item.variantId)) {
        await this.cache.setValue(`flash-sale:admission:sku:${item.id}`, String(item.remainingQuantity ?? 0));
        await this.cache.setValue(`flash-sale:admission:epoch:${item.id}`, String(item.managementEpoch), 86_400_000);
      }
    }
    await this.invalidatePublicCache(campaignId);
    return result;
  }

  async updateQuota(userId: string, campaignId: string, variantId: string, input: FlashSaleQuotaRequest): Promise<FlashSaleSellerSnapshot> {
    this.assertSkuFeatureEnabled();
    const result = await this.mutateQuota(userId, campaignId, variantId, input.version, async (tx, row) => {
      const now = new Date();
      if (now >= row.campaign.startsAt || row.endedAt) throw new FlashSaleConflictError('FLASH_SALE_QUOTA_LOCKED', 'Quota can only be edited before the campaign starts.');
      const competing = await tx.flashSaleSku.findMany({ where: { variantId: row.variantId, id: { not: row.id }, endedAt: null, campaign: { cancelledAt: null, startsAt: { lt: row.campaign.endsAt }, endsAt: { gt: row.campaign.startsAt } } }, select: { remainingQuantity: true } });
      const otherQuota = competing.reduce((total, item) => total + item.remainingQuantity, 0);
      if (!Number.isSafeInteger(input.quota) || input.quota < 1 || input.quota + otherQuota > this.available(row.variant.inventory)) throw new FlashSaleConflictError('FLASH_SALE_STOCK_INSUFFICIENT', 'Quota exceeds available physical stock.');
      return tx.flashSaleSku.update({ where: { id: row.id }, data: { allocatedQuantity: input.quota, remainingQuantity: input.quota, version: { increment: 1 }, managementEpoch: { increment: 1 } } });
    });
    const item = result.items.find((candidate) => candidate.variantId === variantId);
    if (item) { await this.cache.setValue(`flash-sale:admission:sku:${item.id}`, String(item.remainingQuantity ?? 0)); await this.cache.setValue(`flash-sale:admission:epoch:${item.id}`, String(item.managementEpoch), 86_400_000); }
    await this.invalidatePublicCache(campaignId);
    return result;
  }

  async replenish(userId: string, campaignId: string, variantId: string, input: FlashSaleReplenishRequest): Promise<FlashSaleSellerSnapshot> {
    this.assertSkuFeatureEnabled();
    const result = await this.mutateQuota(userId, campaignId, variantId, input.version, async (tx, row) => {
      const now = new Date();
      if (stateOf(row, now) !== 'SOLD_OUT') throw new FlashSaleConflictError('FLASH_SALE_QUOTA_LOCKED', 'Only an ongoing sold-out SKU can be replenished.');
      const competing = await tx.flashSaleSku.findMany({ where: { variantId: row.variantId, id: { not: row.id }, endedAt: null, campaign: { cancelledAt: null, startsAt: { lt: row.campaign.endsAt }, endsAt: { gt: row.campaign.startsAt } } }, select: { remainingQuantity: true } });
      const otherQuota = competing.reduce((total, item) => total + item.remainingQuantity, 0);
      if (!Number.isSafeInteger(input.additionalQuantity) || input.additionalQuantity < 1 || input.additionalQuantity + otherQuota > this.available(row.variant.inventory)) throw new FlashSaleConflictError('FLASH_SALE_STOCK_INSUFFICIENT', 'Additional quota exceeds available physical stock.');
      return tx.flashSaleSku.update({ where: { id: row.id }, data: { allocatedQuantity: { increment: input.additionalQuantity }, remainingQuantity: { increment: input.additionalQuantity }, version: { increment: 1 }, managementEpoch: { increment: 1 } } });
    });
    const item = result.items.find((candidate) => candidate.variantId === variantId);
    if (item) { await this.cache.incrementValue(`flash-sale:admission:sku:${item.id}`, input.additionalQuantity); await this.cache.setValue(`flash-sale:admission:epoch:${item.id}`, String(item.managementEpoch), 86_400_000); }
    await this.invalidatePublicCache(campaignId);
    return result;
  }

  async end(userId: string, campaignId: string, variantId: string, input: FlashSaleEndRequest): Promise<FlashSaleSellerSnapshot> {
    this.assertSkuFeatureEnabled();
    const result = await this.mutateQuota(userId, campaignId, variantId, input.version, async (tx, row) => {
      if (stateOf(row, new Date()) !== 'SOLD_OUT') throw new FlashSaleConflictError('FLASH_SALE_QUOTA_LOCKED', 'Only an ongoing sold-out SKU can be ended.');
      return tx.flashSaleSku.update({ where: { id: row.id }, data: { endedAt: new Date(), endedReason: 'SELLER_ENDED', version: { increment: 1 }, managementEpoch: { increment: 1 } } });
    });
    const item = result.items.find((candidate) => candidate.variantId === variantId);
    if (item) await this.cache.setValue(`flash-sale:admission:epoch:${item.id}`, String(item.managementEpoch), 86_400_000);
    await this.invalidatePublicCache(campaignId);
    return result;
  }

  private async mutateQuota(userId: string, campaignId: string, variantId: string, version: number, mutate: (tx: Prisma.TransactionClient, row: SkuRow) => Promise<unknown>): Promise<FlashSaleSellerSnapshot> {
    this.assertUuid(campaignId, 'campaignId'); this.assertUuid(variantId, 'variantId');
    const shopId = await this.requireShop(userId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.flashSaleSku.findFirst({ where: { campaignId, variantId, participation: { shopId } }, include: { campaign: true, variant: { include: { inventory: true } }, product: true } });
      if (!row) throw new FlashSaleNotFoundError();
      this.assertVersion(row.version, version);
      await mutate(tx, row);
      const updated = await tx.flashSaleSku.findUniqueOrThrow({ where: { id: row.id }, include: { campaign: true, variant: { include: { inventory: true } }, product: true } });
      const nextSequence = updated.version;
      await tx.flashSaleOutbox.create({ data: { id: randomUUID(), eventId: randomUUID(), flashSaleSkuId: updated.id, sequence: nextSequence, managementEpoch: updated.managementEpoch, admissionDelta: updated.remainingQuantity - row.remainingQuantity, publicSnapshot: { state: stateOf(updated, new Date()), stateVersion: updated.version, salePriceMinor: asNumber(updated.salePriceMinor) } } });
      const rows = await this.sellerRows(shopId, campaignId, tx);
      return { campaignId, version: updated.campaign.version, items: rows.map((item) => this.snapshot(item, new Date(), true)) };
    });
  }

  async publicStatus(campaignId: string, variantIds?: readonly string[]): Promise<FlashSaleStatusResponse> {
    this.assertUuid(campaignId, 'campaignId');
    if (!this.skuFeatureEnabled()) {
      const campaign = await this.prisma.marketplaceCampaign.findUnique({ where: { id: campaignId }, select: { startsAt: true, endsAt: true } });
      if (!campaign) throw new FlashSaleNotFoundError();
      return { contractVersion: 'flash-sale-v1', campaignId, serverTime: new Date().toISOString(), startsAt: campaign.startsAt.toISOString(), endsAt: campaign.endsAt.toISOString(), items: [] };
    }
    const statusBudget = await this.cache.consumeRateLimit(`flash-sale:status-rate:${campaignId}`, 240, 1_000);
    if (!statusBudget.allowed) throw new FlashSaleConflictError('FLASH_SALE_BUSY', 'Flash Sale status is temporarily rate limited.', 429, statusBudget.retryAfterSeconds || 1);
    const ids = [...new Set(variantIds ?? [])];
    if (ids.length > 50 || ids.some((id) => !uuidPattern.test(id))) throw new FlashSaleValidationError(['variantIds']);
    const cacheKey = `flash-sale:status:${campaignId}:${ids.slice().sort().join(',') || '*'}`;
    const local = this.localPublicCache.get(cacheKey);
    if (local && local.expiresAt > Date.now() && Date.now() - local.record.authoritativeAt <= PUBLIC_CACHE_MAX_AGE_MS) return { contractVersion: 'flash-sale-v1', campaignId, serverTime: new Date().toISOString(), ...local.record.payload };
    this.localPublicCache.delete(cacheKey);
    const cached = await this.cache.getJson<PublicCacheRecord | PublicPayload>(cacheKey);
    if (cached) {
      const record: PublicCacheRecord = 'payload' in cached ? cached : { payload: cached, authoritativeAt: Date.now(), maxStateVersion: Math.max(0, ...cached.items.map((item) => item.stateVersion)) };
      if (Date.now() - record.authoritativeAt <= PUBLIC_CACHE_MAX_AGE_MS) {
        this.cacheLocally(cacheKey, record);
        return { contractVersion: 'flash-sale-v1', campaignId, serverTime: new Date().toISOString(), ...record.payload };
      }
    }
    const existingFill = this.publicFills.get(cacheKey);
    if (existingFill) {
      const record = await existingFill;
      return { contractVersion: 'flash-sale-v1', campaignId, serverTime: new Date().toISOString(), ...record.payload };
    }
    const leaseKey = `flash-sale:fill-lease:${cacheKey}`;
    if (this.publicFillCount >= 8) throw new FlashSaleConflictError('FLASH_SALE_BUSY', 'Flash Sale status is temporarily busy.');
    const leaseOwner = randomUUID();
    const leaseAcquired = await this.cache.setNxValue(leaseKey, leaseOwner, 1_500);
    if (!leaseAcquired && this.cache.isReady()) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      const retry = await this.cache.getJson<PublicCacheRecord>(cacheKey);
      if (retry && Date.now() - retry.authoritativeAt <= PUBLIC_CACHE_MAX_AGE_MS) {
        this.cacheLocally(cacheKey, retry);
        return { contractVersion: 'flash-sale-v1', campaignId, serverTime: new Date().toISOString(), ...retry.payload };
      }
    }
    this.publicFillCount += 1;
    const fill = (async () => {
      const campaign = await this.prisma.marketplaceCampaign.findUnique({ where: { id: campaignId }, include: { type: true } });
      if (!campaign) throw new FlashSaleNotFoundError();
      if (campaign.type.code !== FLASH_SALE) throw new FlashSaleValidationError(['campaignId'], 'The campaign is not a Flash Sale campaign.');
      const rows = await this.prisma.flashSaleSku.findMany({ where: { campaignId, ...(ids.length ? { variantId: { in: ids } } : {}) }, include: { campaign: true } });
      const now = new Date();
      const items: FlashSalePublicSkuStatus[] = rows.map((row) => { const state = stateOf(row, now); return { variantId: row.variantId, productId: row.productId, state, stateVersion: row.version, salePriceMinor: state === 'ACTIVE' ? asNumber(row.salePriceMinor) : null, canPurchase: state === 'ACTIVE' && row.remainingQuantity > 0, startsAt: row.campaign.startsAt.toISOString(), endsAt: row.campaign.endsAt.toISOString() }; });
      const payload: PublicPayload = { startsAt: campaign.startsAt.toISOString(), endsAt: campaign.endsAt.toISOString(), items };
      const record: PublicCacheRecord = { payload, authoritativeAt: Date.now(), maxStateVersion: Math.max(0, ...items.map((item) => item.stateVersion)) };
      this.cacheLocally(cacheKey, record);
      const previous = await this.cache.getJson<PublicCacheRecord>(cacheKey);
      if (!previous || previous.maxStateVersion <= record.maxStateVersion) await this.cache.setJson(cacheKey, record, Math.min(PUBLIC_CACHE_MAX_AGE_MS, Math.max(1, campaign.endsAt.getTime() - now.getTime())));
      return record;
    })();
    this.publicFills.set(cacheKey, fill);
    try {
      const record = await fill;
      return { contractVersion: 'flash-sale-v1', campaignId, serverTime: new Date().toISOString(), ...record.payload };
    } finally {
      if (this.publicFills.get(cacheKey) === fill) this.publicFills.delete(cacheKey);
      this.publicFillCount = Math.max(0, this.publicFillCount - 1);
      if (leaseAcquired) await this.cache.del(leaseKey);
    }
  }
}
