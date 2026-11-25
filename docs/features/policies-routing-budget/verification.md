# Actual verification — Issue #9

**Last verified:** 2026-11-25 (`Asia/Bangkok`)
**Branch:** `feature/9-policies-routing-budget`
**Tested implementation/test commit SHA:** `2e5f19d575b93ec9b2f8f792e3a264e85ecd7e87` (`test(policies): cover concurrent policy publish and request submit`)
**PR:** [#90](https://github.com/oangsa/approval-system/pull/90) targeting `sprint-2-staging` (documentation-only synchronization commit follows `2e5f19d575b93ec9b2f8f792e3a264e85ecd7e87` without modifying runtime or test files). Owner `@oangsa`; independent teammate review by `@kittipichcha` remains pending.

## Environment and scope

- **Environment:** Linux, Node.js `v24.18.1`, npm `11.16.0`, PostgreSQL 17 Alpine (`postgres:17-alpine` disposable loopback `workflow_test` container via `apps/api/tests/postgres/compose.yaml`, recreated with `db:test:down -- -v && db:test:up` before verification and removed with `db:test:down -- -v` afterward), Vitest `4.1.10`, Playwright `1.60.0` (headless Chromium). No development or production database was modified, and no credentials, cookies, or trace tokens are committed.
- **Scope boundary:** Owner confirmed bounded Issue #9 scope: current routing/ceiling configuration and a tested historical department/form resolution seam ship in Issue #9; full return/resubmit lifecycle remains Issue #7. Staged decision execution and approver display retain their primary feature ownership. No simulation endpoint, balance ledger, or funds mutation was added.

## Executed checks on `2e5f19d575b93ec9b2f8f792e3a264e85ecd7e87`

| Command | Actual result |
|---|---|
| `npm run check` (`npm run typecheck && npm run lint && npm test && npm run build`) | Passed: workspace + root `typecheck` passed; `lint` passed; `npm test` passed **54 files / 480 tests** (`0` failed, `0` skipped); `build` passed across `@workflow/contracts`, `@workflow/api`, and `@workflow/web` (client + SSR) |
| `npm run test:release` | Passed: **13 tests** (`0` failed, `0` skipped) |
| `npm run db:test:down -- -v && npm run db:test:up && NODE_ENV=test npm run db:test:migrate` | Passed: fresh `workflow_test` database created and all migrations (including `0011`–`0013`) applied |
| `NODE_ENV=test npm run test:initialization` | Passed: **1 file / 1 test** (`0` failed, `0` skipped) on fresh unseeded database |
| `NODE_ENV=test npm run db:test:seed` | Passed |
| `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` | Passed: **12 files / 126 tests** (`0` failed, `0` skipped), including built-listener HTTP smoke tests and `configuration.test.ts` (**11/11**) |
| `NODE_ENV=test npm run test:e2e` | Passed: **45 tests** (`1.0m`, `0` failed, `0` skipped) in headless Chromium immediately following the CI database sequence |
| `git diff --check` | Passed (`0` whitespace or conflict issues) |

**Disclosed skips, failures, and non-executed local checks:** Zero failed or skipped tests occurred in any executed suite above (`480` unit/API/contract/component, `13` release, `1` initialization, `126` PostgreSQL integration, `45` Playwright Chromium E2E). Production Docker image builds (`approval-release:ci`, `approval-api:ci`, `approval-web:ci`) execute in the GitHub Actions `Verification` workflow on push/PR rather than locally in this pass. Safari/Firefox, production database migration/deployment, and full Issue #7 return/resubmit lifecycle were not performed or claimed.

## Coverage and evidence

- **Contracts (`packages/contracts`):** One/two ordered stages, strict `ALL`-only shape, SLA default `480`, exact inclusive amount bounds, positive ceilings, endpoint search allowlists, PATCH omission preservation, and creation-only immutable reviewer assignment `key` (`patchAssignmentRuleSchema` rejects `key` updates).
- **API and security (`apps/api`):** Admin `POST`/search/`PATCH`/lifecycle actions, direct frozen DTOs, publish `Idempotency-Key`, `401`/`403` denial, stale `409`, `X-Pagination`, minimal eligible-reviewer projection, no admin confidential request-content read grant, and CORS `POST`/`PATCH`/`Idempotency-Key` preflight checks.
- **Real PostgreSQL (`apps/api/tests/postgres/configuration.test.ts`, `runtimePrivileges.test.ts`, `migratorOwnership.test.ts`):**
  - Concurrent same-draft publication produces one immutable version; same-key replay survives later branching; changed payload rejects with `IDEMPOTENCY_CONFLICT`; transactional before/after audit rows and published policy versions are immutable.
  - **Concurrent policy v2 publication versus request submission (`CX-12` / `PRB-AC-09` / `BR-024` / `BR-045`):** Real multi-connection PostgreSQL test (`observer.connection` vs `database.connection`) publishes two-stage policy v2 while a requester submits a request across both unscripted concurrent races and lock-held interleavings, proving both `v1` and `v2` serialization outcomes occur and every accepted cycle, stage row, slot row, and `RequestDetail` contains either a complete `v1` or complete `v2` snapshot with zero mixed stages/reviewers and zero duplicate policy versions, cycles, audits, or outbox events.
  - Rejected assignment key renames (`422` at HTTP/service/repository and omitted `UPDATE(assignment_key)` runtime grant) preserve mapping identity, published policy references, future routing, optimistic concurrency, and `ASSIGNMENT_UPDATED` audit history.
  - Exact ceilings immediately below/at/above, department-specific limit override, highest numeric priority/tie (`409 AMBIGUOUS_APPROVAL_POLICY`), missing route/inactive/self-only later mappings (`409 CONFIGURATION_INCOMPLETE`) with zero partial mutation, trusted primary-department selection, multi-reviewer `ALL` parallel slot expansion, and unchanged in-flight snapshots after disable/mapping edits.
- **Issue #7 seam:** Historical server-owned department and pinned form remain intact after membership/form changes while changed amount resolves the current published two-stage policy.
- **Browser (`e2e/policies-routing-budget.spec.ts`, `E2E-08`):** Admin eligible reviewer lookup, mapping creation, read-only assignment key on edit (`PATCH` version bump without rename and `422` on API rename attempt), type selection, local preview, policy v1/branch/v2 publication, stage-3 absence, ceiling creation and duplicate-scope `409` feedback, requester role denial, above-ceiling `422` display, corrected at-ceiling submit with two-stage slots, SSR private-data absence, mobile overflow, dark CSS tokens, and reduced-motion checks. Local screenshots remain in ignored `artifacts/policies-routing-budget/`.

## Revision and remediation history

1. **Initial development fixes (pre-PR baseline `f53e955` — historical counts `479` Vitest / `124` PostgreSQL / `45` E2E):** Resolved omitted Elysia collection `params`, Zod partial PATCH defaults, CORS `Idempotency-Key`/`PATCH` preflight headers, per-stage snapshot slot deduplication, narrow-viewport lookup button wrapping, and unique E2E fixture naming.
2. **PR #90 Review 1 P1 remediation (`156865c`..`9df0986` — historical counts `480` Vitest / `125` PostgreSQL):** Made reviewer assignment `key` immutable after creation across `packages/contracts`, `ConfigurationService`, `ConfigurationRepository`, `deploy/runtime-grants.sql`, `configurationService.ts`, and `ConfigurationListPage.tsx`, with contract, OpenAPI, component, PostgreSQL, runtime-grant, and Playwright regression coverage.
3. **PR #90 Review 2 B01–B02 remediation (`2e5f19d575b93ec9b2f8f792e3a264e85ecd7e87` — current counts `480` Vitest / `126` PostgreSQL / `45` E2E):** Added the real multi-transaction `CX-12/PRB-AC-09` policy v2 publication versus request submission PostgreSQL test in `configuration.test.ts`, updated `sts.md`, executed the full CI-order verification suite against `2e5f19d575b93ec9b2f8f792e3a264e85ecd7e87`, and synchronized `verification.md`, `dod.md`, `issue-comment.md`, PR #90 description, and [Issue #9 comment](https://github.com/oangsa/approval-system/issues/9#issuecomment-7153135001).

## Remaining gates

Independent teammate review by `@kittipichcha` on PR #90 (`feature/9-policies-routing-budget` -> `sprint-2-staging`), followed by reviewed promotion to `dev` and release-reviewed promotion to `main`, remain required before release.
