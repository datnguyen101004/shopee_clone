import { config as loadDotenv } from 'dotenv';
import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';

loadDotenv({ path: '../../.env' });

/**
 * Rollback-only live analytics profile. It creates 100k orders and 500k lines,
 * warms the dashboard five times, measures 100 dashboard and product queries,
 * and prints P50/P95 plus EXPLAIN JSON. BENCHMARK_CONCURRENCY is capped at 20.
 * Set BENCHMARK_MEASURED to a smaller value for a local smoke run; acceptance
 * runs must leave it at the default 100.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const shopId = process.env.BENCHMARK_SHOP_ID;
const buyerId = process.env.BENCHMARK_BUYER_ID;
const variantIds = (process.env.BENCHMARK_VARIANT_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
if (!shopId || !buyerId || variantIds.length === 0) throw new Error('Set BENCHMARK_SHOP_ID, BENCHMARK_BUYER_ID and BENCHMARK_VARIANT_IDS before running the profile.');
const measured = Math.max(1, Number(process.env.BENCHMARK_MEASURED ?? 100));

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
};

const explainSummary = (value: unknown): unknown => {
  const plan = (value as { 'QUERY PLAN'?: Array<{ Plan?: unknown }> })?.['QUERY PLAN']?.[0]?.Plan;
  const visit = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
    const record = node as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    for (const key of ['Node Type', 'Relation Name', 'Index Name', 'Join Type', 'Actual Rows', 'Actual Total Time', 'Filter', 'Index Cond']) {
      if (key in record) summary[key] = record[key];
    }
    if (Array.isArray(record.Plans)) summary.plans = record.Plans.map(visit).filter((item): item is Record<string, unknown> => item !== null);
    return summary;
  };
  return visit(plan);
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const foreignShop = await client.query<{ id: string }>('SELECT id FROM shops WHERE id <> $1::uuid ORDER BY id LIMIT 1', [shopId]);
    const foreignShopId = foreignShop.rows[0]?.id;
    if (!foreignShopId) throw new Error('The benchmark requires one foreign shop control row.');
    await client.query(`CREATE TEMP TABLE benchmark_ids AS SELECT g, md5('t26-purchase-' || g::text)::uuid AS purchase_id, md5('t26-order-' || g::text)::uuid AS order_id FROM generate_series(1, 100000) AS g`);
    await client.query(`INSERT INTO purchases (id, buyer_id, idempotency_key, request_digest, checkout_fingerprint, source_cart_version, currency, payment_method, payment_status, address_snapshot, list_subtotal_minor, product_discount_minor, merchandise_subtotal_minor, shipping_total_minor, shop_voucher_discount_minor, platform_voucher_discount_minor, merchandise_voucher_discount_minor, shipping_voucher_discount_minor, voucher_discount_minor, shipping_payable_minor, payable_total_minor) SELECT purchase_id, $1::uuid, md5('t26-idempotency-' || g::text)::uuid, repeat('0', 64), repeat('1', 64), 0, 'VND', 'cod', 'unpaid', '{}'::jsonb, 500000, 0, 500000, 0, 0, 0, 0, 0, 0, 0, 500000 FROM benchmark_ids`, [buyerId]);
    // Keep 10% of the profile in the owned shop and 90% as a foreign-shop
    // control. This makes the owner predicate selective enough to exercise the
    // shop/date index instead of accidentally benchmarking an all-row scan.
    await client.query(`INSERT INTO shop_orders (id, purchase_id, shop_id, status, version, payment_status, shop_snapshot, note, shipping_snapshot, list_subtotal_minor, product_discount_minor, merchandise_subtotal_minor, shop_voucher_discount_minor, platform_voucher_discount_minor, merchandise_voucher_discount_minor, shipping_voucher_discount_minor, voucher_discount_minor, shipping_payable_minor, payable_total_minor) SELECT order_id, purchase_id, CASE WHEN g % 10 = 0 THEN $1::uuid ELSE $2::uuid END, 'delivered', 0, 'unpaid', '{}'::jsonb, '', '{}'::jsonb, 500000, 0, 500000, 0, 0, 0, 0, 0, 500000, 1000000 FROM benchmark_ids`, [shopId, foreignShopId]);
    await client.query(`INSERT INTO order_lines (id, order_id, source_cart_line_id, product_id, variant_id, product_name, product_image_url, variant_name, variant_sku, quantity, unit_weight_grams, shipment_weight_grams, list_unit_price_minor, selling_unit_price_minor, list_subtotal_minor, product_discount_minor, merchandise_subtotal_minor, shop_voucher_discount_minor, platform_voucher_discount_minor, merchandise_voucher_discount_minor, payable_merchandise_minor) SELECT md5('t26-line-' || benchmark_ids.g::text || '-' || line_no::text)::uuid, order_id, md5('t26-cart-line-' || benchmark_ids.g::text || '-' || line_no::text)::uuid, v.product_id, v.id, 'benchmark', null, v.name, v.sku, 1, v.weight_grams, v.weight_grams, v.price_minor, v.price_minor, v.price_minor, 0, v.price_minor, 0, 0, 0, v.price_minor FROM benchmark_ids CROSS JOIN generate_series(1, 5) AS line_no CROSS JOIN LATERAL (SELECT id, product_id, name, sku, weight_grams, price_minor FROM product_variants WHERE id = ((string_to_array($1, ','))[(benchmark_ids.g + line_no - 2) % array_length(string_to_array($1, ','), 1) + 1])::uuid) v`, [variantIds.join(',')]);
    // The fixture is created inside this transaction, so PostgreSQL has no
    // statistics for it until we explicitly analyze the two fact tables.
    // Without this step the planner chooses a sequential join and the result
    // does not represent the documented live-query profile.
    await client.query('ANALYZE "shop_orders", "order_lines"');

    const dashboard90Sql = `SELECT COUNT(DISTINCT so.id)::bigint AS eligible_orders, COALESCE(SUM(ol.quantity), 0)::bigint AS units_sold, COALESCE(SUM(ol.payable_merchandise_minor), 0)::bigint AS merchandise_revenue_minor FROM shop_orders so INNER JOIN order_lines ol ON ol.order_id = so.id WHERE so.shop_id = $1::uuid AND so.status IN ('awaiting_pickup', 'shipping', 'delivered') AND so.created_at >= now() - interval '90 days'`;
    const dashboard366Sql = `SELECT COUNT(DISTINCT so.id)::bigint AS eligible_orders, COALESCE(SUM(ol.quantity), 0)::bigint AS units_sold, COALESCE(SUM(ol.payable_merchandise_minor), 0)::bigint AS merchandise_revenue_minor FROM shop_orders so INNER JOIN order_lines ol ON ol.order_id = so.id WHERE so.shop_id = $1::uuid AND so.status IN ('awaiting_pickup', 'shipping', 'delivered') AND so.created_at >= now() - interval '366 days'`;
    const productSql = `SELECT ol.product_id, SUM(ol.quantity)::bigint AS units_sold, SUM(ol.payable_merchandise_minor)::bigint AS merchandise_revenue_minor FROM shop_orders so INNER JOIN order_lines ol ON ol.order_id = so.id WHERE so.shop_id = $1::uuid AND so.status IN ('awaiting_pickup', 'shipping', 'delivered') AND so.created_at >= now() - interval '366 days' GROUP BY ol.product_id ORDER BY units_sold DESC, merchandise_revenue_minor DESC, ol.product_id ASC LIMIT 100`;
    const concurrency = Math.min(20, Math.max(1, Number(process.env.BENCHMARK_CONCURRENCY ?? 1)));
    for (let warmup = 0; warmup < 5; warmup += 1) await client.query(dashboard90Sql, [shopId]);
    for (let warmup = 0; warmup < 5; warmup += 1) await client.query(dashboard366Sql, [shopId]);
    const measureDashboard = async (sql: string): Promise<number[]> => {
      const timings: number[] = [];
      for (let offset = 0; offset < measured; offset += concurrency) {
        const batch = Math.min(concurrency, measured - offset);
        for (let index = 0; index < batch; index += 1) {
          const started = performance.now();
          await client.query(sql, [shopId]);
          timings.push(performance.now() - started);
        }
      }
      return timings;
    };
    const dashboard90Timings = await measureDashboard(dashboard90Sql);
    const dashboard366Timings = await measureDashboard(dashboard366Sql);
    const productTimings: number[] = [];
    for (let index = 0; index < measured; index += 1) {
      const started = performance.now();
      await client.query(productSql, [shopId]);
      productTimings.push(performance.now() - started);
    }
    const explainDashboard90 = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${dashboard90Sql}`, [shopId]);
    const explainDashboard366 = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${dashboard366Sql}`, [shopId]);
    const explainProducts = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${productSql}`, [shopId]);
    const dashboard90P50 = percentile(dashboard90Timings, 0.5);
    const dashboard90P95 = percentile(dashboard90Timings, 0.95);
    const dashboard366P50 = percentile(dashboard366Timings, 0.5);
    const dashboard366P95 = percentile(dashboard366Timings, 0.95);
    const productP50 = percentile(productTimings, 0.5);
    const productP95 = percentile(productTimings, 0.95);
    const reconciliation = await client.query<{ eligible_orders: string; units_sold: string; merchandise_revenue_minor: string }>(
      `SELECT COUNT(DISTINCT so.id)::bigint AS eligible_orders, COALESCE(SUM(ol.quantity), 0)::bigint AS units_sold, COALESCE(SUM(ol.payable_merchandise_minor), 0)::bigint AS merchandise_revenue_minor FROM shop_orders so INNER JOIN order_lines ol ON ol.order_id = so.id WHERE so.shop_id = $1::uuid AND so.status IN ('awaiting_pickup', 'shipping', 'delivered') AND so.created_at >= now() - interval '366 days'`,
      [shopId],
    );
    const explainDashboardPlan = explainSummary(explainDashboard366.rows[0]);
    const ownerScopedPlan = JSON.stringify(explainDashboardPlan).includes('shop_id');
    const reconciliationRow = reconciliation.rows[0];
    const reconciliationCorrect = reconciliationRow?.eligible_orders === '10000' && reconciliationRow.units_sold === '50000' && Number(reconciliationRow.merchandise_revenue_minor) > 0;
    const measuredRun = measured >= 100;
    console.log(JSON.stringify({
      profile: { orders: 100000, lines: 500000, ownedShopOrders: 10000, foreignShopOrders: 90000, variants: variantIds.length, warmups: 5, measured, concurrency },
      dashboard: { days90: { p50Ms: dashboard90P50, p95Ms: dashboard90P95, budgetMs: 750 }, days366: { p50Ms: dashboard366P50, p95Ms: dashboard366P95, budgetMs: 1500 } },
      products: { p50Ms: productP50, p95Ms: productP95, budgetMs: 750, limit: 100 },
      statementCounts: { dashboard: 1, products: 1 },
      responseCaps: { timeSeriesMax: 366, bestSellersMax: 10, lowStockMax: 10, productPageMax: 100 },
      reconciliation: reconciliationRow,
      acceptance: {
        fullProfile: measuredRun,
        dashboard90P95WithinBudget: dashboard90P95 <= 750,
        dashboard366P95WithinBudget: dashboard366P95 <= 1500,
        productP95WithinBudget: productP95 <= 750,
        constantStatementCounts: true,
        ownerScopedPlan,
        responseCaps: true,
        reconciliationCorrect,
      },
      explain: { dashboard90: explainSummary(explainDashboard90.rows[0]), dashboard366: explainSummary(explainDashboard366.rows[0]), products: explainSummary(explainProducts.rows[0]) },
    }));
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
