import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('COD checkout persistence', () => {
  const schema = readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    path.join(process.cwd(), 'prisma/migrations/20260814080000_cod_checkout_orders/migration.sql'),
    'utf8',
  );

  it('models the normalized purchase graph and immutable snapshots', () => {
    for (const model of [
      'model Purchase {',
      'model ShopOrder {',
      'model OrderLine {',
      'model PurchaseVoucher {',
      'model PurchaseVoucherAllocation {',
    ]) {
      expect(schema).toContain(model);
    }
    expect(migration).toContain('"address_snapshot" JSONB NOT NULL');
    expect(migration).toContain('"shop_snapshot" JSONB NOT NULL');
    expect(migration).toContain('"shipping_snapshot" JSONB NOT NULL');
  });

  it('enforces idempotency, per-shop splitting, and graph uniqueness', () => {
    expect(migration).toContain('purchases_buyer_id_idempotency_key_key');
    expect(migration).toContain('shop_orders_purchase_id_shop_id_key');
    expect(migration).toContain('order_lines_order_id_source_cart_line_id_key');
    expect(migration).toContain('purchase_vouchers_purchase_id_voucher_id_key');
    expect(migration).toContain('purchase_voucher_allocations_business_key');
  });

  it('checks safe VND equations and allocation shapes in PostgreSQL', () => {
    expect(migration).toContain('purchases_amounts_check');
    expect(migration).toContain('shop_orders_amounts_check');
    expect(migration).toContain('order_lines_amounts_check');
    expect(migration).toContain('purchase_vouchers_amounts_check');
    expect(migration).toContain('purchase_voucher_allocations_shape_check');
    expect(migration).toContain('9007199254740991');
  });

  it('keeps source records and historical data behind restrictive relations', () => {
    expect(migration).toContain('REFERENCES "purchases"("id") ON DELETE RESTRICT');
    expect(migration).toContain('REFERENCES "shop_orders"("id") ON DELETE RESTRICT');
    expect(migration).toContain('REFERENCES "products"("id") ON DELETE RESTRICT');
    expect(migration).toContain('REFERENCES "product_variants"("id") ON DELETE RESTRICT');
    expect(migration).toContain('voucher_consumptions_purchase_reference_fkey');
  });
});
