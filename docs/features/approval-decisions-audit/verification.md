# Issue #5 verification evidence

Local working tree on `feature/5-approval-decisions-audit`, based on
`74620fa59de9f25a16f237b09deaa9406c0d0b7e`, 2026-11-08. Changes are uncommitted;
there is no implementation commit, hosted CI run, teammate approval or release.
AI assisted implementation, test authoring and verification. Primary owner remains
@oangsa; independent reviewer remains @kittipichcha.

Environment: Linux, Node v24.18.1, npm 11.16.0, repository's guarded loopback
`workflow_test` PostgreSQL container, Vitest 4.1.10, Playwright 1.60.0 Chromium.
Synthetic fixtures only; no credentials or private datasets are recorded here.

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
  unfinished active and future slots. Future stages prevent premature finalization;
  stage-two execution and RETURN fail closed until their owning integrations.
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

Populated migration upgrade was executed. A fresh-database migration run, hosted
CI, cross-browser coverage, comprehensive Thai/theme/accessibility audit and
future RETURN/stage-two/delegation/bulk journeys were NOT RUN here. They are not
claimed by these results. Existing React Router future-flag build warnings remain.

Independent teammate review and the feature -> sprint-1-staging -> dev -> main
reviewed PR workflow remain outstanding. No commits, pushes, PRs, merges, or
production migration/deployment were performed.

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
The working tree remains uncommitted; release/promotion gates and the previously
listed fresh-database/hosted-CI limits remain outstanding.
