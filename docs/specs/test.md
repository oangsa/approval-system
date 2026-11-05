# CPE334 Theme 5 — Workflow and Approval System

**Document:** `test.md` — System Test Specification & Verification Plan  
**Version:** 1.0.0 (proposed testing contract, derived from frozen specifications)  
**Authority:** [`specifications.md`](./specifications.md) v1.0; [`api-specs.md`](./api-specs.md) v1.0.1; [`ui-specs.md`](./ui-specs.md) v1.0  
**Coverage:** All 54 selected features; three sprints; product/API/UI and cross-feature regression  
**Execution status:** **NOT EXECUTED** — this document defines planned verification, not passing results.

> **Contract precedence:** `specifications.md` controls feature behavior, approval state and requirements; `api-specs.md` controls routes, DTOs, status/errors, headers, security and transactions; `ui-specs.md` controls navigation, presentation and interaction. A mismatch is a contract issue, **not** permission to quietly change behavior to make a test pass. Implementation defaults may be tuned if their change is documented and doesn't violate frozen rules.

## 1. Test goal and scope

Verify that a two-person implementation satisfies the frozen product, API and UI contracts, including actual PostgreSQL persistence, secure authorization, revision-aware approval, dynamic conditional form behavior, semantic UI statuses, account recovery, operational notifications, and protected file/report access.

**Included:** deterministic unit tests; schema/DTO tests; real HTTP/API tests; PostgreSQL integration and fault-injection tests; concurrent decision and idempotency tests; frontend component tests; browser end-to-end (E2E) tests; targeted security, localization, accessibility, responsive, and performance smoke checks. Use synthetic fixture users/requests and non-sensitive files.

**Excluded:** unrelated application modules, payment/accounting, multiple organizations, third-party OAuth, email notifications, arbitrary scripts, drag-and-drop workflow designer, CSV export, standalone BI charts, realtime push, and new capabilities absent from the 54-feature baseline.

### 1.1 Verification layers

| Layer | Test ID prefix | Primary runner | What is real? |
|---|---|---|---|
| Domain unit | `UT-*` | Bun test | Pure policies/state/form evaluator; fake clock and controlled dependencies |
| Shared contract | `CT-*` | Bun test | Actual shared Zod schemas, DTO and enum validation |
| HTTP/API | `API-*` | Bun test + Elysia app request | Real routing, middleware, headers, error envelopes and authentication; integration DB as needed |
| Database integration | `DB-*` | Bun test + disposable PostgreSQL | Real Drizzle schema/migrations, constraints, transactions and isolation |
| Concurrency/failure | `CX-*` | Bun test + two or more real PG connections | Competing commits, unique constraints, rollback, retries, crash/fault boundaries |
| UI component | `UI-*` | React Testing Library or comparable React harness **[implementation default]** | Real components + mocked API responses; keyboard and accessible semantics |
| End-to-end | `E2E-*` | Playwright **[implementation default]** | Web + API + real disposable DB, private test storage, actual browser |
| Privacy/security | `SEC-*` | Direct HTTP + browser checks | Role/ownership/cookie/session/download safeguards |
| Operations/non-functional | `OPS-*` | Fake clock, trusted-job request, controlled smoke environment | SLA scheduler, localization, accessibility and optional performance target |

**Important:** unit tests with mocked repositories are not substitutes for DB/concurrency tests where the product promises atomicity, single-vote behavior, unique request numbers, or durable history.

### 1.2 Suggested test locations — implementation defaults, not frozen

```text
apps/
  api/
    tests/unit/
    tests/integration/
    tests/contract/
    tests/concurrency/
  web/
    tests/components/
    tests/accessibility/
packages/
  contracts/
    tests/
tests/
  e2e/
  fixtures/
  evidence/
```

Use independent `apps/web/.env.test` and `apps/api/.env.test`, never commit credentials. The product remains Bun Workspaces, React Router 7, Elysia, Drizzle/PostgreSQL, and one shared `packages/contracts` package. These paths, runners, test script names, and numeric budgets are **implementation defaults**.

## 2. Test fixtures and reproducible environment

### 2.1 Test infrastructure

- Launch a disposable PostgreSQL database (not a shared development/production database) and apply current Drizzle migrations, including uniqueness, foreign keys, and required indexes. Verify schema creation and an empty state before loading fixtures.
- Start the real Elysia app as an in-process HTTP handler or loopback service. Preserve the real authentication/authorization middleware and shared Zod validation. Do not bypass domain services for integration tests.
- Start the real React Router frontend for browser E2E. The UI uses Tailwind/shadcn; Motion for React is optional and must not alter completion semantics.
- Use a private, isolated object-storage fixture that exercises upload, download, delete and orphan cleanup; additionally smoke-test the selected deployed storage adapter before production acceptance. Do not expose public bucket URLs.
- Use a deterministic fake clock for unit/SLA boundary cases. Use actual UTC timestamps and a controlled server clock for scheduled-job integration. User-facing date/time display is `Asia/Bangkok`.
- Use `en`/`th` locale fixtures and light/dark system preference emulation. Fix random seeds, response delays, UUID allocation where safe, and seeded users for reproducibility.
- Reset fixture rows and uploaded binaries between test cases. Run concurrency cases against a clean, isolated dataset and separate DB connections. Do not parallelize shared mutable fixture state without isolation.

### 2.2 Required synthetic actors

| Fixture | Effective roles / department | Test purpose |
|---|---|---|
| `U-OWNER` | REQUESTER, Dept A | Owns request `Q-A` |
| `U-OTHER` | REQUESTER, Dept B | Owns `Q-B`; cross-owner access probe |
| `U-NEW` | REQUESTER, no department | Public signup, draft and department submission guard |
| `U-R1`, `U-R2`, `U-R3` | REVIEWER, active; eligible in relevant mapping | Parallel ALL, stage 1/2, reassignment |
| `U-DELEGATE` | REVIEWER, active | Temporary delegation; original/delegate race |
| `U-MULTI` | REQUESTER + REVIEWER (+ optional ADMINISTRATOR), Dept A | Self-approval cannot be bypassed by role stacking |
| `U-FORMER` | REVIEWER, previously handled old revision | Historic-only read projection, no current-detail access |
| `U-ADMIN` | ADMINISTRATOR | Configuration, escalation discovery, user administration; **not** universal request viewer |
| `U-LASTADMIN` | Sole remaining active ADMINISTRATOR in a separate fixture | Last-admin protection |
| `U-DISABLED` | inactive otherwise valid user | Token/account revocation checks |
| `ANON`, `JOB-ID` | unauthenticated visitor / trusted machine identity | Public-route and internal-job access separation |

All users have separate secrets; no real personal information. Build fresh signed credentials through the actual login flow for protected HTTP tests rather than handcrafting unauthorized privileged JWTs as fixtures.

### 2.3 Configuration and request fixtures

- `TYPE-V1`: enabled published metadata-driven request type with TEXT, TEXTAREA, DECIMAL, DATE, SELECT and BOOLEAN fields; optional line items; localized labels.
- `TYPE-V2`: newer published definition with changed rules/labels/options; returned `Q-A` must still use its originally pinned `TYPE-V1`.
- `TYPE-COND`: valid AND/OR conditions and typed values, including boolean `false` as PRESENT, dependent hidden fields, requiredWhen and a diamond-shaped acyclic dependency graph.
- `TYPE-BAD`: cycle, self-reference, unknown key, invalid option/operator, duplicate key, incompatible types, oversized expression, empty `all`/`any` group.
- `POL-1`: one-stage, one required slot. `POL-2`: two ordered stages; second stage two parallel reviewers (ALL). `POL-TIE`: two applicable same-top-priority policies. `POL-NONE`: no eligible policy; self-only/inactive reviewer variants.
- `LIMIT-A`: policy amount ceiling and stage-trigger threshold, with below/exact/above decimal boundary values.
- `Q-A`: owner A's working draft, first submitted revision, returned revised revision and multiple historical cycles as separate scenarios. `Q-B`: foreign private request. `Q-C`: identical request fields but independent request UUID for uniqueness tests.
- `FILE-PDF`, `FILE-PNG`, `FILE-JPEG`, invalid content type/signature, over-limit file, and interrupted upload. Use benign synthetic byte content.
- Scheduler fixtures: Friday 16:00, Monday 09:00, exactly `dueAt`, just before `dueAt`, and same logical event processed twice.

Fixture creation may use internal seed builders and database factories, but **every acceptance path must still exercise the appropriate public API**, unless specifically testing an internal database invariant.

### 2.4 Standard assertions for API tests

For every endpoint in §4: verify the documented success status and direct DTO/binary shape; input Zod validation; audience/authorization; no privileged fields; and relevant negative states. In addition:

- UUIDs are validated public identifiers; dates are UTC `Z`; calendar-only form dates remain `YYYY-MM-DD`; currency/quantities use exact decimal strings; JSON fields are `camelCase`; enums match the documented uppercase literals.
- `POST /search` returns a direct array with parseable `X-Pagination` metadata, bounded `pageSize`, deterministic ordering and authenticated scoping. It does **not** wrap results in `{data,meta}`.
- Protected JSON and private downloads have `Cache-Control: no-store`. Browser-visible CORS headers expose `X-Pagination`, `X-Request-Id`, and `Location` only to approved origins.
- Errors use matching HTTP `statusCode`, stable `code`, sanitized English `message`, `error`, UUID `requestId`, mirrored `X-Request-Id` and allowed `details[]` only. No raw SQL, stack, storage key, secret or protected existence leak.
- `201` creation returns an authorized direct DTO and a same-prefix `Location` where a readable created resource exists. Binary/PDF responses have correct `Content-Type`, safe `Content-Disposition` and no JSON wrapper.
- Critical retries preserve `Idempotency-Key` identity (actor/public proof context + method + canonical resource path + canonical semantic body). Same-key/same-payload replay does not reexecute side effects; same-key/different-payload returns `409 IDEMPOTENCY_CONFLICT`.
- Existing mutable resources require appropriate `expectedVersion`; stale actions conflict rather than overwrite. Error-to-UI mapping retains human-facing inputs for recoverable errors.

## 3. Domain, contract, database and concurrency test suites

### 3.1 Domain and shared-contract tests

| ID | Setup / operation | Expected proof | References |
|---|---|---|---|
| `UT-01` | Enumerate all allowed request state/action pairs and all disallowed pairs | Only frozen transition matrix accepted; terminal states cannot mutate | BR-026–029, BR-035–044 |
| `UT-02` | Evaluate stage 1/2 and multiple parallel slots with one vs all approvals | ALL policy, future stage WAITING, final APPROVED only at last required vote | BR-035–039 |
| `UT-03` | Build condition atoms EQ/NE/GT/GTE/LT/LTE/IN/PRESENT on supported typed values | Correct typed comparisons; `false` is PRESENT; absent/hidden dependencies treated unset | API §3.3 |
| `UT-04` | Combine `all` + `any` conditions, empty group, cycle, unknown field, self-reference | AND/OR semantics and publish rejection; deterministic topological evaluation | BR-014–018, API §3.3 |
| `UT-05` | Hide previously answered field and change parent again | Hidden key omitted from UI payload; backend rejects explicit hidden key (`FORM_FIELD_NOT_APPLICABLE`) | BR-017–018, UI §8.3 |
| `UT-06` | Calculate quantities/unit amounts and hard-limit thresholds via exact decimal arithmetic | No float drift (e.g. 0.10 + 0.20 = 0.30); exact equality/greater comparisons | BR-031, BR-035 |
| `UT-07` | Resolve policy using request type/department/amount, numeric priority, tied top priority | Highest numeric priority wins; tied top priority is ambiguous | API §6.6 |
| `UT-08` | Check self-approval for requester with stacked roles or delegated assignment | Prohibited for every path | BR-006, BR-050–051 |
| `UT-09` | Derive Bangkok business-minute deadline crossing 17:00, weekend and 09:00 | Counts only Mon–Fri 09:00–17:00, no holiday exceptions | BR-062–063 |
| `UT-10` | Check delegation windows just before, at start, at end, after revoke/reassign | Only current valid scope gains shared single-slot authority; expiry stops authority | BR-049–051, API §6.6 |
| `UT-11` | Generate human request number and canonical public identifiers | Tracking number immutable and unique under DB constraint; UUID and UTC formats valid | BR-030, API §2.1 |
| `UT-12` | Canonicalize search predicates and sort allowlists | Bad fields/operators/join paths rejected, stable tie sort, bounded results | BR-068–069, API §2.3 |
| `UT-13` | Compute permission projections for owner, current reviewer, former handler and admin | Former handler only handled revision/context; admin routing DTO contains no private data | BR-054, API §4 |
| `CT-01` | Validate all shared Zod request/response DTOs and discriminated enum values | Correct unknown-write-field rejection; roundtrip JSON types match API §3 | API §3 |
| `CT-02` | Inject malformed UUID, date instant, LocalDate, DecimalString, priority and task status | 422 validation for well-formed but invalid values; no coercion of money through JS float | API §2–3 |
| `CT-03` | Validate conditional field-definition limits and typed option arrays | Invalid definitions cannot publish; static Zod + runtime evaluator agree on effective values | API §3.3 |
| `CT-04` | Generate OpenAPI from actual Elysia routes/Zod and compare to endpoint directory | No missing route/method, wrong audience status or incorrect DTO shape | API §5–6 |

### 3.2 Real PostgreSQL persistence and transaction tests

| ID | Setup / operation | Expected proof |
|---|---|---|
| `DB-01` | Migrate empty PostgreSQL, run deterministic seed twice | Schema correct; seed idempotent; required foreign keys/indexes/uniqueness present |
| `DB-02` | Create draft, terminate API process, restart and read | Draft survives, no phantom number/cycle/tasks |
| `DB-03` | Submit valid request and inspect linked revision/cycle/stage/slot/audit rows | One complete atomic submission with correct requester, trusted department, pinned version |
| `DB-04` | Fail a transaction after request revision insertion but before cycle/audit commit | No orphan submitted revision, number/cycle or partial PENDING state |
| `DB-05` | Decide slot and force failure before required audit/outbox write | No decision, status or phantom notification effect remains committed |
| `DB-06` | Return → edit → resubmit → compare historical records | Immutable first submitted revision/decision; new cycle uses current policy but original form definition |
| `DB-07` | Change user role/department/policy after existing submission | Historical department/reviewer snapshots remain unchanged; current authorization reacts promptly |
| `DB-08` | Withdraw/reject/return with unfinished slots | Non-actionable slots and durable terminal/returned history; no pending-task reminder afterward |
| `DB-09` | Insert duplicate slot decision or duplicate request number directly under test DB constraints | Uniqueness constraint prevents second effective vote/number |
| `DB-10` | Upload/remove working file, commit submission, attempt historical removal | Working revision association consistent; submitted evidence preserved and never publicly mutable |
| `DB-11` | Restart with persisted notifications, read states, delegations and policies | Persisted results authoritative; no memory-only behavior mistaken for durability |
| `DB-12` | Mark user inactive or revoke refresh family and query protected endpoints | Server-backed access/session enforcement persists after restart |
| `DB-13` | Change draft configuration while another actor attempts publish | Optimistic version conflict, exactly one published immutable version |
| `DB-14` | Independently verify scheduled outbox/notification transaction | Durable logical event stored once; retry does not duplicate recipients |

### 3.3 True concurrency, retries and failure injection

Use independent PostgreSQL connections and a barrier so operations overlap intentionally; do not treat two sequential calls as a concurrency test. Capture final state, committed audit rows, effective vote count and HTTP errors, not just status-code timing.

| ID | Competing operations | Required result |
|---|---|---|
| `CX-01` | Original reviewer vs valid delegate approve same slot | One committed decision, other `409 APPROVAL_TASK_STALE`; first valid committed vote wins |
| `CX-02` | Two parallel reviewers approve last two slots simultaneously | Stage advances/finishes once; exactly one final transition/audit event |
| `CX-03` | One reviewer APPROVE vs another REJECT/RETURN on same active cycle | One coherent final outcome ordered by valid commits; no APPROVED after earlier committed rejection |
| `CX-04` | Owner WITHDRAW vs reviewer APPROVE/REJECT | One serializable outcome; no effective decision after withdrawal |
| `CX-05` | Admin REASSIGN vs old reviewer DECIDE | Old reviewer either commits before reassignment or gets stale/forbidden; no unauthorized post-reassignment vote |
| `CX-06` | Stage activation vs reassignment of future WAITING slot | Correct current assignee/version and dueAt set from activation; no double task |
| `CX-07` | Two independent first submissions with number allocator collision pressure | Unique immutable request numbers; no duplicate submitted request |
| `CX-08` | Same idempotency key, same semantic body, concurrent duplicate submission | One logical create/decision and stable replay; no duplicate audit/notification |
| `CX-09` | Same key, different body or different path/actor | 409 IDEMPOTENCY_CONFLICT only for same identity with changed body; no cross-resource replay |
| `CX-10` | Bulk items including valid, stale, forbidden and duplicate task IDs | Per-task atomic results, no cross-task privilege; duplicate IDs rejected as 422 |
| `CX-11` | Request submit vs attachment upload/delete | File belongs to correct working/submitted revision; no orphan or post-submit mutation |
| `CX-12` | Admin publishes type/policy while requester submits/resubmits | One consistent version boundary; first-submit form staleness 409; resubmit keeps pinned form/new policy |
| `CX-13` | Two SLA runners attempt same reminder/escalation event | One logical notification/outbox record per recipient/event, no automatic reassign |
| `CX-14` | Stale `expectedVersion` write races with latest update | 409; no silent lost update |

## 4. Endpoint-by-endpoint smoke/contract coverage

Every listed API route requires at least one positive contract test and its applicable negative authorization/validation tests. Routes below are **relative to `/api/v1`** unless otherwise noted. This directory is not a substitute for the deeper suites in §§3, 5–7.

| ID | Method and path | Eligible audience | Contract result | Coverage owner |
|---|---|---|---|---|
| `EP-001` | `POST /auth/register` | Public | \`201 RegisterResponse\`, one-time recovery codes | AUTH/REC |
| `EP-002` | `POST /auth/login` | Public | \`200 LoginResponse\`, refresh cookie | AUTH/REC |
| `EP-003` | `POST /auth/refresh` | Cookie holder, origin/CSRF checks | \`200 RefreshResponse\`, rotated refresh cookie | AUTH/REC |
| `EP-004` | `POST /auth/logout` | Authenticated or valid refresh-session holder, origin/CSRF checks | \`200 MessageResponse\`, revoke current session/clear cookie | AUTH/REC |
| `EP-005` | `POST /auth/logout-all` | Authenticated | \`200 MessageResponse\`, revoke all sessions | AUTH/REC |
| `EP-006` | `GET /auth/me` | Authenticated | \`200 UserSummary\` | AUTH/REC |
| `EP-007` | `POST /auth/password/change` | Authenticated | \`200 MessageResponse\`, revoke existing sessions | AUTH/REC |
| `EP-008` | `POST /auth/recovery/password` | Public, rate-limited | \`200 MessageResponse\` on verified code reset | AUTH/REC |
| `EP-009` | `POST /auth/recovery/codes/regenerate` | Authenticated and reauthenticated | \`200 {recoveryCodes:string[]}\` once | AUTH/REC |
| `EP-010` | `POST /auth/recovery/admin-grants/redeem` | Public, rate-limited | \`200 MessageResponse\` on valid grant | AUTH/REC |
| `EP-011` | `POST /admin/users/:id/recovery-grants` | Administrator | \`201 AdminRecoveryGrant\` once | AUTH/REC |
| `EP-012` | `POST /users/search` | Administrator | \`200 UserSummary[]\` + \`X-Pagination\` | ADMIN/ID |
| `EP-013` | `POST /users` | Administrator | \`201 UserSummary\` | ADMIN/ID |
| `EP-014` | `GET /users/:id` | Administrator | \`200 UserSummary\` | ADMIN/ID |
| `EP-015` | `PATCH /users/:id` | Administrator | \`200 UserSummary\` | ADMIN/ID |
| `EP-016` | `PUT /users/:id/roles` | Administrator | \`200 UserSummary\` | ADMIN/ID |
| `EP-017` | `PUT /users/:id/department` | Administrator | \`200 UserSummary\` | ADMIN/ID |
| `EP-018` | `POST /departments/search` | Administrator | \`200 DepartmentSummary[]\` + \`X-Pagination\` | ADMIN/ID |
| `EP-019` | `GET /departments/:id` | Authorized admin or current department member (limited DTO) | \`200 DepartmentSummary\` | ADMIN/ID |
| `EP-020` | `POST /departments` | Administrator | \`201 DepartmentSummary\` | ADMIN/ID |
| `EP-021` | `PATCH /departments/:id` | Administrator | \`200 DepartmentSummary\` | ADMIN/ID |
| `EP-022` | `POST /reviewers/eligible/search` | Administrator configuring roles/rules | \`200 reviewer summaries[]\` + \`X-Pagination\` | ADMIN/ID |
| `EP-023` | `POST /request-types/search` | Authenticated, public active-type metadata only; admin may request disabled | \`200 type summaries[]\` + \`X-Pagination\` | FORMS |
| `EP-024` | `GET /request-types/:id` | Authorized user | \`200 PublishedRequestType\` or admin draft metadata | FORMS |
| `EP-025` | `GET /request-types/:id/versions/:versionId` | Admin, or request participant with legitimate pinned-version context | \`200 PublishedRequestType\` | FORMS |
| `EP-026` | `POST /admin/request-types` | Administrator | \`201 type draft DTO\` | FORMS |
| `EP-027` | `PATCH /admin/request-types/:id/draft` | Administrator | \`200 type draft DTO\` | FORMS |
| `EP-028` | `POST /admin/request-types/:id/draft` | Administrator | \`201 type draft DTO\` — branch latest published definition to a new draft | FORMS |
| `EP-029` | `POST /admin/request-types/:id/publish` | Administrator | \`201 PublishedRequestType\` | FORMS |
| `EP-030` | `POST /admin/request-types/:id/enable` | Administrator | \`200 type summary\` | FORMS |
| `EP-031` | `POST /admin/request-types/:id/disable` | Administrator | \`200 type summary\` | FORMS |
| `EP-032` | `POST /requests/search` | Authenticated; visibility scope | \`200 RequestSummary[]\` + \`X-Pagination\` | REQ/REV |
| `EP-033` | `POST /requests` | Requester with active account | \`201 RequestDetail\` (DRAFT) | REQ/REV |
| `EP-034` | `GET /requests/:id` | Owner or current authorized reviewer only; no historic-only detail access | \`200 RequestDetail\` | REQ/REV |
| `EP-035` | `PATCH /requests/:id/draft` | Owner with \`DRAFT\`/\`RETURNED\` working revision | \`200 RequestDetail\` | REQ/REV |
| `EP-036` | `POST /requests/:id/submit` | Owner DRAFT, assigned department | \`200 RequestDetail\` | REQ/REV |
| `EP-037` | `POST /requests/:id/resubmit` | Owner RETURNED, assigned department | \`200 RequestDetail\` | REQ/REV |
| `EP-038` | `POST /requests/:id/withdraw` | Owner PENDING | \`200 RequestDetail\` | REQ/REV |
| `EP-039` | `GET /requests/:id/revisions` | Owner/current reviewer only | \`200 revision metadata[]\` | REQ/REV |
| `EP-040` | `GET /requests/:id/revisions/:revisionId` | Owner/current reviewer or qualifying historic handler | \`200 RequestRevision\` | REQ/REV |
| `EP-041` | `GET /requests/:id/timeline` | Authorized request participant | \`200 audit timeline item[]\` | REQ/REV |
| `EP-042` | `GET /requests/:id/approvers` | Authorized request participant; minimal reviewer summaries | \`200 ApproverSummary[]\` | REQ/REV |
| `EP-043` | `POST /approval-tasks/search` | Reviewer own current/delegated tasks only | \`200 ApprovalTask[]\` + \`X-Pagination\` | APPROVAL |
| `EP-044` | `POST /admin/approval-tasks/search` | Administrator only; routing metadata for undecided active PENDING-cycle slots | \`200 AdminApprovalTaskSummary[]\` + \`X-Pagination\` | APPROVAL |
| `EP-045` | `GET /approval-tasks/:id` | Current eligible reviewer; approved historical projection to handler | \`200 ApprovalTask\` | APPROVAL |
| `EP-046` | `POST /approval-tasks/:id/decisions` | Eligible reviewer/delegate | \`201 DecisionResult\` | APPROVAL |
| `EP-047` | `POST /approval-tasks/bulk-decisions` | Eligible reviewer/delegate | \`200 BulkDecisionResult\` | APPROVAL |
| `EP-048` | `POST /approval-tasks/:id/reassign` | Administrator, any undecided slot in active PENDING cycle | \`200 ApprovalTask\` | APPROVAL |
| `EP-049` | `POST /admin/approval-policies/search` | Administrator | \`200 policy summaries[]\` + \`X-Pagination\` | POLICY/DELEG |
| `EP-050` | `POST /admin/approval-policies` | Administrator | \`201 policy draft DTO\` | POLICY/DELEG |
| `EP-051` | `PATCH /admin/approval-policies/:id/draft` | Administrator | \`200 policy draft DTO\` | POLICY/DELEG |
| `EP-052` | `POST /admin/approval-policies/:id/draft` | Administrator | \`201 policy draft DTO\` — create next editable version | POLICY/DELEG |
| `EP-053` | `POST /admin/approval-policies/:id/publish` | Administrator | \`201 published policy DTO\` | POLICY/DELEG |
| `EP-054` | `POST /admin/approval-policies/:id/disable` | Administrator | \`200 policy summary\` | POLICY/DELEG |
| `EP-055` | `POST /admin/reviewer-assignments/search` | Administrator | \`200 assignment summaries[]\` + \`X-Pagination\` | POLICY/DELEG |
| `EP-056` | `POST /admin/reviewer-assignments` | Administrator | \`201 assignment DTO\` | POLICY/DELEG |
| `EP-057` | `PATCH /admin/reviewer-assignments/:id` | Administrator | \`200 assignment DTO\` | POLICY/DELEG |
| `EP-058` | `POST /admin/budget-policies/search` | Administrator | \`200 budget policy summaries[]\` + \`X-Pagination\` | POLICY/DELEG |
| `EP-059` | `POST /admin/budget-policies` | Administrator | \`201 budget policy DTO\` | POLICY/DELEG |
| `EP-060` | `PATCH /admin/budget-policies/:id` | Administrator | \`200 budget policy DTO\` | POLICY/DELEG |
| `EP-061` | `POST /delegations/search` | Eligible Reviewer, own delegation scope | \`200 delegation DTO[]\` + \`X-Pagination\` | POLICY/DELEG |
| `EP-062` | `POST /delegations` | Eligible Reviewer | \`201 delegation DTO\` | POLICY/DELEG |
| `EP-063` | `POST /delegations/:id/revoke` | Delegation owner or authorized Admin | \`200 delegation DTO\` | POLICY/DELEG |
| `EP-064` | `GET /requests/:id/comments` | Authorized current request participant | \`200 comment DTO[]\` (bounded pagination) | FILES/CMT |
| `EP-065` | `POST /requests/:id/comments` | Authorized current request participant | \`201 comment DTO\` | FILES/CMT |
| `EP-066` | `GET /requests/:id/attachments` | Authorized current request participant | \`200 attachment metadata[]\` | FILES/CMT |
| `EP-067` | `POST /requests/:id/attachments` | Owner only when DRAFT/RETURNED | \`201 attachment metadata\`, Elysia multipart | FILES/CMT |
| `EP-068` | `DELETE /requests/:id/attachments/:attachmentId` | Owner only on working revision | \`204 No Content\` | FILES/CMT |
| `EP-069` | `GET /attachments/:id/download` | Authorized currently entitled requester/reviewer | Binary stream, safe download headers | FILES/CMT |
| `EP-070` | `POST /notifications/search` | Own authenticated inbox | \`200 Notification[]\` + \`X-Pagination\` | NOTIFY |
| `EP-071` | `PATCH /notifications/:id/read` | Own notification | \`200 Notification\` | NOTIFY |
| `EP-072` | `POST /notifications/mark-all-read` | Own notification inbox | \`200 {updatedCount:number}\` | NOTIFY |
| `EP-073` | `GET /dashboard` | Authenticated | \`200 role-appropriate dashboard DTO\` | DASH |
| `EP-074` | `POST /reports/requests/search` | Authenticated authorized report scope | \`200 report aggregate DTO[]\` + \`X-Pagination\` when collection | REPORT |
| `EP-075` | `POST /reports/requests/pdf` | Authenticated authorized report scope | \`200 application/pdf\` stream | REPORT |


**Admin escalation addition:** `POST /api/v1/admin/approval-tasks/search` is the approved v1.0.1 route and is included in the 75-route directory above.

**Also test non-versioned routes:** `GET /api/versions` returns supported versions, `GET /healthz` exposes liveness only, and `POST /internal/jobs/sla-process` rejects ordinary browser/user credentials but accepts only the configured trusted service identity. The internal job route is **outside** the versioned API namespace.

### 4.1 Per-group HTTP assertions

| Group | Positive and negative cases |
|---|---|
| `AUTH/REC` | Valid login/register/current user; malformed/invalid credentials, rotation/replay, origin/cookie security, single-use recovery and admin grant |
| `ADMIN/ID` | Admin CRUD with `expectedVersion`, reviewer eligibility, last-admin safety, nonadmin 403, role change session invalidation |
| `FORMS` | Published/current/draft version visibility; save/branch/publish; cycle/unknown condition error and stale version 409 |
| `REQ/REV` | Owner save/edit/submit/resubmit/withdraw, exact revision pinning, unavailable private 404, ID/number invariants |
| `APPROVAL` | Own queue; minimal admin search; actionability, single/bulk decision, reassign, stale 409 and permission boundaries |
| `POLICY/DELEG` | Draft/publish priority, 1–2 stages, mapping/cap policy, active interval and delegation revocation |
| `FILES/CMT` | Comments never decide; Elysia multipart access/type/size/signature; private download, immutable evidence |
| `NOTIFY` | Own notification collection/read/mark-all, no cross-account item disclosure, idempotent scheduler |
| `REPORT` | Authorized aggregate scope and PDF stream match table/query filters, safe binary headers |
| `DASH` | Requester/reviewer/admin distinct safe projections and no private data widening |

### 4.2 Wire error-status catalogue

| Error scenario | Expected HTTP + machine code | Assertions |
|---|---|---|
| Invalid login / missing Bearer | `401 UNAUTHENTICATED` | No session created, no data returned |
| Forbidden known protected operation | `403 FORBIDDEN` | No mutation; safe error |
| Protected foreign/absent resource | `404 NOT_FOUND` | indistinguishable status/body/sensitive detail shape |
| Malformed JSON/multipart protocol | `400 BAD_REQUEST` | safe parse error, no stack |
| Static/dynamic field failure | `422 VALIDATION_ERROR` | field details only when authorized |
| Nonapplicable dynamic field submitted | `422 FORM_FIELD_NOT_APPLICABLE` | submitted value does not affect amounts/routing |
| Over budget hard limit | `422 BUDGET_LIMIT_EXCEEDED` | remains DRAFT/RETURNED; no pending cycle |
| First-submit stale type version | `409 FORM_DEFINITION_CHANGED` | original working values preserved |
| Missing policy/ineligible reviewer | `409 CONFIGURATION_INCOMPLETE` | no incomplete approval cycle |
| Equal top-priority policies | `409 AMBIGUOUS_APPROVAL_POLICY` | no arbitrary policy selected |
| Requester attempts own vote | `403 SELF_APPROVAL_FORBIDDEN` | no decision even with reviewer/admin role |
| Stale task/vote/assignment/version | `409 APPROVAL_TASK_STALE` | no second effective decision |
| Illegal request transition | `409 INVALID_REQUEST_TRANSITION` | no history for nonexistent change |
| Bad delegate/reviewer candidate | `422 ASSIGNMENT_NOT_ELIGIBLE` | no new authorization |
| Same key with different body | `409 IDEMPOTENCY_CONFLICT` | no extra effects |
| Invalid/used/expired recovery proof | `400 RECOVERY_CREDENTIAL_INVALID` | no account enumeration |
| Excess authentication/recovery attempts | `429 RATE_LIMITED` | no unsafe retries, respect retry feedback |
| Oversize file / invalid type | `413 FILE_TOO_LARGE` / `415 UNSUPPORTED_MEDIA_TYPE` | no public/stored unsafe binary |
| Infrastructure unavailable | `503 SERVICE_UNAVAILABLE` | safe error, no partial business effect |
| Unexpected error | `500 INTERNAL_ERROR` | sanitized details, correlatable request ID |


### 4.3 Cross-cutting HTTP wire tests

| ID | Operation | Expected wire-level result |
|---|---|---|
| `API-01` | Request `GET /api/versions` and an unsupported version path | Version discovery returns only supported versions; unsupported version is safely rejected under documented middleware behavior |
| `API-02` | Exercise every versioned route with syntactically malformed body and unexpected write keys | Zod/body errors are deterministic; unknown write properties rejected, no business mutation |
| `API-03` | Create and read a direct resource DTO | Response is direct `camelCase` JSON; public IDs are UUIDs, timestamps UTC `Z`, amounts decimal strings |
| `API-04` | Search zero, one and many rows on an authenticated collection | Direct array, parsable and correct `X-Pagination`, stable ordering/tie-breaker, capped page size |
| `API-05` | Request filters on hidden, joined, unsupported or malformed field/operator/sort | `422 VALIDATION_ERROR`; arbitrary SQL identifiers rejected before query construction |
| `API-06` | Send permitted/forbidden Origin and credentialed browser request | Only configured origins accepted; credentialed CORS never wildcard; required headers exposed |
| `API-07` | Open protected/private DTO and trigger error path | `Cache-Control: no-store`; sanitized error envelope, mirrored `X-Request-Id` |
| `API-08` | Replay idempotent critical mutation with identical and changed semantic payload | Same-key/same-body same logical outcome; changed body 409; relevant version check required |
| `API-09` | Test both `201` resource creation and `204` attachment deletion | Appropriate `Location` for readable created resource; 204 has no JSON body |
| `API-10` | Download permitted binary attachment and PDF report | Correct media type, safe filename/content-disposition, no JSON wrapper, no public storage URL |
| `API-11` | Search admin escalation endpoint as admin and nonadmin with all allowed/invalid fields | 200 minimal DTO + X-Pagination for admin, 403 otherwise, invalid filter 422, correct overdue default |
| `API-12` | Send unauthenticated, stale, forbidden and foreign-resource calls | Correct 401/403/404/409 categories; field details never reveal private object existence |

## 5. Feature acceptance test cases — complete 54/54

The ID `FT-NNN` corresponds **one-to-one** with `FR-NNN` and `AC-NNN` in the frozen product specification. This is the minimum end-to-end/contract acceptance spine; a feature is not complete merely because its `FT` test passes without the relevant domain, security, database or UI checks.

| Test | Sprint | Feature / requirement | Setup / action | Required outcome |
|---|---:|---|---|---|
| `FT-001` | 1 | `M01` / `FR-001` / `AC-001` | Login as active user; retry with wrong password and disabled account | Valid login returns access JWT/user and refresh cookie; invalid/disabled attempts create no session |
| `FT-002` | 1 | `M02` / `FR-002` / `AC-002` | Read /auth/me, logout and try old refresh/access credentials | Identity matches server roles; session is revoked and no protected access survives revocation |
| `FT-003` | 1 | `M03` / `FR-003` / `AC-003` | Try owner, other owner, wrong role and multi-role user across protected resources | Only backend-authorized actor receives data or mutates state; no cross-user existence leak |
| `FT-004` | 1 | `M04` / `FR-004` / `AC-004` | Submit seeded active-type DRAFT with trusted department and valid reviewer plan | PENDING request, immutable revision, one active cycle/slots and audit committed together |
| `FT-005` | 1 | `M05` / `FR-005` / `AC-005` | Search requests as requester A with requests owned by A and B | Only A-owned records/counts; requestId/requesterId query cannot broaden visibility |
| `FT-006` | 1 | `M06` / `FR-006` / `AC-006` | Read own/current assigned request and try an unrelated UUID/foreign request | Current status/authorized fields correct; foreign and absent requests indistinguishable |
| `FT-007` | 1 | `M07` / `FR-007` / `AC-007` | Submit using valid, missing, inactive and self-only reviewer mappings | All required slots resolved in valid case; invalid plan yields 409 CONFIGURATION_INCOMPLETE, no PENDING cycle |
| `FT-008` | 1 | `M08` / `FR-008` / `AC-008` | Query review queue as assigned, delegated, unassigned and former reviewer | Only currently actionable assigned/delegated tasks appear |
| `FT-009` | 1 | `M09` / `FR-009` / `AC-009` | Approve first required slot of parallel or first sequential stage | One decision/audit; request stays PENDING until all required votes/stages finish |
| `FT-010` | 1 | `M10` / `FR-010` / `AC-010` | Reject actionable task with blank then valid reason | Blank rejected 422; valid rejection returns REJECTED with one vote/audit and cancelled remaining tasks |
| `FT-011` | 1 | `M12` / `FR-011` / `AC-011` | Attempt decisions from invalid request/task states and replay previously decided task | 409 state/stale response, no unauthorized transition or extra effective decision |
| `FT-012` | 1 | `M13` / `FR-012` / `AC-012` | Give requester REVIEWER/ADMINISTRATOR role and self-assignment/delegation attempt | 403 SELF_APPROVAL_FORBIDDEN; no vote regardless of role or token |
| `FT-013` | 1 | `M14` / `FR-013` / `AC-013` | Approve/reject, restart application and query authorized timeline | Actor, cycle, revision, decision and timestamps persisted and immutable |
| `FT-014` | 1 | `M15` / `FR-014` / `AC-014` | PATCH DRAFT/RETURNED and then PATCH PENDING/terminal request | Only working revisions mutable; submitted immutable snapshot preserved |
| `FT-015` | 1 | `M17` / `FR-015` / `AC-015` | Inject fault after decision insert/before audit or state commit | Entire transaction rolls back; valid retry commits one coherent effect |
| `FT-016` | 1 | `R06` / `FR-016` / `AC-016` | Submit concurrently from distinct seeded drafts and replay one idempotency key | Unique immutable REQ tracking numbers, no duplicate assignment on replay |
| `FT-017` | 2 | `M11` / `FR-017` / `AC-017` | Return task with blank/valid reason | Blank rejected; valid reason closes cycle, sets RETURNED and disables pending slots |
| `FT-018` | 2 | `M16` / `FR-018` / `AC-018` | Compare report counts against seeded visible requests including private foreign requests | Aggregates use authoritative DB truth and authorized scope only |
| `FT-019` | 2 | `R01` / `FR-019` / `AC-019` | Save incomplete draft in wizard; reload as owner and check reviewer queue | Draft reopens with stored values, no request number or review task |
| `FT-020` | 2 | `R02` / `FR-020` / `AC-020` | Return v1 form request, publish v2 and edit returned working revision | Edit uses pinned v1 definition, v2 metadata does not overwrite historical content |
| `FT-021` | 2 | `R03` / `FR-021` / `AC-021` | Resubmit returned edited request after publishing a new approval policy | New cycle/policy/slots; old cycle votes remain historical and never carry forward |
| `FT-022` | 2 | `R04` / `FR-022` / `AC-022` | Edit returned revision repeatedly then inspect historical revisions | Earlier submitted fields, items and attachments remain unchanged |
| `FT-023` | 2 | `R05` / `FR-023` / `AC-023` | Withdraw own PENDING request and try terminal or foreign withdraw | WITHDRAWN and unfinished tasks non-actionable; terminal/foreign changes fail without mutation |
| `FT-024` | 2 | `R07` / `FR-024` / `AC-024` | Create multiple line items with exact decimal amounts; include negative quantity/bad total | Server exact totals; invalid data 422 and no authoritative client total override |
| `FT-025` | 2 | `R08` / `FR-025` / `AC-025` | Publish one/two-stage policy and attempt three stages | 1/2 execute in order; 3-stage publish rejected without change |
| `FT-026` | 2 | `R09` / `FR-026` / `AC-026` | Resolve policies using type/department/amount with distinct priority and equal-top tie | Correct highest-priority version; equal highest tie 409 AMBIGUOUS_APPROVAL_POLICY |
| `FT-027` | 2 | `R10` / `FR-027` / `AC-027` | Read approvers as owner/current reviewer and unrelated reviewer | Current active stage/minimal names visible only when entitled |
| `FT-028` | 2 | `R11` / `FR-028` / `AC-028` | Resubmit then send late decision referencing prior task/cycle/version | 409 APPROVAL_TASK_STALE; prior vote cannot affect new cycle |
| `FT-029` | 2 | `R15` / `FR-029` / `AC-029` | Open dashboards as Requester, Reviewer and Administrator with mixed private fixtures | Only authorized metrics and safe drill-downs; admin lacks universal private-detail access |
| `FT-030` | 2 | `R16` / `FR-030` / `AC-030` | Read multi-cycle audit timeline with interleaved decision/return/reassign events | Chronological durable actor/time/cycle/revision links, no fabricated event |
| `FT-031` | 2 | `O10` / `FR-031` / `AC-031` | Admin creates/updates reviewer mappings; requester sends identical mutation | Admin success/audit; requester 403 with no mapping change |
| `FT-032` | 2 | `O13` / `FR-032` / `AC-032` | Two parallel slots: approve one, approve second, repeat with reject-first and racing votes | ALL voting; no early approval; reject cancels remainder; max one effective vote/slot |
| `FT-033` | 2 | `O16` / `FR-033` / `AC-033` | Admin defines conditional AND/OR graph; publish cycle/unknown-reference config; submit hidden key | Valid published and validated; bad graph 422; hidden key 422 FORM_FIELD_NOT_APPLICABLE |
| `FT-034` | 2 | `O17` / `FR-034` / `AC-034` | Save/read LOW, MEDIUM, HIGH, URGENT; attempt unknown priority | Allowed literal round-trips, unsupported input 422 |
| `FT-035` | 2 | `O18` / `FR-035` / `AC-035` | Submit amount just below/at/above hard ceiling and crossing stage threshold | Above hard ceiling 422 BUDGET_LIMIT_EXCEEDED; threshold selects expected stages, no ledger |
| `FT-036` | 2 | `O19` / `FR-036` / `AC-036` | Submit from two departments with different routing mappings and missing mapping | Reviewer slots follow trusted department; missing route 409 CONFIGURATION_INCOMPLETE |
| `FT-037` | 3 | `R12` / `FR-037` / `AC-037` | Search title/request number as requesters with overlapping private records | Authorized matches only, no cross-owner enumeration |
| `FT-038` | 3 | `R13` / `FR-038` / `AC-038` | Filter status and UTC instant date boundaries in request lists | Correct inclusive/exclusive operator behavior and ownership |
| `FT-039` | 3 | `R14` / `FR-039` / `AC-039` | Sort identical timestamps, request page 1/2/last, invalid page/sort | Stable UUID tie-breaker, truthful X-Pagination, 422 for invalid inputs |
| `FT-040` | 3 | `R17` / `FR-040` / `AC-040` | Exercise core views by keyboard at desktop/tablet/mobile and trigger 4xx/5xx | Accessible focus, usable loading/empty/errors, no stale identity data or overflow |
| `FT-041` | 3 | `O01` / `FR-041` / `AC-041` | Add/read a comment as authorized participant and foreign user; check status | Comment persists in permitted scope; cannot mutate approval decision/status |
| `FT-042` | 3 | `O02` / `FR-042` / `AC-042` | Upload PDF/image to DRAFT/RETURNED; test forbidden type/size, foreign request and PENDING upload | Private authorized storage; 413/415/403/404 as appropriate; submitted files retained |
| `FT-043` | 3 | `O03` / `FR-043` / `AC-043` | Trigger assignment/decision, poll inbox, read/mark and run duplicate delivery | Own persistent notifications, read/unread correct, no duplicates or foreign entries |
| `FT-044` | 3 | `O07` / `FR-044` / `AC-044` | Admin reassigns active slot while old reviewer holds open dialog | Same slot/deadline; new reviewer eligible, old decision 409 stale; audit preserved |
| `FT-045` | 3 | `O08` / `FR-045` / `AC-045` | Delegate with eligible interval; try expired, requester, disabled, revoked and race with original | One vote for original-or-delegate; invalid cases rejected; first valid commit wins |
| `FT-046` | 3 | `O09` / `FR-046` / `AC-046` | Admin edits roles/active/department; requester attempts promotion; disable last admin | Admin changes audited, ordinary user denied; last active admin protection, role revocation enforced |
| `FT-047` | 3 | `O11` / `FR-047` / `AC-047` | Calculate Bangkok deadline for Friday 16:00 with 120 business minutes | Due Tuesday? no: Monday 10:00 for 120 business minutes; no weekend time counted |
| `FT-048` | 3 | `O12` / `FR-048` / `AC-048` | Run due SLA job twice and inspect overdue notifications/assignments | Exactly one logical escalation/reminder; admin notified without automatic reassignment |
| `FT-049` | 3 | `O15` / `FR-049` / `AC-049` | Bulk submit mixed own, other, stale and duplicate task IDs | Per-item ordered outcomes, only eligible votes commit; duplicates rejected 422; replay stable |
| `FT-050` | 3 | `O21` / `FR-050` / `AC-050` | Export report PDF using same filters as table across roles | PDF rows/counts/scope match authorized report; forbidden content excluded |
| `FT-051` | 3 | `O24` / `FR-051` / `AC-051` | First-load with OS light/dark; switch System/Light/Dark and reload | System follows OS; manual override persists; statuses readable without colors |
| `FT-052` | 3 | `O25` / `FR-052` / `AC-052` | First-load Thai/English browser preferences, override and missing Thai labels | Preferred language chosen, persisted override, English fallback, no untranslated controls |
| `FT-053` | 3 | `O26` / `FR-053` / `AC-053` | Public register with attempted roles/department injection, then admin assign department | Requester-only registration, no trusted department before assignment; submission blocked until assigned |
| `FT-054` | 3 | `O27` / `FR-054` / `AC-054` | Use recovery code twice, regen set, admin out-of-band reset grant and old sessions | One-time secrets, audited reset, old sessions revoked; repeated/expired proof fails safely |


### 5.1 Mandatory cross-feature regression (product `S-01`–`S-12`)

| Product scenario | Linked runnable tests | Expected integration-level proof |
|---|---|---|
| `S-01` | `FT-004`, `FT-005`, `FT-006`, `DB-03`, `E2E-01` | Owner sees persisted submitted request after fresh fetch |
| `S-02` | `FT-009`, `FT-010`, `FT-013`, `DB-05`, `E2E-02` | Decision/status/history all durable and exactly once |
| `S-03` | `SEC-01`–`SEC-05`, `FT-003`, `FT-012` | Direct HTTP cannot bypass role/ownership/self-approval |
| `S-04` | `UT-02`, `CX-01`–`CX-03`, `FT-032`, `E2E-05` | ALL votes, races and rejection are coherent |
| `S-05` | `DB-06`, `CX-12`, `FT-020`, `FT-021`, `E2E-04` | Pinned old form + current policy on resubmit |
| `S-06` | `UT-03`–`UT-05`, `CT-03`, `FT-033`, `E2E-03` | Conditional form graph/hidden-key bypass blocked |
| `S-07` | `FT-025`, `FT-033`, `UT-02`, `E2E-08` | No third sequential stage from API or UI |
| `S-08` | `FT-007`, `FT-036`, `DB-04`, `E2E-01` | No eligible reviewer ⇒ no PENDING cycle |
| `S-09` | `CX-05`–`CX-06`, `FT-044`, `FT-045`, `FT-047` | Reassignment/delegation preserves single vote and SLA |
| `S-10` | `FT-053`, `FT-054`, `SEC-06`, `SEC-07`, `E2E-10` | Registration trust boundary and reset revocation |
| `S-11` | `UT-09`, `CX-13`, `FT-047`, `FT-048`, `OPS-01`–`OPS-04`, `E2E-11` | Bangkok calendar, dedup reminders and manual escalation |
| `S-12` | `SEC-08`–`SEC-12`, `FT-037`–`FT-043`, `FT-050` | No report, file, comment, search or inbox private leakage |

## 6. Security and privacy verification

| ID | Attempt | Expected authorization/security result |
|---|---|---|
| `SEC-01` | Anonymous GET/POST to all private endpoint groups | `401 UNAUTHENTICATED`; no protected data, mutation or existence leak |
| `SEC-02` | Requester accesses another request's detail, revision, history, comments, file, report or search result | Absent/foreign indistinguishable `404` or filtered collection; no private metadata |
| `SEC-03` | Requester forges role, department, requesterId, reviewerId or authoritative monetary total in body/URL | Server ignores/rejects authority spoof; no privilege or amount override |
| `SEC-04` | Administrator uses routing list to access private `GET /requests/:id`, files, comments or formal decision | Admin receives routing summary only, with no implicit detail/vote permissions |
| `SEC-05` | Self-owned request assigned to multi-role requester or delegated back to requester | `403 SELF_APPROVAL_FORBIDDEN`; no effective vote |
| `SEC-06` | Disabled account, revoked refresh family, logout-all or password reset followed by old access token | Protected access denied by server session/token version guard |
| `SEC-07` | Public register with privileged fields; lost/reused code; admin-assisted grant replay; wrong recovery proof | No self-elevation; one-time secrets; same safe unknown-account behavior; no raw secret storage |
| `SEC-08` | Former reviewer requests full current detail, later revision, comments, attachments or generalized search | Denied; only specific previously handled historical revision/decision context can be read |
| `SEC-09` | Reviewer uploads/modifies submitted attachments or unrelated files; Admin downloads without entitlement | Denied; safe binary storage, no direct bucket URL |
| `SEC-10` | Foreign user requests notification by ID or filters and exports report | Only own inbox and permitted report scope; no cross-user enumeration |
| `SEC-11` | Send malicious query field, SQL-like identifier, JSON prototype pollution keys or invalid sort | 422/400 with sanitized error; no raw-query execution or schema disclosure |
| `SEC-12` | Read admin escalation default/search with Requester/Reviewer role; inspect DTO as Admin | Nonadmin 403; admin DTO contains no title, request fields, requester PII, attachments or comments |
| `SEC-13` | Wrong Origin/CSRF context for refresh/logout; credentialed wildcard origin | Origin defense enforced; no insecure wildcard credentialed CORS |
| `SEC-14` | Fetch SSR/public pages and HTML source while another user was authenticated | No serialized Bearer, refresh secrets, recovery codes, private request fields or prior-user cache |
| `SEC-15` | Trigger internal scheduler with user Bearer, missing service credential or forged flag | Denied; only trusted machine/service identity can process SLA job |
| `SEC-16` | Inspect headers, logs and generated errors after failures | No stack/SQL/storage keys/passwords/tokens/recovery grants; request ID correlation works |

**Threat-model probes:** expired/tampered JWT, refresh-token reuse from second client, parallel refresh rotation, password brute-force throttling, stolen recovery code replay, disabled/removed reviewer, confused-deputy role stacking, CSRF on cookie endpoints, malicious file metadata, BOLA/IDOR enumeration, search injection, pagination amplification, PDF content leaks, and concurrent double submission. Report confirmed findings as defects; do not weaken the required contract to accommodate a shortcut.

## 7. Browser UI, accessibility and responsive tests

### 7.1 UI component and visual behavior

| ID | Component / action | Expected result | UI contract |
|---|---|---|---|
| `UI-01` | AppShell sidebar collapse, mobile drawer, role-nav updates and logout | Role-filtered sections, managed mobile focus, clean logout state, no private data residue | UI-02; §§4–5 |
| `UI-02` | Render request summary and status chips in light/dark | Monochrome body; neutral/amber/blue/green/red statuses labeled; color never sole signal | UI-10; §2 |
| `UI-03` | Initialize OS light/dark, switch System/Light/Dark, reload; flip OS while System | Correct current theme, persisted override, no SSR hydration mismatch/obvious flash | UI-01; §2.4 |
| `UI-04` | First load with `navigator.languages=['th-TH','en-US']`, with `['en-US']`, unsupported language, then manually toggle | Thai/English selection and English fallback; persistent preference across navigation; localized errors/labels | UI-09; §2.4 |
| `UI-05` | Wizard steps 1–5 with Back/Next, type switch, responsive step indicator | Step values retained, useful validation, no blank Items step, unsaved warning, request number only after submit | UI-03; §8.2 |
| `UI-06` | Save incomplete DRAFT on any wizard step after valid type selected | POST first draft then PATCH with version; no pending task; resume after reload | UI-03; §8.2 |
| `UI-07` | Change conditional parent, hide child, then show it again | Hidden field omitted from payload, dynamic required errors, focus first invalid field | UI §8.3 |
| `UI-08` | Submit using outdated first-submit published definition vs edit RETURNED on pinned version | `FORM_DEFINITION_CHANGED` offers review path; RETURNED shows old definition without silent migration | UI §8.2–8.3 |
| `UI-09` | Use four Request Detail tabs by keyboard/URL; owner/current reviewer/former reviewer | Overview/Approval/History/Discussion-Files accessible; restricted data never fetched/rendered | UI-04; §9 |
| `UI-10` | Open Approve/Reject/Return dialog with keyboard; submit empty reason, stale task, success | All require confirmation; Reject/Return require reason; stale reload offered; authoritative refetch | UI-06; §10.3 |
| `UI-11` | Review task queue with own/delegated/foreign records and bulk select | Only authorized actionable rows; current stage and actual vote shown; no fabricated APPROVED | UI §10 |
| `UI-12` | Admin field-list editor add/edit/remove/reorder, AND/OR condition builder, preview, publish conflict | No drag-and-drop dependency; valid preview; cycle/invalid feedback; immutable published config | UI-05; §11.3 |
| `UI-13` | Admin policy max 2 stages and ALL parallel slot editor, amount policy/mapping lookup | Third stage unavailable; clear policy priority and thresholds; eligible reviewer lookup | UI §11.4–11.5 |
| `UI-14` | Delegation and reassignment forms, expired/stale version, due date display | Proper eligible lookup, confirmation and stale conflict; no extra slot or SLA reset | UI §11.1; §11.6 |
| `UI-15` | Escalation page default and filtered WAITING task; reassign | No private contents; due/overdue semantics accurate; authorized admin refreshes list after mutation | UI-12; §11.6 |
| `UI-16` | Request/review list desktop table versus mobile compact cards | Same authorized data/actions/search/filter/sort/page and no page-wide horizontal overflow | UI-07; §§4,6 |
| `UI-17` | Notification bell polling and full inbox, mark read, visibility change, logout | Same user-specific counts, dedup and read states, no cross-session display | UI-08; §12.1 |
| `UI-18` | Upload file in working wizard; open submitted history; unauthorized download | Owner upload/delete only editable; historic evidence read-only; unauthorized link safe | UI §9; §12 |
| `UI-19` | Display/submit comment; export filtered PDF/report | Comment remains discussion; PDF matches filters; loading/failure state accessible | UI §9; §12.3 |
| `UI-20` | Trigger 400/401/403/404/409/413/415/422/429/500/503, empty/no-results, slow network | Accessible error/recovery; no false success; safe draft reason retention; no sensitive data leak | UI §13 |
| `UI-21` | Reduce motion, keyboard-only tab/dialog/lookup/table, focus trap/return | Focus visible and stable, animations nonblocking or removed, status not color-only | UI §3; §13 |
| `UI-22` | Render dashboard by 3 roles with multi-role user and admin | Allowed summaries/links only; no implicit admin access to private details | UI §12.2 |
| `UI-23` | Responsive testing at widths 390, 820, 1440 px **[implementation default]** | Usable forms/cards/tables/dialogs; no clipped primary actions or body scroll sideways | UI §4.2 |
| `UI-24` | Test theme/status contrast, long Thai/English string expansion, screen-reader announcement | Text and role meaning preserved; no truncation of required labels and live error feedback | UI §§2–3 |

### 7.2 Browser E2E critical journeys

| ID | Real browser path | Required database/API/UI outcome |
|---|---|---|
| `E2E-01` | Login Requester → wizard DRAFT → complete → submit → details | Actual DB PENDING/revision/cycle, tracking number, correct four-tab header and assigned reviewer |
| `E2E-02` | Reviewer login → queue → confirmation Approve/Reject → Requester reload | Correct decision/status/history; no false terminal state when parallel slots remain |
| `E2E-03` | Admin publishes conditional TYPE → requester wizard toggles dependency → submits | Shared condition semantics; missing required and hidden-field bypass rejected |
| `E2E-04` | Reviewer Return → Requester edits pinned type → admin publishes policy change → Resubmit | New cycle uses current policy; old form and historical revisions persist |
| `E2E-05` | Two-stage stage 1 approval → stage 2 parallel ALL vote → finish | WAITING → ACTIONABLE activation; 1-of-2 still PENDING; 2-of-2 APPROVED |
| `E2E-06` | Owner withdraws pending while reviewer has stale dialog open | WITHDRAWN, reviewer gets conflict, no late decision |
| `E2E-07` | Reviewer delegation + Admin reassignment → stale tabs and authoritative refresh | Slot/version/deadline preserved; appropriate actor is eligible; old authority denied |
| `E2E-08` | Admin type/policy drafts → preview → publish; invalid third stage | New versions immutable; invalid config visible and unpublishable |
| `E2E-09` | Reviewer selects mixed tasks → bulk action → inspect failures/retries | Per-task result visible; only authorized tasks changed |
| `E2E-10` | Public register → one-time recovery codes → admin assigns dept → reset and login | Requester-only initially; trusted membership required; code one-use; sessions revoked |
| `E2E-11` | Stage activates Friday afternoon → job repeats Monday → admin escalation queue → reassign | Correct business dueAt, deduplicated admin notice, no auto-reassignment, safe minimal list |
| `E2E-12` | Owner uploads file/comments, another actor attempts download, owner exports report | Private binary protected, discussion not decision, report/PDF scope matches UI |
| `E2E-13` | Full desktop, tablet and mobile primary journeys | Navigation, wizard, detail tabs, review confirmation, mobile cards and keyboard focus work |
| `E2E-14` | First visit dark and Thai browser preferences → manual overrides → reload | OS theme defaults, browser language defaults, persisted overrides and accessible semantic chips |
| `E2E-15` | Logout/account switch mid-fetch/poll, review stale data and errors | Previous user records/tokens/notifications removed, pending responses ignored, safe login navigation |

### 7.3 UI acceptance traceability (frozen `UI-AC-01`–`UI-AC-20`)

| UI acceptance | Primary runnable tests |
|---|---|
| `UI-AC-01` | All `FT-001`–`FT-054`, `UI-01`–`UI-24` |
| `UI-AC-02` | `UI-01`, `UI-20`, `SEC-06`, `SEC-07`, `SEC-14`, `E2E-10` |
| `UI-AC-03` | `UT-03`–`UT-05`, `UI-05`–`UI-08`, `E2E-03` |
| `UI-AC-04` | `UT-02`, `UI-09`–`UI-11`, `E2E-05` |
| `UI-AC-05` | `UI-08`–`UI-10`, `UI-20`, `SEC-01`–`SEC-05`, `E2E-15` |
| `UI-AC-06` | `CX-05`–`CX-06`, `UI-11`, `UI-14`–`UI-15`, `E2E-07`, `E2E-09` |
| `UI-AC-07` | `UI-02`–`UI-04`, `UI-16`, `UI-21`–`UI-24`, `OPS-05`, `OPS-06`, `E2E-13`, `E2E-14` |
| `UI-AC-08` | `FT-018`, `FT-050`, `SEC-10`, `UI-19`, `E2E-12` |
| `UI-AC-09` | `CT-01`–`CT-04`, `API-01`–`API-12`, `UI-09`, `UI-20` |
| `UI-AC-10` | `UI-20`, `SEC-16`, `E2E-15` |
| `UI-AC-11` | `UI-03`, `E2E-14` |
| `UI-AC-12` | `UI-04`, `UI-24`, `E2E-14` |
| `UI-AC-13` | `UI-05`–`UI-08`, `FT-019`, `FT-020`, `E2E-01`, `E2E-04` |
| `UI-AC-14` | `UI-09`, `SEC-08`, `E2E-04` |
| `UI-AC-15` | `UI-12`, `UT-04`, `E2E-08` |
| `UI-AC-16` | `UI-10`, `FT-009`, `FT-010`, `FT-017`, `E2E-02` |
| `UI-AC-17` | `UI-16`, `FT-037`–`FT-039`, `E2E-13` |
| `UI-AC-18` | `UI-17`, `SEC-10`, `E2E-15` |
| `UI-AC-19` | `UI-15`, `SEC-04`, `SEC-12`, `E2E-11` |
| `UI-AC-20` | `UI-02`–`UI-04`, `UI-21`–`UI-24`, `E2E-14` |


### 7.4 Operations, localization, accessibility and performance checks

| ID | Exercise | Expected result |
|---|---|---|
| `OPS-01` | Fake clock advance Friday 16:00 → Monday 09:00 → 10:00 Bangkok for 120-minute SLA | Deadline Monday 10:00 local; not overdue just before dueAt; overdue at boundary, no weekend accrual |
| `OPS-02` | Activate second stage after stage-one ALL completion | Stage-two deadline calculated at activation (not original submission); WAITING task not overdue |
| `OPS-03` | Reassign/delegate a task with established dueAt | dueAt stable; reminders honor current eligible reviewer and task terminal status |
| `OPS-04` | Invoke trusted SLA job repeatedly or concurrently; restart between runs | Durable idempotent notifications and administrator escalation; no auto-assignment or auto-decision |
| `OPS-05` | Switch en/th and dark/light across every critical screen and a configured field lacking Thai label | Complete localized UX with documented English fallback and legible semantic states |
| `OPS-06` | Automated accessibility checks plus manual keyboard navigation (wizard, dialogs, tabs, mobile cards) | Named controls, focus indication/return, no inaccessible blocking motion; reduced-motion respected |
| `OPS-07` | Performance smoke on seeded request/review/report collections with recorded hardware and DB size | Compare measured p95 to the **adjustable** Q-01 target; no unbounded query amplification |
| `OPS-08` | Stop network/storage/database during safe and critical mutations | Clear recovery errors, no partially accepted business effect, no leaked private bytes or credentials |

## 8. Non-functional, release and coverage gates

### 8.1 Invariants that must pass (not adjustable)

- Every protected API group has relevant anonymous/forbidden-role/foreign-object tests. Confidential private-object not-found responses do not reveal existence.
- Every accepted formal decision, submit and resubmit passes transaction atomicity; no duplicate effective slot vote or orphan cycle under retries/races.
- Every selected `FR-001`–`FR-054` has at least one passing feature acceptance case (`FT-*`) and linked `AC-*`, plus relevant negative cases.
- All 12 product integration scenarios `S-01`–`S-12` and 20 UI acceptance criteria `UI-AC-01`–`UI-AC-20` have executed evidence.
- All 75 versioned route/method entries in §4 have contract-test coverage (positive and applicable negative), plus `API-01`–`API-12`, public version discovery and trusted internal job route.
- Secrets are never exposed through HTML/JSON/logging/storage, beyond strictly one-time issuance contracts. Token rotation/revocation, recovery-code single use and role changes are verified against real persistence.
- Business time, cycle/revision pinning, original-or-delegate first-vote-wins, admin minimal escalation search and report/export/file privacy are verified against authoritative database/API behavior.
- Mandatory desktop/mobile and keyboard interaction paths remain usable, with no data from the previous account on screen after session change.

### 8.2 Adjustable quality targets — implementation defaults, not frozen product requirements

| ID | Proposed target | Evidence |
|---|---|---|
| `Q-01` | Typical list/detail p95 < 1,000 ms under **documented** seeded load/environment | Scripted timed smoke; record DB size, concurrency, hardware and date |
| `Q-02` | Browser checks at 390×844, 820×1180 and 1440×900 | Captured snapshots and keyboard walkthrough |
| `Q-03` | 100% protected route groups tested for anonymous, forbidden and owner isolation where applicable | Route coverage audit |
| `Q-04` | One effective vote per approval slot under competing requests | Race harness DB count and response trace |
| `Q-05` | Zero partially committed status/audit changes under injected failure | DB transaction rollback evidence |
| `Q-06` | All high/critical known defects closed before release | Issue/defect ledger |

These numeric targets may be revised with justification; **security, permission, approval and data-integrity invariants cannot be relaxed**.

### 8.3 Sprint-level execution boundaries

| Sprint | New feature acceptance IDs | Regression obligations |
|---|---|---|
| Sprint 1 | `FT-001`–`FT-016` | Auth, role scope, submission, approval/reject, states, history, atomic persistence, request number |
| Sprint 2 | `FT-017`–`FT-036` | Full Sprint 1 replay, new form/policy/revision, stage/parallel/amount/routing unit + DB tests |
| Sprint 3 | `FT-037`–`FT-054` | Full Sprint 1+2 replay, security/operational/UI smoke, entire cross-feature E2E suite |

Features may share test harnesses, but none may be counted complete based solely on a shared service's existence. The Sprint 3 work on account self-registration and reviewer delegation also requires targeted regression of existing authentication and task access.

### 8.4 Recommended test execution order

1. Migration/fixtures and shared contract Zod tests.
2. Pure domain/business-rule unit tests.
3. HTTP route smoke and auth/ownership tests.
4. Real PostgreSQL transaction, concurrency and failure-injection tests.
5. Component tests (wizard, conditional fields, dialogs, tables, localization).
6. Playwright full-stack journeys with authentic roles, storage and server.
7. Security, scheduler, accessibility/responsiveness and optional performance smoke.
8. Final rerun of all regression suites against the same committed build and migrations proposed for release.

**Suggested script names (not guaranteed to exist until implemented):** `bun test`, `bun run test:contracts`, `bun run test:integration`, `bun run test:e2e` and `bun run test:all`. Document actual scripts in package manifests when created; do not claim they currently run.

## 9. Evidence, test case record and defect workflow

### 9.1 Test record format

Every executed test report records:

| Field | Required content |
|---|---|
| `testId` | One of `FT-*`, `UT-*`, `CT-*`, `DB-*`, `CX-*`, `API-*`, `SEC-*`, `UI-*`, `E2E-*`, `OPS-*`, `EP-*` |
| `featureId / FR / BR / AC` | Traceable contract identifiers where applicable |
| `environment` | OS, Bun/Node/test-runner/browser version, PostgreSQL version, object-store adapter |
| `build` | Commit SHA and optional release tag |
| `fixture` | Seed revision, role, request type/policy version, clock instant |
| `operation` | Input, actor, endpoint/page, idempotency identity when relevant |
| `expected / actual` | Response status/body, DB effects, UI states, or visible assertion |
| `result` | `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` or `SKIPPED` (reason required for blocked/skipped) |
| `evidence` | CI run/log, screenshot/video, DB verification output or trace URL/path |
| `defect` | Linked issue ID for each failure, severity, reproducibility and retest result |

All entries in this document are **planned**; real results are captured when test runs occur. Do not prefill `PASS` or fabricate a run timestamp, screenshots or coverage percentage. **Redact all raw recovery codes, one-time admin reset grants, cookies, JWTs, passwords and private document contents in test artifacts and screenshots.**

### 9.2 Defect workflow and severity

- **Critical:** unauthorized private data access, self-approval, duplicate conflicting decisions, loss/corruption of request/recovery secrets, broken session revocation, partial committed state/audit.
- **High:** missing selected workflow, repeated 500 on a critical journey, valid reviewer unable to act, revision/policy mismatch, wrong report scope, insecure file download.
- **Medium:** recoverable list/filter/UI error, misleading badge, moderate usability failure with a workaround.
- **Low:** cosmetic inconsistencies not affecting contract semantics.

For each failure: reproduce with seed/steps, expected/actual and request ID → create issue → fix in reviewed branch → rerun failing test → run adjacent regression → record actual commit and outcomes. Do not mark a test accepted while a related critical/high defect is open.

### 9.3 Product Definition of Tested/Accepted

A selected feature is **verified** only when its frozen `FR`, `AC`, domain/HTTP/DB/UI/privacy assertions and important edge cases have actual, recorded, passing evidence at the proposed release commit. Formal end-to-end workflow acceptance requires both browser-observable behavior and authoritative backend persistence evidence. This file alone is **not** evidence that the application passes.

## 10. Cross-document consistency and known contract boundary notes

- **API naming:** `/api/v1/auth/*` is frozen; do not substitute the reference application's longer authentication route. UI routes such as `/auth/login` are client-side navigation and are not the same as API URLs.
- **Identifiers and pagination:** Public resource IDs are UUID strings; requestNumber is a separate human label; `POST /search` returns direct arrays and `X-Pagination`. Sorting is server-authorized.
- **Dynamic forms:** UI hides and omits inactive values; API intentionally **rejects** submitted hidden keys. Submitted revisions pin their form definition; new cycles use current approval policy.
- **Reviewer privacy:** Former reviewers may inspect only a previously handled revision/decision context; Admin routing metadata alone never implies current request detail or decision authority.
- **SLA:** First slot's deadline starts when its stage becomes actionable; future WAITING stage has no overdue status until activation. Reminders/escalations do not reassign automatically.
- **Status/theme:** Minimal Tailwind black/white surfaces; color is allowed for semantic statuses. Theme follows system initially; language follows browser initially; manual overrides persist.
- **Source precedence:** No test asserts an unrelated reference application's design or feature behavior. Only the three frozen CPE334 specifications are normative.
- **In-document data correction:** For a Friday 16:00 start with a **120-business-minute** SLA (60 minutes Friday + 60 minutes Monday), the expected due time is **Monday 10:00 Asia/Bangkok**. This concrete example is used throughout tests.

**Remaining test harness implementation details (adjustable):** exact CI pipeline, isolated test DB lifecycle, package scripts, fake-clock library, object-store test adapter, screenshot naming, contrast tooling and performance smoke environment. No additional product/API/UI decisions are required to author this test specification.
