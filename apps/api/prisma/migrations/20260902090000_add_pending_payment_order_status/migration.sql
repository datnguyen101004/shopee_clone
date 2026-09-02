-- Add the canonical buyer/seller gate for VNPAY orders.
ALTER TYPE "shop_order_status" ADD VALUE IF NOT EXISTS 'pending_payment';
