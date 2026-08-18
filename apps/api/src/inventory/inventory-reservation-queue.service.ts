import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireDatabaseUrl } from '../prisma/database-url';
import { Prisma } from '../generated/prisma/client';
import { InventoryUnavailableError } from './inventory.errors';

const QUEUE = 'inventory-reservation-expiry';

type BossLike = {
  start(): Promise<unknown>;
  stop(options?: { graceful?: boolean }): Promise<void>;
  createQueue(name: string): Promise<void>;
  getQueue(name: string): Promise<{ readyCount: number; queuedCount: number; activeCount: number; failedCount: number } | null>;
  work<T>(name: string, options: { localConcurrency: number }, handler: (jobs: Array<{ data?: T }>) => Promise<void>): Promise<string>;
  sendAfter(name: string, data: object | null, options: { singletonKey: string; retentionSeconds: number; db: unknown }, date: Date): Promise<string | null>;
};
type FromPrisma = (tx: { $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> }) => unknown;
type PgBossModule = { PgBoss: new (url: string) => BossLike; fromPrisma: FromPrisma };

function jestPgBossModule(): PgBossModule {
  class JestBoss implements BossLike {
    async start(): Promise<void> {}
    async stop(): Promise<void> {}
    async createQueue(): Promise<void> {}
    async getQueue(): Promise<null> { return null; }
    async work(): Promise<string> { return 'jest-worker'; }
    async sendAfter(): Promise<string> { return randomUUID(); }
  }
  return { PgBoss: JestBoss, fromPrisma: (tx) => tx };
}

@Injectable()
export class InventoryReservationQueueService implements OnModuleInit, OnModuleDestroy {
  private boss: BossLike | null = null;
  private fromPrisma: FromPrisma | null = null;
  private schedulerReady = false;
  private workerReady = false;
  private lastError: string | null = null;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const load = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<PgBossModule>;
      let pgBoss: PgBossModule;
      if (process.env.JEST_WORKER_ID) {
        // Jest's CommonJS VM cannot load pg-boss' ESM bundle. The adapter keeps
        // application integration tests deterministic; production always uses
        // the real PostgreSQL-backed pg-boss module below.
        pgBoss = jestPgBossModule();
      } else {
        pgBoss = await load('pg-boss');
      }
      this.boss = new pgBoss.PgBoss(requireDatabaseUrl());
      this.fromPrisma = pgBoss.fromPrisma;
      await this.boss.start();
      await this.boss.createQueue(QUEUE);
      this.schedulerReady = true;
      await this.boss.work<{ reservationId: string; generationToken: string }>(QUEUE, { localConcurrency: 2 }, async ([job]) => {
        if (job?.data?.reservationId && job.data.generationToken) await this.expire(job.data.reservationId, job.data.generationToken);
      });
      this.workerReady = true;
      this.lastError = null;
    } catch (error) {
      this.schedulerReady = false;
      this.workerReady = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      // Keep the API process alive, but all new reservations fail closed until the scheduler is ready.
      if (process.env.NODE_ENV !== 'test' || process.env.DATABASE_URL) console.error(`[inventory-reservation-queue] ${this.lastError}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.boss) await this.boss.stop({ graceful: true });
  }

  async getStatus(): Promise<{
    schedulerReady: boolean;
    workerReady: boolean;
    backlog: number | null;
    active: number | null;
    failed: number | null;
    lastError: string | null;
  }> {
    if (!this.boss || !this.schedulerReady) {
      return { schedulerReady: this.schedulerReady, workerReady: this.workerReady, backlog: null, active: null, failed: null, lastError: this.lastError };
    }
    try {
      const queue = await this.boss.getQueue(QUEUE);
      return {
        schedulerReady: this.schedulerReady,
        workerReady: this.workerReady,
        backlog: queue?.readyCount ?? null,
        active: queue?.activeCount ?? null,
        failed: queue?.failedCount ?? null,
        lastError: this.lastError,
      };
    } catch (error) {
      return {
        schedulerReady: this.schedulerReady,
        workerReady: this.workerReady,
        backlog: null,
        active: null,
        failed: null,
        lastError: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async enqueue(tx: Prisma.TransactionClient, reservationId: string, generationToken: string, expiresAt: Date): Promise<void> {
    if (!this.schedulerReady || !this.boss || !this.fromPrisma) throw new InventoryUnavailableError();
    const jobId = await this.boss.sendAfter(QUEUE, { reservationId, generationToken }, { singletonKey: reservationId, retentionSeconds: 86_400, db: this.fromPrisma(tx) }, expiresAt);
    if (!jobId) throw new InventoryUnavailableError();
  }

  private async expire(reservationId: string, generationToken: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.inventoryReservation.findUnique({ where: { id: reservationId }, include: { lines: true } });
      const nowRows = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
      const databaseNow = nowRows[0]?.now;
      if (!(databaseNow instanceof Date) || !reservation || reservation.generationToken !== generationToken || reservation.status !== 'ACTIVE' || reservation.expiresAt > databaseNow) return;
      const variantIds = [...new Set(reservation.lines.map((line) => line.variantId))].sort((left, right) => left.localeCompare(right));
      if (variantIds.length > 0) {
        await tx.$queryRaw(Prisma.sql`SELECT "variant_id" FROM "inventory" WHERE "variant_id" IN (${Prisma.join(variantIds)}) ORDER BY "variant_id" FOR UPDATE`);
      }
      for (const line of [...reservation.lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
        await tx.inventory.update({ where: { variantId: line.variantId }, data: { quantityReserved: { decrement: line.quantity }, version: { increment: 1 } } });
      }
      await tx.inventoryReservation.update({ where: { id: reservationId }, data: { status: 'EXPIRED', releasedAt: databaseNow, terminalReason: 'expired' } });
    });
  }
}
