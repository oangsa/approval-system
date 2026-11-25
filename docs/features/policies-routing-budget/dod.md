# Definition of done — Issue #9

- [x] Feature SDS, contracts/design, numbered AC, STS and DoD written before implementation.
- [x] Domain/Application/Infrastructure/Presentation, migrations, shared contracts and admin UI complete.
- [x] Submit transaction integrates exact ceilings, all-slot validation and immutable snapshots, including concurrent policy v2 publication versus request submission serialization (`CX-12` / `PRB-AC-09` / `BR-024` / `BR-045`) and immutable reviewer assignment keys (`O10` / `R09` / `O19`).
- [x] Meaningful contract/unit/API/real-PostgreSQL/security/concurrency/E2E tests executed; actual evidence synchronized across [verification.md](verification.md), [issue-comment.md](issue-comment.md), PR #90, and Issue #9.
- [x] Typecheck, lint, build and planned tests pass on tested implementation/test commit `2e5f19d575b93ec9b2f8f792e3a264e85ecd7e87`; non-executed local checks explicitly disclosed below.
- [x] Append exact user prompts and reflections to `ai_use.md`.
- [x] Authorized scoped commits and PR [#90](https://github.com/oangsa/approval-system/pull/90) opened targeting `sprint-2-staging`.
- [ ] Independent `@kittipichcha` review approval on PR #90, merge to `sprint-2-staging`, reviewed promotion to `dev`, and release-reviewed promotion to `main`. No self-review or production release implied.

## Verified revision summary

- **Tested commit SHA:** `2e5f19d575b93ec9b2f8f792e3a264e85ecd7e87` on `feature/9-policies-routing-budget` (followed only by the documentation/`ai_use.md` record commit).
- **Environment:** Linux, Node.js `v24.18.1`, npm `11.16.0`, PostgreSQL 17 Alpine (`postgres:17-alpine` fresh disposable loopback `workflow_test` container), Vitest `4.1.10`, Playwright `1.60.0` (headless Chromium).
- **Commands and results (`0` failed, `0` skipped across all suites):**
  - `npm run check`: `typecheck` passed, `lint` passed, `npm test` **54 files / 480 tests passed**, `build` passed (`@workflow/contracts`, `@workflow/api`, `@workflow/web`).
  - `npm run test:release`: **13 tests passed**.
  - `npm run db:test:down -- -v && npm run db:test:up && NODE_ENV=test npm run db:test:migrate`: passed on fresh `workflow_test`.
  - `NODE_ENV=test npm run test:initialization`: **1 file / 1 test passed**.
  - `NODE_ENV=test npm run db:test:seed`: passed.
  - `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration`: **12 files / 126 tests passed** (`configuration.test.ts`: `11/11`).
  - `NODE_ENV=test npm run test:e2e`: **45 tests passed** (`1.0m`).
  - `git diff --check`: passed.
- **Disclosed non-executed local items:** Production Docker image builds (`approval-release:ci`, `approval-api:ci`, `approval-web:ci`) run in GitHub Actions CI on push/PR; Safari/Firefox, production database migration/deployment, and Issue #7's full return/resubmit lifecycle were not executed or claimed.
