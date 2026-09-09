# T35 admission relinquishment POC

- Run: `admission-100x40-20260909-151947`
- Status: **PASS**
- Started: 2026-09-09T08:19:47.126Z
- Finished: 2026-09-09T08:20:18.713Z

## Scenario

100 authenticated buyers join concurrently; one SKU starts at quota 10; admission pool target is 40; 6 waves release 10 admitted buyers every 2s; 10 final buyers compete for 5 remaining units with confirmation concurrency target 5.

The final contenders are the ten most recently admitted live buyers (they may span the last two grant observations). PostgreSQL reconciliation uses this run's 100 buyer IDs; historical global claims/orders in the test database are shown only as baseline context.

## Dependency status

| Dependency | Required | Available | Detail |
| --- | ---: | ---: | --- |
| api | yes | yes | Public API health endpoint responded successfully. |
| redis | yes | yes | PING/PONG |
| postgres | yes | yes | SELECT 1 |
| localstack | yes | yes | LocalStack health endpoint responded. |
| fixture | yes | yes |  |
| sku | yes | yes | Initial SKU snapshot captured. |
| redisState | yes | yes | activeLeases=0, pendingReleases=0 |

## Service-down matrix

| Service | Availability | Correctness | Recovery |
| --- | --- | --- | --- |
| api | AVAILABLE | NOT_RUN | NOT_RUN |
| redis | AVAILABLE | NOT_RUN | NOT_RUN |
| postgres | AVAILABLE | NOT_RUN | NOT_RUN |
| localstack | AVAILABLE | NOT_RUN | NOT_RUN |

## Architecture fault-tolerance assessment

> This section is an architecture analysis, not a fault-injection measurement.

| Service down | Availability impact | Safety behavior | Recovery path |
| --- | --- | --- | --- |
| SQS | New queue delivery pauses. Existing admitted leases and in-flight checkout remain usable, but WAITING tickets may not progress through the Lambda delivery path until SQS recovers. | Redis ticket/idempotency state prevents duplicate grants when SQS redelivers duplicate or previously invisible messages. | SQS Standard redelivers unacknowledged messages after visibility timeout; recovery is bounded by visibility/backoff and message retention, not polling. |
| Lambda | SQS can retain ticket messages, but the Lambda grant consumer stops. Existing admitted buyers can still preview/confirm while new WAITING tickets accumulate. | No process-local token fallback is introduced; duplicate invocation remains fenced by Redis ticket state. | Queued messages are retried when Lambda is available again. Expiry/page-leave reapers also call grantWaiting immediately after reclaiming capacity, but cannot replace initial message delivery indefinitely. |
| Redis | Admission join/status/token validation, lease accounting and confirmation-slot admission fail closed; Flash Sale checkout availability is interrupted. | PostgreSQL remains the durable order/quota authority, so the system does not grant unverified purchases or knowingly oversell. | Automatic Redis cache-loss rebuilding/reconciliation is explicitly deferred in this POC. Redis is therefore the highest-availability-risk dependency. |
| PostgreSQL | Tickets and leases may still exist in Redis, but order creation and durable quota/claim persistence stop. | Checkout fails instead of treating Redis admission as a purchase guarantee; owned provisional attempts are compensated only after a definitive rollback. | Database recovery is outside this POC; idempotency/result lookup must resolve any ambiguous commit before retry compensation. |

## Phase summary

| Phase | Duration ms | Details |
| --- | ---: | --- |
| preflight | 487 | {"api":{"required":true,"available":true,"reachable":true,"status":200,"latencyMs":433,"detail":"Public API health endpoint responded successfully."},"redis":{"required":true,"available":true,"detail":"PING/PONG"},"postgres":{"required":true,"available":true,"detail":"SELECT 1"},"localstack":{"required":true,"available":true,"status":200,"detail":"LocalStack health endpoint responded."},"fixture":{"required":true,"available":true,"users":100},"sku":{"required":true,"available":true,"detail":"Initial SKU snapshot captured.","remainingQuantity":10,"expectedRemainingQuantity":10},"redisState":{"required":true,"available":true,"detail":"activeLeases=0, pendingReleases=0"}} |
| join-100 | 799 | {"buyers":100,"http200":100,"admitted":0,"waiting":100,"errors":0} |
| initial-admission-snapshot | 0 | {"capturedAt":"2026-09-09T08:19:54.059Z","postgres":{"available":true,"sku":{"id":"00000000-0000-4000-8000-000000000941","campaignId":"00000000-0000-4000-8000-000000000914","variantId":"cbc97eff-fe53-580a-a0fa-5e336366728b","allocatedQuantity":10,"remainingQuantity":10,"netConsumedQuantity":0,"version":34},"globalClaims":16,"globalActiveConsumptions":0,"globalOrders":16,"runClaims":0,"runActiveConsumptions":0,"runOrders":0},"redis":{"available":true,"activeLeases":40,"pendingReleases":0,"confirmationSlotsAvailable":null,"skuRemainingAdmission":null}} |
| seed-confirmation | 4172 | {"buyers":5,"targetSuccessful":5,"successful":5,"busy":2,"conflict":0,"soldOut":0,"attempts":[{"attempt":1,"buyers":[1,2,4,5,11],"successful":3,"busy":2,"conflict":0,"soldOut":0,"responses":[{"status":201,"type":null,"code":null,"detail":null},{"status":201,"type":null,"code":null,"detail":null},{"status":429,"type":"https://shopee-clone.local/problems/flash-sale-busy","code":"FLASH_SALE_BUSY","detail":"Flash Sale confirmation capacity is temporarily full"},{"status":201,"type":null,"code":null,"detail":null},{"status":429,"type":"https://shopee-clone.local/problems/flash-sale-busy","code":"FLASH_SALE_BUSY","detail":"Flash Sale confirmation capacity is temporarily full"}],"slotSamples":{"count":31,"minAvailable":0,"maxAvailable":5}},{"attempt":2,"buyers":[4,11],"successful":2,"busy":0,"conflict":0,"soldOut":0,"responses":[{"status":201,"type":null,"code":null,"detail":null},{"status":201,"type":null,"code":null,"detail":null}],"slotSamples":{"count":27,"minAvailable":3,"maxAvailable":5}}]} |
| relinquish-wave-1 | 456 | {"targets":[11,12,14,16,19,2,7,13,15,17],"relinquished":10,"everAdmitted":55,"expectedEverAdmitted":55,"snapshot":{"capturedAt":"2026-09-09T08:20:01.298Z","postgres":{"available":true,"sku":{"id":"00000000-0000-4000-8000-000000000941","campaignId":"00000000-0000-4000-8000-000000000914","variantId":"cbc97eff-fe53-580a-a0fa-5e336366728b","allocatedQuantity":10,"remainingQuantity":5,"netConsumedQuantity":5,"version":39},"globalClaims":21,"globalActiveConsumptions":5,"globalOrders":21,"runClaims":null,"runActiveConsumptions":null,"runOrders":null},"redis":{"available":true,"activeLeases":40,"pendingReleases":0,"confirmationSlotsAvailable":5,"skuRemainingAdmission":5}}} |
| relinquish-wave-2 | 425 | {"targets":[18,23,22,25,26,5,20,21,24,6],"relinquished":10,"everAdmitted":65,"expectedEverAdmitted":65,"snapshot":{"capturedAt":"2026-09-09T08:20:04.024Z","postgres":{"available":true,"sku":{"id":"00000000-0000-4000-8000-000000000941","campaignId":"00000000-0000-4000-8000-000000000914","variantId":"cbc97eff-fe53-580a-a0fa-5e336366728b","allocatedQuantity":10,"remainingQuantity":5,"netConsumedQuantity":5,"version":39},"globalClaims":21,"globalActiveConsumptions":5,"globalOrders":21,"runClaims":null,"runActiveConsumptions":null,"runOrders":null},"redis":{"available":true,"activeLeases":40,"pendingReleases":0,"confirmationSlotsAvailable":5,"skuRemainingAdmission":5}}} |
| relinquish-wave-3 | 412 | {"targets":[27,28,37,38,40,8,29,30,33,39],"relinquished":10,"everAdmitted":75,"expectedEverAdmitted":75,"snapshot":{"capturedAt":"2026-09-09T08:20:06.749Z","postgres":{"available":true,"sku":{"id":"00000000-0000-4000-8000-000000000941","campaignId":"00000000-0000-4000-8000-000000000914","variantId":"cbc97eff-fe53-580a-a0fa-5e336366728b","allocatedQuantity":10,"remainingQuantity":5,"netConsumedQuantity":5,"version":39},"globalClaims":21,"globalActiveConsumptions":5,"globalOrders":21,"runClaims":null,"runActiveConsumptions":null,"runOrders":null},"redis":{"available":true,"activeLeases":40,"pendingReleases":0,"confirmationSlotsAvailable":5,"skuRemainingAdmission":5}}} |
| relinquish-wave-4 | 372 | {"targets":[41,42,44,45,46,9,32,31,34,70],"relinquished":10,"everAdmitted":85,"expectedEverAdmitted":85,"snapshot":{"capturedAt":"2026-09-09T08:20:09.325Z","postgres":{"available":true,"sku":{"id":"00000000-0000-4000-8000-000000000941","campaignId":"00000000-0000-4000-8000-000000000914","variantId":"cbc97eff-fe53-580a-a0fa-5e336366728b","allocatedQuantity":10,"remainingQuantity":5,"netConsumedQuantity":5,"version":39},"globalClaims":21,"globalActiveConsumptions":5,"globalOrders":21,"runClaims":null,"runActiveConsumptions":null,"runOrders":null},"redis":{"available":true,"activeLeases":40,"pendingReleases":0,"confirmationSlotsAvailable":5,"skuRemainingAdmission":5}}} |
| relinquish-wave-5 | 281 | {"targets":[36,35,43,47,48,49,50,51,53,54],"relinquished":10,"everAdmitted":95,"expectedEverAdmitted":95,"snapshot":{"capturedAt":"2026-09-09T08:20:11.773Z","postgres":{"available":true,"sku":{"id":"00000000-0000-4000-8000-000000000941","campaignId":"00000000-0000-4000-8000-000000000914","variantId":"cbc97eff-fe53-580a-a0fa-5e336366728b","allocatedQuantity":10,"remainingQuantity":5,"netConsumedQuantity":5,"version":39},"globalClaims":21,"globalActiveConsumptions":5,"globalOrders":21,"runClaims":null,"runActiveConsumptions":null,"runOrders":null},"redis":{"available":true,"activeLeases":40,"pendingReleases":0,"confirmationSlotsAvailable":5,"skuRemainingAdmission":5}}} |
| relinquish-wave-6 | 197 | {"targets":[52,55,56,57,58,59,60,64,65,68],"relinquished":10,"everAdmitted":100,"expectedEverAdmitted":100,"snapshot":{"capturedAt":"2026-09-09T08:20:14.114Z","postgres":{"available":true,"sku":{"id":"00000000-0000-4000-8000-000000000941","campaignId":"00000000-0000-4000-8000-000000000914","variantId":"cbc97eff-fe53-580a-a0fa-5e336366728b","allocatedQuantity":10,"remainingQuantity":5,"netConsumedQuantity":5,"version":39},"globalClaims":21,"globalActiveConsumptions":5,"globalOrders":21,"runClaims":null,"runActiveConsumptions":null,"runOrders":null},"redis":{"available":true,"activeLeases":35,"pendingReleases":0,"confirmationSlotsAvailable":5,"skuRemainingAdmission":5}}} |
| final-confirmation | 4082 | {"buyers":10,"targetSuccessful":5,"successful":5,"busy":2,"conflict":5,"soldOut":0,"attempts":[{"attempt":1,"buyers":[97,100,92,94,95,98,99,96,90,91],"successful":3,"busy":2,"conflict":5,"soldOut":0,"responses":[{"status":429,"type":"https://shopee-clone.local/problems/flash-sale-busy","code":"FLASH_SALE_BUSY","detail":"Flash Sale confirmation capacity is temporarily full"},{"status":409,"type":"https://shopee-clone.local/problems/checkout-not-ready","code":null,"detail":"Resolve the reported checkout blockers and preview again."},{"status":201,"type":null,"code":null,"detail":null},{"status":201,"type":null,"code":null,"detail":null},{"status":409,"type":"https://shopee-clone.local/problems/checkout-not-ready","code":null,"detail":"Resolve the reported checkout blockers and preview again."},{"status":409,"type":"https://shopee-clone.local/problems/checkout-not-ready","code":null,"detail":"Resolve the reported checkout blockers and preview again."},{"status":201,"type":null,"code":null,"detail":null},{"status":409,"type":"https://shopee-clone.local/problems/checkout-not-ready","code":null,"detail":"Resolve the reported checkout blockers and preview again."},{"status":409,"type":"https://shopee-clone.local/problems/checkout-not-ready","code":null,"detail":"Resolve the reported checkout blockers and preview again."},{"status":429,"type":"https://shopee-clone.local/problems/flash-sale-busy","code":"FLASH_SALE_BUSY","detail":"Flash Sale confirmation capacity is temporarily full"}],"slotSamples":{"count":31,"minAvailable":0,"maxAvailable":5}},{"attempt":2,"buyers":[97,91],"successful":2,"busy":0,"conflict":0,"soldOut":0,"responses":[{"status":201,"type":null,"code":null,"detail":null},{"status":201,"type":null,"code":null,"detail":null}],"slotSamples":{"count":25,"minAvailable":3,"maxAvailable":5}}]} |
| cleanup-leases | 343 | {"rounds":2,"released":30} |

## Wait time by admission wave

| Admission wave | Buyers | Min ms | Median ms | Max ms |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 40 | 2787 | 4552 | 6339 |
| 2 | 5 | 10641 | 10845 | 10853 |
| 3 | 10 | 13602 | 13607 | 13608 |
| 4 | 10 | 16337 | 16342 | 16344 |
| 5 | 10 | 19065 | 19065 | 19067 |
| 6 | 10 | 21629 | 21631 | 21633 |
| 7 | 10 | 24091 | 24092 | 24093 |
| 8 | 5 | 26433 | 26433 | 26434 |

## Observed totals

```json
{
  "peakActiveLeases": 40,
  "peakPendingReleases": 0,
  "minimumConfirmationSlotsAvailable": 0,
  "peakExecutingConfirmations": 5,
  "seedSuccessfulOrders": 5,
  "finalSuccessfulOrders": 5,
  "finalBusyResponses": 2,
  "finalConflictResponses": 5,
  "finalUnsuccessfulBuyers": 5,
  "finalSoldOutResponses": 0,
  "relinquishedBuyers": 60,
  "cleanupReleasedLeases": 30,
  "duplicateOrders": 0
}
```

## Final invariants

| Invariant | Result | Observed | Expected |
| --- | --- | --- | --- |
| all 100 buyers joined | PASS | 100 | 100 |
| all buyers have unique tickets | PASS | {"present":100,"unique":100} | {"present":100,"unique":100} |
| admission pool reaches configured 40 | PASS | 40 | 40 |
| relinquishment waves release 60 buyers | PASS | 60 | 60 |
| all 100 buyers eventually receive admission | PASS | 100 | 100 |
| cleanup leaves no active admission lease | PASS | 0 | 0 |
| cleanup releases every non-purchasing active lease | PASS | 30 | 30 |
| seed phase creates 5 successful orders | PASS | 5 | 5 |
| final wave has 5 successful orders | PASS | 5 | 5 |
| final contention leaves exactly 5 buyers without an order | PASS | 5 | 5 |
| final contention observes bounded backpressure | PASS | 2 | ">0" |
| confirmation execution peak reaches exactly 5 | PASS | 5 | 5 |
| database remaining quota matches successful orders | PASS | 0 | 0 |
| database quota is nonnegative and bounded | PASS | 0 | "0..10" |
| database net consumption matches active consumption | PASS | 10 | 10 |
| run-scoped orders match successful confirmations | PASS | 10 | 10 |
| no duplicate orders are created | PASS | 0 | 0 |

## Failure analysis / limitations

- None recorded.

Detailed per-buyer events are in `result.json`; the wait-time CSV contains one row for every configured buyer. The runner never writes access tokens or admission cookies to either artifact.
