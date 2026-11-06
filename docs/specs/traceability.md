# CPE334 Theme 5 — Requirements & Verification Traceability Matrix

**Document:** `traceability.md`  
**Revision:** 1.0.0 — derived from frozen product/API/UI and planned tests  
**Product source:** [`specifications.md`](./specifications.md) / [`srs.md`](./srs.md)  
**Design source:** [`system-sds.md`](./system-sds.md)  
**Wire/UI sources:** [`api-specs.md`](./api-specs.md) v1.0.1; [`ui-specs.md`](./ui-specs.md) v1.0  
**Test source:** [`test.md`](./test.md)  
**Execution status:** Identity & Access (`M01`–`M03`) implementation checks were **executed** on 2026-11-06 with actual results recorded in [`testing-verification.md`](../testing-verification.md); teammate-reviewed PR acceptance is still pending. All other features remain **PLANNED / NOT RUN** (no actual results asserted).

> **ID policy:** Preserve the original 54 unique Feature IDs and one-to-one `FR-NNN`, `AC-NNN`, `FT-NNN` mapping. `BR-NNN` and `NFR-NNN` are cross-cutting and can apply to many features. Paths in the matrix are illustrative links to the **existing frozen route directories**, not newly authorized endpoints. Use `api-specs.md` as authoritative for exact methods, schemas, audience and errors.

> **D-01 — approved engineering amendment (2026-11-05):** [Owner decision, Issue #1](https://github.com/oangsa/approval-system/issues/1) replaces the earlier Bun runtime/toolchain with Node.js 24, npm Workspaces, one root `package-lock.json`, Elysia through `@elysia/node`, TypeScript, Vitest for unit/API/contract/real-PostgreSQL integration tests, and Playwright for browser E2E. React Router 7, shadcn/ui + Tailwind CSS, PostgreSQL + Drizzle ORM and shared Zod contracts remain. This amendment changes no feature scope, FR/BR/AC/test identifiers, product/API/UI behavior, ownership or effort estimates; baseline contract versions remain unchanged. It records engineering alignment only, not implementation or passing verification.

## 1. Coverage Accounting

| Item                          | Count / guarantee                                        |
| ----------------------------- | -------------------------------------------------------- |
| Selected features             | 54: 17 Must-have + 17 Recommended + 20 selected Optional |
| Functional requirements       | 54 (`FR-001`–`FR-054`)                                   |
| Primary acceptance criteria   | 54 (`AC-001`–`AC-054`)                                   |
| Primary planned feature tests | 54 (`FT-001`–`FT-054`)                                   |
| Business rules                | 73 (`BR-001`–`BR-073`)                                   |
| Non-functional requirements   | 10 (`NFR-001`–`NFR-010`)                                 |
| Cross-feature scenarios       | 12 (`S-01`–`S-12`)                                       |
| Frozen UI acceptance criteria | 20 (`UI-AC-01`–`UI-AC-20`)                               |
| Sprint allocations            | 16 (Sprint 1) / 20 (Sprint 2) / 18 (Sprint 3)            |

**Evidence status:** The IDs above refer to written **requirements and planned checks**, not passing test results. An implemented feature is only accepted when its applicable `FT`, supporting domain/DB/API/UI/security tests and recorded evidence pass for the tested revision.

## 2. Feature → Requirement → Acceptance → Test → Surface (all 54)

The **primary test** is `FT-NNN`; the **supporting suites** column lists selected extra tests. It is not exhaustive; consult `test.md` for every applicable negative, concurrency and privacy case.

| Sprint | Feature                                             | Functional requirement | Acceptance | Primary test | Domain/module            | API surface (relative to `/api/v1` unless internal)                             | UI surface                                           | Additional test suites         |
| -----: | --------------------------------------------------- | ---------------------- | ---------- | ------------ | ------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------ |
|      1 | `M01` — Login                                       | `FR-001`               | `AC-001`   | `FT-001`     | Identity & Access        | `POST /auth/login`                                                              | `/auth/login`                                        | UT-08; SEC-01; E2E-01          |
|      1 | `M02` — Logout & Current User                       | `FR-002`               | `AC-002`   | `FT-002`     | Identity & Access        | `GET /auth/me; POST /auth/logout`                                               | `/settings`                                          | DB-12; SEC-06; E2E-15          |
|      1 | `M03` — Role-based Access                           | `FR-003`               | `AC-003`   | `FT-003`     | Identity & Access        | `All protected routes`                                                          | `All protected pages`                                | UT-13; SEC-01–16; E2E-15       |
|      1 | `M04` — Create & Submit Request                     | `FR-004`               | `AC-004`   | `FT-004`     | Request Management       | `POST /requests; POST /requests/:id/submit`                                     | `/requests/new`                                      | DB-03–04; CX-08; E2E-01        |
|      1 | `M05` — My Requests                                 | `FR-005`               | `AC-005`   | `FT-005`     | Request Management       | `POST /requests/search`                                                         | `/requests`                                          | UT-12; SEC-03; E2E-01          |
|      1 | `M06` — Request Detail & Status                     | `FR-006`               | `AC-006`   | `FT-006`     | Request Management       | `GET /requests/:id`                                                             | `/requests/:id`                                      | UT-13; SEC-08; E2E-01          |
|      1 | `M07` — Reviewer Assignment                         | `FR-007`               | `AC-007`   | `FT-007`     | Assignment & Policy      | `POST /requests/:id/submit; POST /admin/reviewer-assignments/search`            | `/reviews; /admin/reviewer-assignments`              | UT-08; DB-03; E2E-01           |
|      1 | `M08` — Review Queue                                | `FR-008`               | `AC-008`   | `FT-008`     | Approval Workflow        | `POST /approval-tasks/search`                                                   | `/reviews`                                           | SEC-04; E2E-02                 |
|      1 | `M09` — Approve Request                             | `FR-009`               | `AC-009`   | `FT-009`     | Approval Workflow        | `POST /approval-tasks/:id/decisions`                                            | `/reviews/:taskId`                                   | UT-02; DB-05; CX-02; E2E-02    |
|      1 | `M10` — Reject Request                              | `FR-010`               | `AC-010`   | `FT-010`     | Approval Workflow        | `POST /approval-tasks/:id/decisions`                                            | `/reviews/:taskId`                                   | DB-05; CX-03; E2E-02           |
|      1 | `M12` — State Transition Rules                      | `FR-011`               | `AC-011`   | `FT-011`     | Approval Workflow        | `POST /approval-tasks/:id/decisions; POST /requests/:id/withdraw`               | `/reviews/:taskId; /requests/:id`                    | UT-01; CX-03–04; E2E-06        |
|      1 | `M13` — Self-approval Prevention                    | `FR-012`               | `AC-012`   | `FT-012`     | Assignment & Policy      | `All approval and assignment mutations`                                         | `/reviews; /delegations`                             | UT-08; SEC-05; E2E-07          |
|      1 | `M14` — Decision & Status History                   | `FR-013`               | `AC-013`   | `FT-013`     | Revision & Collaboration | `GET /requests/:id/timeline`                                                    | `/requests/:id (History)`                            | DB-05; DB-11; E2E-02           |
|      1 | `M15` — Editing Policy                              | `FR-014`               | `AC-014`   | `FT-014`     | Request Management       | `PATCH /requests/:id/draft`                                                     | `/requests/:id/edit`                                 | DB-06; E2E-04                  |
|      1 | `M17` — Validation & Persistence                    | `FR-015`               | `AC-015`   | `FT-015`     | Request Management       | `All durable mutations`                                                         | `All mutation flows`                                 | DB-03–05; CX-01–14             |
|      1 | `R06` — Request Number                              | `FR-016`               | `AC-016`   | `FT-016`     | Request Management       | `POST /requests/:id/submit; GET /requests/:id`                                  | `/requests/:id`                                      | UT-11; DB-09; CX-07            |
|      2 | `M11` — Return Request                              | `FR-017`               | `AC-017`   | `FT-017`     | Approval Workflow        | `POST /approval-tasks/:id/decisions`                                            | `/reviews/:taskId`                                   | DB-08; E2E-04                  |
|      2 | `M16` — Basic Reporting                             | `FR-018`               | `AC-018`   | `FT-018`     | Reporting                | `POST /reports/requests/search`                                                 | `/reports`                                           | SEC-10; E2E-12                 |
|      2 | `R01` — Save as Draft                               | `FR-019`               | `AC-019`   | `FT-019`     | Request Management       | `POST /requests; PATCH /requests/:id/draft`                                     | `/requests/new; /requests/:id/edit`                  | DB-02; UI-05–06; E2E-01        |
|      2 | `R02` — Edit Returned Request                       | `FR-020`               | `AC-020`   | `FT-020`     | Revision & Collaboration | `PATCH /requests/:id/draft; GET /request-types/:id/versions/:versionId`         | `/requests/:id/edit`                                 | DB-06; UI-08; E2E-04           |
|      2 | `R03` — Resubmit Request                            | `FR-021`               | `AC-021`   | `FT-021`     | Revision & Collaboration | `POST /requests/:id/resubmit`                                                   | `/requests/:id/edit`                                 | DB-06; CX-12; E2E-04           |
|      2 | `R04` — Revision History                            | `FR-022`               | `AC-022`   | `FT-022`     | Revision & Collaboration | `GET /requests/:id/revisions; GET /requests/:id/revisions/:revisionId`          | `/requests/:id (History)`                            | DB-06; SEC-08; E2E-04          |
|      2 | `R05` — Withdraw Request                            | `FR-023`               | `AC-023`   | `FT-023`     | Request Management       | `POST /requests/:id/withdraw`                                                   | `/requests/:id`                                      | DB-08; CX-04; E2E-06           |
|      2 | `R07` — Request Line Items                          | `FR-024`               | `AC-024`   | `FT-024`     | Request Management       | `POST /requests; PATCH /requests/:id/draft`                                     | `/requests/new (Items)`                              | UT-06; UI-05; E2E-01           |
|      2 | `R08` — Two-stage Approval                          | `FR-025`               | `AC-025`   | `FT-025`     | Approval Workflow        | `POST /admin/approval-policies/:id/publish; POST /approval-tasks/:id/decisions` | `/admin/approval-policies; /requests/:id (Approval)` | UT-02; CX-02; E2E-05           |
|      2 | `R09` — Conditional Approval Rules                  | `FR-026`               | `AC-026`   | `FT-026`     | Assignment & Policy      | `POST /admin/approval-policies/:id/publish; POST /requests/:id/submit`          | `/admin/approval-policies`                           | UT-07; CX-12; E2E-08           |
|      2 | `R10` — Current Approver Display                    | `FR-027`               | `AC-027`   | `FT-027`     | Assignment & Policy      | `GET /requests/:id/approvers`                                                   | `/requests/:id (Approval)`                           | UT-13; UI-09; E2E-01           |
|      2 | `R11` — Revision-aware Decisions                    | `FR-028`               | `AC-028`   | `FT-028`     | Approval Workflow        | `POST /approval-tasks/:id/decisions`                                            | `/reviews/:taskId`                                   | DB-06; CX-01; E2E-04           |
|      2 | `R15` — Role-based Dashboard                        | `FR-029`               | `AC-029`   | `FT-029`     | Search & Experience      | `GET /dashboard`                                                                | `/dashboard`                                         | UI-22; E2E-01                  |
|      2 | `R16` — Visual Status Timeline                      | `FR-030`               | `AC-030`   | `FT-030`     | Revision & Collaboration | `GET /requests/:id/timeline`                                                    | `/requests/:id (History)`                            | UI-09; E2E-04                  |
|      2 | `O10` — Reviewer Assignment Management              | `FR-031`               | `AC-031`   | `FT-031`     | Assignment & Policy      | `POST /admin/reviewer-assignments; PATCH /admin/reviewer-assignments/:id`       | `/admin/reviewer-assignments`                        | DB-07; SEC-12; E2E-08          |
|      2 | `O13` — Parallel Approval                           | `FR-032`               | `AC-032`   | `FT-032`     | Approval Workflow        | `POST /approval-tasks/:id/decisions`                                            | `/reviews/:taskId; /requests/:id (Approval)`         | UT-02; CX-02–03; E2E-05        |
|      2 | `O16` — Multiple Request Types (admin-configurable) | `FR-033`               | `AC-033`   | `FT-033`     | Request Management       | `POST /admin/request-types; POST /admin/request-types/:id/publish`              | `/admin/request-types/:id`                           | UT-03–05; CT-03; UI-12; E2E-03 |
|      2 | `O17` — Priority Levels                             | `FR-034`               | `AC-034`   | `FT-034`     | Request Management       | `POST /requests; PATCH /requests/:id/draft`                                     | `/requests/new; /requests/:id`                       | CT-02; E2E-01                  |
|      2 | `O18` — Budget Limit Validation                     | `FR-035`               | `AC-035`   | `FT-035`     | Assignment & Policy      | `POST /admin/budget-policies; PATCH /admin/budget-policies/:id`                 | `/admin/budget-policies`                             | UT-06; E2E-08                  |
|      2 | `O19` — Department-based Routing                    | `FR-036`               | `AC-036`   | `FT-036`     | Assignment & Policy      | `POST /admin/reviewer-assignments; POST /requests/:id/submit`                   | `/admin/reviewer-assignments`                        | UT-07; DB-03; E2E-08           |
|      3 | `R12` — Search Requests                             | `FR-037`               | `AC-037`   | `FT-037`     | Search & Experience      | `POST /requests/search`                                                         | `/requests`                                          | UT-12; UI-16; SEC-11           |
|      3 | `R13` — Status & Date Filters                       | `FR-038`               | `AC-038`   | `FT-038`     | Search & Experience      | `POST /requests/search`                                                         | `/requests`                                          | UT-12; UI-16; E2E-12           |
|      3 | `R14` — Sorting & Pagination                        | `FR-039`               | `AC-039`   | `FT-039`     | Search & Experience      | `POST /requests/search; POST /approval-tasks/search`                            | `/requests; /reviews`                                | UT-12; UI-16; E2E-13           |
|      3 | `R17` — Responsive & Polished UX                    | `FR-040`               | `AC-040`   | `FT-040`     | Search & Experience      | `All UI routes`                                                                 | `All UI screens`                                     | UI-20–24; E2E-13               |
|      3 | `O01` — Comments / Discussion                       | `FR-041`               | `AC-041`   | `FT-041`     | Revision & Collaboration | `GET/POST /requests/:id/comments`                                               | `/requests/:id (Discussion/Files)`                   | UI-19; SEC-03; E2E-12          |
|      3 | `O02` — File Attachments                            | `FR-042`               | `AC-042`   | `FT-042`     | Request Management       | `GET/POST /requests/:id/attachments; GET /attachments/:id/download`             | `/requests/new; /requests/:id (Discussion/Files)`    | DB-10; CX-11; UI-18; E2E-12    |
|      3 | `O03` — In-app Notifications                        | `FR-043`               | `AC-043`   | `FT-043`     | Notifications & SLA      | `POST /notifications/search; PATCH /notifications/:id/read`                     | `/notifications; header bell`                        | DB-14; UI-17; E2E-11           |
|      3 | `O07` — Reviewer Reassignment                       | `FR-044`               | `AC-044`   | `FT-044`     | Assignment & Policy      | `POST /approval-tasks/:id/reassign; POST /admin/approval-tasks/search`          | `/admin/escalations`                                 | CX-05–06; UI-15; E2E-07        |
|      3 | `O08` — Reviewer Delegation                         | `FR-045`               | `AC-045`   | `FT-045`     | Assignment & Policy      | `POST /delegations; POST /delegations/:id/revoke`                               | `/delegations`                                       | UT-10; CX-01; E2E-07           |
|      3 | `O09` — Admin User Management                       | `FR-046`               | `AC-046`   | `FT-046`     | Identity & Access        | `POST /users/search; PATCH /users/:id; PUT /users/:id/roles`                    | `/admin/users`                                       | DB-07; SEC-07; E2E-10          |
|      3 | `O11` — Approval Deadlines / SLA                    | `FR-047`               | `AC-047`   | `FT-047`     | Notifications & SLA      | `POST /admin/approval-policies/:id/publish; POST /internal/jobs/sla-process`    | `/reviews; /admin/escalations`                       | UT-09; CX-13; E2E-11           |
|      3 | `O12` — Escalation & Reminders                      | `FR-048`               | `AC-048`   | `FT-048`     | Notifications & SLA      | `POST /internal/jobs/sla-process; POST /admin/approval-tasks/search`            | `/admin/escalations; /notifications`                 | DB-14; CX-13; UI-15; E2E-11    |
|      3 | `O15` — Bulk Approval                               | `FR-049`               | `AC-049`   | `FT-049`     | Approval Workflow        | `POST /approval-tasks/bulk-decisions`                                           | `/reviews`                                           | CX-10; E2E-09                  |
|      3 | `O21` — PDF Report Export                           | `FR-050`               | `AC-050`   | `FT-050`     | Reporting                | `POST /reports/requests/pdf`                                                    | `/reports`                                           | SEC-10; UI-19; E2E-12          |
|      3 | `O24` — Dark Mode                                   | `FR-051`               | `AC-051`   | `FT-051`     | Search & Experience      | `(Client-only preference; no dedicated API required)`                           | `/settings; all UI`                                  | UI-03; UI-24; E2E-14           |
|      3 | `O25` — Thai / English UI                           | `FR-052`               | `AC-052`   | `FT-052`     | Search & Experience      | `(UI localization + localized metadata DTOs)`                                   | `/settings; all UI`                                  | UI-04; UI-24; E2E-14           |
|      3 | `O26` — Self-registration                           | `FR-053`               | `AC-053`   | `FT-053`     | Identity & Access        | `POST /auth/register; PUT /users/:id/department`                                | `/auth/register; /admin/users`                       | SEC-07; E2E-10                 |
|      3 | `O27` — Password Recovery                           | `FR-054`               | `AC-054`   | `FT-054`     | Identity & Access        | `POST /auth/recovery/password; POST /admin/users/:id/recovery-grants`           | `/auth/recover; /auth/assisted-reset`                | DB-12; SEC-07; E2E-10          |

## 3. Cross-cutting Business Rule Traceability

Business Rules do **not** map one-to-one to a feature. These grouping links are a quick review index; for the full individual rule wording consult `srs.md` §5 and `specifications.md` §5.

| Rule group                          | Rules           | Selected features most affected                                                                                       | Supporting verification              |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Identity/session/recovery           | `BR-001–BR-012` | `M01`, `M02`, `M03`, `O09`, `O26`, `O27`                                                                              | UT-08; DB-12; SEC-01–07; E2E-10      |
| Dynamic type definitions            | `BR-013–BR-021` | `M04`, `R01`, `R02`, `R03`, `O16`                                                                                     | UT-03–05; CT-03; DB-13; E2E-03–04    |
| Requests / money / history          | `BR-022–BR-034` | `M04`, `M05`, `M06`, `M15`, `M17`, `R01`, `R05`, `R06`, `R07`, `O17`, `O18`                                           | UT-06; DB-02–04; CX-07–08            |
| Approval states, assignments, races | `BR-035–BR-054` | `M07`, `M08`, `M09`, `M10`, `M11`, `M12`, `M13`, `R08`, `R09`, `R10`, `R11`, `O07`, `O08`, `O10`, `O13`, `O15`, `O19` | UT-01–02; DB-05; CX-01–06; SEC-05    |
| Revisions, comments, files          | `BR-055–BR-061` | `M14`, `R02`, `R03`, `R04`, `R16`, `O01`, `O02`                                                                       | DB-06; DB-10; SEC-08–09; E2E-04/12   |
| SLA, UI, privacy, reporting         | `BR-062–BR-073` | `M16`, `R12`, `R13`, `R14`, `R15`, `R17`, `O03`, `O11`, `O12`, `O21`, `O24`, `O25`                                    | UT-09/12; CX-13; SEC-10–16; UI-01–24 |

### 3.1 Individual Business Rule → Feature → Sprint → Planned Test Index

These **73 individual links** complement the grouped rule overview. They do not change the normative wording in `srs.md`. Because BRs are cross-cutting, a row may involve multiple selected features and Sprints. Tests are representative; additional negative paths in `test.md` remain required.

| Rule     | Affected selected features               | Sprint(s) | Selected planned verification         |
| -------- | ---------------------------------------- | --------- | ------------------------------------- |
| `BR-001` | `M01`, `M03`                             | 1         | SEC-01/06; FT-001/003                 |
| `BR-002` | `M01`, `M02`                             | 1         | DB-12; SEC-06; FT-002                 |
| `BR-003` | `M02`, `M03`, `O09`                      | 1,3       | DB-12; SEC-06; FT-002/003/046         |
| `BR-004` | `O26`, `O09`                             | 3         | SEC-07; FT-053/046                    |
| `BR-005` | `O26`, `O09`, `M04`                      | 1,3       | FT-053/046/004; E2E-10                |
| `BR-006` | `M13`, `M03`                             | 1         | UT-08; SEC-05; FT-012                 |
| `BR-007` | `O27`                                    | 3         | SEC-07; FT-054; E2E-10                |
| `BR-008` | `O27`, `M02`                             | 1,3       | DB-12; SEC-07; FT-054                 |
| `BR-009` | `O27`, `O09`                             | 3         | SEC-07; FT-054/046                    |
| `BR-010` | `O09`, `O27`, `M03`                      | 1,3       | SEC-07/08; FT-046/054                 |
| `BR-011` | `M01`, `M02`                             | 1         | SEC-13; API-12                        |
| `BR-012` | `O27`, `M03`                             | 1,3       | SEC-07; FT-054                        |
| `BR-013` | `O16`                                    | 2         | CT-03; FT-033                         |
| `BR-014` | `O16`, `M17`                             | 1,2       | UT-03; FT-033                         |
| `BR-015` | `O16`                                    | 2         | UT-03–05; FT-033                      |
| `BR-016` | `O16`                                    | 2         | UT-04; CT-03; FT-033                  |
| `BR-017` | `O16`, `M17`                             | 1,2       | UT-05; CT-03; FT-033                  |
| `BR-018` | `O16`, `R09`, `O18`                      | 2         | UT-05/06; FT-033/026/035              |
| `BR-019` | `O16`, `R04`                             | 2         | DB-06; FT-022/033                     |
| `BR-020` | `R02`, `O16`                             | 2         | DB-06; FT-020/033                     |
| `BR-021` | `R03`, `O16`, `R09`                      | 2         | CX-12; FT-021/026/033                 |
| `BR-022` | `O16`                                    | 2         | UI-12; FT-033                         |
| `BR-023` | `M04`, `M03`, `O19`                      | 1,2       | DB-03; FT-004/036                     |
| `BR-024` | `M04`, `M17`, `M07`                      | 1         | DB-03/04; FT-004/007/015              |
| `BR-025` | `M07`, `O19`, `M17`                      | 1,2       | FT-007/036; S-08                      |
| `BR-026` | `R01`, `M04`                             | 1,2       | DB-02/03; FT-019/004                  |
| `BR-027` | `M15`, `R02`, `R04`                      | 1,2       | DB-06; FT-014/020/022                 |
| `BR-028` | `M04`, `R03`, `R05`                      | 1,2       | FT-004/021/023; SEC-03                |
| `BR-029` | `R05`, `M12`                             | 1,2       | DB-08; FT-023/011                     |
| `BR-030` | `R06`, `M17`                             | 1         | UT-11; CX-07; FT-016                  |
| `BR-031` | `R07`, `O18`                             | 2         | UT-06; FT-024/035                     |
| `BR-032` | `O17`, `M03`                             | 1,2       | CT-02; FT-034/003                     |
| `BR-033` | `M14`, `R04`                             | 1,2       | DB-03/06; FT-013/022                  |
| `BR-034` | `M17`                                    | 1         | DB-04/05; FT-015                      |
| `BR-035` | `R08`                                    | 2         | UT-02; FT-025                         |
| `BR-036` | `R08`, `O13`, `M07`                      | 1,2       | UT-02; FT-025/032/007                 |
| `BR-037` | `O13`, `R08`, `M09`                      | 1,2       | UT-02; CX-02; FT-032/009              |
| `BR-038` | `M10`, `M11`                             | 1,2       | CX-03; FT-010/017                     |
| `BR-039` | `M09`, `R08`, `O13`                      | 1,2       | UT-02; CX-02; FT-009/025/032          |
| `BR-040` | `R11`, `M09`                             | 1,2       | DB-05; FT-028/009                     |
| `BR-041` | `M08`, `M09`, `O08`                      | 1,3       | SEC-04; FT-008/009/045                |
| `BR-042` | `R11`, `M14`                             | 1,2       | DB-09; CX-01; FT-028/013              |
| `BR-043` | `M13`, `M03`, `M10`                      | 1         | SEC-04/05; FT-012/003/010             |
| `BR-044` | `M12`, `R05`                             | 1,2       | DB-08; FT-011/023                     |
| `BR-045` | `R09`, `R11`, `R04`                      | 2         | DB-06/07; FT-026/028/022              |
| `BR-046` | `M17`, `O13`                             | 1,2       | CX-01–05; FT-015/032                  |
| `BR-047` | `M17`, `M09`, `O15`                      | 1,3       | CX-08–10; FT-015/009/049              |
| `BR-048` | `O07`, `M07`                             | 1,3       | CX-05; FT-044/007                     |
| `BR-049` | `O07`, `O11`                             | 3         | CX-05/06; FT-044/047                  |
| `BR-050` | `O08`, `O13`                             | 2,3       | CX-01; FT-045/032                     |
| `BR-051` | `O08`, `M13`                             | 1,3       | UT-10/08; FT-045/012                  |
| `BR-052` | `O15`, `M09`                             | 1,3       | CX-10; FT-049/009                     |
| `BR-053` | `M17`, `M14`                             | 1         | DB-05; FT-015/013                     |
| `BR-054` | `M03`, `O09`, `O07`, `O12`               | 1,3       | SEC-08/12; FT-003/046/044/048         |
| `BR-055` | `R03`, `R11`                             | 2         | DB-06; FT-021/028                     |
| `BR-056` | `R02`, `R03`, `R04`                      | 2         | DB-06; FT-020/021/022                 |
| `BR-057` | `M14`, `R16`, `O07`, `O08`               | 1,2,3     | DB-11; FT-013/030/044/045             |
| `BR-058` | `O01`, `M12`                             | 1,3       | FT-041/011; E2E-12                    |
| `BR-059` | `O02`, `R04`                             | 2,3       | DB-10; FT-042/022                     |
| `BR-060` | `O02`, `M03`                             | 1,3       | DB-10; SEC-09; FT-042/003             |
| `BR-061` | `O01`, `O02`, `M05`                      | 1,3       | SEC-03/09; FT-041/042/005             |
| `BR-062` | `O11`                                    | 3         | UT-09; FT-047; E2E-11                 |
| `BR-063` | `O11`, `O07`, `O08`                      | 3         | CX-06; FT-047/044/045                 |
| `BR-064` | `O12`, `M12`                             | 1,3       | DB-08; FT-048/011                     |
| `BR-065` | `O12`                                    | 3         | SEC-15; CX-13; FT-048                 |
| `BR-066` | `O12`, `O07`                             | 3         | UI-15; FT-048/044                     |
| `BR-067` | `O03`, `O12`                             | 3         | DB-14; CX-13; FT-043/048              |
| `BR-068` | `R12`, `R13`, `R14`, `R15`, `M16`, `O21` | 2,3       | SEC-10/12; FT-037/038/039/029/018/050 |
| `BR-069` | `R12`, `R13`, `R14`                      | 3         | UT-12; FT-037/038/039                 |
| `BR-070` | `O25`, `O16`                             | 2,3       | UI-04/24; FT-052/033                  |
| `BR-071` | `O24`, `R17`                             | 3         | UI-02/21/24; FT-051/040               |
| `BR-072` | `M03`, `M17`, `O02`                      | 1,3       | SEC-08/09/16; FT-003/015/042          |
| `BR-073` | `R17`, `M17`                             | 1,3       | UI-20; FT-040/015                     |

## 4. Non-functional Requirements and Verification Links

The `NFR-*` wording is frozen by `srs.md` §8. The source `Q-*` targets are _implementation defaults_ and shall not be mistaken for product-level frozen SLO guarantees.

| NFR       | Topic                       | Core affected features                                        | Verification                                             |
| --------- | --------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| `NFR-001` | Security                    | `M03`, `M13`, `O02`, `O09`, `O26`, `O27`                      | SEC-01–16; API-12; E2E-10/12                             |
| `NFR-002` | Durable storage             | `M04`, `M14`, `M17`, `R01`, `R04`, `O03`                      | DB-01–14; E2E-01/04                                      |
| `NFR-003` | Atomicity                   | `M04`, `M09`, `M10`, `M11`, `M17`, `R03`                      | DB-03–06; CX-01–04                                       |
| `NFR-004` | Concurrency                 | `M17`, `R06`, `R08`, `R11`, `O07`, `O08`, `O13`, `O15`, `O16` | CX-01–14                                                 |
| `NFR-005` | Validation                  | `M17`, `R07`, `R09`, `O16`, `O18`                             | UT-03–07; CT-01–04; API-10                               |
| `NFR-006` | Operational safety          | `M02`, `O02`, `O03`, `O11`, `O12`, `O27`                      | DB-12–14; SEC-06–07/09/15; CX-13                         |
| `NFR-007` | Maintainability             | ALL 54 selected                                               | CT-04; feature-specific reviewed tests; static typecheck |
| `NFR-008` | Usability and accessibility | `R17`, `O24`, `O25`                                           | UI-01–24; E2E-13–15                                      |
| `NFR-009` | Localization                | `O16`, `O25`                                                  | UI-04; UI-24; E2E-14                                     |
| `NFR-010` | Traceability                | ALL 54 selected                                               | FT-001–054; review of execution evidence                 |

## 5. Cross-feature Acceptance Scenarios

| Scenario | Purpose                                                | Affected feature IDs                            | Planned supporting verification   |
| -------- | ------------------------------------------------------ | ----------------------------------------------- | --------------------------------- |
| `S-01`   | Requester submits and retrieves own persisted request  | `M04`, `M05`, `M06`                             | FT-004–006; E2E-01                |
| `S-02`   | Approval/rejection and durable history                 | `M09`, `M10`, `M14`, `M17`                      | FT-009–010/013/015; DB-05; E2E-02 |
| `S-03`   | Self-approval, unrelated reviewer, admin privacy       | `M03`, `M13`                                    | FT-003/012; SEC-03–05/12          |
| `S-04`   | Parallel ALL with races and retries                    | `R08`, `O13`, `R11`                             | UT-02; CX-01–03; E2E-05           |
| `S-05`   | Returned pinned form/current approval policy           | `R02`, `R03`, `R09`                             | DB-06; CX-12; E2E-04              |
| `S-06`   | Conditional fields and nonapplicable values            | `O16`, `M17`                                    | UT-03–05; CT-03; E2E-03           |
| `S-07`   | Third approval stage rejected                          | `R08`, `O16`                                    | UT-02; E2E-08                     |
| `S-08`   | Missing/self-only reviewer blocks submission           | `M07`, `O19`, `M13`                             | UT-08; DB-03; FT-007/036          |
| `S-09`   | Reassignment/delegation and unchanged due date         | `O07`, `O08`, `O11`                             | UT-10; CX-01/05/06; E2E-07        |
| `S-10`   | Signup department gating/recovery sessions             | `O26`, `O27`, `O09`                             | SEC-07; DB-12; E2E-10             |
| `S-11`   | Bangkok business time, retry-safe escalation           | `O11`, `O12`, `O03`                             | UT-09; CX-13; E2E-11              |
| `S-12`   | Privacy across search/files/comments/inbox/reports/PDF | `R12`, `R13`, `R14`, `O01`, `O02`, `O03`, `O21` | SEC-08–12; E2E-12                 |

## 6. Frozen UI Acceptance Traceability

| UI acceptance | Planned component/browser/security tests |
| ------------- | ---------------------------------------- |
| `UI-AC-01`    | FT-001–054; UI-01–24                     |
| `UI-AC-02`    | UI-01; E2E-10; SEC-07/14                 |
| `UI-AC-03`    | UI-05–08; E2E-03–04                      |
| `UI-AC-04`    | UI-10–11; E2E-05                         |
| `UI-AC-05`    | UI-20; E2E-06/15                         |
| `UI-AC-06`    | UI-14; E2E-07/09                         |
| `UI-AC-07`    | UI-21–24; E2E-13–14                      |
| `UI-AC-08`    | UI-19; E2E-12                            |
| `UI-AC-09`    | CT-01/04; UI-09/11                       |
| `UI-AC-10`    | UI-20; E2E-15                            |
| `UI-AC-11`    | UI-03; E2E-14                            |
| `UI-AC-12`    | UI-04; E2E-14                            |
| `UI-AC-13`    | UI-05–08; E2E-01/04                      |
| `UI-AC-14`    | UI-09; SEC-08; E2E-04                    |
| `UI-AC-15`    | UI-12; E2E-03/08                         |
| `UI-AC-16`    | UI-10; E2E-02                            |
| `UI-AC-17`    | UI-16; E2E-13                            |
| `UI-AC-18`    | UI-17; E2E-15                            |
| `UI-AC-19`    | UI-15; SEC-12; E2E-11                    |
| `UI-AC-20`    | UI-02/03/21/24; E2E-14                   |

## 7. API Endpoint Coverage — Authority and Gap Check

- The **complete endpoint-by-endpoint** list and `EP-*` smoke identifiers are maintained in [`test.md`](./test.md) §4, derived from [`api-specs.md`](./api-specs.md) §5. Keep those endpoint IDs unchanged when adding test implementation.
- `EP-*` positive smoke testing is **not** sufficient alone. Every protected endpoint needs the applicable anonymous, wrong-role, wrong-owner, validation, stale-version and replay cases from `API-*`, `SEC-*`, `DB-*` and `CX-*` suites.
- The administrator escalation endpoint `POST /api/v1/admin/approval-tasks/search` is the approved additive API v1.0.1 endpoint; it returns **minimal routing metadata**, not a full request or task content projection. It maps to `O07`, `O12`, `UI-AC-19` and `SEC-12`.
- Internal `POST /internal/jobs/sla-process` is a trusted machine route outside the public `/api/v1` namespace; it maps to `O11`, `O12`, `UT-09`, `CX-13` and `SEC-15`.
- If an endpoint changes or is added with approval, update its API contract, `test.md` EP row, affected Feature/FR/AC/FT mapping and any UI route in the same reviewed change.

## 8. Sprint and Dependency Overview

| Sprint                    | Feature count | Product acceptance objective                                                                                               | Critical prerequisites                                                               |
| ------------------------- | ------------: | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1 — Foundation            |            16 | Login, submitted request, assigned reviewer approve/reject, status and audit, security negative tests                      | Seeded active request type, department, reviewer mapping and auth/session foundation |
| 2 — Core expansion        |            20 | Versioned forms, conditional fields, draft/return/resubmit, two-stage/parallel approval, routing, budget, dashboard/report | Immutable revision and cycle identity; one reusable approval decision engine         |
| 3 — Extended capabilities |            18 | Search, responsive UI, files/comments, notifications, reassignment/delegation, SLA, recovery, PDF and full regression      | Stable slot semantics, event history, private storage, trusted scheduled processing  |

This is the selected allocation. It does not claim that everything assigned to a Sprint has been implemented.

## 9. Change and Test-Evidence Procedure

1. Create an implementation issue referencing **Feature ID → FR → applicable BR/NFR → AC → FT/other test IDs**.
2. Keep endpoint/DTO and UI references synchronized with the frozen specification; document an explicit reviewed change if behavior must evolve.
3. Execute tests against a recorded code revision, seed, DB environment and actual browser where relevant.
4. Record `PASS`, `FAIL`, `SKIPPED`, `BLOCKED` or `NOT_RUN` **only from evidence**, not because a case exists on paper.
5. For a failed test, capture expected/actual, sanitized request ID/log, defect link, fix revision and retest.
6. Do not mark a feature accepted while its important access, persistence, concurrency or UI requirement has not been verified.

**Current evidence statement:** The Identity & Access (`M01`–`M03`) child checks were executed on 2026-11-06; actual results are recorded in [`testing-verification.md`](../testing-verification.md) and remain subject to teammate-reviewed PR acceptance. Every other check in this matrix is planned, and no other passing implementation or execution result is asserted.

## 10. Identity & Access child criteria (additive)

| Feature                     | Frozen requirement / acceptance / primary test | Feature criteria                      | Scoped supporting tests                                                          |
| --------------------------- | ---------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| M01 — Login                 | FR-001 / AC-001 / FT-001                       | IA-AC-01–02, IA-AC-08–09, IA-AC-11–12 | IA-CT-01; IA-DB-01; IA-API-01, IA-API-08–09; IA-WEB-04; IA-E2E-01, IA-E2E-04     |
| M02 — Logout & Current User | FR-002 / AC-002 / FT-002                       | IA-AC-03–05, IA-AC-08–10, IA-AC-12    | IA-DB-02–06, IA-DB-08; IA-API-02–05, IA-API-08; IA-WEB-01–03; IA-E2E-02–03       |
| M03 — Role-based Access     | FR-003 / AC-003 / FT-003                       | IA-AC-06–12                           | IA-DB-07–08; IA-API-03, IA-API-06–08; IA-WEB-03, IA-WEB-05; IA-E2E-03, IA-E2E-05 |

The child criteria refine, but do not replace, the frozen feature mapping. IA-API-07 proves only generic test-guard behavior and does not satisfy full FT-003 business-resource coverage. The identity feature's implementation checks are executed with recorded evidence in [`testing-verification.md`](../testing-verification.md); downstream `FT-003` business-resource coverage and every non-identity check remain PLANNED / NOT RUN.

### Issue #2 implementation evidence

The bounded M04/M15/M17/R06 slice is implemented on `feature/2-request-submit-validation`; supporting draft patch/type metadata reads do not transfer primary ownership of later Save/Resume, configuration, assignment, or decision features. See [SDS](../features/request-submission/sds.md), [numbered AC](../features/request-submission/acceptance-criteria.md), [STS](../features/request-submission/sts.md), and [actual verification](../features/request-submission/verification.md). Future decision atomicity remains owned by its behavior-specific issue; current evidence proves submission atomicity only. Independent teammate review and branch promotion remain pending.
