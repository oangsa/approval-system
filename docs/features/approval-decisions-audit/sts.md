# Software test specification — v1

Planned, not yet executed. References DEC-AC-01–10 and global test.md.

| Suite | Planned evidence |
| --- | --- |
| Contracts | Decision reason/version/unknown fields, exact result, UTC timeline, bounded paging |
| Domain unit | Self/foreign/wrong role/inactive/stale version/cycle/revision/stage, ALL and future-stage safety |
| API | Authentication, validation, 201/replay/conflict/403/404/409, CORS and OpenAPI |
| Real PostgreSQL | Single approve/reject, parallel partial approval, future stage, rollback at audit, independent connections racing, durable replay, unique slot, immutable history and safe scope |
| UI components | Confirmation, required reason, pending/retry key, stale retention/reload, history states |
| Playwright | Real submit/review/confirm/refetch/history, keyboard dialog, requester history and SSR privacy |

Review regression: single-slot and parallel two-stage completion must fail closed
with 409 INVALID_REQUEST_TRANSITION, unchanged persisted evidence and no completed
idempotency key. The blocked key remains reusable for a permitted rejection;
partial approvals remain accepted and future-stage attempts remain stale.

Record exact executed checks and gaps in verification.md. Do not equate test
presence with passing evidence; review and publication gates remain separate.

## Executed evidence

See [verification.md](verification.md) for environment, actual runs and failure
ledger. Contracts and domain tests execute DEC-AC-01–04. The ten PostgreSQL
feature cases (including a real process restart) execute rollback/replay/races,
API/security and timeline scope for DEC-AC-01–06/09. Four browser cases execute
confirmation/history, stale recovery and lost accepted-response retry for
DEC-AC-07–09; the fast service test verifies unchanged key reuse independently.
Full suites pass as recorded. DEC-AC-10 teammate review/promotion is pending.
Future RETURN/stage-two/delegation/bulk cases remain outside this slice.

Alignment review regressions additionally verify actual-handler task reopening,
nonparticipant/admin denial, no current request/queue privilege from historical
handling, private UI removal after decision 403/404, current-stage display after
success and typed-reason retention/discard after stale reload. Browser approve
and reject cases reload the handled task before visiting requester history.

Server error regression cases cover safe/copyable 500/503 support IDs in decision
and timeline UI, absence of private diagnostics, successful history retry, and
terminal 403/404 history denial.
