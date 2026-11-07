# Reviewer routing and queue design

Status: planned for Issue #4. This design refines the frozen product, API and UI specifications; it does not replace them.

## Assignment and task identity

Reuse Issue #2 submission resolution and transaction. The trusted primary department and published policy resolve every required slot before submission commits. There are at most two sequential stages, with distinct required slots and parallel ALL voting. The first stage is ACTIVE with ACTIONABLE slots; later stages are WAITING. Missing, inactive, wrong-role or self-only reviewer configuration fails atomically with `409 CONFIGURATION_INCOMPLETE`. Later role changes do not silently replace a snapshotted reviewer.

An `ApprovalTask` represents an approval slot. This implementation selects `approval_slots.id` as both public `id` and `slotId`; no separate task identity is created. The API projection contains exactly `id`, `slotId`, `requestId`, `cycleId`, `revisionId`, `stageNumber`, `assignedReviewer { id, displayName }`, `status`, `dueAt`, `canCurrentUserDecide`, and `version`. Status is `WAITING`, `ACTIONABLE`, `APPROVED`, `REJECTED`, `RETURNED`, or `CANCELLED`; stage is 1 or 2, and timestamps are UTC. No title, private request fields or routing-only fields are added.

## Read and authorization

Both list rows and pagination count use the same server-side scope: active authenticated actor with current REVIEWER role, assigned slot, ACTIONABLE slot, ACTIVE stage, current cycle and submitted revision of a PENDING request. Task detail applies the same current eligibility. A role or assignment change takes effect on the next authorized read. Administrator membership alone grants no reviewer task or private request access. Former assignment does not grant current detail access. Valid delegation and an approved historical handler projection remain future work under their own authorization contracts.

| Actor or state | Current search and detail |
| --- | --- |
| Active assigned REVIEWER, current actionable slot | Allowed |
| Anonymous | 401 |
| Authenticated actor without current REVIEWER role, including administrator only | Search returns 403; detail returns indistinguishable 404 |
| Other reviewer, former assignee or missing task | Detail returns indistinguishable 404; search excludes task |
| WAITING, stale cycle, terminal request or inactive actor | No current eligible task access |

`POST /api/v1/approval-tasks/search` returns the direct `ApprovalTask[]` and `X-Pagination`; `GET /api/v1/approval-tasks/:id` returns the direct task. Validate bounded filters, paging and sorts against the shared search contract, reject unknown fields with 422, never accept client-supplied actor scope, and use deterministic ordering. Responses use no-store and expose the pagination header. Preserve the frozen API error envelope and request ID.

## Presentation and integration

`/reviews` displays authorized results as a desktop table and accessible mobile cards. `/reviews/:taskId` displays the current task and request context only through the existing authorized request read. Fetch permitted context only for visible tasks; show a safe fallback if unavailable. Loading, empty, no-match, error and retry states remain distinct. Clear private state on account changes, preserve keyboard access and avoid color-only status. No decision control is provided by #4.

After Issue #3 integration, reuse its generic `RequestCollection` and preserve its routes and contract exports. Generate the reviewer index migration only against the #3-integrated migration journal; verify fresh and upgrade paths. Do not create a competing submission resolver.

## Decision guard handoff

Provide Issue #5 a reusable server-side decision authorization guard. Immediately before a vote, #5 must use trusted current actor and locked request/slot identity, validate current role, assignment and state, and reject requester equal to actor regardless of stacked roles. An otherwise known own-request attempt returns `403 SELF_APPROVAL_FORBIDDEN`; foreign or missing tasks remain indistinguishable 404. Issue #5 owns the decision endpoint, guard integration, unique effective vote, transitions, audit and outbox transaction. Failed votes must leave all durable state unchanged. Later delegation and bulk paths must apply the same invariant. Direct decision evidence remains blocked by #5; no decision endpoint or delegation is claimed here.

Issue #5 must populate `cycleIsActive` from `approval_cycles.is_active` on the slot cycle row under its decision transaction lock.
