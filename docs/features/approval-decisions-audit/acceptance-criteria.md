# Numbered acceptance criteria — v1

- DEC-AC-01: Exact validated decision endpoint and 201 frozen DTO (M09/M10; EP-046/API-08).
- DEC-AC-02: Current nonself active reviewer, revision/cycle/stage/slot/version required; safe 403/404/409, no writes on failure (SEC-05/UT-01).
- DEC-AC-03: Rejection requires reason and closes all unfinished slots; approval completes only final ALL slot with no future stage (UT-02/FT-009/010/011).
- DEC-AC-04: Durable same-key replay, semantic conflict, new duplicate stale; unique effective slot vote (DB-05/CX-08/09).
- DEC-AC-05: Decision/state/audit/outbox/idempotency atomic; independent-connection races and injected failure preserve coherent state (DB-08/09/CX-03/14).
- DEC-AC-06: Bounded persisted permitted timeline survives restart; audit/decision immutable and safe metadata projection (FT-013/EP-041).
- DEC-AC-07: Accessible Approve/Reject confirmation, reason validation, pending and unchanged retry key (UI-09/10).
- DEC-AC-08: Stale retains reason, closes unsafe action, offers reload; success refetches authoritative resources (E2E-02).
- DEC-AC-09: Request and reviewer history separate from discussion; actual handlers can reopen exact read-only task context without current request/queue access. Decision 403/404 removes prior protected content. Current and historical authorization do not leak private data.
- DEC-AC-10: Actual checks/environment recorded; independent teammate review and staged promotion required, never self-review.
