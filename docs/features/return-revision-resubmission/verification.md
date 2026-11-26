# Verification evidence

Status: NOT RUN. P0 defines planned contracts only; no feature implementation, test, AI review or human teammate review is claimed here. Prior feature evidence does not verify issue #7.

| Check | Status | Evidence |
| --- | --- | --- |
| RR-T-01–12, including child rows | NOT RUN | Pending implementation and per-assertion results |
| Typecheck, lint, contracts, API and web tests | NOT RUN | Pending final tree |
| Real PostgreSQL migration, integration, rollback and races | NOT RUN | Pending isolated task database and final tree |
| Build and real API/PostgreSQL browser journeys | NOT RUN | Pending final tree |
| Desktop/mobile screenshots, accessibility and privacy | NOT RUN | Pending inspection |
| Independent local AI review | NOT RUN | Pending final implementation |
| Human teammate review | PENDING | Separate from AI review |
| PR and staged promotions | PENDING | Subject to workflow and authorization |

Record exact tested commit or uncommitted tree identity, environment, commands, counts, failures, skips, reruns and evidence locations here. See [STS](sts.md), [DoD](dod.md) and [plan](plan.md) for execution boundaries and isolated database safeguards.

## Baseline and environment — 2026-11-25

Starting source revision: `7238b5e`, matching freshly fetched `origin/sprint-2-staging`. Feature contracts were committed before product edits as `0a736de`. The requested feature branch name takes precedence over the older branch label in the issue. Node.js 24.22.1 and npm 11.19.1 are installed. Task-owned Compose project `issue7` runs disposable PostgreSQL 17 on loopback port 55433, separate from the pre-existing test instance on 55432. Existing migrations and synthetic seed completed successfully; test target guards remain enabled. Credentials are generated locally in ignored `.env.issue7` and are not part of the evidence.

Baseline checks preceded feature source edits. Typecheck and lint passed. Sandboxed Vitest failed before loading tests because temporary-file renames were denied; the outside-sandbox run executed 501 tests, with 499 passing and two five-second timeouts in unchanged `adminRequestTypes.test.tsx`. An isolated default-timeout rerun passed five of six tests, with the long ConditionBuilder case timing out. A diagnostic rerun with `--testTimeout=20000` passed all six assertions-based tests. No timeout configuration or test assertion was changed. The aggregate baseline command stopped at tests, so it did not run its build step. Logs: ignored `artifacts/issue7/baseline-check.log`, `baseline-check-unsandboxed.log`, `baseline-admin-recheck.log`, and `baseline-admin-diagnostic.log`.

The initial sandboxed database migration/seed attempt failed with `EACCES` connecting to 127.0.0.1:55433. The identical guarded commands succeeded outside the network sandbox. These are environment failures, not feature verification. Final implementation results remain pending above.

## Resumed checks and review — 2026-11-26

Docker Desktop was stopped when work resumed. Restarted its installed per-user application and only the task-owned Compose instance, then reapplied all migrations and seeded synthetic fixtures after the tmpfs database was recreated. The existing port-55432 database was not used or reset. Fresh fetch confirms sprint staging remains `7238b5e`.

The preserved implementation passes full workspace typecheck, lint and build. `npm test -- --maxWorkers=2` executed 507 tests: 506 passed and the unchanged baseline ConditionBuilder test exceeded its five-second timeout. `npm test -- --maxWorkers=2 --testTimeout=20000` subsequently passed all 507 tests in 61 files. This explicit local time allowance changes no test assertion or repository timeout setting; the default-timeout failure remains disclosed. Logs are `artifacts/issue7/final-{typecheck,lint,build,tests,tests-extended}.log`. Subsequent review repairs and new tests still require their applicable final reruns.

The [initial independent agent review](review.md) requested a returned Overview correction and additional PostgreSQL/UI acceptance assertions. A fresh implementation agent owns each repair packet. The PostgreSQL acceptance packet was escalated from Terra medium to Terra high after two test-authoring failures: incorrect fixture substitution/stale error expectation, followed by incorrect ambiguous-policy/role-removal expectations. These are test construction failures, not established product defects. Verified stage-two and RETURN-copy rollback work was preserved; final coverage and reruns remain pending.

The initial browser failure persisted after a longer diagnostic timeout. Trace and screenshot inspection established a mobile selector defect: the queue renders list items below the desktop breakpoint while the test waited for a hidden table row. Login, submission and search had completed. A bounded browser repair uses the visible mobile card and adds isolated policy/form publication and accepted-response-loss replay assertions. No product timeout or assertion was relaxed to fix that selector.

## Final verified tree — 2026-11-26

The final uncommitted tree was re-verified end to end after the last source edit (`e2e/request-list-detail.spec.ts`, the bounded History-tab revision-fetch assertion). All commands ran from `C:/Users/kitti/approval-system` against the task-owned Compose project `issue7`; the pre-existing port-55432 database was not used or reset. Logs are under ignored `artifacts/issue7/`.

| Check | Command | Result | Log |
| --- | --- | --- | --- |
| Typecheck | `npm run typecheck` | exit 0 | `final-typecheck-verified.log` |
| Lint | `npm run lint` | exit 0 | `final-lint-verified.log` |
| Unit/API/contract/web | `npm test -- --maxWorkers=2 --testTimeout=20000` | 62 files, 526 passed, 0 failed, 0 skipped | `final-tests-verified.log` |
| Real PostgreSQL integration | `npm run test:integration` (`.env.issue7`, port 55433) | 15 files, 180 passed, 0 failed | `final-postgres-verified.log` |
| Build | `npm run build` | exit 0 (contracts, API, web) | `final-build-verified.log` |
| Browser E2E | `npm run test:e2e` (`.env.issue7-browser`, port 55434) | 51 passed, 0 failed, 0 skipped | `full-e2e-verified.log` |

The browser run includes the previously failing `e2e/request-list-detail.spec.ts` (now passing with the History-tab revision-fetch assertion) and both `e2e/return-revision-resubmission.spec.ts` journeys. The explicit `--testTimeout=20000` local allowance changes no test assertion or repository timeout setting; the default-timeout ConditionBuilder failure remains disclosed above. Screenshots inspected at desktop and mobile widths: `artifacts/issue7/screenshots/{revision-history-desktop,revision-history-mobile,return-dialog-mobile}.png` show the revision selector, immutable snapshot, restarted-review explanation and required correction reason.

Independent local AI re-review of the final tree is recorded in [review](review.md). Human teammate review and staged promotions remain separate gates.
