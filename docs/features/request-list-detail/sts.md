# Software test specification — Issue #3

All cases are **PLANNED / NOT RUN**. Use isolated disposable PostgreSQL with owner A and B, current and former reviewers, admin-only, multi-role and anonymous actors. Never share a resetting database with Issue #4. Paths below are planned test locations. Record actual commands, environment and outcomes separately after execution; no prior feature result proves these cases.

| ID / global link | Setup and action | Assertion and negative case | AC / planned path |
| --- | --- | --- | --- |
| REQ-CT-01 / API-03 | Parse summary including draft null pointers. | Exact public fields and types; reject hidden fields. | 02; `packages/contracts/tests/requestCollection.test.ts` |
| REQ-CT-02 / API-04 | Parse allowed search and pagination; try unknown fields, bad operators, blank/long text and size 101. | Defaults and valid forms parse; invalid forms fail. | 02; same path |
| REQ-API-01 / EP-032 | A searches mixed A/B data. | Direct array, correct pagination count, no-store and exposed header; empty result truthful. | 01–02; `apps/api/tests/integration/requestSearch.test.ts` |
| REQ-API-02 / FT-005, SEC-02 | A and multi-role actor search with foreign requesterId/id and invalid field. | No foreign rows or count; invalid overrides return 422. | 01–02; same path and `apps/api/tests/postgres/requestReadSearch.test.ts` |
| REQ-API-03 / EP-034, FT-006, UT-13, SEC-08 | Read as owner, current reviewer, former reviewer, admin-only and unrelated actor; compare missing UUID. | Authorized current fields match DB; denied and missing responses have identical safe 404. | 03; API integration and PostgreSQL request tests |
| REQ-DB-01 / API-04 | Seed 0, 1, 45 and 101 owner rows with tied timestamps; page through results. | Accurate owner-only totals, stable unique page boundaries, no inflated counts; invalid page rejected. | 01–02; `apps/api/tests/postgres/requestReadSearch.test.ts` |
| REQ-DB-02 / DB-03 | Submit through existing flow, reread committed record and after restart. | Number, status, revision, cycle and version match durable state; no invented state. | 03; PostgreSQL request tests |
| REQ-DB-03 / SEC-08 | Reassign current reviewer or change eligibility, then reread. | Former reviewer loses current detail; newly eligible current reviewer succeeds; admin has no bypass. | 03; PostgreSQL request tests |
| REQ-UI-01 / UI-20 | Exercise list loading, empty, no-match, error and retry with scoped results. | Accessible distinct states; no stale rows on error or scope change. | 04, 06; `apps/web/tests/components/requestList.test.tsx` |
| REQ-UI-02 / UI-09 | Navigate four tabs via click, Left/Right/Home/End and invalid tab URL. | Correct focus, ARIA and current fields; no unauthorized or unimplemented fetches. | 05; `apps/web/tests/components/requestDetail.test.tsx` |
| REQ-UI-03 / SEC-14 | Start A fetch, logout and sign in B before completion; inspect public HTML. | A data never reappears or serializes in public SSR; stale responses ignored. | 06; UI tests and `e2e/request-list-detail.spec.ts` |
| REQ-E2E-01 / E2E-01 | A signs in, creates/submits via existing flow, lists, opens detail and reloads. | Persisted PENDING, number, owner, current stage and tabs match DB. Cross-feature E2E remains planned. | 03–05; `e2e/request-list-detail.spec.ts` |
| REQ-E2E-02 / UI-AC-17 | Use list on desktop and narrow mobile; navigate by keyboard. | Same authorized rows and actions, accessible links and no page-wide overflow. | 04; same path |
| REQ-UI-04 | Render generic collection with request and adapted task items using both renderers. | Stable keys, pagination and equivalent desktop/mobile content; primitive performs no fetch. | 07; `apps/web/tests/components/requestCollection.test.tsx` |

Run applicable typecheck, lint, contracts, API, web, build, isolated migration/seed, real PostgreSQL integration, Playwright and root check. Record failures and unrun checks accurately. Existing request submission and authentication regressions remain required; no global journey is marked complete from this scoped coverage alone.
