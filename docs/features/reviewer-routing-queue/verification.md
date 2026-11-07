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

## Remaining gates

- REV-PG-04 multi-page and REV-PG-05 concurrency cases remain unrun; the full REV-PG-01/02/03 fixture matrices remain open as recorded in [STS executed coverage and gaps](sts.md#executed-coverage-and-gaps).
- Issue #5 owns live decision and self-vote verification (REV-CROSS-01); delegation (REV-CROSS-02) remains a separate future dependency. These results do not satisfy those gates or imply complete STS case coverage.
- Independent teammate review and the staged PR workflow remain outstanding; no publication is implied by this document.
