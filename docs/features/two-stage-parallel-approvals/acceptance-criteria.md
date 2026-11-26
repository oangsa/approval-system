# Acceptance criteria

Version 1 — 2026-11-26. Contracts were written before source implementation. Implementation and test status are recorded in [verification](verification.md). All assertions are required; frozen specifications prevail.

| ID | Required assertion | Evidence |
| --- | --- | --- |
| TP-01 | One/two ordered nonempty ALL stages publish and execute; zero/empty/third stages rejected without changing published policy; existing editor reused. | FT-025, EP-053, UI-13, E2E-08 |
| TP-02 | Stage 2 starts WAITING, cannot vote or enter actionable queue; stage 1 partial ALL stays PENDING; all required votes activate stage 2 once and version its slots. | UT-02, FT-032, UI-11, E2E-05 |
| TP-03 | Stage 2 partial ALL stays PENDING; final approval closes once; stage 1 deadline unchanged, stage 2 dueAt null; activation timestamp and unique stage-keyed intent correct. | UT-02, DB-09, CX-02, E2E-05 |
| TP-04 | REJECT and RETURN in either active stage close cycle, cancel unfinished work, preserve prior decisions; RETURN creates existing working copy and prevents later activation. | EP-046, CX-03, DB-05 |
| TP-05 | Current role, owner/self, assignment, cycle/revision, expectedVersion and idempotency checked; waiting/stale/foreign decisions fail; accepted same-key replay returns original result without effects, changed payload conflicts. | SEC-05, CX-14, EP-046 |
| TP-06 | Independent PostgreSQL connections race last approvals, approval versus reject/return, stale and replay; one coherent result, activation/finalization and no duplicate votes/audit/outbox. Forced audit/outbox failures roll back all writes and permit retry. | DB-05/09, CX-02/03/14 |
| TP-07 | Approvers direct minimal array has deterministic order, private no-store; owner/current ACTIONABLE or WAITING reviewer allowed on current PENDING cycle; unrelated, Admin alone and former handler denied without disclosure. Shared schema preserves detail wire shape. | FT-027, EP-042, UT-13 |
| TP-08 | Approval tab and actionable detail show stage states and accurate approved/remaining counts; confirmation, stale/replay, accessibility and restricted historical view remain correct. | UI-09/10/11/13, E2E-05/08 |
| TP-09 | Activation seam: first submission sets stage 1 timestamp; stage 2 null before activation and set once afterward; legacy null remains unknown; grant permits runtime update. | DB integration and migration checks |
| TP-10 | Relevant typecheck, lint, build, unit, contract, API, real PostgreSQL and browser checks plus review and delivery gates recorded honestly on final tree. | [STS](sts.md), [DoD](dod.md), [verification](verification.md) |

## TP-R2 corrective acceptance — effective reviewer compatibility

Supported reassignment of an undecided ACTIONABLE or WAITING slot preserves its ID, routing snapshot, key, stage membership and deadline while changing its effective reviewer and version. That persisted postcondition must remain compatible with the decision engine. Replacement reviewers may vote using the current version, original/foreign reviewers remain denied, future replacement must not block current-stage completion, and activation/finalization occur once. Validate all required per-stage/per-key slot counts, including grouped reviewers, and reject missing, unknown-key, same-key extra or balanced wrong-key slots without writes. This acceptance corrects a compatibility defect; it does not add the separate reassignment endpoint or claim its authorization/concurrency implementation.
