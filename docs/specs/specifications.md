# CPE334 Theme 5 — Workflow and Approval System

**Document:** `specifications.md` — Product Engineering Specification
**Product baseline:** Frozen v1.0 (2026-11-05)
**Document revision:** 1.0.0 (derived from frozen baseline)
**Status:** Normative specification; implementation/test status is **not asserted**
**Scope:** 54 approved capabilities, 3 planned Sprints, 2 developers

> **Authority:** The previously frozen CPE334 Theme 5 v1.0 architecture, feature inventory, and 15 approved product decisions govern this document. `api-specs.md` and `ui-specs.md` will refine this specification without changing it. Any contradictory implementation detail must be reconciled against this baseline before implementation. Unspecified choices are documented as **implementation defaults**, not silently frozen as product rules.

> **Language:** The word **shall** indicates required behavior; **must not** indicates prohibited behavior. *Examples* and *proposed defaults* are non-normative unless explicitly promoted through change control.

## 1. Product Goal

Deliver one organization’s full-stack request and approval platform. Requesters use administrator-configured forms to submit and track requests; assigned reviewers approve, reject, or return requests through an auditable, revision-aware workflow; administrators control trusted membership and bounded routing policies without automatic access to confidential request contents.

The completed product shall support multiple request types, conditional fields, at most two sequential approval stages, parallel ALL voting within a stage, conditional department/amount routing, return/edit/resubmit, role-based access, reviewer reassignment and delegation, bulk approval, policy-based monetary limits, comments, private attachments, notifications, weekday SLA escalation, reports/PDF export, public registration, and recovery codes.

**Engineering objective:** Implement these capabilities once through cohesive business modules, not 54 independent applications or duplicate approval state machines.

## 2. Stakeholder Interpretation and Contract Authority

The product is a **single-organization** workflow system. It is not a general ERP, accounting platform, multi-tenant SaaS service, or unrestricted visual workflow builder. The administrator manages business *configuration* (types, conditional fields, departments, reviewers, approval thresholds); the backend owns every authoritative authorization, calculation, approval, and audit decision.

### 2.1 Frozen decision register

| Decision | Frozen behavior |
|---|---|
| DEC-01 | Admin-configurable versioned request types |
| DEC-02 | Sequential stages with parallel **ALL** approvals |
| DEC-03 | Budget **policy limits only**, no balance ledger |
| DEC-04 | Single organization, departments, multiple user roles |
| DEC-05 | Public requester signup and **recovery codes**, no OAuth |
| DEC-06 | Business-day SLA, reminders and admin escalation |
| DEC-07 | Every resubmission starts a **new approval cycle** |
| DEC-08 | Eligible, time-limited reviewer delegation |
| DEC-09 | Dynamic **conditional visibility and requiredness** |
| DEC-10 | Maximum **two sequential stages**, with parallel slots allowed |
| DEC-11 | Administrator assigns trusted department membership |
| DEC-12 | Mon–Fri **09:00–17:00 Asia/Bangkok**, no holiday-calendar feature |
| DEC-13 | Returned edits use the **original form-definition version** |
| DEC-14 | **Admin-assisted reset** if all recovery codes are lost |
| DEC-15 | Submission blocked when **no eligible reviewer** is resolvable |

### 2.2 Contract hierarchy

1. Frozen product baseline v1.0 and approved change record.
2. This `specifications.md` for product behavior and invariants.
3. `api-specs.md` for wire-level transport and error contracts.
4. `ui-specs.md` for route, component, and user-interaction contracts.
5. Feature-level SDS/STS and code/tests, which must satisfy the above.

If lower-level documents reveal an ambiguity, record it explicitly. Do not reinterpret a frozen feature away or silently weaken an approval/security rule.

## 3. Scope

### 3.1 Included

- Email/password login; refresh rotation and logout; authenticated identity and resource authorization.
- Self-registration as Requester, trusted department assignment by Administrator, role/user management, hashed recovery codes and audited assisted reset.
- Admin-created, versioned request types with bounded conditional text/number/date/select/boolean fields.
- Request creation/submission, drafts, numbers, line items, priority, return/edit/resubmit, withdrawal and immutable revisions.
- Reviewer assignment, department routing, conditional approval policies, a maximum of two ordered stages and parallel ALL slots.
- Approve/reject/return, self-approval prevention, decision history, reassignment, time-limited delegation and bulk decisions.
- Persisted comments and private attachments with owner/participant authorization.
- Role dashboards, search/filter/sort/page, current approver, timeline, basic reports and PDF export.
- Persistent in-app notifications; business-hour SLA, reminders and Administrator escalation without automatic reassignment.
- Responsive shadcn/ui experience, dark mode, Thai/English text and accessible error/loading/empty states.
- PostgreSQL persistence, concurrency safety, documented migrations/seed, executable tests and reviewed integration.

### 3.2 Excluded

- OAuth/social login, multi-tenant organization support, verified-email login requirement.
- Real payments, expense settlement, accounting, departmental remaining-budget ledgers or currency conversion.
- Arbitrary executable conditions, unrestricted workflow scripts, visual drag-and-drop workflow builder.
- Email notification campaigns or email-based password recovery.
- CSV export, standalone chart analytics, side-by-side revision comparison.
- Automatic SLA-triggered reviewer reassignment or automatic approval.

### 3.3 Role and confidentiality boundary

| Actor | Allowed business scope | Important restriction |
|---|---|---|
| Requester | Own drafts, requests, revisions, permitted comments/files and status | No review decisions or other requester data |
| Reviewer | Current assigned/delegated tasks and permitted request context | No unassigned review, no self-approval |
| Administrator | Trusted users/departments, request types, policies, reviewer slots, escalation and minimum routing metadata | No blanket access to private request payloads/comments/files |

A user can hold multiple roles. All permissions are evaluated per operation and resource, not through UI visibility alone.

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

| State | Description | Editable by requester? |
|---|---|---|
| `DRAFT` | Incomplete or unsubmitted working request | Yes (owner) |
| `PENDING` | Active approval cycle waiting for decisions | No |
| `RETURNED` | Prior cycle closed; requester may prepare a new revision | Yes, in a new working revision |
| `APPROVED` | Final required slot of final stage approved | No (terminal) |
| `REJECTED` | Authorized review rejection | No (terminal) |
| `WITHDRAWN` | Owner withdrew pending request | No (terminal) |

### 6.2 Permitted transitions

| Current state | Actor / action | New state | Guard and mandatory effects |
|---|---|---|---|
| `DRAFT` | Owner submits | `PENDING` | Full validation, department, eligible reviewer plan, new immutable revision/cycle and audit |
| `PENDING` | Reviewer approves intermediate slot/stage | `PENDING` | One effective slot decision, audit; activate next stage only after ALL votes |
| `PENDING` | Reviewer completes final stage | `APPROVED` | All required slots approved; write terminal decision and audit atomically |
| `PENDING` | Reviewer rejects | `REJECTED` | Required reason, terminate tasks and audit atomically |
| `PENDING` | Reviewer returns | `RETURNED` | Required reason, terminate cycle, permit new working revision |
| `RETURNED` | Owner resubmits | `PENDING` | Use pinned form definition, current approval policy, fresh cycle and decisions |
| `PENDING` | Owner withdraws | `WITHDRAWN` | Cancel unfinished tasks, audit and preserve previous decisions |

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

| Versioned concept | What is pinned? | When resolved? |
|---|---|---|
| Request type/form definition | Submitted version and originally pinned definition for returned edits | First accepted submission; continues through returned revisions |
| Approval policy | Version associated with each **approval cycle** | Each submission / resubmission |
| Approval assignments | Eligible slots and assignees in each cycle | On cycle creation, then explicit auditable reassignment/delegation only |
| Request content | Immutable snapshot for each submitted revision | Each submission / resubmission |

These separate boundaries resolve the apparent tension between keeping the original form and applying the latest approval policy to a resubmission.

## 7. System Architecture Summary

### 7.1 Repository and runtime

```text
workflow-approval-system/
├── AGENTS.md                   # the only AI-instruction file
├── apps/
│   ├── web/                    # React Router 7, SSR enabled, authenticated client-loaded routes
│   └── api/                    # Elysia / Bun, OOP + Clean Architecture
├── packages/
│   └── contracts/              # shared Zod static transport schemas and types
├── docs/
│   ├── specifications.md       # this document
│   ├── api-specs.md            # future wire contract
│   └── ui-specs.md             # future screen contract
├── .github/
├── package.json
└── bun.lock
```

### 7.2 Frontend

React Router 7 Framework Mode with `ssr: true`; public pages can use SSR, while authenticated data routes use explicit client data loading, hydration boundaries and SPA-style navigation. Private API responses and credentials shall not leak into SSR HTML. The frontend is feature-modular and uses shadcn/ui + Tailwind; shared DataTable and dynamic-form primitives may be used by multiple feature modules.

### 7.3 Backend

- **Domains:** Entities, policies, value objects, invariant validation, repository contracts.
- **Applications:** Orchestrated use cases, transaction coordination, actor/resource authorization and event recording.
- **Infrastructures:** Drizzle repositories, PostgreSQL, password/token providers, private storage adapter, notification scheduler adapter.
- **Presentations:** Elysia controllers, Zod transport validation, auth guards, safe errors, OpenAPI.

Clean Architecture dependencies point inward; framework code shall not own approval state transitions. Multiple feature controllers must reuse the same decision service.

### 7.4 Shared validation

`packages/contracts` owns static API envelopes, shared discriminants and typed contracts. The backend also validates **runtime field values** against the actual stored immutable form-definition version. Dynamic conditional-field evaluation must be deterministic and independent from visual hiding alone.

### 7.5 Logical modules

1. Identity & Access
2. Request Management
3. Assignment & Policy
4. Approval Workflow
5. Revision & Collaboration
6. Search & Experience
7. Reporting
8. Notifications & SLA

Logical modules are responsibilities, not a requirement to mirror eight top-level directories in every architectural layer.

## 8. Data and Persistence Requirements

### 8.1 Conceptual entities

| Group | Entities (conceptual; exact physical names defined in the SDS) |
|---|---|
| Identity | `users`, `roles`, `user_roles`, `refresh_sessions`, `recovery_codes`, `admin_reset_grants` |
| Organization | `departments`, `department_memberships` |
| Request definition | `request_types`, `request_type_versions`, `field_definitions` |
| Approval configuration | `approval_policies`, `approval_policy_versions`, `reviewer_assignment_rules`, `budget_policies`, `sla_policies` |
| Requests | `requests`, `request_revisions`, `request_field_values`, `request_items` |
| Review execution | `approval_cycles`, `approval_stages`, `approval_slots`, `approval_decisions` |
| Assignment and delegation | `reviewer_delegations`, `assignment_events` |
| Audit and collaboration | `audit_events`, `request_comments`, `attachments` |
| Notifications | `notifications`, `scheduled_job_events` |

### 8.2 Required persistence invariants

- Unique normalized user emails and unique official request numbers.
- Foreign keys and constraints connecting request → revision → cycle → stage → slot → effective decision.
- Submitted request/form/policy versions and formal decision rows remain immutable.
- Exactly one current request state, current revision pointer and current cycle reference where applicable.
- At most one effective decision per approval slot and no authorization by stale/replaced assignments.
- Backend-authoritative exact decimal monetary totals; one configured organizational currency, no conversion feature.
- UTC timestamp storage, with Bangkok timezone applied to business calendar calculations.
- Durable append-only audit history for meaningful accepted business changes.
- Database transaction boundaries cover decision, state change, audit/event creation and other required effects as one operation.
- High-contention operations shall use version checks/appropriate row locks and uniqueness constraints to prevent lost updates or duplicate votes.
- Repeatable migrations and deterministic seed data exist; source control contains no real secrets.

### 8.3 Confidentiality and files

A user’s ability to read an attachment, comment, request or export derives from the parent request's access policy at the time of access. Object storage remains private; do not expose permanent public URLs. Admin assignment views may show narrow metadata without revealing confidential form payloads.

### 8.4 Scope of database documentation

The exact column types, indexes, SQL migrations, deletion strategy and enum storage belong to the System-Level SDS and later concrete design; this specification freezes **logical entities and invariants**, not unnecessary physical implementation details.

## 9. API Specification Summary

The exact wire-level contract belongs in [`api-specs.md`](./api-specs.md). It shall define:

- Versioned base path, HTTP methods and semantics for authentication, user/departments, request types and published versions, requests/revisions, approval tasks, configuration, delegations, comments/files, notifications and reports.
- Shared Zod DTOs including dynamic-field-definition schemas, pinned definition version and current review-cycle identifiers.
- Authentication cookie and Bearer access-token lifecycle, CSRF/origin controls, role+record permission matrix.
- Safe validation, unauthorized, forbidden, unavailable, stale/conflict, invalid-transition and configuration-missing error responses with stable machine codes.
- Query allowlists, deterministic pagination/sorting/filtering, no leakage from list or PDF/report endpoints.
- Explicit transactional mutations, per-item bulk outcomes, idempotent retries and optimistic/concurrent decision handling.
- Storage upload/download authorization and scheduled internal-job authentication.
- OpenAPI documentation and backward compatibility for accepted consumers.

**Authority:** A UI-selected requester ID, role label, request owner field, or claimed total must never replace identity/business verification performed by Elysia.

## 10. UI Specification Summary

The exact route and component behavior belongs in [`ui-specs.md`](./ui-specs.md). It shall define:

- Public Home, Login, Register and Recovery screens, including one-time recovery-code enrollment display and admin-assisted recovery initiation.
- Role-aware Dashboard, My Requests, New/Edit Draft, Returned Edit, Request Detail with current stage, revision timeline and comments/attachments.
- Review Queue/Task Detail, single and bulk decisions, reassignment/delegation operations, permission-aware action visibility and conflict recovery.
- Admin views for Users/Departments, request-type/field/policy versions, reviewer mappings, conditional form preview and SLA/budget policies.
- Reports/PDF export, in-app notification center, personal preferences, Thai/English and dark/light modes.
- Metadata-driven form rendering, keyboard-accessible conditional fields, preservation of unsaved form input, field-level and page-level errors.
- One reusable collection/list foundation for search/filter/sort/page and explicit loading, empty-dataset, no-match, unauthorized, stale, and retry states.
- Responsive behavior and clear non-color-dependent statuses.

The frontend may hide unavailable actions for clarity, but a visible or hidden control is **never** the authorization boundary.

## 11. Non-Functional and Quality Requirements

### 11.1 Required qualitative invariants

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

### 11.2 Proposed measurable verification targets — implementation defaults, not frozen product decisions

| Target ID | Proposed target | Verification approach |
|---|---|---|
| Q-01 | For defined seeded load, typical list/detail API p95 < 1,000 ms | Timed integration/performance smoke with environment recorded |
| Q-02 | Core UI usable at desktop, tablet and narrow mobile viewports | Manual keyboard/responsive inspection and selected Playwright flows |
| Q-03 | 100% of protected API groups have anonymous + forbidden-role/ownership negative checks where relevant | Automated coverage audit |
| Q-04 | No duplicate effective decision under competing requests or retries | Real PostgreSQL concurrency tests |
| Q-05 | No partial state/audit commit on injected transaction failure | Fault-injection integration test |

These quantitative targets are engineering proposals until adopted into feature contracts/STS. They may be tuned with documented reasons, never used to excuse security or data-integrity defects.

## 12. Acceptance Criteria

Each selected feature has a baseline observable AC. Feature-level contracts may subdivide one AC into multiple smaller criteria, but shall preserve coverage and link all planned/actual tests. **None of these criteria is marked executed merely by being written here.**

### 12.1 Sprint 1 acceptance criteria

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

### 12.2 Sprint 2 acceptance criteria

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

### 12.3 Sprint 3 acceptance criteria

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

### 12.4 Cross-feature acceptance and regression criteria

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

## 13. Feature Inventory, Traceability and Three-Sprint Plan

### 13.1 Stable feature-to-requirement-to-acceptance traceability

| Sprint | Feature ID | Catalog feature | FR | AC |
|---|---|---|---|---|

| 1 | `M01` | Login | `FR-001` | `AC-001` |
| 1 | `M02` | Logout & Current User | `FR-002` | `AC-002` |
| 1 | `M03` | Role-based Access | `FR-003` | `AC-003` |
| 1 | `M04` | Create & Submit Request | `FR-004` | `AC-004` |
| 1 | `M05` | My Requests | `FR-005` | `AC-005` |
| 1 | `M06` | Request Detail & Status | `FR-006` | `AC-006` |
| 1 | `M07` | Reviewer Assignment | `FR-007` | `AC-007` |
| 1 | `M08` | Review Queue | `FR-008` | `AC-008` |
| 1 | `M09` | Approve Request | `FR-009` | `AC-009` |
| 1 | `M10` | Reject Request | `FR-010` | `AC-010` |
| 1 | `M12` | State Transition Rules | `FR-011` | `AC-011` |
| 1 | `M13` | Self-approval Prevention | `FR-012` | `AC-012` |
| 1 | `M14` | Decision & Status History | `FR-013` | `AC-013` |
| 1 | `M15` | Editing Policy | `FR-014` | `AC-014` |
| 1 | `M17` | Validation & Persistence | `FR-015` | `AC-015` |
| 1 | `R06` | Request Number | `FR-016` | `AC-016` |
| 2 | `M11` | Return Request | `FR-017` | `AC-017` |
| 2 | `M16` | Basic Reporting | `FR-018` | `AC-018` |
| 2 | `R01` | Save as Draft | `FR-019` | `AC-019` |
| 2 | `R02` | Edit Returned Request | `FR-020` | `AC-020` |
| 2 | `R03` | Resubmit Request | `FR-021` | `AC-021` |
| 2 | `R04` | Revision History | `FR-022` | `AC-022` |
| 2 | `R05` | Withdraw Request | `FR-023` | `AC-023` |
| 2 | `R07` | Request Line Items | `FR-024` | `AC-024` |
| 2 | `R08` | Two-stage Approval | `FR-025` | `AC-025` |
| 2 | `R09` | Conditional Approval Rules | `FR-026` | `AC-026` |
| 2 | `R10` | Current Approver Display | `FR-027` | `AC-027` |
| 2 | `R11` | Revision-aware Decisions | `FR-028` | `AC-028` |
| 2 | `R15` | Role-based Dashboard | `FR-029` | `AC-029` |
| 2 | `R16` | Visual Status Timeline | `FR-030` | `AC-030` |
| 2 | `O10` | Reviewer Assignment Management | `FR-031` | `AC-031` |
| 2 | `O13` | Parallel Approval | `FR-032` | `AC-032` |
| 2 | `O16` | Multiple Request Types (admin-configurable) | `FR-033` | `AC-033` |
| 2 | `O17` | Priority Levels | `FR-034` | `AC-034` |
| 2 | `O18` | Budget Limit Validation | `FR-035` | `AC-035` |
| 2 | `O19` | Department-based Routing | `FR-036` | `AC-036` |
| 3 | `R12` | Search Requests | `FR-037` | `AC-037` |
| 3 | `R13` | Status & Date Filters | `FR-038` | `AC-038` |
| 3 | `R14` | Sorting & Pagination | `FR-039` | `AC-039` |
| 3 | `R17` | Responsive & Polished UX | `FR-040` | `AC-040` |
| 3 | `O01` | Comments / Discussion | `FR-041` | `AC-041` |
| 3 | `O02` | File Attachments | `FR-042` | `AC-042` |
| 3 | `O03` | In-app Notifications | `FR-043` | `AC-043` |
| 3 | `O07` | Reviewer Reassignment | `FR-044` | `AC-044` |
| 3 | `O08` | Reviewer Delegation | `FR-045` | `AC-045` |
| 3 | `O09` | Admin User Management | `FR-046` | `AC-046` |
| 3 | `O11` | Approval Deadlines / SLA | `FR-047` | `AC-047` |
| 3 | `O12` | Escalation & Reminders | `FR-048` | `AC-048` |
| 3 | `O15` | Bulk Approval | `FR-049` | `AC-049` |
| 3 | `O21` | PDF Report Export | `FR-050` | `AC-050` |
| 3 | `O24` | Dark Mode | `FR-051` | `AC-051` |
| 3 | `O25` | Thai / English UI | `FR-052` | `AC-052` |
| 3 | `O26` | Self-registration | `FR-053` | `AC-053` |
| 3 | `O27` | Password Recovery | `FR-054` | `AC-054` |

### 13.2 Sprint outcomes and dependencies

| Sprint | Capability count | Completion outcome |
|---|---:|---|
| 1 — Foundation | 16 | Seeded type/users/assignments; authenticated submit → assigned review → approve/reject → persisted history, invalid transitions and access negative tests |
| 2 — Workflow expansion | 20 | Drafts, return/edit/resubmit, immutable revisions, admin request types/conditional fields, routing, budgets, two-stage/parallel ALL decisions, dashboard/report |
| 3 — Extended capabilities | 18 | Search/pagination, files/comments, notifications, reassignment/delegation, SLA/escalation, bulk, PDFs, admin accounts, signup/recovery, localization/visual polish and regression |

**Planned project checkpoints:** 2026-11-08 (Sprint 1); 2026-11-29 (Sprint 2 complete + tested Sprint 3 progress); 2026-12-13 (final accepted product). These are planning checkpoints, not evidence that a feature has been implemented.

**Cross-sprint dependencies:** Authentication and eligible assignment come before request submission; submitted revisions and cycle identity precede return/resubmit; approval slot semantics precede parallel ALL, reassignment, delegation, and bulk actions; event history precedes notifications/SLA; report/export share authoritative role-filtered queries.

### 13.3 No silent scope cuts

54 capabilities are included (17 M + 17 R + 20 selected O), exactly once in the plan. A feature may share an implementation with another feature, but its AC and tests cannot be silently omitted. Unselected O04/O05/O06/O14/O20/O22/O23 are excluded.

## 14. Assumptions and Decisions

### 14.1 Frozen interpretations

1. **Two stages maximum** means sequential depth, **not** number of required parallel reviewers.
2. **ALL parallel votes** refers to required approval slots in the currently active stage; one actor cannot cast multiple effective votes on a slot.
3. **Form version pinning** and **current approval-policy re-resolution on resubmission** are separate versioning rules.
4. **No eligible reviewer** blocks acceptance of a submission atomically rather than placing it in an unassigned pending queue.
5. **Budget validation** is ceilings/thresholds only; monetary approvals are not payments or ledger deductions.
6. **Public signup** never grants administrative roles or trusted department membership.
7. **Recovery codes and administrator help** do not rely on email-based reset links; identity verification for assisted recovery happens independently.
8. **SLA escalation** creates in-app admin notifications; it does not automatically reassign a review task.
9. **No universal admin read**: a configuration administrator cannot browse confidential request content simply by holding the role.
10. **Multiple request types** means generic admin-configurable forms with bounded conditional fields, not predefined three hardcoded forms.

### 14.2 Operational procedures to document before activation

- Admin-assisted account reset: independent identity verification, approval record, one-time reset delivery, expiration and abuse handling.
- Deployment-specific domain/origin/cookie/CSRF configuration, secret rotation, object-storage access and authenticated scheduled-job endpoint.

These are operational details requiring implementation-ready documentation, not new user feature decisions.

## 15. Implementation Defaults — NOT FROZEN

The following selections guide the first implementation and may be adjusted with documented rationale, provided product rules above are preserved.

| Concern | Suggested default |
|---|---|
| Workspace | `apps/web`, `apps/api`, `packages/contracts`; one `AGENTS.md` and root `bun.lock` |
| Public IDs | Opaque UUIDs for directly addressable resources |
| API naming | `/api/v1`, camelCase JSON fields, snake_case DB columns |
| API errors | Consistent machine code/message with safe structured field errors |
| Frontend forms | React Hook Form + Zod resolver + metadata-driven inputs |
| Password hashing | Argon2id |
| Access JWT | 15-minute TTL, held in browser memory |
| Refresh | 7-day lifetime with rotating HttpOnly/Secure cookie and server family revocation |
| Dynamic operators | `equals`, `notEquals`, `in`, `isSet`, optional AND groups; reject condition cycles |
| Nonapplicable fields | Explicit validation error on submitted nonapplicable values rather than trusting hidden controls |
| Money | One organization currency, initially THB; PostgreSQL exact `numeric` |
| Request number | `REQ-YYYY-NNNNNN` with database uniqueness |
| Priority vocabulary | `LOW`, `NORMAL`, `HIGH`, `URGENT` |
| Uploads | Private object store; PDF/JPEG/PNG; maximum 10 MiB/file |
| Collection paging | Default 20, max 100 rows, deterministic tie-breaker |
| Business SLA example | 8 business hours from stage activation; configurable allowed SLA durations |
| Tests | Bun test for unit/integration, PostgreSQL-backed tests, Playwright for critical journeys |
| Infrastructure | Containerized web/API, durable PostgreSQL, private storage, managed scheduler |
| Internationalized fields | Thai/English labels or documented fallback from one configured label |

Defaults do not permit weakening frozen session rotation, self-approval, parallel ALL, audit atomicity, or authorization requirements.

## 16. Product Definition of Done

A selected capability is **accepted** only when:

1. Its contract and stable AC are reviewed before implementation.
2. UI, API and data behavior are implemented in the correct layers with the shared validation contract.
3. The backend independently enforces role, ownership, state and policy rules.
4. Relevant migrations, constraints, transactional and concurrency protections work on PostgreSQL.
5. Unit, API/database integration, and selected E2E tests run where appropriate, including negative and boundary behavior.
6. Observed outcomes are linked to AC/test IDs and the tested revision; failed/skipped tests are disclosed.
7. Loading, validation, empty, stale, forbidden, conflict and recovery paths are handled where applicable.
8. An independent teammate reviews the bounded change, meaningful integration checks run, and the accepted revision is identifiable.
9. Feature documentation, setup, traceability and known limitations are current.
10. No incomplete implementation is relabeled as passing or covered by a fake/mock-only acceptance test.

**Document audit:** Exactly 54 features; no duplicate feature or acceptance IDs; 15 frozen decisions; eight logical domains; three sprints; no scope-lowering changes.

**Status:** Normative specification drafted from frozen product baseline. No actual implementation or test execution is asserted.

