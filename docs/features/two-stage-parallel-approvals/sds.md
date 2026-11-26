# Software design

Version 1 — 2026-11-26. Contracts were written before source implementation. Implementation and test status are recorded in [verification](verification.md). [Plan](plan.md) and frozen specifications govern.

Policies contain one or two ordered nonempty ALL stages. Submission creates stage 1 active and stage 2 waiting. Retain request-first lock and related lock order, unique votes, idempotency, immutable decisions and audit. Remove the temporary stage-two decision/transition guard. A stage completes only when all required slots approve. On stage 1 completion atomically complete it, activate stage 2 once, timestamp activation, promote WAITING slots to ACTIONABLE with version increments, update current stage and insert the unique activation outbox intent. Partial approval remains PENDING; final-stage completion approves once.

REJECT or RETURN in either active stage closes the cycle, cancels unfinished slots/stages and increments affected slot versions, preserving completed decisions and stages. RETURN retains the existing returned working copy. Decision, transition, audit, outbox and idempotency completion are atomic; failure rolls back all effects. Replays return the original result; stale new-key decisions cannot change state. Preserve stage 1 deadlines; stage 2 dueAt stays null for the later SLA issue. Historical handled-task projection remains restricted.
