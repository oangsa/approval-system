# Definition of done — v1

- [x] DEC-AC-01–09 implemented with recorded scoped tests; shared contracts and migrations included.
- [x] Unit/API/contracts/UI/typecheck/lint/build pass.
- [x] Real PostgreSQL rollback, race, durable replay, API restart, immutable and timeline evidence recorded.
- [x] Browser confirmation/history, pending/retry and stale recovery evidence recorded.
- [x] Traceability, environment, tested working-tree baseline and failures/skips documented in [verification](verification.md).
- [ ] Independent @kittipichcha review; PR to sprint-1-staging then reviewed dev/main promotions.

Hosted Verification run #53 passed at pushed HEAD `154f3f5`; it does not verify
the local review fixes. Fresh-database local migration coverage remains unexecuted;
see [verification](verification.md) for revision-specific results and limits.
Stage-two activation is deferred: the reviewed fallback rejects a stage-one
completing vote before writes, preserving a recoverable ACTIVE stage and
ACTIONABLE slot. This checklist records the scoped slice, not full two-stage
workflow acceptance. Source edits do not authorize commit, push, PR publication, merge or deployment.
