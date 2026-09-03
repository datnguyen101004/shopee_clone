## Purpose

Defines a secure Google sign-in journey that resolves a verified provider identity to a local marketplace account and creates the existing bounded browser session without exposing OAuth credentials or reusable tokens.

## ADDED Requirements

### Requirement: Start Google authorization from a trusted storefront

The system SHALL let a guest start Google sign-in from the login experience. It SHALL request only the OpenID Connect identity scopes required for sign-in, use the exact configured callback URI, bind the request to the initiating browser with one-time anti-forgery and replay values, and preserve only an allowlisted local return path.

#### Scenario: Start authorization with a safe return path

- **WHEN** a guest activates Google sign-in with a supported local return path
- **THEN** the browser is redirected to Google with an authorization-code request bound to that browser and the safe return path is retained server-side for completion

#### Scenario: Start authorization with an unsafe return path

- **WHEN** a guest starts Google sign-in with an external, protocol-relative, malformed, or unsupported return destination
- **THEN** the system discards that destination and uses the storefront home as the post-login destination

#### Scenario: Use the registered local callback

- **WHEN** Google prepares the local development authorization response
- **THEN** the redirect URI is exactly `http://localhost:3001/login/oauth2/code/google` without an API prefix, query suffix, trailing slash, or trailing comma

### Requirement: Validate every Google authorization response

The system SHALL accept a Google callback only when the authorization response, one-time transaction, and initiating browser agree. Before trusting identity data it SHALL exchange the code server-side and validate the ID token signature, issuer, audience, expiry, nonce, stable subject, email, and verified-email status.

#### Scenario: Complete a valid Google callback

- **WHEN** Google returns a valid one-time code and matching state for the initiating browser and the verified ID token satisfies every required claim
- **THEN** the system consumes the transaction once and continues with the identity identified by the Google `sub` claim

#### Scenario: Reject a forged or replayed callback

- **WHEN** state, browser binding, nonce, issuer, audience, signature, expiry, subject, email, or verified-email status is absent or invalid, or the transaction was already consumed
- **THEN** the system creates no account or session, clears transient OAuth state, and returns the browser to a sanitized login failure

#### Scenario: Handle provider cancellation

- **WHEN** the user declines consent or Google returns a documented authorization error
- **THEN** the system creates no account or session and returns the browser to a non-sensitive cancelled state from which email login and retry remain available

### Requirement: Resolve accounts by stable Google subject

The system SHALL persist the provider and Google `sub` as the external identity key and SHALL NOT use an email address as the provider identity key. A Google identity SHALL belong to at most one local user, and a local user SHALL have at most one identity for the same provider.

#### Scenario: Sign in a returning Google identity

- **WHEN** a valid callback contains a Google `sub` already linked to an active, non-deleted local user
- **THEN** the system signs in that local user without creating a duplicate identity or account

#### Scenario: Register a first-time Google identity

- **WHEN** a valid callback contains a previously unseen Google `sub` and its normalized verified email is not owned by a local account
- **THEN** the system atomically creates one active passwordless local user, links the Google identity, and creates one local refresh-session family

#### Scenario: Concurrent first-time callbacks

- **WHEN** multiple valid callbacks race for the same previously unseen Google `sub`
- **THEN** exactly one provider identity and one local account are created and the requests do not corrupt identity ownership

#### Scenario: Existing email is not silently linked

- **WHEN** a valid previously unseen Google identity presents a normalized email already owned by an unlinked local account
- **THEN** the system creates no duplicate account, does not link or sign in the existing account, and returns sanitized guidance to use the account's existing sign-in method

#### Scenario: Provider email changes after linking

- **WHEN** a returning linked Google `sub` presents a different verified email
- **THEN** the system continues to resolve the established local account by `sub` and does not create, relink, or merge an account based only on the changed email

### Requirement: Convert Google identity into the existing local session

The system SHALL create the same bounded Shopee Clone access and refresh session used by credential login. The callback SHALL place only the local opaque refresh credential in the existing HttpOnly cookie, SHALL NOT place an access credential or OAuth value in a URL, and SHALL let the frontend restore the access credential into runtime memory before navigating to the safe destination.

#### Scenario: Complete browser sign-in

- **WHEN** account resolution succeeds
- **THEN** the API sets the local refresh cookie, redirects to a trusted frontend completion route without credential data, and the frontend restores authenticated header state before navigating safely

#### Scenario: Completion restoration fails

- **WHEN** the frontend completion route cannot restore a valid local session
- **THEN** it settles into a usable guest state, shows a generic retry path, and does not enter a redirect or refresh loop

### Requirement: Keep Google credentials and tokens confidential

The system SHALL load `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only from runtime environment configuration. It SHALL never emit, copy into planning evidence, durably persist, return, log, or commit either value, authorization codes, ID tokens, Google access tokens, or transient verifier material. Provider tokens SHALL be held only as long as required to verify sign-in and SHALL NOT be retained for later Google API access.

#### Scenario: Start with valid runtime configuration

- **WHEN** both Google environment variables are present and structurally acceptable at API startup
- **THEN** Google sign-in is enabled without exposing either value in startup output or diagnostics

#### Scenario: Start with missing or malformed runtime configuration

- **WHEN** either required Google variable is absent, empty, malformed, or still a documented placeholder
- **THEN** the API fails closed with a sanitized configuration error that identifies only the configuration key or capability, never its submitted value

#### Scenario: Provider exchange fails

- **WHEN** Google rejects a code exchange or its network endpoint is unavailable
- **THEN** the system returns a sanitized sign-in failure, records no provider token, and emits no client secret, code, ID token, or upstream response body

### Requirement: Bound transient OAuth state and abuse

The system SHALL expire and single-consume Google login transactions, clear their browser binding after completion or failure, prune expired records with bounded work, and apply configurable privacy-preserving request-source limits to authorization starts and callbacks.

#### Scenario: OAuth transaction expires

- **WHEN** a callback arrives after its short documented transaction lifetime
- **THEN** the system rejects it without exchanging the code or creating a session and clears the transient browser state

#### Scenario: Google sign-in is flooded

- **WHEN** one request source exceeds the configured start or callback limit
- **THEN** the system returns sanitized rate-limit behavior without logging raw state, codes, provider subject, or email

### Requirement: Provide an accessible Google login experience

The storefront SHALL present Google sign-in as an additional method rather than replacing email/password login. The control and completion states SHALL be keyboard operable, responsive, clearly labelled, protected against duplicate activation, and announced accessibly for pending, cancelled, failed, and successful outcomes.

#### Scenario: Choose Google on the login page

- **WHEN** a keyboard, pointer, or assistive-technology user reaches the login page
- **THEN** the user can distinguish and activate Google sign-in while the existing credential, registration, and recovery paths remain available

#### Scenario: Return with a safe OAuth outcome

- **WHEN** the provider journey returns cancelled or fails without a local session
- **THEN** the login page displays a generic accessible outcome, removes transient outcome parameters from browser history, and permits a safe retry

### Requirement: Verify provider integration without disclosing configuration

The project SHALL provide deterministic automated coverage with provider fakes and a documented manual local smoke check against Google. Automated tests SHALL not require a real Google account, and verification evidence SHALL record only pass/fail state and sanitized failure category.

#### Scenario: Run the quick authentication gate

- **WHEN** `test:e2e:auth:quick` runs against existing local services
- **THEN** it verifies the Google entry control, safe redirects or faked completion behavior, accessibility, and existing email-login regressions without printing environment values

#### Scenario: Run a real-provider smoke check

- **WHEN** an authorized Google test user completes the documented local flow on `http://localhost:3000`
- **THEN** the application reaches an authenticated local session and evidence records only success or a sanitized category such as configuration, consent, callback, or claim validation failure
