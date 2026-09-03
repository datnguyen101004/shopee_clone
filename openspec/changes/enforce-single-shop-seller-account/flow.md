# Flow

> **Implementation status:** Seller workspace ownership checks, seller-role invariant guards,
> paired lifecycle adapters for admin/moderation, suspended-auth feedback, and the migration
> preflight/backfill scripts are implemented. PostgreSQL is reachable, but migration execution is
> intentionally blocked by one legacy seller role without an approved shop; migration/Playwright
> verification must continue after that record receives a reviewed business resolution.

## Seller registration and approval

```mermaid
flowchart TD
  A[Account opens seller entry] --> B{Existing shop record?}
  B -- No --> C[Show first shop registration]
  C --> D[Submit registration]
  D --> E[Lock account ownership slot]
  E --> F{Shop now exists?}
  F -- Yes --> G[Return the same existing workspace]
  F -- No --> H[Create one pending shop]
  B -- Yes --> I{Onboarding state}
  I -- Pending --> J[Show application status]
  I -- Rejected --> K[Show edit and resubmit]
  I -- Approved --> L[Open the only seller shop]
  H --> M[Admin reviews application]
  M --> N{Decision}
  N -- Reject --> K
  N -- Approve --> O[Approve shop and grant SELLER atomically]
  O --> L
```

## Coordinated suspension

```mermaid
sequenceDiagram
  actor Admin
  participant Entry as Admin or moderation entry
  participant Lifecycle as Seller identity lifecycle
  participant Store as Account, shop, sessions, audits

  Admin->>Entry: Suspend approved shop or seller account with reason
  Entry->>Lifecycle: Request coordinated suspension
  Lifecycle->>Store: Lock account then shop
  Lifecycle->>Store: Validate approved seller pair and admin protection
  Lifecycle->>Store: Suspend account and shop
  Lifecycle->>Store: Revoke active owner sessions
  Lifecycle->>Store: Audit both targets
  alt every operation succeeds
    Store-->>Lifecycle: Commit
    Lifecycle-->>Entry: Coordinated success
    Entry-->>Admin: Show both entities suspended
  else any operation fails
    Store-->>Lifecycle: Roll back all changes
    Lifecycle-->>Entry: Retryable failure
    Entry-->>Admin: Show no partial success
  end
```

## Coordinated restoration

```mermaid
flowchart TD
  A[Restore request targets seller account or shop] --> B[Lock account and shop]
  B --> C{Shop is approved and pair is valid?}
  C -- No --> D[Reject without changes]
  C -- Yes --> E{Both already active?}
  E -- Yes --> F[Return idempotent success without new audits]
  E -- No --> G[Activate account and shop together]
  G --> H[Audit both targets]
  H --> I[Commit; revoked sessions stay revoked]
  I --> J[Seller must sign in again]
```

## Migration safety

```mermaid
flowchart TD
  A[Run invariant preflight] --> B{Duplicate shop owners?}
  B -- Yes --> C[Stop and require reviewed reconciliation]
  B -- No --> D{SELLER without one approved shop?}
  D -- Yes --> C
  D -- No --> E[Backfill approved owners missing SELLER with audit]
  E --> F[Re-run preflight]
  F --> G{All invariants valid?}
  G -- No --> C
  G -- Yes --> H[Apply unique owner constraint]
  H --> I[Run migration and critical journey verification]
```
