# CI request-type fixture regression

Verified 2026-11-13 against current `origin/dev` at `12436be3cfad7e6b631cff770db9912198521cac` in the isolated `fix/request-type-fixture-isolation` checkout. Fresh origin fetch also confirmed `sprint-1-staging` at `4c5e5a3` has the same source tree. Existing deployment edits were preserved.

[Failed job](https://github.com/oangsa/approval-system/actions/runs/43370697254/job/131705501341?pr=50) checked out this dev head and passed typecheck, lint, builds and PostgreSQL tests. The request-list browser test then failed because two picker buttons had the accessible name `General request (GENERAL)`. This was not caused by missing UI commits.

The `DB-04 validation failure form preserves draft` PostgreSQL case creates a unique `T<UUID>` request type, but republished version 2 by spreading the global `seededDefinition`. That replaced the definition's code with `GENERAL` while its database row retained `T<UUID>`. Type lookup filters/sorts by the database code and returns the published JSON definition, exposing the inconsistent fixture as another `General request (GENERAL)`. CI runs integration and browser suites against the same database. UUID sort order determines whether the extra label appears on the first lookup page.

Fix the fixture by cloning its existing published definition, changing only version identity/number. Assert that querying the republished type by its unique code returns that same code and version 2. Preserve the stale-form rejection assertion. No application, endpoint, permissions, schema, browser locator or CI workflow change.

## Reproduction and verification

- Added regression before fixing fixture: failed deterministically, returning `code: GENERAL` where `T<UUID>` was expected. Existing requests suite had 1 failure / 26 passes.
- Focused regression after fix: 1 passed; other 26 cases excluded by the targeted test filter.
- `npm run check`: passed all typechecks, lint, 387 tests across 43 files and production builds.
- Recreated only the disposable `approval-ci-fixture-fix` PostgreSQL instance on loopback port 55521; migrated, ran initialization test (1 passed), then seeded.
- `RUN_BUILT_HTTP_SMOKE=1 npm run test:integration`: all 73 tests passed across 10 files; no skips.
- Immediately ran `E2E_WEB_PORT=14421 E2E_API_PORT=14422 npm run test:e2e` against the same database, with no reset/reseed between suites: all 26 Chromium tests passed, including the unchanged strict picker locator.
- `git diff --check`: passed. Local logs are ignored under `artifacts/ci-fixture-fix/`.

Local replay used native Chromium; hosted CI additionally uses its containerized browser environment and builds production Docker images. Hosted results are recorded by the fix PR's checks. Firefox/Safari were not run. No production service/database was used.

The repair targets reviewed `sprint-1-staging`, followed by reviewed promotion to `dev`. PR #50's original failed job remains historical; its source branch receives the fix through that promotion before release review to main.
