import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('moderation and reporting migration persistence', () => {
  const migration = readFileSync(
    path.join(
      process.cwd(),
      'prisma/migrations/20260821100000_product_shop_moderation_reporting/migration.sql',
    ),
    'utf8',
  );

  it('declares enum extensions and new domain enums', () => {
    expect(migration).toContain(`ALTER TYPE "privileged_target_type" ADD VALUE IF NOT EXISTS 'review'`);
    expect(migration).toContain(`ALTER TYPE "privileged_target_type" ADD VALUE IF NOT EXISTS 'moderation_case'`);
    expect(migration).toContain(`ALTER TYPE "privileged_action" ADD VALUE IF NOT EXISTS 'hide'`);
    expect(migration).toContain(`ALTER TYPE "privileged_action" ADD VALUE IF NOT EXISTS 'no_action'`);
    expect(migration).toContain(`CREATE TYPE "report_target_type" AS ENUM ('product', 'shop')`);
    expect(migration).toContain(`CREATE TYPE "report_status" AS ENUM ('submitted', 'reviewed')`);
    expect(migration).toContain(`CREATE TYPE "moderation_case_status" AS ENUM ('open', 'in_review', 'resolved')`);
    expect(migration).toContain(`CREATE TYPE "moderation_case_outcome" AS ENUM ('no_action', 'suspend_target', 'restore_target')`);
  });

  it('enforces exactly-one-target constraints on cases and reports', () => {
    expect(migration).toContain('moderation_cases_target_type_check');
    expect(migration).toContain('"target_type" = \'product\' AND "product_id" IS NOT NULL AND "shop_id" IS NULL');
    expect(migration).toContain('"target_type" = \'shop\' AND "shop_id" IS NOT NULL AND "product_id" IS NULL');
    expect(migration).toContain('user_reports_target_type_check');
  });

  it('creates partial unique indexes for active cases and unresolved reports', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "moderation_cases_active_product_unique_idx"');
    expect(migration).toContain('WHERE "status" != \'resolved\'');
    expect(migration).toContain('CREATE UNIQUE INDEX "moderation_cases_active_shop_unique_idx"');
    expect(migration).toContain('CREATE UNIQUE INDEX "user_reports_active_reporter_product_unique_idx"');
    expect(migration).toContain('WHERE "status" = \'submitted\'');
    expect(migration).toContain('CREATE UNIQUE INDEX "user_reports_active_reporter_shop_unique_idx"');
  });

  it('enforces character length checks and HTTPS evidence reference checks', () => {
    expect(migration).toContain('user_reports_details_length_check');
    expect(migration).toContain('char_length(trim("details")) >= 20 AND char_length("details") <= 1000');
    expect(migration).toContain('report_evidence_references_url_https_check');
    expect(migration).toContain('"url" LIKE \'https://%\'');
    expect(migration).toContain('moderation_decisions_public_reason_length_check');
    expect(migration).toContain('seller_moderation_notices_reason_length_check');
  });

  it('adds correlation columns to privileged audit events', () => {
    expect(migration).toContain('ALTER TABLE "privileged_audit_events"');
    expect(migration).toContain('ADD COLUMN "decision_id" UUID');
    expect(migration).toContain('ADD COLUMN "review_moderation_event_id" UUID');
    expect(migration).toContain('REFERENCES "moderation_decisions"("id")');
    expect(migration).toContain('REFERENCES "review_moderation_events"("id")');
  });
});
