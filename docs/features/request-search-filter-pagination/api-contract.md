# API contract

POST /api/v1/requests/search and /api/v1/approval-tasks/search only. Existing direct DTO arrays, no-store, exposed JSON X-Pagination remain authoritative. Page 1, capacity 20 by default, max 100, page max 10000, at most 20 AND conditions. Request text OR fields: requestNumber,title (either order). Queue retains its existing permitted requestNumber/title text search, actionable status, stageNumber, overdue and dueAt allowlist. No arbitrary requesterId/departmentId, joins, raw paths or multi-sort.

Requests: status EQUAL/NOTEQUAL; typeId/priority EQUAL; createdAt/updatedAt/submittedAt EQUAL/NOTEQUAL/GREATER/LESSER/GREATEROREQUAL/LESSEROREQUAL; submittedAt ISNULL/ISNOTNULL with omitted value; requestNumber/title EQUAL/CONTAINS/STARTWITH/ENDWITH. Sort updatedAt/createdAt/submittedAt/requestNumber/title asc or desc.

Queue: status EQUAL ACTIONABLE; stageNumber EQUAL 1/2; overdue EQUAL boolean; dueAt same six date comparisons and omitted-value null checks; requestNumber EQUAL/CONTAINS/STARTWITH/ENDWITH. Sort dueAt/stageNumber/requestNumber asc or desc. No widening to waiting or historical tasks. UTC ISO dates only. Unknown/invalid input yields 422 VALIDATION_ERROR with no schema details.

Pagination: currentPage and pageSize reflect requested page/capacity even on empty pages; totalPages=ceil(totalCount/pageSize), zero total gives zero pages; hasPrevious=page>1, hasNext=page<totalPages. Counts and rows share authorized predicates and statement snapshot.
