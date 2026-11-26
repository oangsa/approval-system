# Verification

Status: implementation and final automated verification complete. Fresh independent local [review](review.md) approved with no open findings. Human delivery gates remain separate.

Baseline `e011d1a49163d5b01e9304aeae72cc2cb28161e9`; Node 24.22.1, npm 11.19.1. Task-owned disposable PostgreSQL 17 instances use ports 55435 (integration, `.env.issue10`) and 55436 (browser, `.env.issue10-browser`). Existing instances on 55433/55434 were left untouched. Credentials remain in ignored local environment files. Required coverage and delivery gates are in [STS](sts.md) and [DoD](dod.md).

## Baseline checks — 2026-11-26

Before source implementation, `npm run typecheck` passed. `npm test -- --maxWorkers=2` ran 526 tests in 62 files: 524 passed and two failed. The unchanged ConditionBuilder case exceeded its five-second timeout; the unchanged request-type filter case failed its mocked selection assertion and produced an undefined-promise error. The isolated rerun `npx vitest run --project web apps/web/tests/components/requestTypeFilter.test.tsx apps/web/tests/components/adminRequestTypes.test.tsx --maxWorkers=1 --testTimeout=20000` passed all eight tests in both files. The explicit local timeout allowance changes no repository check or assertion; the initial failures remain disclosed. Logs: ignored `artifacts/issue10/baseline-{typecheck,tests,web-recheck}.log`.

Existing migrations and synthetic seeds succeeded on both task databases. An initial invocation incorrectly supplied `--env-file` through `NODE_OPTIONS`, which Node rejects before running npm; loading the task environment into the process corrected the command. Logs: `artifacts/issue10/{baseline,browser}-{migrate,seed}.log`. These baseline checks do not verify the new feature.

The feature contracts were written before source implementation. No commit, push, external issue update, PR publication, deployment, teammate review or staged promotion is authorized by the current implementation request.

## Combined implementation checks

| Check | Command | Result | Log under `artifacts/issue10/` |
| --- | --- | --- | --- |
| Typecheck | `npm run typecheck` | PASS, exit 0 after final test additions | `final-typecheck-verified.log` |
| Lint | `npm run lint` | PASS, exit 0 after final test additions | `final-lint-verified.log` |
| Ordinary unit/API/contract/web tests | `npm test -- --maxWorkers=2 --testTimeout=20000` | PASS, 63 files / 534 tests, no failures or skips | `final-tests.log` |
| Build | `npm run build` | PASS, all workspaces | `final-build.log` |
| Release tooling | `npm run test:release` with Git Bash first in process PATH | PASS, 13/13, no failures or skips | `release-tests-gitbash.log` |
| Real PostgreSQL | `RUN_BUILT_HTTP_SMOKE=1 npm run test:integration`, task environment | PASS, 16 files / 191 tests, no failures or skips | `postgres-final.log` |
| Focused browser | `npx playwright test e2e/two-stage-parallel-approvals.spec.ts`, browser task environment | PASS, 1/1 including queue/stale assertions | `browser-focused-final.log` |
| Full browser regression | `npm run test:e2e`, browser task environment | PASS, 52/52 Chromium tests, no failures or skips | `e2e-final.log` |

The first release tooling run selected Windows WSL Bash and failed four mocked release tests before cloud calls because the subprocess did not receive its expected environment (`PROJECT_ID` missing). Selecting installed Git Bash through process PATH and rerunning the unchanged suite passed all 13 tests. No release code or assertion changed. Earlier log: `release-tests.log`.

Focused source checks passed 39 API/domain/contract/OpenAPI tests and 32 frontend tests. Independent review separately passed 26 API/domain/OpenAPI and 32 frontend tests using process-local temporary-file paths. Sandbox Vitest runs that failed temporary-file rename before collection are environmental failures, not test results; successful outside-sandbox or process-temp reruns are distinguished.

During acceptance-test authoring, stage deadline access on the stage instead of slot and selection of a different reviewer's future slot caused a typecheck error and one fixture assertion failure. The test packet was escalated from Terra medium to Terra high after those two construction errors, preserving the implemented source and verified tests. The corrected scoped PostgreSQL run passed eight tests (41 unrelated tests filtered, not full-suite evidence). An endpoint assertion was corrected from `no-store` to the frozen `private, no-store`; production headers were unchanged.

## Acceptance repairs and final tree

The first full PostgreSQL run executed 188 tests in 15 files: 186 passed and two historical-authorization tests failed at exact snapshot tuple validation (`INVALID_REQUEST_TRANSITION`). Independent review TP-R1 and a read-only diagnostic falsification harness confirmed unsupported fixtures: they injected a cancelled shadow slot absent from the frozen policy/assignments into an active cycle. Supported reassignment preserves the existing slot. The repair creates a real parallel required peer before submission and lets RETURN cancel it, retains every historical authorization assertion, clears the group mapping before the next cycle, and verifies immutable snapshots. Added forged-extra-tuple regressions prove APPROVE and RETURN reject with no writes. The repaired historical suite passed 19/19; the final complete PostgreSQL run passed 191/191, including all existing process-restart tests. Logs: `postgres-full.log`, `historical-fixtures-fixed.log`, `postgres-final.log`.

Deterministic independent-connection rendezvous now covers both-stage parallel approval and distinct-slot approval versus RETURN/REJECT. Actual migration SQL is exercised against a populated checked temporary relation, preserving legacy null activation times; runtime timestamp UPDATE runs under the runtime role. A focused database run passed 51 tests and filtered one existing environment-gated process test; this filtered run is distinct from the final full run with zero skips. Log: `two-stage-postgres.log`.

The expanded browser test initially failed on duplicate links in responsive markup, then an exact `Due` label lookup that included option text and never reached filter selection. Browser ownership was escalated from Terra high to Terra xhigh after those two test-authoring failures. Trace analysis confirmed the interaction never occurred; a prefix label match and an overdue-payload-specific response predicate corrected the test. No production filter change, arbitrary sleep, timeout increase or reduced assertion was used. Final focused journey passed with waiting/overdue queue exclusion, stale reason retention/handled reload and all stage/parallel decisions. Failure log: `two-stage-browser.log`; passing log: `browser-focused-final.log`.

Full lint caught three Allman brace violations in the new endpoint test mock; formatting was corrected and final lint passed. An early typecheck caught the in-progress stage deadline fixture error; final workspace typecheck passed. Earlier logs remain `feature-typecheck.log` and `final-lint.log`.

The orchestrator and fresh reviewer inspected desktop and mobile screenshots at `artifacts/issue10/screenshots/{waiting-desktop,partial-mobile}.png`. Ordered waiting/active/completed stages, reviewer labels, partial PENDING status and remaining ALL counts are readable with no visible overflow; the browser also asserts the mobile document does not overflow.

Source identity is base `e011d1a49163d5b01e9304aeae72cc2cb28161e9` plus the uncommitted [27-file source/test/configuration manifest](source-manifest.sha256). Manifest SHA-256: `4c237bb00c92667e7a97e12696976bc2c40c20699e5b52b08296e3936942450f`. It excludes prose records to avoid self-referential hashes. Ordinary tests and build ran after the final production edit; subsequent changes were acceptance tests, fixture corrections, formatting and documentation. `git diff --check` passes excluding `ai_use.md`; that file intentionally preserves the exact prompt's trailing space.

The full browser run completed 52/52 in 4.7 minutes, including policy configuration, historical/private SSR regressions, return/resubmission, and the new two-stage parallel journey. Final source/test files match the manifest independently checked by the fresh reviewer. No automated check remains unrun within the implementation verification scope. Human teammate review, commit/push, PR publication and staged promotions remain pending and require their separate authorization/workflow.
