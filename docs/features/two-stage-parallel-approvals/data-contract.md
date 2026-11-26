# Data contract

Version 1 — 2026-11-26. Contracts were written before source implementation. Implementation and test status are recorded in [verification](verification.md). Add nullable `approval_stages.activated_at` via versioned migration and grant its update in `deploy/runtime-grants.sql`. Stage 1 receives submission timestamp; stage 2 is null until once-only activation. Existing rows remain null as legacy unknown. Preserve stage 1 deadlines; stage 2 `dueAt` stays null pending later SLA work.

Activation and slot/version changes occur within the existing locked decision transaction. A unique `APPROVAL_STAGE_ACTIVATED` outbox intent keyed by stage ID uses the existing requestId/cycleId payload. Preserve vote uniqueness, audit immutability, replay and rollback; no duplicate intent or transition on retry or races. Terminal reject/return cancels unfinished work, preserves previous decisions and retains atomic returned-copy creation.
