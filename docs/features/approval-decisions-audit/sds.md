# Approval decisions and audit SDS — v1

Versioned before implementation, 2026-11-08. Issue #5; M09/M10/M12/M14;
FR-009/010/011/013; AC-009/010/011/013. Frozen specifications, api-specs,
ui-specs, system-sds and root AGENTS.md prevail.

Domain validates current actor, ownership, task version, submitted revision,
active cycle/stage/slot and computes ALL completion. Application owns orchestration;
infrastructure locks and persists; presentation validates shared Zod contracts.
Reuse #2 submission snapshot and #4 slot identity (taskId = slotId).

POST /api/v1/approval-tasks/:id/decisions accepts APPROVE or REJECT, reason
(required nonblank for rejection), expectedVersion and UUID Idempotency-Key.
Shared schemas retain frozen RETURN vocabulary, but this slice rejects RETURN
and stage-two execution with 409 INVALID_REQUEST_TRANSITION. Returns exact frozen
201 DecisionResult for accepted APPROVE/REJECT. RETURN, delegation, bulk and activation
of stage two remain separate consumer integrations. Stage-one parallel slots
use ALL; until stage-two activation is implemented, a vote that would complete
stage one with a future stage fails with 409 INVALID_REQUEST_TRANSITION before
any writes. Partial approvals remain accepted; the final slot stays ACTIONABLE
and stage one ACTIVE so the request remains recoverable. Rejection closes the
whole cycle. This temporary guard is not full API §7.2 stage-two progression.

Lock current identity, idempotency scope, request, cycle, stages and slots in
stable order. Replay an accepted result before new-operation state validation.
Scope is actor + POST + canonical task path + key; hash validated semantic body.
Store one decision per slot (unique DB constraint), state updates, audit, outbox
and completed idempotency result in the same transaction. A rolled-back attempt
has no durable claim and can retry. A request lock serializes all cycle votes.

Own-task attempts: 403 SELF_APPROVAL_FORBIDDEN. Foreign/missing: indistinguishable
404. Ineligible current role: 403. Stale cycle/revision/version/terminal: 409
APPROVAL_TASK_STALE; unsupported invalid transitions: 409 INVALID_REQUEST_TRANSITION.
All failures preserve decision/state/audit/outbox. Identity is never client supplied.

GET /api/v1/requests/:id/timeline returns AuditTimelineItem[] with X-Pagination,
validated pageNumber/pageSize (default 1/20, maximum 100), stable time/id ordering.
Owner and current reviewer see request events; a former deciding reviewer sees
only their own accepted decision events, never broad current request content.
Project metadata explicitly by event type; never serialize arbitrary internal JSON.
Audit and decisions have database UPDATE/DELETE rejection triggers. No rewrite API.

UI uses a keyboard/focus-managed native modal composed with existing shadcn
Button/Input primitives and Tailwind. Every Approve/Reject requires DecisionDialog.
Hold reason/key only in memory; unchanged retry retains key, pending prevents
repeat submits. Stale closes dialog, retains reason, disables action and offers
Reload task. Retain the reason across a reload into read-only or unavailable
context and offer explicit discard. Success refetches task, authorized request
and queue; show confirmed request status and current stage without inventing state.
A 403/404 decision response closes the dialog and clears protected request content.
Decision/history 500/503 states display a safe copyable Request ID; terminal
history denials stop retries using the existing shared error presentation mapping.

The existing GET /api/v1/approval-tasks/:id supports an exact handled-task projection
only when an accepted decision proves the actor handled that slot. It returns the
same ApprovalTask DTO with canCurrentUserDecide=false. Historical reads never grant
current request detail, queue membership, further decisions or another actor's
handled context. A current role change removes actionable access while the exact
handling record remains the proof for this limited historical read. The review
page renders only the task summary and permitted history for this projection;
it must not fetch the broad current request DTO. Existing nonparticipants remain
indistinguishable 404, including administrator-only actors without a handling record.
History tab is separate from discussion. Abort and scope reads on account changes;
private content remains absent from public SSR.
