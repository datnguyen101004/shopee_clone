## Purpose

Defines durable marketplace roles and authoritative backend authorization so buyer, seller, and admin capabilities remain separated, ownership-sensitive resources stay private, and every privileged role change is attributable.

## ADDED Requirements

### Requirement: Maintain canonical additive marketplace roles

The system SHALL recognize exactly `buyer`, `seller`, and `admin` as marketplace roles. Every active account SHALL have the buyer role, while seller and admin SHALL be explicit additive assignments. Registration, credential login, Google sign-in, refresh, and any browser-supplied field SHALL NOT grant seller or admin authority.

#### Scenario: Register a normal account

- **WHEN** a guest successfully registers by email or creates an account through Google sign-in
- **THEN** the account receives the buyer role and no seller or admin role

#### Scenario: Submit an elevated role during self-service authentication

- **WHEN** a client adds a role or permission field to registration, login, refresh, or Google completion input
- **THEN** the request is rejected by strict boundary validation or the field is structurally impossible to submit, and no elevated assignment is created

#### Scenario: Hold multiple authorized roles

- **WHEN** an authorized administrator grants seller or admin to an existing buyer
- **THEN** the account retains buyer and gains only the explicitly granted role

### Requirement: Project current roles safely to authenticated clients

The system SHALL include a deduplicated, canonical-order role list in every safe authenticated-user and session response. Access credentials SHALL identify the user and local session without becoming the authority for role membership, and protected requests SHALL evaluate current persisted assignments so revocation affects already-issued access credentials.

#### Scenario: Restore a multi-role session

- **WHEN** an account with buyer and seller assignments logs in, refreshes, or requests its current user
- **THEN** the safe user projection contains exactly `buyer` and `seller` in canonical order and contains no assignment audit metadata

#### Scenario: Revoke a role during an active session

- **WHEN** seller or admin is revoked after an access credential was issued
- **THEN** the next protected request using that otherwise valid credential is evaluated without the revoked authority

#### Scenario: Ignore forged role claims

- **WHEN** a client presents a modified, extra, or stale role value outside the server-owned assignment state
- **THEN** authorization uses the persisted current roles and grants no authority from the client value

### Requirement: Distinguish authentication and authorization failures

Protected API operations SHALL return the established sanitized Problem Details shape. A missing, invalid, expired, or unavailable identity SHALL return 401, while an authenticated active user lacking the required role or ownership SHALL return 403. Denials SHALL expose no protected resource body, permission internals, account details, or stack information.

#### Scenario: Call a protected operation without valid authentication

- **WHEN** a guest or client with an invalid access credential calls a role-protected endpoint
- **THEN** the API returns the standard sanitized 401 authentication Problem Details response

#### Scenario: Call an operation without sufficient authority

- **WHEN** an authenticated active user calls an endpoint for which its current roles or ownership do not qualify
- **THEN** the API returns a consistent sanitized 403 authorization Problem Details response and no protected data

### Requirement: Enforce a deny-by-default role permission matrix

Every non-public operation SHALL declare its authentication and role requirements at the backend boundary. Seller operations SHALL require seller, admin operations SHALL require admin, and an unclassified or missing required-role policy SHALL NOT inherit elevated access merely because the caller is authenticated. Admin SHALL NOT implicitly bypass seller ownership unless an operation explicitly declares a separate admin capability.

#### Scenario: Buyer calls a seller operation

- **WHEN** an authenticated buyer without seller calls a seller-protected operation
- **THEN** the API denies the request with 403

#### Scenario: Seller calls an admin operation

- **WHEN** an authenticated buyer-seller without admin calls an admin-protected operation
- **THEN** the API denies the request with 403

#### Scenario: Admin calls an explicitly admin operation

- **WHEN** an authenticated active account with current admin assignment calls an admin-protected operation
- **THEN** the API allows role evaluation to proceed to that operation's remaining validation and business rules

### Requirement: Enforce seller resource ownership server-side

Ownership-sensitive shop, product, and per-shop order operations SHALL derive the owning shop and owner from authoritative persistence rather than trusting a client-supplied owner identifier. A seller SHALL access only resources belonging to its current owned shop. A non-owner and an unknown ownership target SHALL receive the same sanitized denial category so resource existence is not disclosed.

#### Scenario: Seller reads its own shop context

- **WHEN** an authenticated seller requests the protected seller view of the shop whose persisted owner is that user
- **THEN** the API returns only the safe seller shop projection

#### Scenario: Seller targets another shop

- **WHEN** an authenticated seller supplies another shop's identifier to an ownership-protected operation
- **THEN** the API returns sanitized 403 and no shop, product, order, or owner detail

#### Scenario: Client forges ownership input

- **WHEN** a seller includes its own user or shop identifier while targeting a resource persisted under another shop
- **THEN** the server ignores the ownership assertion and denies the operation from persisted relationships

### Requirement: Bootstrap and administer elevated roles safely

The system SHALL provide an operator-only first-admin bootstrap that succeeds only when no active admin exists and records its origin. After bootstrap, only a current active admin SHALL assign or revoke seller/admin roles for active accounts. Role changes SHALL be transactionally idempotent, SHALL NOT permit removal of the last active admin, and SHALL never expose an unauthenticated or self-service elevation route.

#### Scenario: Bootstrap the first admin

- **WHEN** an authorized operator selects an existing active account while no active admin exists
- **THEN** exactly one admin assignment and its bootstrap audit event are committed atomically

#### Scenario: Race first-admin bootstrap attempts

- **WHEN** two bootstrap attempts race while no active admin exists
- **THEN** no more than one target becomes the first admin and the persisted audit history remains consistent

#### Scenario: Admin grants an elevated role

- **WHEN** a current admin grants seller or admin to an eligible active account with an accepted reason
- **THEN** the assignment and matching audit event commit atomically and a repeated equivalent request creates no duplicate active assignment

#### Scenario: Attempt to remove the last active admin

- **WHEN** an administrator tries to revoke the only active admin assignment
- **THEN** the API rejects the change with sanitized conflict Problem Details and retains the assignment

#### Scenario: Non-admin attempts role management

- **WHEN** a buyer or seller attempts to grant, revoke, or inspect privileged role administration data
- **THEN** the API returns sanitized 403 and makes no role or audit change

### Requirement: Preserve an append-only role audit trail

Every successful bootstrap, grant, and revocation SHALL append an immutable audit event containing the target user identifier, role, action, UTC timestamp, accepted bounded reason, and either the administering user identifier or a bootstrap source. Application APIs SHALL provide bounded admin-only audit retrieval and SHALL NOT offer update or delete behavior for audit events. Audit output and logs SHALL exclude credentials, tokens, cookies, password material, and unrelated personal data.

#### Scenario: Record an administrator role change

- **WHEN** an admin successfully grants or revokes a role
- **THEN** one corresponding audit event identifies the actor, target, action, role, reason, and timestamp

#### Scenario: Read role audit history

- **WHEN** a current admin requests an accepted bounded audit page
- **THEN** the API returns stable ordered safe audit projections without credential or session material

#### Scenario: Role mutation transaction fails

- **WHEN** persistence fails while changing a role or writing its audit event
- **THEN** neither the current assignment nor a partial audit event is committed

### Requirement: Backfill existing accounts deterministically

The additive migration SHALL grant buyer to every existing non-deleted user and seller to every existing non-deleted shop owner, SHALL create no implicit production admin, and SHALL preserve all existing users, shops, products, sessions, and external identities. Repeated deterministic local seeding SHALL converge on the same role and audit state without duplicates.

#### Scenario: Migrate existing marketplace data

- **WHEN** the role migration runs over the current T11.1 database
- **THEN** existing users remain intact, every eligible user has buyer, shop owners also have seller, and no account gains admin implicitly

#### Scenario: Repeat local seed and verification

- **WHEN** deterministic seed and database verification run multiple times
- **THEN** role assignments and seed audit events remain stable, valid, and duplicate-free

### Requirement: Present role-aware navigation without trusting the UI

The storefront SHALL derive seller and admin navigation visibility from the validated safe user projection, provide accessible loading and forbidden states for operational entry pages, and remove elevated links immediately after refreshed state loses the role. Hidden links or client-side route checks SHALL never replace backend authorization.

#### Scenario: Render navigation for a buyer

- **WHEN** a buyer-only session is restored
- **THEN** buyer navigation remains usable and seller/admin operational links are not presented as authorized destinations

#### Scenario: Render navigation for elevated roles

- **WHEN** a session containing seller or admin is restored
- **THEN** the corresponding operational entry link is presented with an accessible name while unrelated elevated links remain hidden

#### Scenario: Visit an operational route directly without authority

- **WHEN** a guest or insufficiently privileged authenticated user directly visits a seller/admin entry route
- **THEN** the UI presents a stable sign-in or forbidden state without exposing protected data or entering a redirect/refresh loop, and any API call is still independently denied
