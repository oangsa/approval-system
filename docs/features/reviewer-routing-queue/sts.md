# Reviewer routing and queue test specification

Global IDs refer to `docs/specs/test.md`; child cases refine rather than replace them. Assertions include database state where specified. The table defines intended coverage; the executed subset and outstanding gaps are recorded below and in [verification evidence](verification.md). A case is not complete merely because a subset ran.

| Case / global trace | Type and planned path | Setup and action | Expected result |
| --- | --- | --- | --- |
| REV-CT-01 / API-03 | Contract: `packages/contracts/tests/approvalTasks.test.ts` | Parse exact task with null due date and stages 1 and 2; try invalid UUID, status, version and extra private fields. | Exact frozen DTO accepted; invalid or extra fields rejected. |
| REV-CT-02 / API-04 | Contract: same | Exercise search defaults, invalid page/sort, WAITING and actor override. | Defaults valid; invalid or unauthorized fields rejected, never silently widen scope. |
| REV-UT-01 / UT-08, SEC-05, FR-012 | Unit: `apps/api/tests/unit/approvalTaskRules.test.ts` | Test stacked-role self actor, eligible nonself actor, stale, waiting, terminal and forged context. | Self is rejected with typed 403; no role bypass; stale state is handled distinctly. |
| REV-UT-02 / UT-13, FR-008 | Unit: same and service unit tests | Evaluate current reviewer, former handler, Administrator-only and disabled actor. | Only current eligible reviewer is authorized. |
| REV-PG-01 / FT-007, DB-03, AC-007 | PostgreSQL: `apps/api/tests/postgres/requests.test.ts` | Submit one-stage and two-stage policies with parallel required slots. | Exact cycle, stage and slot counts; first stage ACTIVE/ACTIONABLE, later stage WAITING; revision snapshot correct. |
| REV-PG-02 / FT-007, DB-04, AC-007 | PostgreSQL: same | Submit missing, inactive, wrong-role, self-only or invalid stage configurations; inject pre-audit failure. | Invalid configuration returns 409; failed transactions preserve prior state with no partial revision, cycle, slots, audit or outbox. |
| REV-PG-03 / FT-008, EP-043, AC-008 | PostgreSQL: `apps/api/tests/postgres/requests.test.ts` | Query as reviewers A and B with assigned, waiting, stale-cycle, inactive and terminal fixtures. | Each receives only own current actionable slots; count matches rows. |
| REV-PG-04 / API-04 | PostgreSQL: same | Query 0, 1, 45 and 101 own slots; equal due dates, filters, sorts and literal search. | Correct bounded page and total count, stable UUID tie order, no duplicates or unsafe search widening. |
| REV-PG-05 / BR-041, BR-048 | PostgreSQL: same | Change assignment or deactivate role while an independently connected task read occurs. | Reads after commit deny prior assignee; no automatic reassignment or stale authorization. |
| REV-API-01 / EP-043, SEC-01 | API: `apps/api/tests/integration/approvalTaskOpenApi.test.ts` | Search as eligible reviewer, anonymous and wrong-role actors; send invalid body. | Direct array and pagination header on 200; 401, 403 and 422 as applicable; no-store and exposed pagination header. |
| REV-API-02 / EP-045, SEC-04 | API: same | Read task as assignee, another reviewer and Administrator-only actor; request foreign, missing and malformed IDs. | Assignee receives exact projection; foreign and missing are indistinguishable 404; no Administrator-only private read; invalid UUID is rejected. |
| REV-API-03 / SEC-05, AC-007 | API: same and submission API tests | Multi-role requester submits with self-only policy. | 409 CONFIGURATION_INCOMPLETE; no task or approval is created. |
| REV-UI-01 / UI-11, UI-20, AC-008 | UI: `apps/web/tests/components/reviewQueue.test.tsx` | Exercise loading, empty, no-match, error, retry, desktop and mobile results. | Accessible distinct states, same authorized results, safe links and cards. |
| REV-UI-02 / UI-20 | UI: `apps/web/tests/components/reviewTask.test.tsx` | Read task then permitted or denied request; test foreign task, slow hydration and account switch. | No unauthorized fetch or private DOM leak; stale data clears; no invented decision action. |
| REV-E2E-01 / E2E-02 partial | Browser: `e2e/reviewer-queue.spec.ts` | Submit as owner; assigned and unrelated reviewers browse queue and detail. | Only assignee sees current task and permitted current request context. |
| REV-E2E-02 / UI-AC-17 | Browser: same | Use 1440px and 390px viewports, keyboard and account switching. | Table and cards work, focus remains usable, no whole-page horizontal overflow or prior-account data. |

## Executed coverage and gaps

- REV-PG-01: Passed one-stage parallel and two-stage submission assertions for cycle, revision, stages, slots, initial states and each reviewer's active queue.
- REV-PG-02: Passed missing, inactive, self-only, wrong-role, unresolved, empty and invalid stage-two configuration checks, including HTTP 409 and atomic state checks; injected pre-audit failure verifies rollback.
- REV-PG-03: Passed current and foreign assignment, WAITING, stale cycle, terminal state, disabled identity and current scope/count assertions.
- REV-PG-04: Passed 0, 1, 45 and 101 rows, page totals including empty pages, tied ordering, filters and literal search assertions.
- REV-PG-05: Passed independent-connection committed assignment and role changes, including prior-assignee denial and current reads. These checks do not prove every possible race.
- REV-CT-01: Partial. Existing assertions do not cover stage 2 and all specified invalid DTO cases. Issue #4 owns the missing coverage. API wire and foreign/missing detail 404 parity, search wrong-role 403 and anonymous 401 guards ran.
- REV-UI-01/REV-UI-02: component states and recovery ran; the queue recovery and full browser cases ran on the integrated branch.
- REV-E2E-01/REV-E2E-02: the scoped reviewer browser journey ran on the integrated branch at desktop and mobile sizes, including the SSR privacy check. REV-E2E-02 is partial: explicit keyboard coverage is missing and remains owned by Issue #4.
- Integration: after Issue #3 merged into `sprint-1-staging`, the branch was merged and the combined suites ran (310 unit/component, 51 PostgreSQL, 21 browser). See [verification evidence](verification.md).

## Dependent evidence

| Case / global trace | Owner and status | Setup, action and expected result |
| --- | --- | --- |
| REV-CROSS-01 / FT-012, SEC-05, AC-012; full E2E-02 decision | Issue #5 — BLOCKED BY DEPENDENCY / NOT RUN | Against the real decision API and PostgreSQL, a multi-role requester attempts direct self-vote. Expect 403 SELF_APPROVAL_FORBIDDEN and no decision, status, cycle, slot, audit or outbox change. Guard unit tests alone do not satisfy this case. |
| REV-CROSS-02 / FT-008 delegation | Future delegation owner — BLOCKED BY DEPENDENCY / NOT RUN | Exercise original reviewer, valid delegate and expired grant; only authorized access to the existing slot is allowed, with no current-data leak. |

Retain identity and submission regressions and, after integration, Issue #3 search/detail regressions. Run typecheck, lint, contracts, API, web, build, PostgreSQL integration, E2E and root checks. Record actual commands, environment, migration state, outcomes and limitations in verification evidence; do not claim unexecuted cases pass.
