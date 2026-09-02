-- Record authenticated VNPAY ReturnUrl settlements separately from server-to-server IPN events.
ALTER TYPE "payment_event_source" ADD VALUE IF NOT EXISTS 'return';
