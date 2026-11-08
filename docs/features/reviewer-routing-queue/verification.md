# Reviewer routing and queue verification evidence

## Scope and environment

Evidence covers the Issue #4 branch integrated with `sprint-1-staging` after Issue #3 (PR #20) merged. The integration merge commit is `46aae88dd04f20dc8a333ffd055f039807661826`; the pre-integration baseline was `da19e0527485057a4b8d940bd60828416e4a7af5`. Tests ran on Windows with Node.js v24.22.1, npm 11.19.1 and a native disposable PostgreSQL 18.1 loopback instance. Migrations 0000–0005 and seed passed.

## Integration

- `origin/sprint-1-staging` merged into `feature/4-reviewer-routing-queue`. Two additive conflicts were resolved by keeping both sides: `apps/web/app/routes.ts` (the `/reviews` and `/requests` routes) and `packages/contracts/src/index.ts` (the `approvalTasks` and `requestCollection` exports).
- The shared `RequestCollection` from Issue #3 is now present, so the previously missing import and its two implicit-`any` follow-on errors are resolved. `ReviewQueuePage` reuses the shared collection unchanged.
- One genuine integration conflict surfaced in `apps/web/tests/components/shell.test.tsx`: the merged navigation exposes both `/requests` (Issue #3) and `/reviews` (Issue #4). The role-union expectations were updated to the combined feature set.
- The reviewer index migration `0005_productive_bromley.sql` was generated against the Issue #3-integrated journal, as the design required.

## Executed checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, Vitest, workspace builds) | 310 passed, 34 files |
| `npm run test:integration` with `RUN_BUILT_HTTP_SMOKE=1`, after API build | 51 passed, 6 files |
| `npm run test:e2e` (full Playwright suite) | 21 passed |
| `git diff --check` | Passed |

The E2E run includes the Issue #4 reviewer journey (`e2e/reviewer-queue.spec.ts`), the Issue #3 requester journey (`e2e/request-list-detail.spec.ts`), the Issue #2 submission journey and the Issue #1 identity journeys, so the combined browser coverage is exercised on the integrated branch.

## Migration evidence

| Path | Action | Result |
| --- | --- | --- |
| Upgrade | Applied 0005 to the populated `workflow_test` database (190 requests, 88 revisions, 51 cycles, 53 slots, 52 stages, 205 users) | Row counts unchanged; `approval_slot_reviewer_status_idx` created; migration count 5 → 6 |
| Fresh | Applied 0000–0005 to an empty `workflow_test` database | 21 tables created; `approval_slot_reviewer_status_idx` created; migration count 6 |

## Remaining gates at the integrated-branch run

- At that run, REV-PG-04 multi-page and REV-PG-05 concurrency cases were unrun; the full REV-PG-01/02/03 fixture matrices were open. See the November 8 evidence below for subsequent results.
- Issue #5 owns live decision and self-vote verification (REV-CROSS-01); delegation (REV-CROSS-02) remains a separate future dependency. These results do not satisfy those gates or imply complete STS case coverage.
- Independent teammate review and the staged PR workflow remain outstanding; no publication is implied by this document.

## November 8 local verification

The code and tests verified locally on November 8 are recorded in `fa8a967a03f2a6ec8a1e2e8c26046d8380e8ae05`. The runs used the exact six-file patch applied to `5b27bb8542ce8bc37051736ee38cb189177bb943` before it was committed. Windows used Node.js 24.22.1 and npm 11.19.1. The isolated checkout passed `npm.cmd ci --no-audit --no-fund` with elevated execution after the sandboxed offline install failed with EPERM.

Docker PostgreSQL 17 Alpine ran on an isolated loopback connection. Fresh migration and seed passed: six journal rows, 21 public tables and btree `approval_slot_reviewer_status_idx (reviewer_id,status)`. A separate upgrade applied 0000–0004 from `a4ccbcaee534f3b79b3bfb31a54d4785770ada43`, seeded and passed the existing two-stage fixture test (one selected). Normal migration ran twice: journal 5 → 6 → 6, index absent → present, and request/revision/cycle/stage/slot/user counts remained 1/1/1/2/3/10.

| Check | Result |
| --- | --- |
| Focused `npm.cmd run test:integration --workspace @workflow/api -- tests/postgres/requests.test.ts --reporter=verbose` | 27/27 passed on elevated rerun, including REV-PG-01–05 and HTTP pagination. Initial run was 26/27 due to a null-due-date expectation; the expectation was corrected before rerun. |
| `RUN_BUILT_HTTP_SMOKE=1 npm.cmd run test:integration` | 59/59 passed in six files, no skips; REV-PG-04 passed again on the same database. |
| Focused web; full web | 20/20; 119/119 passed. Strict typecheck initially exposed unchecked indexes; implementation was corrected and latest UI typecheck passed. |
| `test:contracts`; `test:api` | 15/15; 183/183 passed. |
| Playwright | 21/21 Chromium tests passed, including assigned reviewer desktop/mobile and private SSR checks. Explicit keyboard coverage remains missing. |
| `npm.cmd run check` | Elevated clean-snapshot rerun passed: root and workspace typecheck, ESLint, 317 tests in 34 files (15 contracts, 183 API, 119 web), and all workspace builds. An earlier attempt passed typecheck but stopped at lint on brace style in a new web test; formatting was corrected. Final targeted web lint and 20 focused tests passed. |

The exact six-file worktree patch was verified by SHA256 against the clean snapshot after the formatting correction. Both isolated Docker test projects were torn down.

REV-CT-01 and REV-E2E-02 remain partial as described in the [STS](sts.md). Issue #5 owns REV-CROSS-01 and REV-AC-06; future delegation owns REV-CROSS-02. Independent teammate review and promotion remain pending.
