## Purpose

Defines the secure account and session behavior that lets marketplace users authenticate, recover access, and continue protected storefront journeys without exposing credentials or reusable session secrets.

## ADDED Requirements

### Requirement: Register an account with email credentials

The system SHALL accept a display name, email address, and password for self-service account registration. It SHALL trim and case-normalize the email, validate the input at the API boundary, store only a strong adaptive password hash, and create no more than one account for the normalized email.

#### Scenario: Successful registration

- **WHEN** a guest submits a valid display name, an unused email with arbitrary surrounding whitespace or letter case, and an accepted password
- **THEN** the system creates one active account with the normalized email and starts an authenticated session

#### Scenario: Concurrent duplicate registration

- **WHEN** two registration requests race using email values that normalize to the same address
- **THEN** exactly one account is created and the other request receives a sanitized registration failure without persistence corruption

#### Scenario: Invalid registration input

- **WHEN** a guest submits an invalid email, blank display name, or password outside the documented length and safety policy
- **THEN** the system rejects the request with validation Problem Details and does not store credentials or create a session

### Requirement: Authenticate credentials without account enumeration

The system SHALL authenticate normalized email and password credentials for active, non-deleted accounts. Missing accounts, wrong passwords, accounts without usable credentials, and accounts that cannot sign in SHALL return the same externally observable authentication failure.

#### Scenario: Successful credential login

- **WHEN** an active account submits its normalized-equivalent email and correct password
- **THEN** the system returns a new authenticated session without returning the password hash or refresh secret in the response body

#### Scenario: Invalid or unavailable account login

- **WHEN** the email is unknown, the password is wrong, or the matching account is suspended or deleted
- **THEN** the system returns the same sanitized 401 Problem Details response and reveals no account-status distinction

### Requirement: Issue bounded access and refresh credentials

The system SHALL issue a short-lived signed access credential and a longer-lived opaque refresh credential for each successful registration, login, or refresh. The access credential SHALL identify the user and session, carry issuer, audience, issue, and expiry bounds, and be rejected when its signature, claims, or expiry are invalid. The browser refresh credential SHALL be transported only as a Secure-in-production, HttpOnly, SameSite cookie and SHALL be stored server-side only as a non-reversible hash.

#### Scenario: Use a valid access credential

- **WHEN** a client presents an unexpired access credential with valid signature, issuer, audience, user, and active-session claims
- **THEN** an authentication guard exposes the authenticated user and session to the protected endpoint

#### Scenario: Reject an invalid access credential

- **WHEN** a protected endpoint receives a missing, expired, malformed, wrongly signed, or wrongly scoped access credential
- **THEN** the endpoint returns sanitized 401 Problem Details and no protected data

### Requirement: Rotate refresh credentials atomically

The system SHALL replace a valid refresh credential on every successful refresh, invalidate the presented credential atomically, and return a new access credential and refresh cookie. Expired, revoked, malformed, or unknown refresh credentials SHALL not create a session. Confirmed reuse of a previously rotated credential SHALL revoke its session family.

#### Scenario: Successful refresh rotation

- **WHEN** a client presents the current unexpired refresh cookie
- **THEN** the system atomically invalidates it, records its successor, returns a new access credential, and replaces the cookie

#### Scenario: Reuse a rotated credential

- **WHEN** a refresh credential is presented again after it has already been rotated outside the documented concurrency tolerance
- **THEN** the system revokes that refresh-session family, clears the browser cookie, and returns sanitized 401 Problem Details

#### Scenario: Concurrent refresh attempts

- **WHEN** multiple requests concurrently present the same current refresh credential
- **THEN** no more than one rotation succeeds and the persisted session chain remains consistent

### Requirement: Logout revokes the active refresh session

The system SHALL support idempotent logout that revokes the refresh session represented by the current cookie when one exists and always expires the browser refresh cookie.

#### Scenario: Logout an authenticated browser session

- **WHEN** a browser logs out with a current refresh cookie
- **THEN** that refresh session can no longer rotate and the response expires the cookie

#### Scenario: Repeat logout

- **WHEN** logout is called without a cookie or after the session was already revoked
- **THEN** the system still returns a successful no-content response and an expired cookie

### Requirement: Discover the current authenticated user

The system SHALL provide an authenticated current-user response containing only the stable identifier, normalized email, display name, and account status needed by the client. It SHALL derive identity from the validated access credential rather than client-provided user identifiers.

#### Scenario: Load authenticated session identity

- **WHEN** a client with a valid access credential requests the current user
- **THEN** the system returns the matching safe user projection and no credential or token metadata

#### Scenario: Account becomes unavailable

- **WHEN** an access credential belongs to a user who is now suspended or deleted
- **THEN** current-user discovery returns sanitized 401 Problem Details and no user projection

### Requirement: Request password recovery privately

The system SHALL accept password-recovery requests using normalized email and return the same accepted response whether the account exists, is unavailable, or is ineligible. For an eligible account it SHALL invalidate prior active reset credentials, create a cryptographically random expiring single-use credential, store only its hash, and send the recovery link through the configured delivery boundary.

#### Scenario: Request recovery for an eligible account

- **WHEN** a guest requests recovery for an active account with usable credentials
- **THEN** the system returns the generic accepted response and delivers one new time-bounded reset link without exposing it in API output or logs

#### Scenario: Request recovery for an unknown account

- **WHEN** a guest requests recovery for an unknown, suspended, or deleted account
- **THEN** the system returns the same status, body shape, and public message as an eligible request

### Requirement: Reset a password once and revoke old sessions

The system SHALL accept an unexpired, unused password-reset credential and a policy-compliant new password, update the password hash, mark the reset credential used, invalidate every outstanding reset credential for the account, and revoke all of the account's refresh sessions in one transaction.

#### Scenario: Successful password reset

- **WHEN** a guest submits a valid unused reset credential and an accepted new password
- **THEN** the password changes atomically, existing refresh sessions are revoked, and the credential cannot be used again

#### Scenario: Invalid reset credential

- **WHEN** a reset credential is expired, malformed, unknown, or already used
- **THEN** the system returns the same sanitized reset failure and does not modify the account or sessions

### Requirement: Limit authentication abuse

The system SHALL apply configurable rate limits to registration, login, refresh, forgot-password, and reset-password operations using privacy-preserving request and normalized-identity signals as appropriate. A limited request SHALL receive 429 Problem Details with a retry hint, and successful authentication SHALL clear the relevant credential-failure state without disabling broader request limits.

#### Scenario: Repeated failed login attempts

- **WHEN** login failures for an identity or request source exceed the configured window
- **THEN** subsequent attempts in that window receive sanitized 429 Problem Details with `Retry-After`

#### Scenario: Recovery request flooding

- **WHEN** recovery requests exceed their configured request-source limit
- **THEN** the system limits further requests without revealing which submitted emails exist

### Requirement: Keep browser session secrets out of persistent script storage

The web application SHALL keep access credentials only in runtime memory, SHALL rely on the HttpOnly refresh cookie to restore a session, and SHALL NOT write access or refresh credentials to local storage, session storage, browser-readable cookies, URLs, analytics, or logs. Failed restoration SHALL leave the visitor in a usable guest state.

#### Scenario: Restore a browser session

- **WHEN** the application starts with a valid refresh cookie and no in-memory access credential
- **THEN** it performs one coordinated refresh, loads the safe current-user projection, and renders authenticated account state

#### Scenario: Session restoration fails

- **WHEN** the refresh cookie is absent, expired, or revoked
- **THEN** the application clears runtime authentication state and continues as a guest without a redirect loop

### Requirement: Provide accessible account and recovery journeys

The storefront SHALL provide responsive login, registration, forgot-password, and reset-password pages with associated labels, keyboard operation, pending-state protection, inline validation, safe generic server errors, and clear success states.

#### Scenario: Complete login in the browser

- **WHEN** a guest submits valid credentials from the login page
- **THEN** duplicate submission is prevented, authenticated header state appears, and focus or announcements communicate the successful transition

#### Scenario: Submit invalid form data

- **WHEN** a guest submits incomplete or invalid account form data
- **THEN** the page identifies the invalid fields accessibly and preserves non-secret input while never repopulating a password

### Requirement: Continue only allowlisted local intents after authentication

The web application SHALL accept only explicitly supported local return paths and structured purchase-intent fields from the login entry point. It SHALL reject external, protocol-relative, malformed, repeated, or inconsistent intent values. Because persistent cart and checkout are later capabilities, T11 SHALL return a successfully authenticated user to the validated product page without claiming that the pending purchase action was executed.

#### Scenario: Continue a valid product intent

- **WHEN** login succeeds with a valid local product return path and matching allowlisted intent fields
- **THEN** the browser returns to that product page with no credential data in the destination URL

#### Scenario: Reject an unsafe redirect

- **WHEN** login receives an external URL, protocol-relative URL, unsupported route, or inconsistent product intent
- **THEN** the application discards the intent and navigates to the storefront home after successful login

### Requirement: Fail safely when authentication configuration is invalid

The API SHALL validate signing material, allowed browser origins, cookie security mode, credential lifetimes, and recovery delivery mode at startup. Production mode SHALL fail closed when required secrets are absent, weak, or configured with development-only delivery behavior. Authentication logs and errors SHALL exclude passwords, raw access credentials, refresh credentials, reset credentials, database connection strings, and secret configuration.

#### Scenario: Start production with unsafe configuration

- **WHEN** the API starts in production mode with missing or weak signing material, insecure cookie settings, or a development-only recovery adapter
- **THEN** startup fails with a sanitized configuration error before accepting traffic

#### Scenario: Authentication dependency fails

- **WHEN** persistence, hashing, token signing, or recovery delivery fails unexpectedly
- **THEN** the API returns sanitized Problem Details, emits no secret value, and does not leave partially created credentials or sessions
