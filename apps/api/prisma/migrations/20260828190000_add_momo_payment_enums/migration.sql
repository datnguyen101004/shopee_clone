-- Add sandbox payment enum values in a dedicated migration. PostgreSQL requires
-- newly-added values to be committed before a later migration can use them.
CREATE TYPE "payment_provider" AS ENUM ('momo');
CREATE TYPE "payment_environment" AS ENUM ('sandbox');
CREATE TYPE "payment_event_source" AS ENUM ('create', 'ipn', 'query', 'refund');
CREATE TYPE "payment_event_decision" AS ENUM ('applied', 'ignored', 'duplicate', 'mismatch');
CREATE TYPE "payment_refund_status" AS ENUM (
  'pending',
  'pending_reconciliation',
  'unknown',
  'succeeded',
  'failed'
);

ALTER TYPE "purchase_payment_method" ADD VALUE IF NOT EXISTS 'momo';
ALTER TYPE "purchase_payment_status" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "purchase_payment_status" ADD VALUE IF NOT EXISTS 'pending_reconciliation';
ALTER TYPE "purchase_payment_status" ADD VALUE IF NOT EXISTS 'unknown';
ALTER TYPE "purchase_payment_status" ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE "purchase_payment_status" ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE "purchase_payment_status" ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE "purchase_payment_status" ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE "purchase_payment_status" ADD VALUE IF NOT EXISTS 'refund_pending';
ALTER TYPE "purchase_payment_status" ADD VALUE IF NOT EXISTS 'partially_refunded';
ALTER TYPE "purchase_payment_status" ADD VALUE IF NOT EXISTS 'refunded';
