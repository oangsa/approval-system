# Verification

Status: teammate P1 TP-R2 code correction and automated verification are complete; fresh independent local review approved with no findings. Human teammate re-review remains pending. Earlier local approvals and results below remain historical and did not cover effective-reviewer reassignment compatibility. See the latest repair section and [review record](review.md).

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

## Delivery continuation — 2026-11-26

The earlier authorization and uncommitted-tree statements above describe the original implementation run. Subsequent delivery work recorded seven scoped commits, ending at `4e2ca4334fc502b94c7292c45d3ca0cb05140470`, and published [PR #92](https://github.com/oangsa/approval-system/pull/92) from `feature/10-sprint-2-full-stack-two-stage-parallel-approvals` to `sprint-2-staging`.

On the current request to continue, commit, push and create a PR, GitHub readback confirmed that PR is open and its head matches the clean local branch. All 27 source/test/configuration manifest entries were rechecked with zero mismatches. This follow-up updates delivery and assistance records only; it preserves the existing source commits and reuses PR #92. Application tests were not repeated because the reviewed implementation is unchanged. The recorded automated results above are historical verification, not newly executed checks or a claim about current hosted CI. Human teammate approval, merging and reviewed promotions to `dev` and `main` remain pending.

## TP-R2 reassignment compatibility repair — 2026-11-26

Base `1edf70f7784e352b6e33545ba96ef99bab129cff`. The submitted teammate P1 review was discovered after the preceding delivery confirmation; passing CI and unchanged hashes did not cover the missing compatibility scenario. See [review provenance and requirement](review.md). The explicit user-requested branch name remains intentional.

The production change is limited to slot validation in `DecisionRepository.Lock`: derive required counts per stage/key from distinct original snapshot reviewer entries, then compare persisted counts without requiring the effective reviewer to equal the original reviewer. Current reviewer authorization, self/role/version checks, persisted slot IDs, request-first locks, unique votes, snapshots and the decision transaction remain unchanged. No schema or endpoint is added.

Real PostgreSQL RED run: three replacement journeys failed with `INVALID_REQUEST_TRANSITION` and four malformed-count cases passed (50 unrelated tests filtered). After the repair, all seven TP-R2 cases passed (50 unrelated filtered). These cover active/waiting replacements, grouped ALL, snapshot/identity/deadline preservation, original/foreign/stale denial without effects, one terminal audit, inactive final cycle, exact replay and missing/extra/unknown/balanced counts. Logs: `artifacts/issue10/reassignment-{red,green}.log`.

An initial two-file diagnostic invocation from the repository root reported 75 passes and one `Listener stopped` failure. Its raw log was inadvertently overwritten by the later focused GREEN run; the result and stack were captured in the orchestrator's tool output and are disclosed here as reported evidence, not a retained raw artifact. The existing restart test resolves `dist/index.js` from its working directory: that file exists under `apps/api`, not the repository root. The correct invocation `npm run test:integration --workspace @workflow/api -- decisions.test.ts -t 'API process restart'` passed one test (56 filtered) after the current build. A root-wrapper forwarding attempt was interrupted before that successful direct workspace run; log `reassignment-listener-workspace.log` preserves both. No product/test timeout or assertion was changed.

The ordinary two-worker run reported 533/534 passes, failing only the unchanged request-type filter mocked selection/undefined-promise case already recorded in the original baseline. The unchanged suite passed 534/534 with one worker and the previously disclosed local timeout allowance; no assertion or repository check configuration changed. Initial log: `reassignment-tests.log`; passing full rerun: `reassignment-tests-serial.log`.

| Repair check | Command / environment | Result | Log under `artifacts/issue10/` |
| --- | --- | --- | --- |
| Typecheck | `npm run typecheck` | PASS | `reassignment-typecheck.log` |
| Lint | `npm run lint` | PASS | `reassignment-lint.log` |
| Build | `npm run build` | PASS | `reassignment-build.log` |
| Ordinary suite | `npm test -- --maxWorkers=1 --testTimeout=20000` | PASS, 63 files / 534 tests, zero failures/skips | `reassignment-tests-serial.log` |
| Real PostgreSQL | `RUN_BUILT_HTTP_SMOKE=1 npm run test:integration`, root `.env.issue10`, normal workspace script | PASS, 16 files / 198 tests, zero failures/skips | `reassignment-postgres-final.log` |
| Full browser | `npm run test:e2e`, root `.env.issue10-browser` | PASS, 52 Chromium tests, zero failures/skips | `reassignment-e2e-final.log` |
| Release tooling | `npm run test:release`, Git Bash first in process PATH | PASS, 13/13 | `reassignment-release.log` |

The [TP-R2 source manifest](source-manifest-reassignment-fix.sha256) records the same 27 implementation/test/configuration paths with repaired contents; the original manifest remains historical evidence of the earlier tree. Direct fixture updates exercise compatibility with the supported persisted reassignment postcondition. No administrator reassignment writer exists here, so its endpoint authorization, audit orchestration and reassignment-versus-vote endpoint races are not claimed; existing independent decision races and transactional rollback remain required and are executed in the full suite.

The repair manifest SHA-256 is `b0467cf73ba914fa0dc132315b8939a7e8ac80c151de21efefc2387e941c63fd`. The independent reviewer verified its 27 entries with zero mismatches. Final assertion additions were also checked with `npm run typecheck --workspace @workflow/api` and scoped ESLint on the two changed code files, both exit 0 (`reassignment-final-api-typecheck.log`, `reassignment-final-scoped-lint.log`). No source/test edits followed these checks. All repair suites above have completed; the submitted human CHANGES_REQUESTED review is not dismissed by these local results.
