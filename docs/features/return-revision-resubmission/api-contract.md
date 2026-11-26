# API implementation contract

Status: Defined for issue #7; implementation and verification NOT RUN. Frozen product, API and UI specifications prevail. See [plan](plan.md) for source clauses and packet boundaries.

All paths below are under /api/v1; standard authentication, error envelope, UUID Idempotency-Key and optimistic version requirements in the frozen API apply.

| Operation | Request and success | Boundary |
| --- | --- | --- |
| POST /approval-tasks/:id/decisions | Strict {decision: RETURN, reason, expectedVersion}; 201 DecisionResult | Trim reason; 1–4000 UTF-16 code units. Missing, blank or overlong is 422. Authorized actionable reviewer, not self; current role, slot, cycle, revision, version and key required. Preserve REJECT's 10–4000 new-write rule and historical replay compatibility. |
| PATCH /requests/:id/draft | Existing draft contract; 200 RequestDetail | Owner REQUESTER and RETURNED working revision; pinned version cannot change. |
| POST /requests/:id/resubmit | Strict {expectedVersion}; 200 RequestDetail | Owner current REQUESTER, RETURNED, working revision, matching version and active original department membership. Unknown fields or null/missing version yield 422. |
| GET /requests/:id/revisions | Direct metadata array and X-Pagination | Owner/current reviewer; submitted revisions only. |
| GET /requests/:id/revisions/:revisionId | Exact frozen RequestRevision | Owner/current reviewer or actor with an actual decision on exactly this submitted revision. |
| GET /request-types/:id/versions/:versionId | Existing PublishedRequestType contract | Non-admin requestId must satisfy current request-read authority; do not broaden for former handlers. |

Revision list query defaults pageNumber=1 and pageSize=20, maximum pageNumber=10000 and pageSize=100; reject unknown query keys and invalid bounds with 422. Order revisionNumber descending then ID ascending. Each metadata item is {id, revisionNumber, formDefinitionVersionId, submittedAt, submittedBy, cycleId}, with nonnull submission/cycle values. Empty first draft is [] with truthful zero totals. These metadata and paging choices are implementation defaults, not amendments to frozen contracts.

| Actor | List | Exact submitted revision | Current detail / pinned context |
| --- | --- | --- | --- |
| Owner or current reviewer | Allowed under current authority | Allowed | Existing current authority |
| Former actual decision actor, active identity | Denied | Only exact handled revision | Denied absent independent current authority |
| Prior assignment or cancelled task alone; Admin alone; foreign actor | Denied | Denied | Denied absent independent authority |

Malformed, foreign, missing, unsubmitted and mismatched revision IDs receive indistinguishable 404 where applicable. Historical entitlement grants no comments/files access.

Replay is scoped separately for submit and resubmit. After current identity and requester-role checks, look up accepted replay before changed state/version checks. Canonicalize the validated body: object order is irrelevant, changed expectedVersion conflicts under the same key, and unknown fields are rejected. Store the original accepted response atomically; lost-response or restart replay returns it without new effects. Old accepted decision replay likewise returns its stored result; a new key on a stale task yields 409 APPROVAL_TASK_STALE.
