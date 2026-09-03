# Mock recommendation training fixture

This directory contains the deterministic local fixture used by tasks 5.1–5.8.

- `mock_buyer_events.csv`: authenticated views, favorites, follows, completed orders, and cancelled orders.
- `mock_buyer_profiles.csv`: the expected bounded profile shape for `dat1` and `dat2`.
- `mock_training_examples.csv`: 3,000 impression-like buyer/product pairs with 2,400 train rows and 600 held-out rows (300 positive held-out labels).
- `generate.mjs`: regenerates all files with dataset version `mock-reco-v1` and seed `20260902`.

The labels are synthetic preference-rule labels. Training output is therefore
stored with `demonstration-only` metrics and must not be treated as production
quality evidence.

Run `pnpm recommendations:seed` to validate the fixture and print its stable
partition summary. Set `RECOMMENDATION_SEEDED_DATASET_OUTPUT` when a JSON copy
of the normalized fixture is needed for inspection.
