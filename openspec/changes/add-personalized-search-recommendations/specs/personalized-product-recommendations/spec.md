## Purpose

Defines privacy-bounded buyer profiles and personalized product ranking for relevance search and daily recommendations, with safe cold-start behavior, deterministic diversity, and non-personalized fallbacks.

## ADDED Requirements

### Requirement: Bounded authenticated buyer profiles
The system SHALL derive versioned buyer-search profiles only for authenticated buyers from owned views, favorites, followed shops, and valid orders. Profiles SHALL contain bounded ranking features rather than raw unbounded activity histories, SHALL remain usable for thirty days since their last materialized generation so a one-day absence does not erase personalization, and SHALL NOT be created for anonymous visitors.

#### Scenario: Eligible authenticated buyer
- **WHEN** an authenticated buyer has enough qualifying behavior under the active profile policy
- **THEN** the offline profile pipeline produces a versioned profile with category, shop, price, and recent-affinity features

#### Scenario: Guest visitor
- **WHEN** a guest searches or opens the homepage
- **THEN** the system uses non-personalized ranking and does not create an anonymous buyer profile

#### Scenario: Stale or insufficient profile
- **WHEN** a buyer profile is absent, older than thirty days, incompatible, or below the minimum behavior threshold
- **THEN** the system treats the buyer as cold-start and returns baseline results

### Requirement: Personalized relevance ranking
For an eligible authenticated buyer using `sort=relevance`, the system SHALL combine textual relevance, static quality, buyer-profile features, product-profile features, and a versioned logistic-regression model to rank eligible candidates. The scoring function SHALL execute within Elasticsearch and SHALL NOT require a separate online ML inference service.

#### Scenario: Personalized relevance search
- **WHEN** an eligible buyer performs a relevance search and a compatible active model is available
- **THEN** the system applies personalized scoring to the filtered Elasticsearch candidates and may return a different eligible order than the guest baseline

#### Scenario: Explicit sort selected
- **WHEN** an authenticated buyer selects price, best-selling, or newest sorting
- **THEN** personalization does not change the primary explicit ordering and may only break ties between equal primary values

#### Scenario: Incompatible model or profile version
- **WHEN** the active model, feature schema, stored scoring script, or buyer profile versions are incompatible
- **THEN** personalized scoring is skipped and the request uses baseline Elasticsearch ranking

### Requirement: Local offline model lifecycle
The system SHALL provide a deterministic local flow that generates buyer-product features, trains logistic-regression weights from versioned seeded examples, records model metrics and versions, and activates only a compatible model. Seeded local labels SHALL be identified as demonstration data rather than evidence of production ranking quality.

#### Scenario: Deterministic local training
- **WHEN** the local training command is repeated with the same versioned dataset and random seed
- **THEN** it produces equivalent feature definitions, weights, metrics, and model metadata

#### Scenario: Model evaluation
- **WHEN** a candidate model is evaluated on its held-out dataset
- **THEN** the system reports AUC, log-loss, and personalized ranking metrics separately from Elasticsearch baseline relevance metrics

### Requirement: Explicit S3 clickstream training handoff
The local training command SHALL optionally read a fixed S3 manifest URI using the ambient AWS credential chain. The manifest SHALL contain no more than thirty exact immutable daily `training.csv` URIs. Daily mode SHALL read only the newest unconsumed day and warm-start from the latest compatible model; explicit full mode SHALL read the manifest's complete window and initialize a fresh model. The command SHALL validate every handoff, preserve click-attribution labels, record the exact input URIs and mode, and SHALL NOT persist AWS credentials or automatically activate the candidate.

#### Scenario: Daily model update
- **WHEN** `RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI` identifies a valid manifest with a new completed daily export
- **THEN** the training command reads only that newest daily object, initializes from the latest compatible model, and records the base model plus exact daily URI in the new candidate metadata

#### Scenario: Explicit full refresh
- **WHEN** the operator requests full mode against a valid manifest
- **THEN** the training command reads at most thirty immutable daily objects and trains a fresh candidate without using previous weights

#### Scenario: No clickstream export is selected
- **WHEN** `RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI` is absent
- **THEN** the existing seeded local fixture remains the training source

### Requirement: Point-in-time training feature snapshots
The system SHALL provide an explicit backend command that requires a local-calendar `sourceDate`, UTC `since`, and UTC `cutoff`, exports one versioned product snapshot for that source day, and exports only buyer profiles whose stored profile changed inside `(since, cutoff]`. The source-day partition SHALL NOT be inferred from the UTC cutoff date. Buyer changes SHALL be read from the materialized profile table in bounded pages rather than rebuilding activities per buyer, and SHALL contain only the clickstream-compatible pseudonym and key ID. The Glue transform SHALL read only the source-day product snapshot, source-day buyer delta, and previous compacted buyer state; it SHALL carry unchanged buyers forward, require compatible versions, and emit the ordered sixteen online ranking features.

#### Scenario: Enriched authenticated impression
- **WHEN** an attributed impression has a buyer pseudonym and compatible committed buyer and product snapshots at or before `occurredAt`
- **THEN** Glue writes one labelled training row containing snapshot provenance and all ordered ranking features instead of zero-filled placeholders

#### Scenario: Anonymous or unmatched impression
- **WHEN** an impression is anonymous or either compatible point-in-time snapshot is unavailable
- **THEN** that impression is excluded from the personalized training export rather than receiving invented feature values

#### Scenario: Buyer has no activity on the source day
- **WHEN** the buyer has no changed profile in the source-day delta but exists in the previous compacted state
- **THEN** Glue uses that last profile for source-day impressions and carries it into the new compacted state without querying older snapshot history

#### Scenario: One bounded daily transform
- **WHEN** Glue processes a source date at 04:00 the next day
- **THEN** it reads only that source date plus the immediately previous compacted state, creates that daily dataset once, and updates a fixed manifest containing no more than thirty daily dataset URIs

#### Scenario: Trainer reads enriched Glue export
- **WHEN** `recommendations:train` reads a snapshot-enriched `training.csv`
- **THEN** it learns feature weights, records the snapshot-backed clickstream source and remains candidate-only without automatic activation

### Requirement: Personalized daily recommendations
The system SHALL personalize only the homepage `DAILY_RECOMMENDATIONS` module in this change. It SHALL return up to 24 initial displayable products, exclude duplicates, and enforce at most three products from one shop and at most six products from one category in the initial result.

#### Scenario: Eligible buyer homepage
- **WHEN** an eligible buyer requests the homepage and personalized ranking is available
- **THEN** the daily-recommendations module contains up to 24 personalized, displayable, diversity-constrained products

#### Scenario: Guest or cold-start homepage
- **WHEN** a guest or cold-start buyer requests the homepage
- **THEN** daily recommendations use a diverse baseline based on best-selling, rating confidence, and freshness

#### Scenario: Other homepage modules
- **WHEN** homepage personalization is enabled
- **THEN** Flash Sale, Top Selling, Mall, and other curated modules retain their existing resolution and ordering behavior

### Requirement: Personalized ranking fallback
Personalization failures SHALL be non-blocking. Missing profiles, missing models, version mismatch, scoring failures, or profile timeouts SHALL fall back to baseline Elasticsearch ranking, and Elasticsearch failure SHALL fall back to the existing PostgreSQL behavior appropriate to the surface.

#### Scenario: Profile retrieval failure
- **WHEN** a buyer profile cannot be retrieved within the configured timeout
- **THEN** search and daily recommendations return baseline results rather than an error or empty result

#### Scenario: Personalized script failure
- **WHEN** personalized scoring fails for an otherwise valid request
- **THEN** the system retries or reissues the request without personalization and returns baseline eligible results

#### Scenario: Homepage Elasticsearch failure
- **WHEN** Elasticsearch cannot serve daily recommendations
- **THEN** the homepage uses its existing curated or PostgreSQL-backed fallback and does not remove unrelated homepage modules

### Requirement: Product-detail related products remain unchanged
This change SHALL NOT route product-detail related products through personalized or Elasticsearch similarity ranking.

#### Scenario: Product detail request
- **WHEN** a buyer opens a product-detail page after this change
- **THEN** the related-products collection continues to use the existing PostgreSQL same-category behavior and contract

### Requirement: Personalized quality and safety gates
Personalized evaluation SHALL compare the personalized order with the Elasticsearch baseline on the same eligible candidates and SHALL treat sellability and explicit-sort violations as release-blocking failures.

#### Scenario: Candidate model quality report
- **WHEN** a compatible model and sufficient held-out examples are available
- **THEN** evaluation reports personalized NDCG improvement, AUC, and log-loss improvement against their defined baselines

#### Scenario: Unsafe personalized output
- **WHEN** personalized evaluation finds a non-sellable result or an explicit-sort violation
- **THEN** the candidate model or ranking configuration is not eligible for activation
