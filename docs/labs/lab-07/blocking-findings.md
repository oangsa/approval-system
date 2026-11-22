# Lab 7 review findings and disposition

PR #80 review 6012368544 by kittipichcha, **CHANGES REQUESTED**, submitted
22 November 2026 at **19:54:09 ICT (UTC+07:00)**, reviewed head
`2392f4fb65a556d83d2e39bc2d7862c8475c8bc1`.

## B-01 — OPEN: substantive pre-implementation review evidence

The contract at `contract-draft.md`, Required review and chronological next steps,
requires substantive findings, resolution and timing before implementation.
PR #79 review 6010822681 establishes approval of `5d2e8d8` at 13:44:18 ICT;
the issue attestation is at 13:49 ICT. Its review body, inline comments and PR
discussion are empty. Rechecked after the reviewer raised this finding.

Earlier report/verification wording treated the missing content as merely an
evidence-detail limitation. That conclusion was too strong: the full required
review gate is **UNVERIFIED**. The existing approval remains a real approval;
it cannot establish unrecorded substantive content. The later PR #80 review is
real review at its actual time, after implementation, and does not repair chronology.

Owner: Kittipich supplies any genuinely contemporaneous review findings and their
resolution with original source/time, if they exist. Otherwise the team obtains
TA guidance on the missed process gate. No invented notes, backdating, history
rewriting or retrospective relaxation of the contract. Release remains blocked.

## B-02 — verification additions; reviewer confirmation pending

The original passing suites did not cover all adopted STS layers. Missing raw
HTTP boundaries, complete rejection effects, REJECT-specific authorization and
rollback, and historical browser reads are being verified explicitly. These are
verification-only changes; no product behavior or adopted STS is relaxed.

Original RED/GREEN and failed runs remain preserved. New tests are subsequent
coverage work, not retrospective original RED. Test-only revision:
`9c4f3a64981359dc5648f603f0bb130a7c977b51`.

Full local verification on that revision, 22 November 2026 ICT:
typecheck/lint/build passed; contracts 21, API 205, web 171, PostgreSQL 95 and
browser 31 passed, zero failed/skipped in final successful runs (523 distinct
cases, excluding targeted subsets and earlier baseline totals).
Web command: `npm run test:web -- --maxWorkers=1`. The preceding default-worker
run failed with seven unexpected worker exits, 99 passed of 124 discovered,
exit 1; it is retained, not counted as successful coverage. Cause unconfirmed;
single-worker completion changes scheduling, not assertions or test selection.
Other suite commands are the unchanged root scripts.
Raw logs/UTC timestamps: private `artifacts/lab-07/blocking-full-*.log` and
`blocking-full-runs.jsonl`. All database work used guarded loopback workflow_test.
Hosted Verification also passed on 9c4f3a6: push run 45025529307 and PR run
45025534051 / job 137217621424. The PR job reports web171/API205/contracts21/
PG95/browser31, release13 and initialization1 passing, plus all image-build and
migration steps. Hosted web uses normal worker scheduling; the local unexpected
worker-exit cause remains unconfirmed. Local/CI success does not close a human
review finding or authorize release.

### Coverage map at test-only revision 9c4f3a6

HTTP/PG below means the real Elysia route via app.handle with real guarded
PostgreSQL; browser tests use actual frontend/API listeners. Raw values are sent
without preprocessing. The evidence oracle reads committed request/cycle/stage/
slot versions, decisions, audit, outbox and completed keys on a separate database
connection, with deterministic ordering.

| Adopted STS | Executable evidence |
| --- | --- |
| STS-L7-01 | contracts/decisions and domain reason-semantics tests; PG “Lab 7 HTTP validates new rejections…” sends missing/empty/whitespace/nine-unit bodies and verifies 422 plus unchanged independent oracle/keys. |
| STS-L7-02 | PG “Lab 7 raw HTTP rejection commits every effect” sends exact ten, padded ten and eleven on separate parallel/future-stage tasks. Asserts request/task versions, inactive cycle, rejected stage/slot, cancelled unfinished stages/slots, one decision, two audit events, one outbox and one completed key; real owner timeline GET. |
| STS-L7-03 | Same raw HTTP cases send 4000 and padded 4000 without trim in the caller; invalid-input HTTP case sends 4001, checks 422 and no write. Persisted note is exact trim result. |
| STS-L7-04 | Existing HTTP/PG APPROVE cases retained; browser “Lab 7 preserves approval without a reason…” confirms 201 and requester History after reload. |
| STS-L7-05 | New six-case valid REJECT HTTP matrix covers anonymous/self/foreign/missing/wrong-role/inactive; exact status/error plus independent no-write oracle. Inactive identity is rejected as 401 at authentication, before domain (whose inactive guard remains covered). Domain invalid-context tests exercise both APPROVE and valid ten-unit REJECT. |
| STS-L7-06 | Four valid REJECT HTTP stale cases (version/revision/cycle/slot); raw-boundary cases additionally assert accepted same-key/body 201, changed-body key 409, fresh-key duplicate 409 and unchanged saved effects. |
| STS-L7-07 | Historical fixture HTTP timeline GET as requester and reviewer; actual requester browser reload displays exact short “No”; independent stored request/decision unchanged; PG immutable update and delete both rejected. |
| STS-L7-08 | Existing actual SQL audit-insertion fault seam parameterized for both APPROVE and valid ten-unit REJECT, retaining approval coverage; complete independent oracle/key rollback and coherent successful retry. |
| STS-L7-09 | Existing separate requester/reviewer real browser journey retains nine-unit accessible feedback/input, no-write oracle, corrected ten-unit decision and persisted History after reload. |
| STS-L7-10 | Contract/domain Unicode and combining tests; raw HTTP accepts five emoji and five decomposed combining pairs, persists without normalization; four emoji+x is rejected through the HTTP route with no write. |
| STS-L7-11 | Historical accepted “No” key/body 201 with identical saved result, conflict old key 409, NEW short key 422; independent rows/keys unchanged. |
| STS-L7-12 | New HTTP RETURN cases: “No” gives existing unsupported-transition 409; missing/blank 422; independent oracle unchanged. Shared/domain regression retained. |
| STS-L7-13 | Existing independent-connection approve/reject race retained with valid new reason; coherent terminal status, single decision and audit verified. Oracle also reads completed keys/outbox. |

Relevant files: `apps/api/tests/postgres/decisions.test.ts`,
`apps/api/tests/unit/decisionRules.test.ts`, `packages/contracts/tests/decisions.test.ts`,
`e2e/approval-decisions.spec.ts` and the unchanged dialog component tests.

Historical setup is explicitly a **synthetic legacy-format persistence fixture**
through unchanged Repository.Save/Complete, bypassing NEW validation only in test
setup. It is not a production row or a claim that the old binary ran in this
follow-up. The actual HTTP and browser read paths are unmocked. No historical
row is rewritten to satisfy the new rule.
