# API contract

Version 1 — 2026-11-26. Contracts were written before source implementation. Implementation and test status are recorded in [verification](verification.md). Paths are relative to `/api/v1`; frozen authentication, errors, version and idempotency rules apply.

Extract `approverSummarySchema` and inferred `ApproverSummary` without wire change: `slotId`, `stageNumber` (1 or 2), `reviewer` (`id`, `displayName`), `status` (WAITING, ACTIONABLE, APPROVED, REJECTED, RETURNED or CANCELLED). `GET /requests/:id/approvers` returns a direct minimal `ApproverSummary[]`, deterministically ordered by stage and stable slot identity, with private no-store caching and no email or contact details.

Apply current request-detail authorization: owner or current participant, including ACTIONABLE or WAITING reviewer on the current PENDING cycle. Admin alone and former handlers have no bypass. Missing, foreign and unauthorized private resources follow existing indistinguishable 404 behavior; malformed UUIDs retain existing request validation behavior. Historical handling alone does not authorize this current read. Existing decision endpoint, expectedVersion, identity/role/self-approval checks, stale response and accepted-key replay semantics remain in force.
