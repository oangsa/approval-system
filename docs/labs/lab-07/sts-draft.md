# Lab 7 STS — draft v0.1, 22 November 2026 ICT

Issue #78. PROPOSED / NOT RUN. Requires TA decision and substantive teammate
contract review. Existing FT-010, DEC criteria and STS IDs are not renumbered.
AC numbers below mean AC-L7-nn in contract-draft.md.

## Shared setup and data oracle

Unit/contract tests need no database. API listener-free tests establish transport
responses but do not prove persistence. PG/browser cases require NODE_ENV=test,
guarded loopback workflow_test, migrations and synthetic seed. Snapshot request,
cycle/stage/slot statuses and versions, decision/audit/outbox/key row counts BEFORE
an invalid action; compare afterward on an independent connection. Synthetic
eligible reviewer must differ from requester. Never use production seeds.

| ID / AC | Layer and input/prerequisites | Procedure | Expected result/data effects; preserved behavior |
| --- | --- | --- | --- |
| STS-L7-01 / 01 | Contract, domain, API/PG; independent pending tasks; omitted, empty, space-newline-space, `123456789` | Parse and invoke NEW rejection for each input with fresh key; compare oracle | Invalid schema/domain; API 422 VALIDATION_ERROR; zero durable differences, task still actionable. Old schema accepts 9 units, so meaningful RED must fail on success=true, not broken setup. |
| STS-L7-02 / 02 | Contract/API/PG; `1234567890`, `12345678901`, ` 1234567890 ` | Separate valid tasks; reject each, query requester/history after refresh | 201; trim stored; REJECTED, inactive cycle, selected slot REJECTED and unfinished slots CANCELLED; exactly one decision and normal decision/status audit/outbox/key effects. |
| STS-L7-03 / 03 | Contract/API; `x`.repeat(4000), repeat(4001) and padded 4000 | Submit each with fresh task/key; inspect persisted reason for valid case | 4000 succeeds, 4001 fails 422; padding removed before semantic cap; no write for invalid input. |
| STS-L7-04 / 04 | Domain/API/PG/browser; fresh task, APPROVE omitted reason | Confirm approval without entering Reason; reload requester history | Accepted 201; normal one-stage APPROVED transition and immutable record, optional reason remains optional. |
| STS-L7-05 / 05 | Domain/API/PG; valid 10-unit reason; anonymous, wrong role, inactive, self-owned, foreign/missing task | Invoke direct API, then compare DB oracle | 401 for unauthenticated; existing role/self 403, foreign/missing 404; no private leakage/writes. Hidden UI alone is insufficient proof. |
| STS-L7-06 / 05 | PG; stale task/version/cycle and valid >=10-unit reason | POST stale request; commit valid decision; same key/body replay; same key changed body; fresh-key duplicate | Existing stale 409; stable accepted result for replay; conflicting hash 409; no duplicate decision/audit/outbox. |
| STS-L7-07 / 06 | PG/API/browser; synthetic historical short reason created under OLD accepted baseline | Read authorized timeline/reload after upgrade without rewriting fixture | Short note readable and unchanged, no new validation on read; immutable update/delete still denied. |
| STS-L7-08 / 05 | PG; valid 10-unit NEW reason; existing audit insertion fault seam | Inject failure after decision/state writes before audit commit, then retry | Entire operation rolls back, including key; fresh valid retry commits coherent effects. |
| STS-L7-09 / 07 | Real browser + API + PG; separate requester/reviewer contexts | Requester login/create/submit; reviewer opens task, enters `123456789`; capture feedback/value and no-write oracle; correct to `1234567890`, reject; requester refreshes history | Accessible error retains 9 units, no invalid mutation; exact 10 accepted; persistent rejected status/reason after refresh. Record context/time/SHA per screenshot. |
| STS-L7-10 / 03 | Contract/domain/API; 5 emoji; 4 emoji+`x`; 5 `e`+combining acute pairs | Count trimmed JS length then parse NEW reasons | 10 valid; 9 invalid; combining pairs 10 valid; no normalization, grapheme/codepoint mismatch or DB minimum constraint. |
| STS-L7-11 / 05/06 | PG/API; accepted OLD short body/key plus new unaccepted short key | Replay old same key/body, conflict old key, submit new short key | Proposed: old accepted replay stable, conflict 409, new short 422; unchanged row counts. Requires reviewed validation sequencing. |
| STS-L7-12 / 04 | Shared/domain/API; RETURN reason `No`, omitted and blank | Parse existing transport variants; invoke current Sprint 1 domain for valid transport | RETURN nonblank schema remains unchanged; domain 409 INVALID_REQUEST_TRANSITION, no writes. No RETURN feature introduced. |
| STS-L7-13 / 05 | PG; independent connections, same slot or active cycle; valid reasons/approve | Race accepted decision attempts; query final state and all effect counts | Existing request locks/unique slot enforce coherent terminal state and one effective decision per slot; loser stale/conflict, no partial effects. |

## Planned meaningful RED/GREEN (not execution evidence)

First test-only change should parameterize REJECT 9→false and 10→true in
packages/contracts/tests/decisions.test.ts and domain equivalents. Run the exact
chosen command in both phases, e.g. `npm run test:contracts -- -t "Lab 7"`.
Record actual file/command/SHA/ICT time/environment/exit/assertion output when run.
An installation or compile failure is not RED. Preserve scoped contract, test and
implementation commits; do not squash the chronology away.

Existing contracts test `Incomplete` has 10 units and needs no changed expectation.
Domain test `ALL votes, future stages and rejection never prematurely finalize`
uses `No` and must later use a valid >=10-unit new rejection, linking the revised
expectation to approved AC-L7-02. Preserve its ALL/future-stage assertions. Keep
a distinct old short-history fixture; do not remove historical coverage.

## Regression command selection

Use actual root scripts: typecheck, lint, build; test:contracts (DTO/reason),
test:api (domain/auth/guards/HTTP), test:web (dialog/service/error),
test:integration (real PostgreSQL state/replay/rollback/concurrency/history),
test:e2e (real browser journeys). test:release is not required for a text-rule-only
implementation unless release code is affected. Existing pipeline runs it anyway.
Keep each suite's passed/failed/skipped/not-run separate; a filtered target is a
subset, never added again to the containing full suite total.
