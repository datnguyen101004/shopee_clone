# Search relevance dataset v1

Generated from the PostgreSQL displayable catalogue snapshot catalogue-v1-20260902162225 at 2026-09-02T16:22:25.957Z.

- Products: 1366
- Queries: 45
- Positive judgments: 2773
- Snapshot SHA-256: f15c04bd8f602f8f5821c18232bdf6066162b9a876550077650a623accd4bd51

Missing judgments are treated as relevance `0`. Labels use `0` (irrelevant), `1` (weak), `2` (relevant), and `3` (strong/target). The fixture is a local, manually reviewable baseline evaluation set; it is not buyer training data.

Regenerate with `pnpm search:relevance:dataset` after a deliberate catalogue snapshot change. Do not overwrite a version used in a previous benchmark.
