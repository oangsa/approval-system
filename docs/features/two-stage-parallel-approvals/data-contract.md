# Data contract

Version 1 — 2026-11-26. Contracts were written before source implementation. Implementation and test status are recorded in [verification](verification.md). Add nullable `approval_stages.activated_at` via versioned migration and grant its update in `deploy/runtime-grants.sql`. Stage 1 receives submission timestamp; stage 2 is null until once-only activation. Existing rows remain null as legacy unknown. Preserve stage 1 deadlines; stage 2 `dueAt` stays null pending later SLA work.

Activation and slot/version changes occur within the existing locked decision transaction. A unique `APPROVAL_STAGE_ACTIVATED` outbox intent keyed by stage ID uses the existing requestId/cycleId payload. Preserve vote uniqueness, audit immutability, replay and rollback; no duplicate intent or transition on retry or races. Terminal reject/return cancels unfinished work, preserves previous decisions and retains atomic returned-copy creation.

## Version 1.1 — reassignment compatibility correction

The immutable routing snapshot records original resolution, not the identity of the reviewer after supported reassignment. Validate every stage's assignment keys and required slot counts against distinct original `(assignmentKey, reviewerId)` tuples, without requiring the current reviewer to equal the original reviewer. Keep persisted slot IDs, cycle/stage membership, primary/unique keys, effective reviewer authorization, versions and request-first locking unchanged. Unknown keys and missing or additional required slots remain invalid, including an extra or missing member of a grouped assignment.

This correction adds no column, endpoint or reassignment policy engine. Regression fixtures change an undecided slot's effective reviewer and increment its version while retaining the same slot identity and immutable snapshot, to exercise compatibility at the decision boundary. The unimplemented administrator reassignment endpoint and its own authorization/audit orchestration remain separate feature work; existing decision persistence and audit guarantees remain in force.
