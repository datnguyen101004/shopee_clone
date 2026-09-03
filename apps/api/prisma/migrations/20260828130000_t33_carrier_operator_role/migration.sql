-- T33 adds a local-only role for the Demo Carrier operations portal.
-- This is additive: existing buyer, seller, and admin assignments are unchanged.
ALTER TYPE "marketplace_role" ADD VALUE IF NOT EXISTS 'carrier_operator';
