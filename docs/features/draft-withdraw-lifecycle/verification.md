# Issue #6 verification — 2026-11-24

Implementation is an **uncommitted working tree** on `feature/6-draft-withdraw-lifecycle`, based on `bdab39b115e39caec46da099ee9956cf47567423`. No implementation commit, push, PR, merge or release is claimed. Existing user edits to root AGENTS.md were present before work and preserved. Independent review by @kittipichcha remains outstanding; eventual feature PR must target sprint-2-staging, then reviewed promotion to dev and release-reviewed main.

## Environment and commands

Node.js v24.18.1, npm 11.16.0, Vitest 4.1.10, Playwright 1.60.0 / headless Chromium. Real PostgreSQL 17.10 in a task-created disposable `postgres:17-alpine` container, loopback port 55432, database workflow_test with tmpfs data. Test-target guard remained enabled. Applied all migrations including 0009, then seeded required roles/test accounts. The task-created container was removed after checks; command logs and screenshots remain. Browser API/web servers built and started by existing Playwright configuration on loopback ports 14174/14173. No production database or secrets used.

| Check | Actual final result |
| --- | --- |
| `npm run typecheck` | PASS, all workspaces and root |
| `npm run lint` | PASS |
| `npm test` | PASS, 46 files / 410 tests, no skips |
| `npm run build` | PASS, API/web/contracts; latest focused Playwright run also rebuilt API/web |
| `npm run db:test:migrate` / `npm run db:test:seed` | PASS on guarded disposable PostgreSQL |
| `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` with TEST_DATABASE_URL pointing to disposable target | PASS, 10 files / 104 tests, no skips; includes actual API process termination/restart |
| `NODE_ENV=test npm run test:e2e` with same test target | PASS, 34 tests / 41.9s |
| `NODE_ENV=test npm run test:e2e -- e2e/draft-withdraw.spec.ts` after final owner-action authorization guard | PASS, 3 tests / 13.4s |
| `git diff --check` | PASS |

The full browser pass preceded the final detail-action `availableActions` guard; all three feature flows were rerun after that guard. Earlier 101-test PostgreSQL run had two opt-in process tests skipped; final 104-test run explicitly enabled both and skipped none. No failed check remains in the final runs. Test commands must supply their own disposable TEST_DATABASE_URL; credentials are intentionally omitted here.

## Acceptance evidence

- DW-AC-01–03 / FT-019 / EP-033/035 / DB-02 / API-08 / SEC-02: contracts reject unauthorized write keys/invalid supplied values; PostgreSQL proves omission preservation, full dynamic map replacement, hidden-key rejection, owner-only reads, zero reviewer queue rows and no phantom official number/submitted snapshot/cycle. Fresh connection reads persisted draft. Built-listener restart test creates an incomplete draft over HTTP, terminates API, starts another process and reads identical stored content.
- DW-AC-04 / UI-05/06 / E2E-01: component test hydrates edit route, saves incomplete content, maps server errors to correct step/focus and retains inputs. Browser saves from type/basic/details/review steps, reloads, resumes through list, retries a lost accepted PATCH response with same key, warns on unsaved navigation, and confirms sensitive content absent from SSR. Existing wizard tests retain type-change guards and full submission regression coverage.
- DW-AC-05–06 / FT-023 / EP-038: real HTTP verifies optional reason, strict body/key/version, 200 direct RequestDetail, no-store, replay and changed-body conflict. PostgreSQL proves foreign/role/state/stale denials without mutation, inactive current cycle, cancelled active/waiting tasks with bumped versions, preserved prior votes, unchanged submitted revision/cycle snapshot, actor/time/reason timeline event and unique outbox.
- DW-AC-07 / DB-08 / CX-04/14: fault at replay completion rolls back all task/request/audit/outbox effects; retry succeeds. Two independent connections rendezvous immediately before acquiring common request lock for true simultaneous withdrawal versus APPROVE and REJECT; exactly one accepted outcome, no late vote/actionable orphan. Concurrent same-key withdrawal returns identical DTO with one history/outbox event.
- DW-AC-08 / E2E-06: keyboard confirmation, Escape/focus restoration, optional empty reason, accepted-response loss/replay, stale reviewer decision denial and refreshed empty queue. Mobile list withdrawal refreshes applied pending filter and preserves optional reason in requester history. Component tests cover busy repeat guards, stale reload/reconfirmation, 403/404 refresh, foreign/terminal visibility; queue focus test proves authoritative refetch. Desktop draft and mobile history screenshots inspected visually; no clipping/overflow observed.

## Initial failures and corrections

1. First integration attempt ran before seed: 95 failures from missing role FK fixtures; 6 passes, 2 opt-in skips. Seed then encountered deterministic fixture identity conflicts left by that unseeded run. Recreated only task-owned disposable database, migrated and seeded correctly. No product validation was weakened.
2. Seeded run: 100 passes, 1 new HTTP fixture failure, 2 skips. New fixture omitted required JWT issuer/audience; supplied existing required configuration. Subsequent final run passes all 104 including process checks.
3. Initial browser attempt: 2 failures because concurrent standalone build replaced assets used by Playwright server, leaving login unhydrated. Rebuilt under Playwright and stopped concurrent browser/build writes. Next attempt reached feature behavior but failed on two incorrect selectors (completed-step suffix and queue search label). Corrected selectors to real accessible names. Full 34-test pass and final focused 3-test pass followed.
4. Intermediate typechecks exposed missing Withdraw method on repository test double, dynamic import used as a type, Testing Library's unsupported exact option, and structural narrowing of optional availableActions. Corrected tests/types and reran typecheck/lint/tests successfully.

## Retained local artifacts

Ignored `artifacts/issue6/` contains final command logs, source file SHA-256 manifest, desktop resumed-draft screenshot, desktop withdrawal history and mobile withdrawal history. `artifacts/playwright/report/` and `artifacts/playwright/results/` contain latest focused browser report/screenshots. These local artifacts are not published or committed. They contain only synthetic test records. Durable review summary is this file; teammate approval and staged promotion remain unchecked in DoD.

## Issue evidence publication status

Automatic approval review rejected posting detailed verification to GitHub Issue #6, citing unverified external destination and potentially sensitive implementation/verification egress. No issue comment was posted. Local evidence is complete; [proposed concise issue comment](issue-comment.md) awaits explicit user approval. No workaround or alternate publication channel was used.


## Single scrutinize review follow-up — 2026-11-24

User requested one end-to-end scrutinize pass and repairs. [Review report](review.md) records ten confirmed finding groups, concrete traces, fixes and regression evidence, including unchanged caller/callee paths. Repairs are part of the same uncommitted feature working tree based on bdab39b115e39caec46da099ee9956cf47567423. Existing AGENTS.md edits remain untouched. No commit, push, PR or external comment was attempted during this pass; independent teammate review remains pending.

Actual final results after repairs:

- `npm run typecheck`: PASS across workspaces/root.
- `npm run lint`: PASS.
- `npm test`: PASS, 46 files / **423 tests**, no skips, no unhandled errors.
- `npm run build`: PASS; subsequent Playwright full run also builds current API/web artifacts.
- `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` with guarded disposable TEST_DATABASE_URL: PASS, 10 files / **107 tests**, no skips; real HTTP field-validation, omission preservation, canonical UUID replay, version-boundary regression and existing restart/rollback/races included.
- `NODE_ENV=test npm run test:e2e` with same test target: PASS, **36 tests**, 43.1 seconds; includes real conflicting draft reload/cancel/confirmed save and competing withdrawal followed by reload/Escape parent refresh.
- `git diff --check`: PASS.

Runtime: Node.js 24.18.1, npm 11.16.0, PostgreSQL 17.10 from a fresh task-owned postgres:17-alpine container with tmpfs workflow_test on loopback port 55432. Migrations and seed applied before tests; target guard never disabled. Review database is disposable and removed after verification. No development or production database used.

Initial reproductions are distinct from final passing totals: first UI regression run had 7 failures / 182 passes; omitted-item/UUID PostgreSQL run had 2 failures / 30 passes; separate completed-step, malformed decimal and premature-version tests reproduced additional paths. Minor test-fixture issues (undefined test ID and unsupported fireEvent.cancel helper) were corrected; native cancel event is now dispatched. No tests were skipped or weakened to hide product failures. The previously added create-active-version test was replaced because it contradicted frozen API §6.4's save-rendered-version/submit-active-version boundary.

Ignored artifacts/issue6-review/ retains failed-before and final logs plus source SHA-256 manifest. Earlier artifacts/issue6/ and earlier counts above remain the historical implementation record; this follow-up supersedes them for current repaired code. Proposed external issue comment remains unpublished and requires the approval already requested; this review does not retry that blocked action.

## Authorized publication follow-up — 2026-11-24

Owner explicitly authorized commits, push and a PR to sprint-2-staging with Closes #6 in its body. Earlier uncommitted/unpublished descriptions above are historical. Implementation is recorded in scoped commits: 1a70cb0 (design), 25f9e98 (contracts), f1bfa43 (backend), and df219e8 (frontend). Root assistance-record policy is a separate docs(workflow) commit.

Fresh `npm run check` passed typecheck, lint, 46 files / 423 tests and all builds. `git diff --check` passed. All 33 source/test entries in artifacts/issue6-review/source-sha256.txt matched, preserving correspondence with the earlier 107-test PostgreSQL and 36-test browser evidence. PostgreSQL/browser suites were not rerun in this publication turn. Independent teammate review and subsequent staged promotions remain pending. No issue comment or merge is authorized by this follow-up.

## CI confirmation race repair — 2026-11-24

The reported CI run passed 35/36 browser tests and failed DW-AC-01–04 with `dialog.accept: Cannot accept dialog which is already handled!`. A local Chromium reproduction delayed confirmation by 200 ms and reproduced that exact error: the unchanged URL/input assertions completed before the first dialog arrived, so both one-shot handlers received the same dialog. This is test synchronization, with no application behavior change.

All four native-confirmation checks in `e2e/draft-withdraw.spec.ts` now await both the triggering click and completion of the requested dialog response through `respondToConfirmation`; the helper also asserts `confirm` type. Existing cancel/input-retention, accept/navigation, saved-resume and concurrent-edit assertions remain intact.

Verification on Node.js 24.18.1 with Chromium and a fresh task-owned PostgreSQL 17 disposable database (`workflow_test`, loopback 55432), migrated and seeded through the guarded test scripts:

- A harness executing the actual helper passed dismiss/accept at 0, 50 and 200 ms confirmation delays. The old handler pattern reproduced the CI error.
- `npm run test:e2e -- e2e/draft-withdraw.spec.ts --grep 'DW-AC-01|concurrent draft edit' --repeat-each=5`: **10/10 passed**, 24.6 seconds, no retries.
- `npm run typecheck`, `npm run lint`, `npm test` (**423 tests / 46 files**) and `npm run build`: passed.
- The full 36-test browser suite and PostgreSQL integration suite were not rerun for this test-only repair.

Experiment ledger: initial browser launch was blocked by the sandbox and succeeded with approved execution outside it. The first repeated browser run passed six tests before an overlapping verification build replaced its served assets, causing two login timeouts; that run was interrupted (one interrupted, one not run). An attempted restart before the original runner stopped failed because its server port remained occupied. After stopping it, the clean isolated repeat run above passed all ten tests. These environment failures were separate from the reproduced dialog race. The task-owned database was removed after verification. No commit, push, merge or publication performed.

`git diff --check -- e2e/draft-withdraw.spec.ts docs/features/draft-withdraw-lifecycle/verification.md` passed. The repository-wide whitespace check reports only six trailing-space lines retained verbatim from the supplied CI log in the required append-only `ai_use.md` prompt record.
