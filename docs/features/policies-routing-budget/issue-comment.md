## Issue #9 — implementation and synchronized verification evidence

Implemented `R09`, `O10`, `O18`, and `O19` on branch `feature/9-policies-routing-budget` ([PR #90](https://github.com/oangsa/approval-system/pull/90) targeting `sprint-2-staging`, synchronized with `origin/sprint-2-staging` `e3816c0`).

- **Tested merged implementation/test commit SHA:** `7238a20ae1451f87ea5b89d14058966d09337908` (integrating `origin/sprint-2-staging` `e3816c0` onto `2e5f19d575b93ec9b2f8f792e3a264e85ecd7e87`; followed only by the documentation/`ai_use.md` synchronization commit with identical runtime and test code).
- **Environment:** Linux, Node.js `v24.18.1`, npm `11.16.0`, PostgreSQL 17 Alpine (`postgres:17-alpine` fresh disposable loopback `workflow_test` container, recreated before verification and removed afterward), Vitest `4.1.10`, Playwright `1.60.0` (headless Chromium).

### Scope summary

Adds strict shared Zod contracts (including immutable creation-only reviewer assignment keys); Clean Architecture admin policy draft/patch/branch/publish/disable operations; versioned and audited reviewer groups and hard ceilings; Drizzle migrations `0011`–`0013` and runtime grants; admin-only minimal eligible reviewer lookup; and React Router admin configuration pages with paged lookups, read-only assignment keys on edit, version controls, `ALL` labels, priority ambiguity warnings, exact ceilings, and `409`/`422` recovery. Submit validates every stage before mutation and snapshots actual slots; published policy and mapping updates affect future cycles only. Full return/resubmit lifecycle remains with Issue #7 per owner-approved bounded scope; Issue #9 provides and tests current-policy resolution using the historical server-owned department and pinned form. No simulation endpoint, balance ledger, or funds mutation was added.

### Executed checks on `7238a20ae1451f87ea5b89d14058966d09337908` (`0` failed, `0` skipped)

- `npm run check` (`npm run typecheck && npm run lint && npm test && npm run build`): passed — `typecheck` passed, `lint` passed, Vitest **60 files / 501 tests passed** (`0` skipped), and API, client/SSR, and contracts builds passed.
- `npm run test:release`: **13 tests passed** (`0` skipped).
- `npm run db:test:down -- -v && npm run db:test:up && NODE_ENV=test npm run db:test:migrate`: passed on fresh `workflow_test` (migrations through `0013`).
- `NODE_ENV=test npm run test:initialization`: **1 file / 1 test passed** (`0` skipped) on fresh unseeded PostgreSQL.
- `NODE_ENV=test npm run db:test:seed`: passed.
- `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration`: **13 files / 143 tests passed** (`0` skipped), including built-listener HTTP smoke tests, `reportingDashboard.test.ts`, concurrent policy publication/idempotency, concurrent policy v2 publication versus request submission across independent PostgreSQL transactions (`CX-12` / `PRB-AC-09` / `BR-024` / `BR-045` — complete `v1` or `v2` snapshot with zero mixed stages/reviewers or duplicate side effects), immutable reviewer assignment keys, atomic rollback, minimal authorization projections, historical routing seam, runtime grants, and migrator ownership.
- `NODE_ENV=test npm run test:e2e`: **49 tests passed** (`1.3m`, `0` skipped) in headless Chromium after the fresh migration/initialization/seed/integration CI sequence, including `E2E-08` configure-to-submit, read-only assignment key edit/API `422` rename rejection, duplicate-scope `409`, over-ceiling `422`, exact-ceiling two-stage submission, SSR isolation, mobile overflow, dark tokens, and reduced motion.
- `git diff --check`: passed on changed files.

*(Pre-merge Issue #9 revision `2e5f19d575b93ec9b2f8f792e3a264e85ecd7e87` also passed `54` files / `480` Vitest, `13` release, `1` initialization, `12` files / `126` PostgreSQL, and `45` E2E tests, plus remote GitHub Actions `Verification` on `a8c232c`.)*

### Disclosures and remaining gates

- **Non-executed local checks:** Production Docker image builds (`approval-release:ci`, `approval-api:ci`, `approval-web:ci`) run in GitHub Actions CI on push/PR rather than locally in this pass. Safari/Firefox, production deployment, and Issue #7's full return/resubmit lifecycle were not performed or claimed.
- **Pending external gates:** Independent teammate review by `@kittipichcha` on PR #90 (`sprint-2-staging`), followed by reviewed promotion to `dev` and release-reviewed promotion to `main`.
