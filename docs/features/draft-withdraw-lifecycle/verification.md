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

## PR #87 B01–B03 repairs — 2026-11-24

Tested **uncommitted working tree** on `feature/6-draft-withdraw-lifecycle`, based on reviewed HEAD `fe7987b2a7e9b89d692d8eeea0e2060521d7104f`. That commit alone does not contain these repairs. No commit, push, merge, independent teammate approval or production release is claimed. Pre-existing `ai_use.md` changes were preserved and new assistance content appended. PR #87 still targets `sprint-2-staging`; @kittipichcha approval and reviewed promotion through dev/main remain external gates.

### Repairs and regression evidence

- **B01 / DW-AC-02:** original immutable definition reconstructs existing editable content; explicit PATCH changes are merged and then validated against the target. PostgreSQL verifies retained THB 5,000 cannot disappear on a direct-to-items version-only PATCH; rejection leaves DTO/version/audit unchanged. Explicit clearing and replacement succeed, title-only omission preserves money even after publication, and items-to-direct migration never reinterprets the computed total as an omitted direct amount. Existing historical-version save/active-version submit and omission/item-identity assertions also pass.
- **B02 / DW-AC-03–04:** successful creation of B after changing A's type replaces the edit URL after dirty state clears. The edit route restores B's saved content and retains the wizard step in navigation state. Component/browser tests verify cancelled type change, confirmed creation, REPLACE navigation without another unsaved prompt, no duplicate creation on unchanged save, reload of B, and unchanged A.
- **B03 / DW-AC-04:** unchanged Save uses authoritative GET and checks DRAFT, working revision, EDIT_DRAFT and exact session version. Prior success copy clears before every attempt; conflicts/permission failures reuse existing recovery. Session/component/browser tests cover unchanged success without writes/version changes, peer edits/submission, real Requester-role revocation, preserved recoverable inputs, unavailable editor on permission loss, and absent false success. Browser permission fixture uses a unique synthetic account and confirms no added audit event. Changed PATCH and create lost-response keys remain stable. Submit uses its own authoritative mutation when content is unchanged so an accepted lost submission response can still replay with the same key.

### Final checks

| Command | Actual result |
| --- | --- |
| `npm run typecheck` | PASS, all workspaces and root; final new browser tests included |
| `npm run lint` | PASS |
| `npm test` | PASS, 46 files / **434 tests**, no skips |
| `npm run build` | PASS, all workspaces; final Playwright run also rebuilt current web/API |
| `npm run db:test:migrate` / `npm run db:test:seed` | PASS on task-owned disposable database |
| `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` with disposable TEST_DATABASE_URL | PASS, 10 files / **109 tests**, no skips; final test revision, rollback/races and process restart included |
| `NODE_ENV=test npm run test:e2e` with same guarded test target | PASS, **39 tests**, 46.3 seconds, no skips |
| `npm run test:release` | PASS, **13 tests**, no skips |
| `git diff --check` | PASS, no pre-existing or preserved whitespace exceptions |

Node.js 24.18.1, npm 11.16.0, Vitest 4.1.10, Playwright 1.60.0/headless Chromium, PostgreSQL **17.10**. A task-created `postgres:17-alpine` container (`approval-pr87-postgres`) used tmpfs `workflow_test` and loopback port 55432; all migrations and synthetic seed applied before tests. Existing database-target guards stayed enabled. No development/production data used. Container removed after verification. Browser services used existing Playwright configuration and were stopped by Playwright. Existing dependencies used; no clean install or production Docker image build was rerun for these source-only repairs.

Ignored `artifacts/pr87-repair/` retains command logs and a SHA-256 manifest of the seven changed source/test files; Playwright's ignored report/results directories retain the final browser report and synthetic screenshots. These local artifacts are not published or committed. The manifest identifies the tested source independently of the unchanged base commit.

### Experiment ledger and initial failures

1. Before fixes, focused frontend regressions failed **9 tests / 18 passed**, reproducing wrong edit URL and cached false success. Real PostgreSQL B01 regressions failed **2 tests**, reproducing silent direct-amount removal and conversion of item total `15.02` into a direct amount; 33 unrelated tests were excluded by the focused name filter. Existing ordinary-save and explicit-clear paths served as differential checks.
2. After the initial fixes, those **27 frontend tests** and **2 monetary regressions** passed. A new submission lost-response test then failed **1 / 9 passed** because revalidation observed PENDING before replay. Unchanged Submit now reaches the existing authoritative submit endpoint directly; final full suite includes its passing replay assertion. Save Draft still always revalidates unchanged content.
3. First PostgreSQL command forwarded a name filter incorrectly through the root npm script and found no files. Corrected invocation through the API workspace executed the intended failing regressions. Sandbox initially blocked local DB connections (`EPERM`); migrations, seed and database/browser checks subsequently ran with permitted local access. No guard or assertion was disabled.
4. First full browser run passed **38/39**. New permission test correctly removed REQUESTER in the database and the UI denied editing, but its expected DTO still included that role. Corrected the expectation to require current REVIEWER-only identity while retaining full request-content/version and audit-equality assertions. Final full **39/39** pass followed.
5. Initial sandboxed release-test invocation could not run the local proxy listener. Rerun with local listener access passed all **13** tests. Final source/configuration checks have no outstanding failures; no required local check was skipped. Two additional clearing/replacement assertions were followed by a final complete **109-test** PostgreSQL rerun.

Issue #6 publication status is recorded below after the requested evidence-posting attempt. Independent teammate approval remains outstanding and cannot be supplied by this repair session.

### Issue #6 publication attempt

Read Issue #6 and PR #87 through the GitHub connector, confirming repository, issue identity, reviewed head and staging target. Prepared the complete bounded evidence in [issue-comment.md](issue-comment.md). The connector first rejected issue-style argument names; its schema requires `repo_full_name`, `pr_number`, and `comment`. Automatic approval review then rejected publication because that schema exposed PR #6 as the destination while the user authorized Issue #6. No external comment was posted; no workaround was attempted. Explicit approval for direct publication to Issue #6 remains required. This publication block does not affect the passing local repairs or authorize committing/pushing them.

### Owner-authorized PR #87 publication follow-up

Owner requested “commit and push to pr87”. The earlier uncommitted status above describes the repair/test phase. Repairs are now recorded in scoped source commits: `7349dc1` (B01 monetary authority), `9ddd70f` (B02 draft edit URL), and `efe1f15` (B03 authoritative unchanged saves), preceded by `bfa6a6f` (SDS/AC/STS). Final evidence and assistance records accompany those changes in a separate documentation commit.

Before publication, all seven source/test SHA-256 entries still matched the files exercised by the passing 434-test unit/API/contract/component, 109-test PostgreSQL, 39-test browser and 13-test release runs. `git diff --check` passed. No source behavior changed during commit packaging, and runtime suites were not repeated solely for history changes. The requested destination is PR #87's existing `feature/6-draft-withdraw-lifecycle` branch, targeting `sprint-2-staging`. Issue-comment publication remains separately blocked; no issue comment, merge, teammate approval or release is claimed by this push authorization.

## B04 canonical review summary — 2026-11-24

Tested **uncommitted working tree** based on `6d561eed7f78fdfcfb06873ee2dc50a53516cdd3` on `feature/6-draft-withdraw-lifecycle`. B04 changes only RequestWizard frontend behavior and its tests/documentation. Backend, shared contracts, database schema and migrations are unchanged. This follow-up does not claim a commit, push, external issue comment, teammate approval, merge or release.

### Reproduction and repair

Three new component regressions failed before repair, with 20 other lifecycle tests passing. They reproduced raw obsolete items in review despite payload exclusion, obsolete items after confirmed migration, and a discarded direct amount returning when a subsequent definition restored direct monetary support. Compatible direct/item migrations and cancelled migration paths provided passing differential checks. This confirms both retained incompatible local state and raw-state rendering, rather than a server persistence defect.

After confirmation, migration now keeps only applicable monetary/item state while retaining compatible content. Cancellation returns before any definition or content changes. Review values, fields, items and totals all read the same `payload()` representation used by save/submit. Clearing state prevents obsolete values returning during later definition changes; canonical summary rendering independently protects against inapplicable raw state. The five new component cases cover both monetary authorities, compatible retention, cancellation, permanent clearing and exact changed-property PATCH bodies.

The real browser regression creates an isolated published item-based type, saves a complete draft, publishes a nonmonetary definition without item support, and triggers the existing stale first-submit recovery. Cancelling migration preserves displayed old items/total and the identical durable DTO. Confirming retains title, justification, priority and category, removes obsolete review items/total, sends an explicit empty item replacement, and persists null amount/currency with the new version. Reload restores that content; another unchanged save leaves the durable DTO identical.

### Verification and initial failures

- Before repair: focused lifecycle component run **3 failed / 20 passed**. After repair: **23 passed**, no skips.
- `npm run check`: PASS, including typecheck across root/workspaces, lint, **439 tests across 46 files**, and all workspace builds; no skipped tests.
- Final `npm run typecheck` and `npm run lint` after browser-fixture correction: PASS.
- First full Playwright run: B04 passed; overall **39 passed / 1 failed**. Existing B02 assumed a second published type supplied by a prior PostgreSQL suite; a fresh seeded database contains only GENERAL. The failure was `expect(other).toBeDefined()`, before B02 application interaction. B02 now creates its own alternate published type and selects that exact generated ID. All existing acceptance assertions remain intact. Recreated only the task-owned disposable database for final verification.

Standalone PostgreSQL integration/release/production Docker suites and clean installation were not rerun for this frontend repair; the browser suite exercises the real API and PostgreSQL persistence. Earlier 109-test PostgreSQL and 13-test release results remain historical B01–B03 evidence, not newly claimed B04 runs.

Runtime: Node.js 24.18.1, npm 11.16.0, Vitest 4.1.10, Playwright 1.60.0/headless Chromium. Task-owned `postgres:17-alpine` / PostgreSQL 17.10 container `approval-pr87-b04-postgres` uses tmpfs workflow_test on loopback port 55432. Existing migrations and synthetic seed applied with database-target guard enabled. Existing Playwright configuration builds and starts local web/API services; no development/production data used. Ignored `artifacts/pr87-b04/` retains failed-before/passing-after/check/browser logs and a source SHA-256 manifest; Playwright report/results remain ignored local artifacts.

Final `NODE_ENV=test npm run test:e2e` with guarded disposable TEST_DATABASE_URL: **PASS, 40 tests / 46.2 seconds, no skips** on the recreated seeded database, including the explicit B02 fixture and B04 migration/persistence regression. `git diff --check`: **PASS**, no whitespace exceptions. No failed final check remains. API/web builds were also repeated by the final browser runner. Disposable database removed after completion; no browser servers retained.

### B04 owner-authorized publication follow-up

Owner requested “commit and push”. The uncommitted status above describes the test phase. B04 is now recorded in `0c4249b` with its component/browser regressions, preceded by `10395c4` (SDS/AC/STS) and `b8c4dfa` (independent alternate-type browser fixture). Final evidence and assistance records accompany those changes in a separate documentation commit. All three source/test hashes match the passing 439-test workspace and 40-test browser verification, and diff checks pass. No source changes or runtime reruns were needed during commit packaging. Publication targets PR #87’s existing feature/6-draft-withdraw-lifecycle branch; independent teammate approval and reviewed staging/dev/main promotions remain pending. No merge, release or external issue comment is authorized or claimed here.

## CI request-type fixture correction — 2026-11-24

The rendered-version PostgreSQL regression constructed version 2 from `seededDefinition`, replacing its fixture-specific code with `GENERAL`. The database row retained its unique `T<uuid>` code, but the published JSON returned a second `General request (GENERAL)` option. CI runs integration and browser suites on the same database; the duplicate reached the first picker page depending on UUID ordering. A clean browser-only run therefore missed this defect.

The fixture now copies its own published definition before changing version identity/number. A metadata-search assertion checks that version 2 retains the fixture's type ID and code. Product code, contracts and the browser locator are unchanged.

Evidence from a task-owned disposable PostgreSQL 17 container on loopback port 55439:

- Before correction, all 109 integration tests passed but left two published JSON definitions with code `GENERAL`. An unmodified browser-only journey passed when pagination hid the duplicate. Disabling unrelated types in this disposable database reproduced the reported strict-mode violation at `request-list-detail.spec.ts:68` exactly. This rules out partial-name matching as the cause.
- The new metadata assertion failed before correction: expected `T<uuid>`, received `GENERAL`.
- After correction, recreated and migrated/seeded the disposable database, then ran `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` followed by `NODE_ENV=test npm run test:e2e` against the same guarded `TEST_DATABASE_URL`: **109 PostgreSQL tests passed, no skips; 40 browser tests passed in 46.4 seconds, no skips**. Exactly one published `GENERAL` definition remained after integration.
- `npm run check`: **PASS**, including typecheck, lint, 439 tests across 46 files and all workspace builds. Browser execution also rebuilt API/web.
- Source/documentation diff checks pass; `ai_use.md` preserves six trailing spaces from the exact supplied prompt as required by AGENTS.md, which `git diff --check` flags. No other whitespace exceptions.

Logs remain local under `/tmp/picker-*.log`; Playwright output is under ignored `artifacts/playwright/`. No commit, push, merge, release or external comment performed. CI's Docker wrapper, image builds, initialization suite and release tests were not rerun; the integration-to-browser shared-database sequence was verified directly with local Node.js/Chromium.

## PR #87 B05–B08 verification — 2026-11-24

- **B05 (`apps/web/app/services/requestService.ts`):** Added recursive key-sorted `canonical()` serialization for `RequestEditingSession` content tracking, changed-field diffing, idempotency key hashing, and submit/reload comparison. Four new unit tests in `apps/web/tests/unit/requestLifecycle.test.ts` and a browser E2E test in `e2e/draft-withdraw.spec.ts` (creating a draft whose PostgreSQL `jsonb` returns `["reason", "category"]` instead of `["category", "reason"]`) confirm unchanged Save triggers `GET` with 0 `PATCH` calls, unchanged `version`, and unchanged `audit_events`.
- **B06 (`apps/api/src/Presentations/Routes/RequestRoutes.ts`, `apps/api/src/Domains/Requests/RequestRules.ts`, `apps/web/app/modules/requests/RequestWizard.tsx`):** Added `formatIssuePath()` for bracket-form Zod paths (`lineItems[0].quantity`, `lineItems[1].unitAmount`), updated `RequestRules.validateContent` to emit bracket-form line-item paths and evaluate per-item total bounds before aggregate `lineItems` bounds, and mapped bracket paths to DOM IDs (`lineItems.0.quantity`) in `RequestWizard.tsx`. Initial Playwright E2E exposed `RequestRules` emitting `lineItems` before `lineItems[0].quantity` on item overflow, causing focus to land on `+ Add item`; reordering per-item validation before aggregate total resolved it. Covered in `requestRules.test.ts`, `requests.test.ts` (`POST` and `PATCH`), `requestLifecycle.test.tsx`, and `e2e/draft-withdraw.spec.ts`.
- **B07 (`apps/web/app/modules/requests/RequestOwnerActions.tsx`, `RequestResult.tsx`, `RequestDetailPage.tsx`, `RequestDetailTabs.tsx`, `RequestListPage.tsx`):** Preserved `RequestOwnerActions` trigger ref and parent mounts across version updates, restored focus to `Withdraw` when surviving, and routed focus via `onFocusFallback` to the `RequestStatus` badge (`tabIndex={-1}`) on detail or `#request-list-search` on list when `Withdraw` disappears. Initial jsdom tests revealed `useEffect` capturing `<Input autoFocus />` inside `<dialog>` instead of the trigger; anchoring `target` to `trigger.current` resolved it. Verified in `requestLifecycle.test.tsx`, `requestDetail.test.tsx`, `requestList.test.tsx`, and Playwright E2E across detail, conflict-reload Escape, desktop list, and mobile filtered list.
- **Final local commands & results (after last code/test edit):**
  - `npm run check`: **PASS** — root/workspace `tsc` typecheck, `eslint`, Vitest (`46` test files / `448` tests passed, `0` failed, `0` skipped), and `@workflow/api`, `@workflow/web`, `@workflow/contracts` builds.
  - `npm run db:test:down && npm run db:test:up && NODE_ENV=test npm run db:test:migrate && NODE_ENV=test npm run db:test:seed && NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration && NODE_ENV=test npm run test:e2e`: **PASS** — `10` PostgreSQL test files / `109` tests passed (`25.05s`, `0` skips) and `43` Playwright Chromium tests passed (`47.5s`, `0` skips); disposable container torn down afterward via `db:test:down`.
  - Environment: Node.js `v24.18.1`, npm `11.16.0`, Vitest `4.1.10`, Playwright `1.60.0` (Chromium), PostgreSQL `17-alpine` disposable `workflow_test` container.
  - Not rerun locally in this pass: `npm ci`, `npm run test:initialization`, `npm run test:release`, and production Docker image builds (covered by GitHub Actions CI after commit/push).
- **B08 status:** Verification record prepared in `docs/features/draft-withdraw-lifecycle/issue-comment.md`; awaiting explicit owner authorization to commit, push to PR #87 (`feature/6-draft-withdraw-lifecycle`), wait for final CI, and post the final verification comment directly on Issue #6.
