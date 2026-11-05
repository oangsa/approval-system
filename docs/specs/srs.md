# CPE334 Theme 5 — Software Requirements Specification (SRS)

**Document:** `srs.md`  
**Document version:** 1.0.0 — requirements baseline derived from frozen product specification  
**Status:** Baseline documentation; implementation and test execution **not asserted**  
**Authoritative source:** [`specifications.md`](./specifications.md), product baseline v1.0  
**Related contracts:** [`api-specs.md`](./api-specs.md) v1.0.1; [`ui-specs.md`](./ui-specs.md) v1.0; [`test.md`](./test.md)

> **Requirements authority:** All FR, BR, NFR, AC and product decisions below are reproduced from the existing frozen product specification. Their identifiers, meaning and acceptance tests are not redefined by this file. If the underlying frozen specifications change through approved change control, update this SRS and its traceability concurrently. Proposed system-design choices belong to [`system-sds.md`](./system-sds.md), not to this SRS.

> **D-01 — approved engineering amendment (2026-11-05):** [Owner decision, Issue #1](https://github.com/oangsa/approval-system/issues/1) replaces the earlier Bun runtime/toolchain with Node.js 24, npm Workspaces, one root `package-lock.json`, Elysia through `@elysia/node`, TypeScript, Vitest for unit/API/contract/real-PostgreSQL integration tests, and Playwright for browser E2E. React Router 7, shadcn/ui + Tailwind CSS, PostgreSQL + Drizzle ORM and shared Zod contracts remain. This amendment changes no feature scope, FR/BR/AC/test identifiers, product/API/UI behavior, ownership or effort estimates; baseline contract versions remain unchanged. It records engineering alignment only, not implementation or passing verification.

## 1. Purpose and Audience

### 1.1 Purpose

Specify **what** the Workflow and Approval System shall do, under which permissions, state transitions and constraints, and how its requirements are to be verified. This is the human-readable requirements baseline for the two-developer project; it is **not** an account of features already implemented.

### 1.2 Intended readers

- Stakeholders and reviewers validating product behavior and scope.
- Both developers implementing and reviewing cross-cutting domain rules.
- Test authors mapping requirements to executable cases and objective evidence.

### 1.3 Conformance vocabulary

- **Shall** / **must**: binding behavior inherited from the frozen contract.
- **Must not**: prohibited behavior.
- **Implementation default / proposed**: adjustable technical choice, not a new product obligation.
- An AC indicates **expected behavior**, not a passing test run.

### 1.4 Source precedence

1. Frozen CPE334 Theme 5 product baseline and approved revisions.
2. [`specifications.md`](./specifications.md) for FR, BR, NFR, AC and behavior.
3. [`api-specs.md`](./api-specs.md) for API wire behavior, auth, errors and DTOs.
4. [`ui-specs.md`](./ui-specs.md) for UI behavior and presentation.
5. [`test.md`](./test.md) for verification plans and identifiers.

This SRS is a structured requirements view of these materials, not a separate source of contradictory requirements.

## 2. Product Description

### 2.1 Business problem and objectives

A single organization with multiple departments needs controlled requests, reviewer decisions, status visibility, immutable history and basic reporting. Administrators configure bounded request forms, trusted department memberships, reviewer mappings and approval policies. Requesters and reviewers must not gain information or authority beyond their actual resource permissions.

### 2.2 Supported actors and access boundaries

| Actor             | Required capabilities                                                                                                 | Constraints                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Public visitor    | Register, log in and start verified recovery                                                                          | No access to protected data; registration confers Requester only                                   |
| Requester         | Create, save, submit, edit returned revisions, withdraw and view own request history                                  | Cannot review own request or access others' private records                                        |
| Reviewer          | View own current/delegated approval tasks and necessary request context; decide if eligible                           | No unassigned task decisions; historical access is restricted to handled revision/decision context |
| Administrator     | Configure users, departments, request types, policies, reviewer assignments, budget ceilings, and escalation handling | No automatic right to inspect all confidential request details; no automatic approval authority    |
| Trusted scheduler | Process due reminders and escalations                                                                                 | Authenticated machine identity; does not autonomously approve or reassign                          |

A user may hold several roles; permissions are decided for each operation and record. An administrator may also be a reviewer only when explicitly eligible under ordinary review rules.

### 2.3 Operating environment and dependencies

- Browser application supporting desktop, tablet and mobile, in Thai and English, light and dark modes.
- React Router 7/TypeScript web application, Node.js 24/Elysia (`@elysia/node`) backend, PostgreSQL/Drizzle persistence, shared Zod contracts.
- Authenticated HTTP/JSON API, private binary object storage, independent scheduled processing.
- Server stores authoritative UTC timestamps; business time is calculated for Monday–Friday 09:00–17:00 in `Asia/Bangkok`.
- Public identifiers are opaque UUIDs; any human-readable request number is distinct from identity.

### 2.4 Included product scope

- Email/password authentication and rotating sessions; Requester signup and recovery codes with audited administrator-assisted reset.
- Administrator-configurable versioned request types; conditional visibility/requiredness; drafts, submissions, line items, priorities and revisions.
- A maximum of two sequential approval stages, parallel **ALL** votes, conditional routing, reassignment, delegation, bulk decisions and audit history.
- Trusted department membership, policy monetary ceilings, per-stage SLA, reminders and administrator escalation.
- Comments, private attachments, notifications, role dashboards, filtering, reporting and authorized PDF export.
- Minimal responsive Tailwind/shadcn UI with meaningful semantic status colors and an optional motion layer.

### 2.5 Excluded scope

OAuth and third-party social sign-in; multi-tenant organizations; verified-email requirement; payment settlement; a financial balance ledger; visual drag-and-drop workflow designer; arbitrary scripts/SQL; email notification campaigns and email-based password reset; CSV export; specialized analytics dashboards; revision-diff editor; holiday calendar; automatic SLA reassignment or approval.

## 3. Key User Journeys and Dependencies

| Journey                           | Preconditions                                                                              | Observable result                                                                       | Acceptance coverage                 |
| --------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------- |
| Authenticated request             | Active Requester, admin-assigned department, published request type and eligible reviewers | One persisted `PENDING` request, submitted revision, approval cycle and audit           | `AC-001`–`AC-016`, `S-01`–`S-03`    |
| Parallel staged review            | Published one-/two-stage policy and valid review slots                                     | Each effective vote recorded once; stage advances only after all required slots         | `AC-025`, `AC-032`, `S-04`          |
| Returned correction               | Request previously submitted, authorized reviewer returns with reason                      | Pin form version, edit new working revision, resubmit under current policy as new cycle | `AC-017`, `AC-020`–`AC-022`, `S-05` |
| Configurable form                 | Administrator has draft type metadata                                                      | Valid conditional definition publishes; invalid cycles/hidden keys fail                 | `AC-033`, `S-06`–`S-07`             |
| Staff routing and deadline        | Valid slots, role mapping and stage policy                                                 | Reassign/delegate without duplicate votes or deadline reset; SLA escalates to admin     | `AC-044`–`AC-048`, `S-09`, `S-11`   |
| Account recovery                  | Recovery codes or independently verified assisted reset                                    | Single-use reset; sessions revoked; audit available                                     | `AC-053`–`AC-054`, `S-10`           |
| Confidential collaboration/report | Entitled request participant                                                               | Permitted comments/files, visible lists/reports/PDF/inbox, no foreign private data      | `AC-037`–`AC-043`, `AC-050`, `S-12` |

**Scope sequencing:** Sprint 1 establishes the authenticated vertical slice; Sprint 2 extends request/policy/revision behavior; Sprint 3 adds operational and presentation capabilities. Feature IDs are assigned exactly once. This is a planning allocation, not evidence of implementation.

## 4. Functional Requirements

Each **FR** maps to exactly one selected feature for baseline accounting; several FRs may share a backend use case or UI component. The IDs remain stable once adopted. Requirements describe outcomes, not route names or widget styling.

### 4.1 Sprint 1 functional requirements (16)

- **FR-001 [M01]** The application shall authenticate an eligible active user using their registered email and application password; invalid credentials shall not create a session.
- **FR-002 [M02]** The authenticated user shall retrieve their own identity and roles and shall log out with server-side session revocation.
- **FR-003 [M03]** Every protected operation shall enforce authenticated identity, role, record ownership, and operation-specific permission on the backend.
- **FR-004 [M04]** An authorized requester shall create and submit a validated request using an active request type and obtain a persisted approval cycle.
- **FR-005 [M05]** A requester shall list only requests they own.
- **FR-006 [M06]** An authorized participant shall inspect a request and its authoritative current status without receiving inaccessible private fields.
- **FR-007 [M07]** The system shall resolve one or more eligible assigned reviewer slots for each required approval stage before accepting submission.
- **FR-008 [M08]** A reviewer shall see an actionable queue limited to currently assigned or validly delegated approval tasks.
- **FR-009 [M09]** A currently authorized reviewer shall approve an actionable slot, advancing the request only when the applicable stage policy is satisfied.
- **FR-010 [M10]** A currently authorized reviewer shall reject an actionable slot with a required reason, terminating the active approval cycle.
- **FR-011 [M12]** The system shall accept only explicitly permitted request, approval-stage, and approval-task state transitions.
- **FR-012 [M13]** No participant shall formally approve their own request through any role, assignment, delegation, or bulk-action path.
- **FR-013 [M14]** The application shall persist immutable decision and lifecycle history with the authenticated actor and relevant request, cycle, and revision.
- **FR-014 [M15]** The system shall enforce state-dependent request editing: current submitted revisions are immutable, and only eligible working drafts or returned revisions are editable.
- **FR-015 [M17]** Submission, decisions, and all required effects shall be validated and durably persisted atomically where business consistency requires it.
- **FR-016 [R06]** Each submitted request shall receive a unique backend-generated, immutable, human-readable tracking number.

### 4.2 Sprint 2 functional requirements (20)

- **FR-017 [M11]** An authorized reviewer shall return a pending request with a required correction reason, closing that approval cycle.
- **FR-018 [M16]** Authorized users shall view basic counts and approval outcomes for only the records they are permitted to inspect.
- **FR-019 [R01]** A requester shall save and reopen an incomplete request draft without starting approval.
- **FR-020 [R02]** A requester shall edit their own returned request against its pinned form-definition version.
- **FR-021 [R03]** A requester shall resubmit a valid returned revision into a fresh approval cycle with newly resolved current approval policies.
- **FR-022 [R04]** The system shall retain all submitted request revisions as immutable historical snapshots.
- **FR-023 [R05]** A requester shall withdraw their pending request, making outstanding tasks non-actionable and preserving audit history.
- **FR-024 [R07]** When enabled for a request type, the form shall support multiple item rows with server-calculated exact monetary totals.
- **FR-025 [R08]** Approval policies shall support a maximum of two ordered sequential stages.
- **FR-026 [R09]** The system shall choose bounded conditional approval policies based on approved request type, department, and monetary attributes.
- **FR-027 [R10]** Authorized participants shall see the current actionable stage and appropriately disclosed current reviewers.
- **FR-028 [R11]** Each decision shall be bound to one approval slot, cycle, and submitted revision; decisions from previous cycles shall never be reused.
- **FR-029 [R15]** The application shall provide role-specific dashboards displaying only authorized request or task summaries.
- **FR-030 [R16]** Authorized users shall view a chronological status/decision timeline derived from persisted history.
- **FR-031 [O10]** Authorized administrators shall manage reviewer assignment configurations without granting implicit access to private request content.
- **FR-032 [O13]** A stage shall support multiple required parallel slots and shall complete successfully only after every required slot approves.
- **FR-033 [O16]** Authorized administrators shall create, publish, version, and disable metadata-driven request types with bounded conditional fields and server validation.
- **FR-034 [O17]** Requesters shall set a supported priority on eligible requests; the system shall persist and display it consistently.
- **FR-035 [O18]** The backend shall enforce configurable amount ceilings and monetary approval thresholds without tracking fund balances.
- **FR-036 [O19]** Reviewer routing shall resolve assignments through approved department-based configuration.

### 4.3 Sprint 3 functional requirements (18)

- **FR-037 [R12]** Authorized users shall search permitted request collections by request number and title.
- **FR-038 [R13]** Authorized lists shall filter by status and permitted date ranges.
- **FR-039 [R14]** Authorized lists shall support deterministic sorting and bounded server-side pagination.
- **FR-040 [R17]** The user interface shall implement consistent responsive, keyboard-accessible, loading, empty, validation, and error states.
- **FR-041 [O01]** Authorized request participants shall add and read persistent comments distinct from formal approval decisions.
- **FR-042 [O02]** Authorized participants shall upload and retrieve request attachments from private storage under backend access checks.
- **FR-043 [O03]** The system shall create a persistent in-app notification inbox for supported request, assignment, and deadline events.
- **FR-044 [O07]** Authorized administrators shall reassign an actionable approval slot to an eligible reviewer, preserving the slot, history, and deadline.
- **FR-045 [O08]** An eligible reviewer shall create and revoke a bounded time-limited delegation to an eligible reviewer on the same approval slot.
- **FR-046 [O09]** Authorized administrators shall manage user accounts, active state, role assignments, and trusted department membership.
- **FR-047 [O11]** Approval tasks shall have due dates calculated using the frozen Bangkok business-time calendar.
- **FR-048 [O12]** A retry-safe scheduled process shall remind relevant users and escalate overdue tasks to administrators without automatic reassignment.
- **FR-049 [O15]** Eligible reviewers shall perform bulk decisions with independent per-task authorization and per-item outcomes.
- **FR-050 [O21]** An authorized user shall export permitted report data as PDF with the same row-level visibility and filters as on-screen reporting.
- **FR-051 [O24]** The application shall support light and dark themes with consistent visual state meaning.
- **FR-052 [O25]** The application shall support Thai and English labels, navigation, feedback, and configured-field localization/fallback.
- **FR-053 [O26]** Public users shall self-register with email and application password, receiving only the Requester role pending administrator-assigned department.
- **FR-054 [O27]** The system shall support single-use hashed recovery codes and audited administrator-assisted password reset when all codes are lost.

## 5. Business Rules

Business Rules express domain invariants and required restrictions. The future API contract shall provide the exact HTTP behavior and the UI contract shall provide feedback and navigation states. Both must preserve these rules.

### 5.1 Identity, roles, sessions and recovery

- **BR-001** Only authenticated active users may access protected business endpoints; a public login or registration route does not confer access to other users’ data.
- **BR-002** Access JWTs shall be short-lived; refresh tokens shall rotate as single-use credentials in HttpOnly cookies and be hashed in persistent storage.
- **BR-003** Disabled accounts and revoked refresh sessions shall be denied according to backend session-validity rules; access control shall not trust a frontend-selected role or requester ID.
- **BR-004** No user may grant themselves Reviewer or Administrator privileges or a trusted department membership through public registration.
- **BR-005** Public registration grants Requester only, without department authority; an administrator assigns department membership before departmental submission.
- **BR-006** A user may hold multiple roles; every decision path, including an Administrator acting as Reviewer, shall prohibit self-approval.
- **BR-007** Recovery codes shall be cryptographically random, shown only at issue/regeneration, stored as hashes, limited to one successful use, and protected by rate limiting.
- **BR-008** Consuming a valid recovery code and setting a replacement password shall revoke existing sessions atomically with recovery-code consumption.
- **BR-009** If all recovery codes are lost, an authorized administrator may initiate a one-time audited reset only after independently verifying the claimant outside the application.
- **BR-010** An administrator shall never read an existing password or recovery code; administrative identity operations do not implicitly authorize private request content access.
- **BR-011** Cookie-authenticated endpoints shall enforce appropriate CSRF/origin defenses, and production session cookies shall use Secure/HttpOnly protections.
- **BR-012** Email is a login identifier, not verified ownership unless independently checked; administrative identity proofing must not infer ownership from an unverified email string.

### 5.2 Configurable request definitions and field semantics

- **BR-013** The system shall support administrator-created request types with stable identity, enable/disable state, and separately published immutable versions.
- **BR-014** The supported bounded field vocabulary is short text, long text, decimal number, date, single-select and boolean.
- **BR-015** Visibility and requiredness may depend on the value of other fields in the same form; administrators cannot inject scripts or arbitrary SQL.
- **BR-016** Invalid or cyclic field dependencies, unknown option references, or conflicting field metadata shall prevent a configuration version from being published.
- **BR-017** The server shall evaluate visibility, requiredness, types, lengths, ranges and options against the relevant published definition; client validation is advisory.
- **BR-018** Hidden or nonapplicable field values shall not influence monetary totals or reviewer routing; the API shall handle malicious/stale nonapplicable values according to a documented error contract.
- **BR-019** Every submitted request revision shall permanently reference the request-type definition version used for its validation.
- **BR-020** Returned requests remain editable under their originally pinned type version even if newer versions exist; disabling the type shall not destroy historical revisions.
- **BR-021** New requests use the latest enabled published form version; new review cycles resolve a current approval-policy version separately.
- **BR-022** No drag-and-drop visual workflow designer or unrestricted programmable rules engine is implied by configurable forms.

### 5.3 Request lifecycle, ownership, amounts and editing

- **BR-023** Each request belongs to an authenticated requester and one administrator-assigned primary department at submission time.
- **BR-024** Submission shall validate required type-specific values, approved department membership, authoritative amounts, applicable policy limits and complete reviewer eligibility before committing.
- **BR-025** When no eligible reviewer exists for any required slot, submission shall fail with a clear configuration error and shall not create a PENDING request or partial approval cycle.
- **BR-026** Persisted drafts may be incomplete, but a draft is not pending approval; the first accepted submission creates the initial immutable submitted revision.
- **BR-027** An existing submitted revision shall never be edited in place; a returned request is edited using a new working revision under the pinned form definition.
- **BR-028** Only eligible request owners may submit/resubmit their drafts or returned work, or withdraw their own pending requests.
- **BR-029** Withdrawn, rejected and approved requests are terminal in the frozen lifecycle; terminal mutations shall fail safely.
- **BR-030** Official request numbers shall be generated server-side, unique under concurrency, and immutable after first successful submission.
- **BR-031** Applicable line items use positive quantities and exact decimal monetary arithmetic; backend-computed totals take precedence over any client-calculated display values.
- **BR-032** Priority shall use a bounded validated vocabulary; a user-provided priority does not override reviewer assignment or authorization.
- **BR-033** Every request creation, accepted transition and revision submission shall retain a durable historical record linked to its actor and time.
- **BR-034** Failed validation shall preserve the prior durable request state and shall not leave an orphaned approval stage or decision.

### 5.4 Approval configuration, state, voting and concurrency

- **BR-035** An approval policy may contain one or two sequential stages; a third stage is rejected when policy configuration is validated.
- **BR-036** Each stage shall contain at least one required approval slot and may contain multiple parallel required slots.
- **BR-037** Parallel stage policy is ALL: every required slot must approve before its stage completes; an intermediate stage cannot prematurely finalize the request.
- **BR-038** An authorized rejection terminates the active approval cycle as REJECTED; an authorized return with required reason terminates it as RETURNED.
- **BR-039** Approving the final required slot of the final stage terminates the request as APPROVED; earlier approvals leave it PENDING.
- **BR-040** Each decision must reference the currently actionable task/slot, submitted revision and active approval cycle.
- **BR-041** A pending task is actionable only while its stage is active, its cycle remains pending, and the user has current assignment or valid delegation authority.
- **BR-042** Formal decisions are immutable, and each approval slot may have at most one effective decision.
- **BR-043** Only a current eligible reviewer can approve, reject, or return; a requester cannot execute reviewer operations solely by possessing a token or knowing a task ID.
- **BR-044** On an active cycle terminal decision or withdrawal, all remaining unfinished tasks become non-actionable.
- **BR-045** Assignments and policy versions applicable to a submission are snapshotted into its approval cycle; historical decisions retain their original actors and context.
- **BR-046** Application and database operations shall prevent simultaneous approvals/rejections from producing inconsistent terminal states or duplicate effective votes.
- **BR-047** Critical decision retries shall not execute a second business effect or append a duplicate effective audit event.
- **BR-048** If a reviewer assignment is missing/invalidated after an accepted submission, the system shall not silently authorize a replacement; it requires an authorized corrective assignment and audit.
- **BR-049** Reassignment replaces the owner of an existing pending approval slot, preserves the slot and deadline, revokes the old assignment authority and records the change.
- **BR-050** A valid time-limited delegation grants an alternate eligible reviewer authority on an existing slot, not a second vote; the original slot remains single-decision.
- **BR-051** Delegation is effective only within its approved time window/scope; it cannot override requester self-approval, disabled account, or invalid-stage rules.
- **BR-052** Bulk approval shall call the same single-decision invariant for each item, independently authorize it, and report individual success/failure.
- **BR-053** One decision and required changes to approval status/history shall either commit together or roll back together.
- **BR-054** No administrative role grants universal read access to confidential request content; administrative assignment screens expose minimum metadata needed.

### 5.5 Revision history, comments and attachments

- **BR-055** Return closes the existing cycle; resubmission creates a new cycle with newly resolved current approval policies, without carrying forward old approvals.
- **BR-056** Resubmission shall use the original pinned request-type form version and preserve all earlier submitted values, decisions, cycles and history.
- **BR-057** Accepted transitions and assignment/delegation/policy changes shall create append-only audit events identifying actor, target, time, and relevant revision/cycle.
- **BR-058** Comments are persistent business discussion, not formal approvals, and shall never modify status by themselves.
- **BR-059** Each file attachment shall be associated with a permitted request and relevant revision; submitted document evidence shall remain historically attributable.
- **BR-060** File binaries shall reside in private object storage, not public permanent links; upload and every download enforce resource authorization, file-type/size validation and safe metadata.
- **BR-061** A requester may not gain access to another request’s private comments or attachments by altering identifiers or pagination/search arguments.

### 5.6 SLA, notifications, user experience and reporting

- **BR-062** The SLA business calendar is Monday through Friday, 09:00–17:00 Asia/Bangkok; weekends and out-of-hours time do not accrue; no holiday calendar is defined.
- **BR-063** An approval slot SLA begins when its stage becomes actionable; reassignment and delegation do not restart or extend its deadline.
- **BR-064** Completed, rejected, returned or withdrawn approval tasks shall not continue receiving pending-task overdue reminders.
- **BR-065** The scheduled reminder/escalation mechanism shall remain functional independently of a browser session or continuously running web-server timer.
- **BR-066** Overdue escalation notifies authorized administrators; it does not automatically reassign or approve/reject a pending task.
- **BR-067** Persistent notifications belong to authorized recipients and support read/unread states; scheduler retries shall not duplicate logical notifications.
- **BR-068** Search, filters, pagination, dashboard summaries, reports, and PDFs shall be scoped to the authenticated user’s permitted resources on the backend.
- **BR-069** Sort/filter/page fields shall be allowlisted, bounded, and deterministic; arbitrary client database-field access is not permitted.
- **BR-070** Thai and English UI and administrator-configured field names shall have documented language labels/fallback to avoid unlabeled controls.
- **BR-071** Theme and status communication shall remain understandable without reliance on color alone, and critical flows shall be keyboard accessible.
- **BR-072** The backend shall return safe errors without stack traces, raw SQL, secrets, or existence information about another user’s protected resources.
- **BR-073** All user-facing actions shall provide defined busy, validation, empty/no-results, forbidden, not-found, conflict and recoverable error behavior.

## 6. Request and Approval State Contract

### 6.1 Primary request states

| State       | Description                                              | Editable by requester?         |
| ----------- | -------------------------------------------------------- | ------------------------------ |
| `DRAFT`     | Incomplete or unsubmitted working request                | Yes (owner)                    |
| `PENDING`   | Active approval cycle waiting for decisions              | No                             |
| `RETURNED`  | Prior cycle closed; requester may prepare a new revision | Yes, in a new working revision |
| `APPROVED`  | Final required slot of final stage approved              | No (terminal)                  |
| `REJECTED`  | Authorized review rejection                              | No (terminal)                  |
| `WITHDRAWN` | Owner withdrew pending request                           | No (terminal)                  |

### 6.2 Permitted transitions

| Current state | Actor / action                            | New state   | Guard and mandatory effects                                                                 |
| ------------- | ----------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `DRAFT`       | Owner submits                             | `PENDING`   | Full validation, department, eligible reviewer plan, new immutable revision/cycle and audit |
| `PENDING`     | Reviewer approves intermediate slot/stage | `PENDING`   | One effective slot decision, audit; activate next stage only after ALL votes                |
| `PENDING`     | Reviewer completes final stage            | `APPROVED`  | All required slots approved; write terminal decision and audit atomically                   |
| `PENDING`     | Reviewer rejects                          | `REJECTED`  | Required reason, terminate tasks and audit atomically                                       |
| `PENDING`     | Reviewer returns                          | `RETURNED`  | Required reason, terminate cycle, permit new working revision                               |
| `RETURNED`    | Owner resubmits                           | `PENDING`   | Use pinned form definition, current approval policy, fresh cycle and decisions              |
| `PENDING`     | Owner withdraws                           | `WITHDRAWN` | Cancel unfinished tasks, audit and preserve previous decisions                              |

Any other transition fails without changing business state. An invalid transition is **not** fixed by manipulating a frontend role selector or forcing a route.

### 6.3 Stage and approval slot model

- One request may have multiple historical approval cycles, but only one current active cycle.
- Each cycle contains one or two **ordered stages**. Only the current stage is actionable.
- Each stage has at least one required **approval slot**; multiple slots are decided in parallel and require **ALL** effective approvals to finish.
- Assignment is not a vote. Delegation does not add a slot. Reassignment replaces the eligible owner of a slot, without changing the historical decisions or deadline.
- Each effective decision references its stage, slot, cycle, revision, actor, and time.
- A rejection or return closes the cycle and makes all outstanding slots non-actionable.
- A decision racing with a rejection, return, withdrawal, or reassignment must be serializable to one coherent outcome; no stale actor gets a second effective decision.

### 6.4 Version boundaries

| Versioned concept            | What is pinned?                                                       | When resolved?                                                          |
| ---------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Request type/form definition | Submitted version and originally pinned definition for returned edits | First accepted submission; continues through returned revisions         |
| Approval policy              | Version associated with each **approval cycle**                       | Each submission / resubmission                                          |
| Approval assignments         | Eligible slots and assignees in each cycle                            | On cycle creation, then explicit auditable reassignment/delegation only |
| Request content              | Immutable snapshot for each submitted revision                        | Each submission / resubmission                                          |

These separate boundaries resolve the apparent tension between keeping the original form and applying the latest approval policy to a resubmission.

## 7. Data, Security and External Interface Requirements

### 7.1 Required business records

Users, roles, trusted departments, session/recovery credentials; versioned request-type definitions; drafts and immutable submitted revisions; approval policies, cycles, stages, slots and decisions; assignment/delegation/audit records; private attachment metadata; comments; notification and SLA event records; reports derived from authorized records. Physical table definitions and indexes are **design**, detailed in [`system-sds.md`](./system-sds.md).

### 7.2 Security and visibility invariants

- Identity comes from the authenticated backend session, not editable request fields or an arbitrary frontend role/owner selector.
- Confidential request data is visible only to its owner or currently authorized reviewer; former reviewers receive only their own historically handled context.
- Configuration-only administrators receive minimal routing/status metadata, not a universal request-detail viewer.
- Each binary upload/download is checked against the owning request and applicable revision permissions; file storage is private.
- Access/refresh credentials, recovery codes and admin recovery grants must not be exposed in logs, screenshots, general read DTOs or persistent plaintext storage.

### 7.3 External interfaces

- **Web/UI**: navigation, wizard forms, task decisions, configuration, accessibility, theme, language and feedback are specified by [`ui-specs.md`](./ui-specs.md).
- **HTTP API**: `/api/v1` conventions, auth under `/auth`, direct DTOs, `POST /search`, `X-Pagination`, errors, idempotency and machine identity are specified by [`api-specs.md`](./api-specs.md).
- **Storage**: private object storage accessed through authorized Elysia multipart upload and backend-authorized downloads.
- **Scheduler**: trusted authenticated server-to-server SLA processing, not client-side timers.

## 8. Non-Functional and Quality Requirements

### 8.1 Required qualitative invariants

- **NFR-001 Security:** Protected APIs enforce authenticated role and resource permissions; password, refresh and recovery secrets are never stored in plaintext.
- **NFR-002 Durable storage:** Accepted request, approval and audit changes remain durable across process restart or redeployment.
- **NFR-003 Atomicity:** A formal decision cannot commit without its required state and history effects.
- **NFR-004 Concurrency:** Competing decisions, form publication, assignment updates and request number allocation cannot create conflicting final data.
- **NFR-005 Validation:** Every public mutation validates static transport shape and appropriate dynamic/domain rules; invalid data cannot bypass the backend through direct HTTP calls.
- **NFR-006 Operational safety:** Refresh tokens, recovery codes, private downloads and scheduled jobs follow access control, replay/retry and rate-limiting policies.
- **NFR-007 Maintainability:** Business policies are independent from HTTP and ORM infrastructure, shared data contracts are centralized, and both team members can test/review features.
- **NFR-008 Usability/accessibility:** Core journeys are keyboard operable, convey meaning beyond color and recover safely from known errors.
- **NFR-009 Localization:** Critical workflows support Thai/English navigation and meaningful configured-field labels/fallback.
- **NFR-010 Traceability:** Every selected capability maps to an FR, AC, planned test and evidence of execution before it is marked accepted.

### 8.2 Proposed measurable verification targets — implementation defaults, not frozen product decisions

| Target ID | Proposed target                                                                                       | Verification approach                                               |
| --------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Q-01      | For defined seeded load, typical list/detail API p95 < 1,000 ms                                       | Timed integration/performance smoke with environment recorded       |
| Q-02      | Core UI usable at desktop, tablet and narrow mobile viewports                                         | Manual keyboard/responsive inspection and selected Playwright flows |
| Q-03      | 100% of protected API groups have anonymous + forbidden-role/ownership negative checks where relevant | Automated coverage audit                                            |
| Q-04      | No duplicate effective decision under competing requests or retries                                   | Real PostgreSQL concurrency tests                                   |
| Q-05      | No partial state/audit commit on injected transaction failure                                         | Fault-injection integration test                                    |

These quantitative targets are engineering proposals until adopted into feature contracts/STS. They may be tuned with documented reasons, never used to excuse security or data-integrity defects.

## 9. Acceptance Criteria

Each selected feature has a baseline observable AC. Feature-level contracts may subdivide one AC into multiple smaller criteria, but shall preserve coverage and link all planned/actual tests. **None of these criteria is marked executed merely by being written here.**

### 9.1 Sprint 1 acceptance criteria

- **AC-001** (`M01`, `FR-001`): Given an active seeded user, correct credentials yield a usable session; invalid credentials do not authenticate or reveal which credential was wrong.
- **AC-002** (`M02`, `FR-002`): The current-user endpoint reflects authenticated roles; logout invalidates the server refresh session and subsequent protected access is rejected according to the token-revocation policy.
- **AC-003** (`M03`, `FR-003`): An unauthenticated call, a forbidden role action, and cross-requester access are rejected by the API with no protected data leaked.
- **AC-004** (`M04`, `FR-004`): A valid seeded type and eligible reviewer allow submission and persisted retrieval; an invalid form or missing eligible reviewer leaves no pending request or partial approval plan.
- **AC-005** (`M05`, `FR-005`): Requester A sees own requests and cannot enumerate Requester B records by changing query or path parameters.
- **AC-006** (`M06`, `FR-006`): A permitted request detail contains current status and approved fields; inaccessible or missing records use safe unavailable behavior.
- **AC-007** (`M07`, `FR-007`): All required slots are resolved before commit; a self-only/inactive/missing reviewer configuration blocks submission with an actionable configuration error.
- **AC-008** (`M08`, `FR-008`): An assigned reviewer sees their currently actionable queue; a nonassigned reviewer does not gain access to another reviewer’s task.
- **AC-009** (`M09`, `FR-009`): One authorized approval writes one decision and history entry; a remaining required parallel slot or future stage prevents premature final approval.
- **AC-010** (`M10`, `FR-010`): A permitted rejection requires a nonblank reason, records a decision, ends the active cycle, and disables remaining tasks.
- **AC-011** (`M12`, `FR-011`): Invalid and repeated status changes are rejected without mutating the current state or creating audit entries for a nonexistent transition.
- **AC-012** (`M13`, `FR-012`): A requester with multiple roles cannot approve their own request, including with direct API calls or forged assignments.
- **AC-013** (`M14`, `FR-013`): After application restart, the authorized user can retrieve an audit trail accurately identifying each formal decision and state change.
- **AC-014** (`M15`, `FR-014`): Editing a submitted revision directly is rejected; eligible draft/returned editing follows the permitted state policy.
- **AC-015** (`M17`, `FR-015`): A forced failure between a formal decision and audit persistence leaves both uncommitted; replay/concurrency cannot produce conflicting final states.
- **AC-016** (`R06`, `FR-016`): Repeated and concurrent submissions result in distinct server-assigned immutable request numbers.

### 9.2 Sprint 2 acceptance criteria

- **AC-017** (`M11`, `FR-017`): Returning a pending request requires an authorized reviewer and a reason, terminates the cycle, and makes remaining review tasks non-actionable.
- **AC-018** (`M16`, `FR-018`): A report agrees with authoritative database records and excludes unauthorized requests, including when invoked directly by a different role.
- **AC-019** (`R01`, `FR-019`): An incomplete draft persists for its owner and is not visible in an assigned approval queue until submission.
- **AC-020** (`R02`, `FR-020`): A returned request is editable only by its owner and uses its originally pinned form-definition version despite a newer published version.
- **AC-021** (`R03`, `FR-021`): A valid resubmission creates a distinct approval cycle using current policy, while preserving old cycle history and retaining pinned form validation.
- **AC-022** (`R04`, `FR-022`): Earlier submitted field values and line items remain available as immutable snapshots after later revisions.
- **AC-023** (`R05`, `FR-023`): The owner can withdraw an eligible pending request; terminal and foreign requests reject withdrawal and do not mutate history.
- **AC-024** (`R07`, `FR-024`): Applicable request types accept multiple line items; negative quantities or mismatched client-supplied totals fail and the server computes exact amounts.
- **AC-025** (`R08`, `FR-025`): One- and two-stage policies execute in order, and a proposed third stage is rejected at configuration time.
- **AC-026** (`R09`, `FR-026`): Given different approved type/department/amount combinations, the system selects the correct versioned policy and rejects an unavailable route.
- **AC-027** (`R10`, `FR-027`): Eligible participants can identify the actionable stage and permitted assignee information without exposing unrelated reviewer queues.
- **AC-028** (`R11`, `FR-028`): A late decision referencing a previous revision or cycle is rejected; prior approvals do not count in a resubmitted cycle.
- **AC-029** (`R15`, `FR-029`): Requester, Reviewer and Administrator dashboards show permitted summaries and links without cross-user private content leakage.
- **AC-030** (`R16`, `FR-030`): Timeline entries show durable chronological state/decision history with correct actor, time, and associated revision/cycle.
- **AC-031** (`O10`, `FR-031`): An administrator can create/update permitted reviewer mappings; an ordinary requester cannot use the configuration API.
- **AC-032** (`O13`, `FR-032`): With two required parallel slots, approval by only one stays pending; both approvals complete the stage; one rejection terminates it safely.
- **AC-033** (`O16`, `FR-033`): An administrator publishes a valid conditional form; the UI and backend apply visibility and requiredness consistently; cyclic or malformed definitions are rejected.
- **AC-034** (`O17`, `FR-034`): A supported priority persists and is displayed; unsupported values are rejected by shared and server validation.
- **AC-035** (`O18`, `FR-035`): Amounts above a hard ceiling fail without mutation; a threshold amount selects the configured number of stages without maintaining budget balances.
- **AC-036** (`O19`, `FR-036`): Requester department routing creates eligible slots matching approved assignments; a missing configuration blocks submission.

### 9.3 Sprint 3 acceptance criteria

- **AC-037** (`R12`, `FR-037`): Search by request number or title returns only permitted matches and does not permit cross-owner enumeration.
- **AC-038** (`R13`, `FR-038`): Status/date filtering follows defined boundaries and still applies authenticated resource visibility.
- **AC-039** (`R14`, `FR-039`): Page boundaries are enforced, sorting is deterministic including ties, and invalid sort/page values are safely rejected.
- **AC-040** (`R17`, `FR-040`): Core views remain usable on desktop/tablet/mobile; keyboard focus, validation, loading and error feedback work without exposing stale private data.
- **AC-041** (`O01`, `FR-041`): A permitted participant can post a comment, see persisted content, and cannot use commenting to record a formal decision or bypass visibility.
- **AC-042** (`O02`, `FR-042`): Permitted uploads/downloads work through authorized private storage; disallowed types, oversize files and cross-request access are denied.
- **AC-043** (`O03`, `FR-043`): Assignment and status changes generate deduplicated persisted in-app notifications; users see only their own notifications and read/unread states.
- **AC-044** (`O07`, `FR-044`): A permitted reassignment preserves the existing slot/deadline and audit trail, gives the new assignee authority and rejects the old assignee’s later decision.
- **AC-045** (`O08`, `FR-045`): A valid delegation authorizes an eligible alternate during its interval on the same slot; expired/self-directed/ineligible delegations are rejected.
- **AC-046** (`O09`, `FR-046`): Administrator management changes user roles, active state and department membership; ordinary users cannot elevate privileges or update trusted membership.
- **AC-047** (`O11`, `FR-047`): An approval task due across an evening or weekend accrues only Monday–Friday 09:00–17:00 Asia/Bangkok business time.
- **AC-048** (`O12`, `FR-048`): Repeated scheduler runs do not duplicate reminders or escalations; an overdue task notifies administrators but is not automatically reassigned.
- **AC-049** (`O15`, `FR-049`): Bulk decisions report per-item success/failure, cannot approve self-owned or stale tasks, and do not create duplicate effective votes.
- **AC-050** (`O21`, `FR-050`): PDF output reflects the same date/status filters and authorized row visibility as the source report and rejects unauthorized access.
- **AC-051** (`O24`, `FR-051`): Theme selection survives supported navigation and renders status meanings independently of color.
- **AC-052** (`O25`, `FR-052`): Primary workflows display usable Thai and English text; administrator-configured field labels use the documented fallback without missing labels.
- **AC-053** (`O26`, `FR-053`): A new registrant has Requester-only access, cannot self-grant department/reviewer/admin status, and cannot submit a departmental request until admin assignment.
- **AC-054** (`O27`, `FR-054`): Each recovery code is displayed only at enrollment and accepted once; password reset revokes active sessions, and assisted recovery requires audited admin authorization.

### 9.4 Cross-feature acceptance and regression criteria

- **S-01** (FR-004, FR-005, FR-006): A requester directly submits a seeded valid form and sees its persisted status after fresh retrieval.
- **S-02** (FR-009, FR-010, FR-013, FR-015): Assigned reviewer approval/rejection creates one effective decision plus durable history, including after application restart.
- **S-03** (FR-003, FR-012): Requester, another reviewer, and Administrator cannot bypass the self-approval or ownership checks through direct HTTP calls.
- **S-04** (FR-025, FR-032): Parallel ALL-vote tests cover one-of-two, both-of-two, reject-first, conflicting simultaneous decisions, and duplicate retries.
- **S-05** (FR-020, FR-021, FR-026): A returned request remains pinned to its original form definition while new approval routing policy is applied on resubmission.
- **S-06** (FR-033): An invalid conditional form including a hidden-field bypass, missing required condition, or cycle is rejected by the backend.
- **S-07** (FR-025, FR-033): Admin-configurable request types and routing rules cannot add a third sequential stage.
- **S-08** (FR-007, FR-036): No eligible reviewer fails atomically before request submission becomes pending, including self-only assignment and inactive reviewers.
- **S-09** (FR-044, FR-045, FR-047): Time-limited delegation/reassignment cannot create a second vote or reset the existing SLA deadline.
- **S-10** (FR-053, FR-054): A newly registered user lacks a trusted department; admin-assisted reset and recovery-code consumption revoke sessions.
- **S-11** (FR-047, FR-048): Friday afternoon business-day deadlines, repeated scheduler runs, and escalation without auto-reassignment produce expected results.
- **S-12** (FR-037, FR-038, FR-039, FR-041, FR-042, FR-043, FR-050): PDF exports, attachments, comments, search, and notifications cannot disclose another user’s protected data.

## 10. Requirements Verification and Traceability

- `FR-001`–`FR-054` each map to one of the 54 approved selected capabilities and to corresponding `AC-001`–`AC-054`.
- `test.md` assigns corresponding planned `FT-001`–`FT-054`; implementation must additionally pass relevant domain, contract, database, security and browser E2E tests.
- Cross-feature scenarios `S-01`–`S-12` verify invariants spanning multiple features; source IDs are not replaced or renumbered.
- The 10 frozen `NFR-*` obligations and adjustable `Q-*` quality targets remain separate. Do not relabel a proposed performance threshold as a guaranteed requirement.
- [`traceability.md`](./traceability.md) provides the master Feature → FR → AC → FT → module/API/UI → Sprint matrix and the BR/NFR cross-cutting links.
- Actual execution results must record tested commit, environment, seed, expected/actual outcome and evidence; this specification asserts no tests have run.

## 11. Frozen Decisions and Change Control

The following are binding and unchanged: configurable published versioned request types, conditional field visibility/requiredness, original pinned form definition on returned edit, current policy on fresh resubmission, at most two sequential stages, parallel ALL, one effective decision per slot, no self-approval, trusted department assignment, policy-based amounts without a ledger, business calendar 09:00–17:00 Mon–Fri Bangkok, in-app reminders with admin escalation but no automatic reassignment, recovery codes with audited admin-assisted reset, and submission blocking when required reviewers cannot be resolved.

**Version control:** A change to any selected feature, FR/BR/AC, actor permission, request/approval lifecycle, form/policy version rule, API/UX behavioral guarantee or security invariant requires an explicit approved specification revision and traceability/test impact update. Internal storage/adapter/component choices may evolve without changing the product contract.

## 12. Glossary

| Term                    | Meaning                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| Request type            | Published, admin-configurable definition of fields and rules               |
| Form-definition version | Immutable version of a request type used to validate submitted content     |
| Working revision        | Editable representation in DRAFT or RETURNED state                         |
| Submitted revision      | Immutable payload snapshot associated with an approval cycle               |
| Approval policy         | Published configuration selecting stages and eligible reviewers            |
| Approval cycle          | One submission/resubmission attempt and its review execution               |
| Stage                   | Ordered step; at most two per cycle                                        |
| Slot                    | One required vote in a stage; multiple slots are parallel and ALL required |
| Delegation              | Time-bound alternate authority for an existing slot, not a second vote     |
| Reassignment            | Audited replacement of the pending slot's assigned reviewer                |
| SLA                     | Due-date calculation and escalation using the Bangkok business calendar    |
| AC / FT                 | Acceptance criterion and corresponding planned feature test                |

**Baseline status:** Complete requirements document derived from frozen product contracts. Not a report of implemented or executed functionality.
