## Purpose

Tạo dataset clickstream cho personal ranking theo lịch cố định mỗi ngày, lưu bản processed và một file CSV có version để bước Model Training tiêu thụ.

## ADDED Requirements

### Requirement: Daily training ETL schedule

The system SHALL start the training Glue ETL at 04:00 every day using the `Asia/Ho_Chi_Minh` time zone. Each scheduled run MUST process the previous completed local calendar day from S3 Raw.

#### Scenario: The daily schedule reaches 04:00

- **WHEN** the scheduler reaches 04:00 in `Asia/Ho_Chi_Minh`
- **THEN** it starts one Glue job run with the previous local calendar date as the input partition date

### Requirement: Impression-level ranking examples

The training transform SHALL produce one example per valid product impression. Each example MUST preserve the impression ID and timestamp, pseudonymous buyer/session context, shop and product IDs, surface, placement, position, request/recommendation context, available ranking version fields, and a binary `labelClicked` derived from a matching product click in the configured attribution window.

#### Scenario: An impression has a matching click

- **WHEN** a click for the same session or buyer, product, and request/recommendation context occurs after an impression within the configured attribution window
- **THEN** the processed example for that impression has `labelClicked` equal to `1`

#### Scenario: An impression has no matching click

- **WHEN** no matching click occurs within the configured attribution window
- **THEN** the processed example for that impression has `labelClicked` equal to `0`

### Requirement: Versioned processed and CSV outputs

Each Glue run SHALL write its normalized interaction dataset to a date-versioned S3 Processed prefix and SHALL publish one UTF-8 CSV artifact named `training.csv` under a run-date prefix. The CSV MUST contain a header and the same documented training columns as the normalized dataset.

#### Scenario: The daily Glue transform completes

- **WHEN** Glue finishes transforming the selected raw date
- **THEN** S3 Processed contains the normalized run output and `exports/training/run_date=<date>/training.csv`

### Requirement: Model training consumes an immutable dataset version

The system SHALL identify every training dataset by its run date and source date so a Model Training consumer can select a specific immutable `training.csv`. This change MUST NOT automatically train, evaluate, activate, or deploy a model.

#### Scenario: A training consumer selects a completed dataset

- **WHEN** Model Training is configured with a completed run date
- **THEN** it can read the corresponding `training.csv` without depending on mutable latest-state data

### Requirement: Least-privilege training access

The scheduler SHALL be permitted only to start the designated Glue job, and the Glue job SHALL be permitted only to read the designated S3 Raw partitions, write the designated S3 Processed prefixes, access its catalog metadata, and publish its operational logs.

#### Scenario: A scheduled training run follows the happy path

- **WHEN** the scheduler starts the designated Glue job
- **THEN** the job reads and writes only the configured training data locations and required metadata
