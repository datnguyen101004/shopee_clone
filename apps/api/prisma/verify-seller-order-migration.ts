import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';

loadRepositoryEnvironment();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
  try {
    const counts = await pool.query<{ orders: string; fulfillments: string; events: string }>(`
      SELECT (SELECT count(*) FROM shop_orders)::text AS orders,
             (SELECT count(*) FROM seller_order_fulfillments)::text AS fulfillments,
             (SELECT count(*) FROM seller_order_fulfillment_events)::text AS events`);
    const row = counts.rows[0]!;
    assert.equal(row.orders, row.fulfillments, 'every shop order must have one fulfillment aggregate');
    assert(Number(row.events) >= Number(row.fulfillments), 'fulfillment events cannot be fewer than aggregates');
    const versionZero = await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM seller_order_fulfillment_events WHERE fulfillment_version = 0`);
    assert.equal(versionZero.rows[0]!.count, row.fulfillments, 'every aggregate must retain exactly one version-0 event');

    const incompatible = await pool.query(`
      SELECT so.id
      FROM shop_orders so
      JOIN seller_order_fulfillments f ON f.order_id = so.id
      WHERE (so.status = 'pending_confirmation' AND f.state NOT IN ('pending_confirmation','rejected','cancelled'))
         OR (so.status = 'awaiting_pickup' AND f.state NOT IN ('confirmed','preparing','ready_for_pickup'))
         OR (so.status IN ('shipping','delivered','return_requested','returned','refunded') AND f.state <> 'handed_off')
         OR (so.status = 'cancelled' AND f.state NOT IN ('cancelled','rejected'))`);
    assert.equal(incompatible.rowCount, 0, 'fulfillment state must remain compatible with coarse lifecycle state');

    const invalidEvents = await pool.query(`
      SELECT e.id FROM seller_order_fulfillment_events e
      LEFT JOIN seller_order_fulfillments f ON f.order_id = e.order_id
      WHERE e.fulfillment_version = 0 AND (e.actor_type <> 'system' OR e.previous_state IS NOT NULL OR e.idempotency_key IS NOT NULL OR e.request_digest IS NOT NULL)
         OR f.order_id IS NULL`);
    assert.equal(invalidEvents.rowCount, 0, 'backfill event must be an immutable system version-0 event');

    const indexes = await pool.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND (indexname LIKE 'seller_order_%' OR indexname LIKE 'inventory_adjustments_order_cancellation%')`);
    assert(indexes.rows.length >= 10, 'seller order lookup and uniqueness indexes must exist');
    console.log(JSON.stringify({ shopOrders: Number(row.orders), fulfillments: Number(row.fulfillments), events: Number(row.events), indexes: indexes.rows.map((item) => item.indexname).sort() }));
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
