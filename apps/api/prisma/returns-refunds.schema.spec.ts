import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('returns, refunds, and disputes persistence', () => {
  const schema = readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    path.join(
      process.cwd(),
      'prisma/migrations/20260821140000_returns_refunds_disputes/migration.sql',
    ),
    'utf8',
  );

  it('models one restrictive return aggregate with immutable child history', () => {
    for (const model of [
      'ReturnRequest',
      'ReturnRequestItem',
      'ReturnEvent',
      'ReturnEvidenceAsset',
      'ReturnShipment',
      'ReturnDecision',
      'RefundLedgerEntry',
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
    expect(schema).toMatch(/orderId\s+String\s+@unique/);
    expect(schema).toContain('@@unique([returnRequestId, version])');
    expect(schema).toContain('@@unique([returnRequestId, idempotencyKey])');
    expect(schema).toContain('@@unique([returnRequestId, orderLineId])');
    expect(schema).toContain('@@unique([returnRequestId, sortOrder])');
    expect(schema).toContain('returnRequestId String           @unique');
    expect(migration).toContain('CREATE TABLE "return_requests"');
    expect(migration).toContain('CREATE TABLE "refund_ledger_entries"');
    expect(migration).toContain('ON DELETE RESTRICT');
  });

  it('persists domain constraints and query paths without synthetic data', () => {
    for (const value of [
      'return_requests_description_check',
      'return_request_items_quantity_check',
      'return_events_actor_identity_check',
      'return_evidence_assets_state_shape_check',
      'return_decisions_action_check',
      'refund_ledger_entries_currency_amount_check',
      'return_requests_buyer_updated_id_idx',
      'return_requests_shop_updated_id_idx',
      'return_requests_seller_deadline_status_idx',
      'return_evidence_assets_state_expiry_idx',
      'privileged_audit_events_return_decision_id_fkey',
    ]) {
      expect(migration).toContain(value);
    }
    expect(migration).not.toMatch(/INSERT\s+INTO\s+"return_/i);
    expect(migration).not.toMatch(/UPDATE\s+"(?:shop_orders|purchases)"/i);
  });

  it('keeps generated client mappings aligned with the additive migration', () => {
    expect(schema).toContain('enum ReturnStatus');
    expect(schema).toContain('model ReturnRequest');
    expect(schema).toContain('returnDecisionId');
    expect(migration).toContain('CREATE TYPE "return_status"');
    expect(migration).toContain('ALTER TABLE "privileged_audit_events"');
    expect(migration).toContain('return_decision_id');
  });
});

