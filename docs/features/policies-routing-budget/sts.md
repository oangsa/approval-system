# Software test specification — Issue #9

Version 1, before implementation. Planned, not execution evidence.

| Test | Coverage | Criteria / traceability |
|---|---|---|
| Shared schemas | strict DTO/write/search shapes, money bounds, stage order, SLA default, third stage/ANY/quorum rejection, immutable assignment key on PATCH | PRB-AC-01/02/04/05; EP-049–060, API-08 |
| Domain resolver | priority, inclusive thresholds, department specificity, ambiguous/no route, inactive/self reviewers including later stages, multi-reviewer ALL expansion | PRB-AC-03/04/06/07; UT-06/07; FT-026/031/035/036 |
| HTTP contracts/security | all endpoint statuses, 401/403, malformed IDs/body/key, X-Pagination, safe lookup projection | PRB-AC-01/05; SEC-04, EP-022/049–060 |
| Real PostgreSQL | lifecycle/branch/immutable history, expectedVersion races, concurrent policy v2 publication versus request submission across independent transactions, idempotency, duplicate budget scope, audit persistence, mapping-to-submit snapshots and rollback | PRB-AC-01/03/04/06/07/09; BR-024, BR-045; DB-03/04/07/13; CX-12 |
| Browser | admin configure mapping/policy/ceiling, publish, requester submit; 409/422 feedback, ALL/priority/budget explanation, role denial | PRB-AC-08/10; UI-13; E2E-08 |
| Workspace checks | typecheck, lint, tests, build, existing E2E and PostgreSQL regressions | PRB-AC-10 |

Record commit, Node/npm, environment, commands, counts, failures/skips in verification.md. Existing frozen specifications and tests remain unchanged except traceability additions.
