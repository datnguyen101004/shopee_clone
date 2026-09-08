import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { FlashSaleService } from './flash-sale.service';

/**
 * Delivers durable Flash Sale state changes after the PostgreSQL transaction.
 * Delivery is idempotent because Redis receives the current absolute quota and
 * epoch; an old event can never increment a newer state.
 */
@Injectable()
export class FlashSaleOutboxProcessor {
  private readonly logger = new Logger(FlashSaleOutboxProcessor.name);
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(RedisCacheService) private readonly redis: RedisCacheService, @Inject(FlashSaleService) private readonly flashSales: FlashSaleService) {}

  @Interval(15_000)
  async prewarmUpcoming(): Promise<void> {
    try {
      const now = new Date();
      const campaigns = await this.prisma.marketplaceCampaign.findMany({ where: { startsAt: { gt: now, lte: new Date(now.getTime() + 120_000) }, endsAt: { gt: now }, cancelledAt: null, type: { code: 'FLASH_SALE' } }, select: { id: true }, take: 20 });
      for (const campaign of campaigns) await this.flashSales.publicStatus(campaign.id);
    } catch (error) { this.logger.debug(`Flash Sale prewarm deferred: ${error instanceof Error ? error.message : String(error)}`); }
  }

  @Interval(2_500)
  async dispatch(): Promise<void> {
    if (this.running) return;
    if (!this.redis.isReady()) return;
    this.running = true;
    try {
      const events = await this.prisma.flashSaleOutbox.findMany({
        where: { processedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
        include: { flashSaleSku: { select: { id: true, campaignId: true, remainingQuantity: true, version: true, managementEpoch: true } } },
      });
      for (const event of events) {
        const sku = event.flashSaleSku;
        if (event.managementEpoch >= sku.managementEpoch && event.sequence <= sku.version) {
          await this.redis.setValue(`flash-sale:admission:sku:${sku.id}`, String(sku.remainingQuantity), 86_400_000);
          await this.redis.setValue(`flash-sale:admission:epoch:${sku.id}`, String(sku.managementEpoch), 86_400_000);
          await this.redis.setJson(`flash-sale:public:event:${sku.id}`, { eventId: event.eventId, sequence: event.sequence, managementEpoch: event.managementEpoch, authoritativeAt: Date.now(), snapshot: event.publicSnapshot }, 86_400_000);
          await this.redis.delByPrefix(`flash-sale:status:${sku.campaignId}:`);
        }
        await this.prisma.flashSaleOutbox.updateMany({ where: { id: event.id, processedAt: null }, data: { processedAt: new Date() } });
      }
    } catch (error) {
      this.logger.warn(`Flash Sale outbox delivery deferred: ${error instanceof Error ? error.message : String(error)}`);
    } finally { this.running = false; }
  }
}
