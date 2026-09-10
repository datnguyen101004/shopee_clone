---
name: backend-architecture
description: Design or review backend architecture, data pipelines, persistence, integrations, messaging, reliability, or scaling decisions. Use for backend proposals and OpenSpec designs whenever the work introduces or changes a material architectural choice; require explicit trade-offs and revisit criteria. Do not use for code-only changes whose architecture is already fixed.
---

# Backend Architecture

Recommend an architecture that fits the user's current constraints without presenting it as universally best. Preserve technologies or trade-offs the user has explicitly accepted unless new evidence makes them unsafe or incompatible.

## Required decision analysis

For every material backend decision, make the following visible in the planning artifact and the user-facing summary:

- **Decision and scope:** what is selected now and which responsibilities remain outside it.
- **Why it fits:** the assumptions about scale, latency, consistency, reliability, team capacity, cost, and delivery stage that justify it.
- **Benefits:** the concrete outcomes gained from the choice.
- **Trade-offs:** complexity, operational burden, cost, coupling, performance limits, failure modes, data-loss or duplication semantics, security/privacy exposure, and constraints introduced by the choice. State explicitly which risks are being accepted.
- **Alternatives:** credible alternatives, why they are not selected now, and the conditions under which they would be better.
- **Revisit criteria:** measurable or observable triggers for migration or redesign, such as throughput, backlog age, database growth, latency SLO breaches, consumer count, recovery time, or operating cost.

Do not hide an important downside inside generic wording such as “more complex” or “less scalable.” Explain the mechanism and likely impact. Distinguish verified facts from estimates and assumptions.

## System-level checks

Cover the relevant lifecycle end to end rather than only the happy path:

- ownership and trust boundaries;
- durable acknowledgement point and behavior when acknowledgements are lost;
- delivery semantics, ordering, deduplication, idempotency, retries, backpressure, and concurrency;
- storage growth, retention, cleanup, archival, partitioning, and replay;
- degraded operation, crash recovery, rollout, rollback, observability, and alerting;
- sensitive-data handling, access control, secret rotation, and audit requirements;
- expected infrastructure and engineering cost at the current stage and at the next likely scale tier.

If the work is an MVP, identify deliberate shortcuts separately from correctness requirements. Record each accepted shortcut as technical debt with a safe operating envelope and a trigger to revisit it. Never claim “exactly once,” “realtime,” “no data loss,” or similar guarantees unless the full path actually provides them.

## Output and OpenSpec integration

Lead with the recommended choice, then present its trade-offs before implementation planning. A compact decision table is preferred when comparing several options; prose is sufficient for a single decision.

When creating or updating an OpenSpec `design.md`, express each material choice using the existing template while preserving these elements: decision, rationale, trade-offs, alternatives, and revisit criteria. Keep the same decisions synchronized in localized design artifacts. Architecture planning does not authorize code implementation or infrastructure provisioning.
