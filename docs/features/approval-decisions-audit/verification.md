# Issue #5 verification evidence

PR [#22](https://github.com/oangsa/approval-system/pull/22) initially contained four scoped
commits on `feature/5-approval-decisions-audit`, based on
`74620fa59de9f25a16f237b09deaa9406c0d0b7e`. Pre-fix pushed HEAD and reviewed revision:
`154f3f5e0ff85c65393a8649ae269fe4ff1059a7` (2026-11-08).
The review fixes described below were verified locally on top of that HEAD and
recorded in commit `61924f9`; the reconciliation follows in a separate docs commit.
Hosted results for the pre-fix HEAD do not verify these changes. Teammate approval and release
remain outstanding.
AI assisted implementation, test authoring and verification. Primary owner remains
@oangsa; independent reviewer remains @kittipichcha.

Environment: Linux, Node v24.18.1, npm 11.16.0, repository's guarded loopback
`workflow_test` PostgreSQL container, Vitest 4.1.10, Playwright 1.60.0 Chromium.
Synthetic fixtures only; no credentials or private datasets are recorded here.

## Historical local passing evidence

These are the earlier recorded runs, not the later PR-creation reruns or a
claim of execution against the current review fix.

| Command | Actual result |
| --- | --- |
| `npm run check` | PASS: typecheck, lint, 348 fast tests / 40 files, API/web/contracts production builds |
| `npm run db:test:up` | PASS with elevated sandbox access; existing isolated container healthy |
| `NODE_ENV=test npm run db:test:migrate` | PASS, populated upgrade through 0008, retaining earlier data |
| `NODE_ENV=test npm run db:test:seed` | PASS, repository synthetic browser accounts/configuration |
| `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` | PASS: 69 tests / 7 files, no skips; includes real Node listeners and API process restart |
| `NODE_ENV=test npm run test:e2e` | PASS: all 25 Chromium tests, including four decision journeys |
| `git diff --check` | PASS |

## Behavior evidence

- Exact shared decision and timeline DTOs, UTC timestamps, bounded query schema,
  reject reason validation, required UUID action key and OpenAPI request/response
  shapes execute through contracts and real `.handle()` API calls.
- Current actor guard denies self (including stacked roles), foreign actor,
  removed reviewer role, stale slot version and stale revision without extra votes
  or changed request/cycle/stage/slot/audit/outbox evidence. Missing/foreign remain
  404, self is 403, wrong-role 403, stale 409; invalid body/reason/key 422.
- A unique slot vote and immutable decision/audit/idempotency/outbox database
  triggers reject duplicate insertion or history rewriting. A permitted outbox
  worker may update only `processed_at`.
- Same accepted key/body replays across services, connections and two separately
  started built API processes. Changed semantic payload conflicts. A new key on
  the decided slot is stale; accepted result is not recomputed from later state.
- A real PostgreSQL trigger faults audit insertion after decision and state
  writes. The complete transaction rolls back, leaves no completed key and the
  same key is safely reusable. Test-only trigger/function are removed in finally.
- Four independent-connection approve/reject races produce exactly one effective
  terminal vote and matching request state. Different actors concurrently voting
  distinct parallel slots produce PENDING then APPROVED, exactly two votes.
- Parallel ALL partial approval stays PENDING. Rejection closes cycle and cancels
  unfinished active and future slots. The historical future-stage test only checked
  PENDING and unactivated stage two; it missed the stuck stage-one completion.
  The review fix below replaces that unsafe expectation with a no-write guard.
  Stage-two execution and RETURN remain unsupported.
- Owner timeline is paged and persisted; former handler receives only their own
  accepted decision. Foreign users cannot read history. Metadata is explicitly
  projected from decisions, never snapshotted internal configuration JSON.
- Built API process stop/start preserves exact timeline and accepted replay.
- Browser approve/reject journeys exercise keyboard focus, Escape/cancel and focus
  return, reason retention and required rejection reason, successful server refetch,
  requester History tab and reload. 390px history screenshots were inspected;
  cycle/revision text wraps without whole-page horizontal overflow.
- Stale browser confirmation closes the dialog, retains reason, offers Reload task
  and denies further action on the terminal task. A deliberately lost accepted
  response retries with the same key; pending disables confirm/cancel and Enter
  does not duplicate the effect. Private review content is absent from SSR.

## Failure ledger and limits

Initial sandbox Docker/network access failed; elevated isolated-test commands
succeeded. The first migration attempt omitted NODE_ENV=test and was correctly
rejected by the target guard. Early typechecks caught unsupported Button props
and Node events import syntax; both were corrected. The initial fast/browser
regressions expected unavailable History and forbade timeline calls; they now
assert persisted history while retaining guards against unimplemented resources.
A real API test exposed an omitted CORS allow-header response; fixed and retested.
Its follow-up case-sensitive header assertion was corrected to compare header
names case-insensitively. Earlier default PostgreSQL runs skipped built-listener
checks; the final run enabled them and skipped nothing.

Populated migration upgrade was executed locally. A fresh-database local migration
run, cross-browser coverage, comprehensive Thai/theme/accessibility audit and
future RETURN/stage-two/delegation/bulk journeys were NOT RUN here. They are not
claimed by these results. Existing React Router future-flag build warnings remain.

Independent teammate review and the feature -> sprint-1-staging -> dev -> main
reviewed PR workflow remain outstanding. At the time of those historical local
runs, no commits, pushes or PR had been made. PR #22 and its commits now exist;
no merge or production migration/deployment is claimed.

Requested local verification evidence was also posted to
[issue #5](https://github.com/oangsa/approval-system/issues/5#issuecomment-6721966797).
The issue remains open; that comment publishes evidence only, not source changes
or teammate approval.


## Alignment review follow-up — 2026-11-08

The alignment check identified two MAJOR and two MINOR mismatches. Historical handler
GET/task-page reopening, private-content removal after decision 403/404,
authoritative stage display and safe 500/503 support identifiers are corrected.
Current spec/AC/STS text reflects the limited historical read and saved-reason
retention/discard; no new endpoint, dependency or migration was added by review.

The final fast suite has 348 tests / 40 files. Full PostgreSQL regression has
69 tests / 7 files with built HTTP/restart checks enabled, no skips. Full browser
coverage remains 25 cases, with approve/reject extended to reload the handled task
and deny current request content, and stale recovery extended to retain input
until explicit discard. The initial implementation's earlier 335/68 counts are
superseded by these follow-up results.

Review regression ledger: real-PG handled-task read failed with NOT_FOUND;
nonactionable web-service read failed with Task unavailable; current-stage text
was absent; decision 403/404 left protected content; server-error support IDs were
absent. Each now has passing regression evidence. New test code initially used a
Playwright-only locator option in Testing Library; typecheck caught it and the
option was removed.

One intermediate full browser run had 24 passes and one requester-detail failure:
the page reached sign-in after a refresh 401, rather than the expected foreign
request 404. Its sanitized trace also showed an aborted logout request. The
isolated requester-detail case passed, and two subsequent sequential full runs
passed all 25, including the final build after the support-ID fixes. The cause of that transient session/navigation failure is not
established; no auth source changes or test weakening were made. It remains a
nonblocking observation, not a claimed repaired authentication defect.

This review does not replace kittipichcha's independent teammate approval.
This paragraph records historical local evidence. See the pre-fix pushed-HEAD
and hosted-CI reconciliation below; release/promotion gates remain outstanding.

## Pushed-HEAD reconciliation — PR #22

The PR description at HEAD `154f3f5` records a later `npm run check` pass
(348 tests / 40 files), an unsuccessful PostgreSQL integration rerun, and a
browser rerun that could not start its configured web server (exit code 1).
The PostgreSQL rerun did not produce a successful final result. The PR provides
no detailed root cause for either rerun failure; none is inferred here. These
limits remain separate from the historical passing local evidence above.

[Hosted Verification run #53](https://github.com/oangsa/approval-system/actions/runs/42485512523)
completed successfully for `154f3f5e0ff85c65393a8649ae269fe4ff1059a7`.
GitHub job `verify` (128746374771) reports successful steps for typecheck, lint,
web/API/contracts Vitest suites, production build, test database migration/seed,
PostgreSQL integration, Chromium installation and browser E2E. The workflow at
that revision sets `RUN_BUILT_HTTP_SMOKE=1` for integration. Step summaries
were checked through GitHub; exact hosted test counts and artifacts were not
independently inspected. This proves success of those configured checks at that
HEAD, not stage-two progression correctness, independent teammate approval,
cross-browser coverage or verification of the local review fix.

## Review fix — two-stage completion guard

API §7.2 requires atomic stage-two activation. Until that integration exists,
the review-authorized fallback rejects the stage-one completing approval with
409 INVALID_REQUEST_TRANSITION before repository Save and idempotency Complete.
Earlier partial votes remain committed, stage one stays ACTIVE, the last slot
stays ACTIONABLE and stage two stays WAITING. Rejection remains available.
This is a recoverable temporary restriction, not implemented stage-two progress.

Regression ledger: before the guard, two domain cases failed because completing
approval returned success. After the guard, all 15 decision-domain tests passed.
Real-PostgreSQL regressions cover both single and parallel stage-one completion,
unchanged request/cycle/stage/slot/decision/audit/outbox evidence, no completed
idempotency key, and reuse of the failed key for rejection.

Current local review-fix checks (2026-11-08, based on pushed HEAD above):

| Command | Actual result |
| --- | --- |
| Decision-domain regression before guard | FAIL as expected: 2 cases accepted the unsafe completion |
| `npx vitest run --project api apps/api/tests/unit/decisionRules.test.ts` | PASS: 15 tests after guard |
| `npm run check` | PASS: typecheck, lint, 349 tests / 40 files and all production builds |
| `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` | PASS outside sandbox: 70 tests / 7 files, no skips, including built HTTP/restart checks |
| `NODE_ENV=test npm run test:integration --workspace @workflow/api -- tests/postgres/decisions.test.ts --reporter=verbose` | PASS: 10 tests; 1 process-restart test skipped because this targeted command omitted RUN_BUILT_HTTP_SMOKE; covered by the full run above |
| `git diff --check` | PASS |

The initial sandbox integration attempt produced no completed results and was
interrupted; Docker inspection was denied in the sandbox. Elevated inspection
confirmed the isolated container healthy; the elevated full integration run
passed. No PostgreSQL rerun failure from the earlier PR session is claimed fixed.
At the initial guard verification, browser E2E had not yet been rerun; the historical local and
hosted browser results remain revision-specific evidence. At that verification point no new hosted run, commit, push, PR edit, merge or
deployment had been performed. Subsequent checks are recorded below.

## Follow-up specification alignment review — 2026-11-08

Intent: verify that scoped approve/reject and persisted history satisfy their
contracts while the previously authorized temporary guard preserves recoverability.
The existing domain guard is the smallest safe fallback; no new endpoint,
migration, dependency or stage-two subsystem is needed to satisfy that fallback.

Traced paths and authority:

- API §§6.5/7.2/8 → shared decision schemas → DecisionRoutes → DecisionService →
  DecisionRules → transactional DecisionRepository Save/Complete. Reviewed
  current actor/role/assignment/self guards, slot versions, ALL partial/final
  votes, rejection cancellation, idempotent replay/conflict, immutable
  decision/audit/outbox writes and rollback. The two-stage completion guard runs
  before Save; the earlier full real-PG suite passed 70 tests without skips.
- API §§4/6.4/6.5 and feature SDS → ApprovalTaskService/Repository handled read
  and DecisionRepository Timeline. Current participants and exact historical
  handlers use distinct projections; historical access does not grant broad
  request detail or task-queue membership. Timeline paging is bounded and stable;
  metadata is explicitly projected.
- UI §§10.3/13 → DecisionAttempt → DecisionActions/DecisionDialog →
  ReviewTaskPage and refreshAfterDecision. Reviewed stable retry keys, confirmation,
  pending guards, stale reload, retained reasons, denied-content removal,
  authoritative success status/stage and safe support identifiers.
  A new ReviewTaskPage regression verifies the normal two-stage fallback:
  INVALID_REQUEST_TRANSITION closes the action, reload refetches an unchanged
  version, and the task can open a new rejection confirmation. The reload's
  loading state unmounts old decision state, so no implementation fix was needed.
- Feature DoD and global traceability: MINOR mismatch fixed. DoD still described
  hosted CI as unexecuted and traceability did not state the temporary completion
  guard. Both now identify the actual evidence and explicitly exclude acceptance
  of full two-stage progression.

No additional confirmed MAJOR or MINOR implementation mismatch was found in
these traced paths. Stage-two activation/execution, RETURN, delegation and bulk
remain deferred integrations, not edge cases or claimed complete features.
Full API §7.2 two-stage progression is still incomplete; this review accepts
only the explicitly authorized fail-closed fallback for PR #22.

Follow-up checks: `npm run check` PASS (350 tests / 40 files, typecheck,
lint and all builds); sequential `NODE_ENV=test npm run test:e2e` PASS
(25 Chromium tests); `git diff --check` PASS. The 350 count includes the new
unchanged-version reload regression; the earlier 349 count is historical.

An initial browser attempt overlapped `npm run check`'s build, producing
missing hashed-asset errors. It was interrupted (1 pass, 2 failures,
1 interrupted, 21 not run) and is not passing evidence. The sequential run
after builds completed passed all 25. This was verification orchestration
interference; no application fix or weakened test was used.
