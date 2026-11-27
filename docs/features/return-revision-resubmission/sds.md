# Return, revision and resubmission design

Status: Defined for issue #7; implementation and verification NOT RUN. Frozen product, API and UI specifications prevail. See [plan](plan.md) for source clauses and packet boundaries.

## Lifecycle and transaction

An actionable authorized RETURN in a valid active stage closes the current cycle. Under the existing request/cycle/stage/slot lock order, persist one decision, mark the deciding slot RETURNED, cancel and version ACTIONABLE/WAITING siblings and cancel remaining live stages; retain completed votes and stages. Copy submitted revision N to working N+1 with fresh revision and item IDs, pinned form, fields and exact amounts. Keep the submitted revision and closed cycle pointers, set the working pointer and RETURNED status, and increment request version once. Decision, DECISION_RETURN and REQUEST_RETURNED audit events, one decision outbox intent and replay completion commit atomically.

Only the owner with current REQUESTER role edits the working copy; repeated saves do not allocate additional revisions. Resubmit validates the complete pinned form and current route under the publication gate and locks. Freeze the working revision, create a distinct cycle and current policy/assignment snapshot, eligible stages and slots with first-stage due time, then set PENDING and write REQUEST_RESUBMITTED audit/outbox and replay response in one transaction. Failures roll back all writes, retaining working edits. Existing number, identity, original submittedAt, form and department snapshot remain unchanged; no number sequence is consumed. New revision submittedAt and cycle createdAt represent resubmission. No prior vote transfers.

Route using original department ID only after confirming its active row and an active membership there; a changed primary membership does not retarget. Missing membership or inactive department produces CONFIGURATION_INCOMPLETE. A disabled type is permitted only for returned resubmission. Do not compare its pinned form to a newly published form. Existing first-submit behavior and FORM_DEFINITION_CHANGED remain intact. RETURN works in valid stage one or two without expanding stage-two APPROVE progression.

Authorization, list count and historical projection use a coherent read transaction/lock. Current identity and authorization are rechecked server-side. No attachments subsystem, comparison view, new role or endpoint beyond frozen contracts is introduced.
