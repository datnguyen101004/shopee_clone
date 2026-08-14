import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('order lifecycle persistence', () => {
  const schema = readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    path.join(
      process.cwd(),
      'prisma/migrations/20260814120000_order_lifecycle_tracking/migration.sql',
    ),
    'utf8',
  );

  it('models all states, version, actor, and immutable events', () => {
    for (const state of [
      'AWAITING_PICKUP',
      'SHIPPING',
      'DELIVERED',
      'CANCELLED',
      'RETURN_REQUESTED',
      'RETURNED',
      'REFUNDED',
    ]) {
      expect(schema).toContain(state);
    }
    expect(schema).toContain('model OrderTimelineEvent {');
    expect(schema).toContain('version                         Int');
    expect(migration).toContain('CREATE TYPE "order_timeline_actor"');
  });

  it('enforces version, actor, reason, idempotency, and restrictive relations', () => {
    expect(migration).toContain('shop_orders_version_check');
    expect(migration).toContain('order_timeline_events_actor_check');
    expect(migration).toContain('order_timeline_events_reason_check');
    expect(migration).toContain('order_timeline_events_idempotency_check');
    expect(migration).toContain('order_timeline_events_order_id_order_version_key');
    expect(migration).toContain('order_timeline_events_order_id_idempotency_key_key');
    expect(migration).toContain('REFERENCES "shop_orders"("id") ON DELETE RESTRICT');
    expect(migration).toContain('REFERENCES "users"("id") ON DELETE RESTRICT');
  });

  it('backfills one deterministic version-zero creation event without changing orders', () => {
    expect(migration).toContain("NULL, 'ORDER_CREATED', NULL, NULL, NULL");
    expect(migration).toContain('ON CONFLICT ("order_id", "order_version") DO NOTHING');
    expect(migration).not.toContain('UPDATE "shop_orders"');
  });
});
