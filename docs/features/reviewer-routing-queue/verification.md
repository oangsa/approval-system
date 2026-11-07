# Reviewer routing and queue verification evidence

## Scope and environment

Evidence covers working-tree fixes tested against baseline `da19e0527485057a4b8d940bd60828416e4a7af5`, not an integrated release. Tests ran on Windows with Node.js v24.22.1, npm 11.19.1 and a native disposable PostgreSQL 18 loopback instance. Baseline-compatible migrations 0000–0003 and seed passed.

## Executed checks

| Check | Result |
| --- | --- |
| `npm run test:api` | 181 passed |
| `npm run test:contracts` | 13 passed |
| `npm run test:integration` with `RUN_BUILT_HTTP_SMOKE=1`, after API build | 50 passed |
| `npm run test:web -- apps/web/tests/components/reviewTask.test.tsx apps/web/tests/unit/approvalTaskService.test.ts` | 8 passed |
| API and contracts typecheck, API build, scoped lint, `git diff --check` | Passed |

The guard regression first produced one expected failure and seven passes, then eight passes after the fix. HTTP detail tests initially returned 403 for Administrator and owner where 404 was expected; afterward foreign and missing details had 404 parity. Search wrong-role 403 and anonymous 401 remained intact. Detail recovery initially had three expected failures, then five passes.

The two-stage fixture initially hit SQLSTATE 23514 because published policy is immutable. The fixture then inserted published stages upfront. Real PostgreSQL verified the active cycle, snapshot, stages, three slots and active queue only. See [STS executed coverage and gaps](sts.md#executed-coverage-and-gaps) for case boundaries.

## Remaining gates

The baseline [CI run](https://github.com/oangsa/approval-system/actions/runs/42352392724), job 128343118570, failed web typecheck solely because Issue #3 `RequestCollection` was missing (TS2307 and two TS7006 errors); later workflow steps were skipped. No Issue #3 merge or copy is included in this evidence.

Root and web builds, queue recovery and full browser coverage, reviewer index, integrated fresh and upgrade verification, and teammate approval remain gated. Issue #5 owns live decision and self-vote verification; delegation is a separate future dependency. These results do not satisfy those gates or imply complete STS case coverage.
