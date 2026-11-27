# Software test specification

Version 1 — 2026-11-26. Contracts were written before source implementation. Implementation and test status are recorded in [verification](verification.md). The table defines required assertions; execution evidence is separate. See [acceptance criteria](acceptance-criteria.md).

| Cases | Required coverage |
| --- | --- |
| TP-T01: FT-025/032, UT-02, EP-046/053 | Policy bounds, nonempty ordered ALL, partial/final decisions, waiting denial, both-stage rejection/return, stale and replay. |
| TP-T02: FT-027, EP-042, UT-13 | Exact shared wire schema, deterministic minimal array, private no-store, owner/current reviewers including WAITING, unauthorized/Admin/former-handler privacy. |
| TP-T03: DB-05/09, CX-02/03/14, SEC-05 | Independent PostgreSQL connections and barriers for last approvals, terminal races, stale and replay; SQL assertions for one vote/activation/finalization and audit/outbox; inject audit/outbox failures, verify rollback and retry; test self-approval. |
| TP-T04: UI-09/10/11/13, E2E-05/08 | Existing editor bounds, progress/counts, waiting queue exclusion, dialogs and stale/replay, historical network restriction, keyboard and responsive paths. |
| TP-T05: activation seam | Migration legacy null, stage 1 submission timestamp, stage 2 null before activation and once-only timestamp, slot versions, null stage 2 dueAt and runtime grant. |
| TP-T06: delivery | Typecheck, lint, build, unit, contract, API, PostgreSQL, browser and bounded review on final tree; record exact commands, failures and reruns. |

## Executable coverage

| Acceptance criteria | Test files and assertions |
| --- | --- |
| TP-01 | `packages/contracts/tests/policies.test.ts`, `apps/api/tests/postgres/configuration.test.ts`, `apps/web/tests/components/policies.test.tsx`, `e2e/policies-routing-budget.spec.ts`: ordered nonempty bounded policies, publication, configuration UI and grouped assignment resolution. |
| TP-02–06 | `apps/api/tests/unit/decisionRules.test.ts`, `apps/api/tests/postgres/decisions.test.ts`: waiting denial, partial/final ALL, once-only activation, versions, both-stage terminal cancellation, independent-connection rendezvous races, transaction fault injection and replay. `returnedAcceptance.test.ts` and `returnResubmitRaces.test.ts` preserve immutable history, valid cancelled peers, unknown-tuple rejection and returned-cycle isolation. |
| TP-07 | `apps/api/tests/integration/approvers.test.ts`, `requestOpenApi.test.ts`, `apps/api/tests/postgres/decisions.test.ts`: strict minimal schema, authenticated participant scope including WAITING, deterministic order, private no-store and historical/Admin/foreign denials. |
| TP-08 | `apps/web/tests/components/requestDetail.test.tsx`, `reviewTask.test.tsx`, `decisionDialog.test.tsx`, `decisionActions.test.tsx`; `e2e/two-stage-parallel-approvals.spec.ts`: loading/retry/denial/session changes, late response isolation, fresh-summary stage selection, both stages' ALL counts, waiting/overdue queue exclusion, confirmation, stale reason retention and restricted handled reload. |
| TP-09 | `apps/api/tests/postgres/activationMigration.test.ts` applies actual migration SQL to populated checked temporary relation; `runtimePrivileges.test.ts` executes timestamp UPDATE under the runtime role; `decisions.test.ts` asserts submission/activation timestamps, waiting deadlines, replay and rollback. |
| TP-10 | [Verification](verification.md), [review](review.md), [DoD](dod.md), [original source manifest](source-manifest.sha256) and [TP-R2 repair manifest](source-manifest-reassignment-fix.sha256). |

## TP-R2 reassignment regressions — specified before repair

Real-PostgreSQL tests must first reproduce rejected replacement votes with the original validator, then prove an ACTIONABLE replacement can complete its unchanged slot and a WAITING replacement does not block stage-1 completion or stage-2 activation. Assert immutable snapshots and slot IDs, reassignment/activation version increments, original-reviewer denial, stale/foreign no-write outcomes, unique decisions and exactly-once final approval. Retain explicit rejection of unknown-key and same-key extra slots and a missing member of a grouped required assignment. Reuse existing independent-connection decision races and audit/outbox rollback coverage.

No administrator reassignment writer is implemented in the current slice. Database fixtures model its supported persisted postcondition; they do not claim to verify a public reassignment endpoint or its authorization. Concurrent reassignment-versus-vote endpoint coverage is conditional on that future implementation; no substitute production policy engine is added here. Actual commands, RED/GREEN results and coverage limitations must be recorded in verification before this blocker is marked repaired.

The seven `TP-R2` tests in `apps/api/tests/postgres/decisions.test.ts` implement this coverage alongside existing decision races and audit/outbox rollback tests. The final matrix and any filtered diagnostic runs are recorded separately in verification.
