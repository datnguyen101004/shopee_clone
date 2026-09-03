# Returns, refunds, and disputes

T29 supports one private return case for each delivered shop order. The server is authoritative: the buyer may create a case through seven days after committed delivery; a seller has 48 hours to respond; the buyer has five days to submit the mock shipment; and the seller has seven days to confirm receipt. A command remains valid at its exact deadline and is expired immediately after it.

States are `REQUESTED`, `AWAITING_RETURN`, `IN_TRANSIT`, `ESCALATED`, `CANCELLED`, `EXPIRED`, `REJECTED`, and `REFUNDED`. Buyers cancel or submit shipment; sellers accept, escalate, or confirm receipt; administrators resolve only escalated cases with approve-return, approve-refund, or reject. Terminal cancellation, expiry, and rejection restore the shop order to `DELIVERED`; receipt records `RETURNED` then `REFUNDED`.

Refunds are `MOCK_CREDIT` outcomes only. The server derives each selected line from its persisted payable merchandise snapshot, using floor prorating for partial quantity and an exact amount for the full quantity. Shipping is not refunded, no voucher or purchase snapshot changes, and no automatic restock occurs.

All mutations require the current `If-Match` ETag and a UUID `Idempotency-Key`. Evidence is JPEG, PNG, or WebP only, limited to 5 MiB and 8000 pixels per dimension; it is staged for 24 hours, then attached once to a case. Evidence is accessible only to its buyer, the owning shop, and an authenticated administrator. Its opaque storage key is never returned by an API.

The rerunnable bounded operational commands are:

- `pnpm returns:deadlines` to escalate/expire overdue cases.
- `pnpm returns:evidence:cleanup` to remove expired unattached evidence.

Both commands report JSON counts and can be invoked in local development or CI; this change intentionally adds no scheduler dependency. Real payment-provider refunds, carrier labels, appeals, chargebacks, and inventory restocking remain integration seams for later work.
