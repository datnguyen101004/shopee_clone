## Purpose

Defines trustworthy marketplace voucher definitions, eligibility, usage limits, and atomic redemption semantics so promotional codes cannot be forged, reused, or oversubscribed.

## ADDED Requirements

### Requirement: Model valid platform, shop, and free-shipping vouchers

The system SHALL persist a unique normalized voucher code, display name, enabled state, UTC start and end, issuer scope, benefit type, minimum spend, global usage limit, per-buyer usage limit, and benefit amount or cap. A shop voucher SHALL belong to exactly one active shop; a platform voucher SHALL have no shop owner; optional product scope SHALL be a whitelist consistent with the voucher's issuer scope. Invalid combinations and non-positive or unsafe monetary limits SHALL be rejected by both application and persistence boundaries.

#### Scenario: Define a platform fixed voucher

- **WHEN** a valid platform voucher has a fixed VND benefit, activity window, minimum spend, and usage limits
- **THEN** the system stores a canonical definition that can apply across eligible selected shops and products

#### Scenario: Define a scoped shop percentage voucher

- **WHEN** a percentage voucher belongs to one shop and whitelists products from that shop
- **THEN** only those products can contribute to its eligibility and discount base

#### Scenario: Reject an inconsistent definition

- **WHEN** a shop voucher has no shop, a platform voucher has a shop owner, a product scope crosses shops, or a benefit has an invalid amount or cap
- **THEN** the write is rejected before the definition can be evaluated

### Requirement: Normalize voucher codes without weakening uniqueness

Voucher input SHALL be trimmed and case-folded to one documented uppercase canonical form with a bounded ASCII character set. Canonical codes SHALL be unique, and the system SHALL reject malformed, empty, duplicate-slot, or repeated request codes before eligibility evaluation.

#### Scenario: Enter a code with harmless formatting differences

- **WHEN** a buyer enters a valid code with surrounding whitespace or lowercase letters
- **THEN** the system resolves the same canonical voucher without creating another identity

#### Scenario: Submit the same code in multiple slots

- **WHEN** one quote request repeats a canonical code or repeats a shop slot
- **THEN** strict request validation returns sanitized `400` Problem Details and performs no voucher calculation

### Requirement: Evaluate eligibility from current server facts and one UTC instant

The system SHALL evaluate enabled state, half-open activity window `[startsAt, endsAt)`, current global usage, current buyer usage, issuer scope, product scope, and minimum spend using authoritative selected cart facts and one server-captured UTC instant. It SHALL return stable machine-readable rejection reasons from `NOT_FOUND`, `DISABLED`, `NOT_STARTED`, `EXPIRED`, `GLOBAL_LIMIT_REACHED`, `BUYER_LIMIT_REACHED`, `TYPE_MISMATCH`, `SCOPE_MISMATCH`, `NO_ELIGIBLE_ITEMS`, and `MINIMUM_SPEND_NOT_MET` without accepting browser claims for any condition.

#### Scenario: Evaluate exact activity boundaries

- **WHEN** evaluation occurs exactly at `startsAt` or one instant before `endsAt`
- **THEN** the voucher is time-eligible, while evaluation exactly at `endsAt` returns `EXPIRED`

#### Scenario: Reject a minimum-spend miss

- **WHEN** the pre-voucher selling-price subtotal of scope-eligible selected items is below the voucher's minimum spend
- **THEN** preview rejects it with `MINIMUM_SPEND_NOT_MET` and returns no benefit for that voucher

#### Scenario: Ignore out-of-scope merchandise

- **WHEN** selected items exist but none belong to the voucher's eligible shop or product whitelist
- **THEN** preview rejects it with the applicable scope reason and no unrelated value contributes to minimum spend

### Requirement: Enforce global and per-buyer usage independently

The system SHALL enforce a finite positive global usage limit and a finite positive per-buyer limit for every voucher. A buyer SHALL be rejected after reaching their own limit even when global capacity remains, and all buyers SHALL be rejected after global capacity is exhausted.

#### Scenario: Buyer has already used the voucher

- **WHEN** a one-use-per-buyer voucher has an existing committed redemption for the authenticated buyer
- **THEN** preview and checkout revalidation reject it with `BUYER_LIMIT_REACHED`

#### Scenario: Other buyers consumed the final capacity

- **WHEN** committed redemptions equal the global limit
- **THEN** the next preview or checkout revalidation rejects the voucher with `GLOBAL_LIMIT_REACHED`

### Requirement: Keep quote preview read-only and non-reserving

Voucher preview SHALL calculate against a consistent current snapshot but SHALL create no reservation, redemption, counter update, or hidden expiration token. Repeating or abandoning a preview SHALL not reduce voucher availability, and any later checkout SHALL re-evaluate current facts.

#### Scenario: Preview repeatedly

- **WHEN** a buyer requests the same eligible voucher quote multiple times
- **THEN** every request remains read-only and the persisted usage counts are unchanged

#### Scenario: Capacity changes after preview

- **WHEN** another checkout consumes the last available use after a buyer sees an eligible preview
- **THEN** the displayed preview grants no ownership and the later checkout revalidation rejects the voucher

### Requirement: Consume applied vouchers atomically with checkout

The system SHALL expose no standalone public consume endpoint. A checkout consumer SHALL reload and re-evaluate vouchers, lock all affected usage records in canonical voucher order, and create redemptions plus update global and per-buyer usage within the same database transaction as the successful purchase. The transaction SHALL commit every applied voucher and the purchase together or roll back all of them.

#### Scenario: Consume several vouchers successfully

- **WHEN** checkout revalidation finds one platform voucher, shop vouchers, and a free-shipping voucher still eligible
- **THEN** the purchase and all corresponding redemptions commit once in the same transaction

#### Scenario: One voucher loses eligibility during checkout

- **WHEN** any requested voucher is expired, exhausted, reused, or otherwise ineligible after transactional revalidation
- **THEN** the entire checkout transaction fails without creating a purchase or consuming any voucher

#### Scenario: Race for the final global use

- **WHEN** concurrent buyers attempt to consume the last remaining use
- **THEN** at most one transaction commits and persisted usage never exceeds the configured limit

### Requirement: Make transactional consumption idempotent per purchase

Voucher consumption SHALL bind each redemption set to a server-owned purchase reference. Repeating consumption for the same reference and identical canonical voucher set SHALL not increment usage twice; reusing that reference with a different set or buyer SHALL fail closed.

#### Scenario: Retry after an ambiguous checkout response

- **WHEN** the same buyer retries the same committed purchase reference with the identical applied voucher set
- **THEN** the system returns the existing consumption result without creating duplicate redemptions

#### Scenario: Reuse a purchase reference inconsistently

- **WHEN** a request associates an existing purchase reference with another buyer or voucher set
- **THEN** the transaction fails with a conflict and preserves the original records
