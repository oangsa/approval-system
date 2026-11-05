# CPE334 Theme 5 — Sprint 3 Feature List

> **Planning draft — not frozen.** This is a proposed allocation of the user-selected **54 capabilities** (M01–M17, R01–R17, and 20 selected O-series). IDs are project planning labels, **not instructor-issued requirement IDs**. No feature is deleted or duplicated between sprints.
>
> **Status:** All listed features are **PLANNED**, none is claimed implemented or tested. Architecture choices are already finalized separately; this file does not change them.

## Sprint 3: Operations, Experience & Final Hardening

- **Checkpoint:** 29 November 2026 — tested progress; 13 December 2026 — Final (100 points)
- **Sprint goal:** Finish administration, secure uploads, notifications/SLA, reassignment/delegation, bulk action, search/exports, i18n/theme, registration/recovery and final regression.
- **Required outcome:** By 29 Nov: all Sprint 3 feature contracts drafted and >=1 substantive workflow/rule implemented + tested in integrated GCP candidate. By 13 Dec: full scope verified on final release.
- **Features assigned:** 18 of 54

## Feature inventory (each ID belongs to one sprint only)

### Identity & Access (3)

| ID    | Feature                   | Target behavior / compact implementation                                                           |
| ----- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `O09` | **Admin User Management** | Admin creates/disables users and manages role assignment with server-side controls.                |
| `O26` | **Self-registration**     | Allow safe new-account creation with minimum requester role, no privilege self-escalation.         |
| `O27` | **Password Recovery**     | Provide a secure account-recovery mechanism; delivery/verification method needs a policy decision. |

### Request Management (1)

| ID    | Feature              | Target behavior / compact implementation                                          |
| ----- | -------------------- | --------------------------------------------------------------------------------- |
| `O02` | **File Attachments** | Upload/download private supporting files with access checks and size/type limits. |

### Assignment & Policy (2)

| ID    | Feature                   | Target behavior / compact implementation                                               |
| ----- | ------------------------- | -------------------------------------------------------------------------------------- |
| `O07` | **Reviewer Reassignment** | Change an individual pending reviewer assignment with authorization and audit.         |
| `O08` | **Reviewer Delegation**   | Temporarily delegate an approval responsibility, with expiry and self-approval checks. |

### Approval Workflow (1)

| ID    | Feature           | Target behavior / compact implementation                                                  |
| ----- | ----------------- | ----------------------------------------------------------------------------------------- |
| `O15` | **Bulk Approval** | Apply the normal per-request decision service to a selection and report partial failures. |

### Revision & Collaboration (1)

| ID    | Feature                   | Target behavior / compact implementation                                                  |
| ----- | ------------------------- | ----------------------------------------------------------------------------------------- |
| `O01` | **Comments / Discussion** | Add permission-checked discussion linked to a request without replacing decision records. |

### Search & Experience (6)

| ID    | Feature                      | Target behavior / compact implementation                                             |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------ |
| `R12` | **Search Requests**          | Search visible requests by number/title without exposing unauthorized matches.       |
| `R13` | **Status & Date Filters**    | Filter visible requests by status and created/submitted date ranges.                 |
| `R14` | **Sorting & Pagination**     | Use stable ordering and server-side pagination for request lists.                    |
| `R17` | **Responsive & Polished UX** | Make critical journeys usable across screen sizes with loading/empty/error feedback. |
| `O24` | **Dark Mode**                | Support persistent light/dark theme preference and usable contrast.                  |
| `O25` | **Thai / English UI**        | Support Thai and English labels/messages and a language switch.                      |

### Reporting (1)

| ID    | Feature               | Target behavior / compact implementation                                  |
| ----- | --------------------- | ------------------------------------------------------------------------- |
| `O21` | **PDF Report Export** | Export authorized reports into a downloadable PDF with safe data scoping. |

### Notifications & SLA (3)

| ID    | Feature                      | Target behavior / compact implementation                                     |
| ----- | ---------------------------- | ---------------------------------------------------------------------------- |
| `O03` | **In-app Notifications**     | Deliver persisted notifications for assignment, decision, and change events. |
| `O11` | **Approval Deadlines / SLA** | Persist stage due dates, overdue status, and clear deadline semantics.       |
| `O12` | **Escalation & Reminders**   | Run idempotent scheduled reminders/escalations for overdue assignments.      |

## Dependency bundles (finish incrementally, start before the 29 Nov checkpoint)

| Bundle                  | Related IDs                              | Required predecessor / implementation intent                                                                                                   |
| ----------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer operations     | `O07`, `O08`, `O15`                      | Existing approval engine, assignment management, revision-aware decision authorization; audit every change.                                    |
| Accounts and recovery   | `O09`, `O26`, `O27`                      | Backend-enforced roles + refresh-session system; new signups cannot self-assign reviewer/admin; define a genuine secure recovery channel/code. |
| Collaboration and files | `O01`, `O02`                             | Request ownership/assigned-reviewer permissions; private file storage with access checks.                                                      |
| Notifications and time  | `O03`, `O11`, `O12`                      | Workflow events, persisted due dates, idempotent background/scheduled processing.                                                              |
| Lists and UX            | `R12`, `R13`, `R14`, `R17`, `O24`, `O25` | Single reusable authorized query/listing flow and consistent UI states, theme tokens and translations.                                         |
| Export                  | `O21`                                    | Authorized reporting from Sprint 2 (`M16`); enforce row-level visibility in PDF results.                                                       |

## Required checkpoint on 29 Nov (Deliverable 2)

- **Contracts for every item listed in this Sprint 3 file:** feature SDS, UI/API/data, AC, STS, DoD, linked requirements, owners and dependencies.
- **At least one meaningful Sprint 3 workflow/rule implemented and actually tested** in the deployed candidate. Suggested demonstration: `O07` reassignment from reviewer A to B, with reviewer A denied afterward, B allowed, self-approval still blocked, and audit events persisted.
- Provide a truthful remaining-work register with feature/AC, owner, target date, defects and test state; do not claim all Sprint 3 features are already complete.

## End-to-end acceptance / regression focus

1. Reviewer reassignment/delegation changes who can decide, but never allows requester self-approval or two approvals of one required slot.
2. Bulk approval reports item-by-item success/failure and preserves normal authorization/state rules for **every** request.
3. SLA overdue event triggers no more than the configured reminder/escalation effect even after scheduled-job retries.
4. Uploading a file as the owner or an authorized reviewer works; unrelated users cannot list/download its contents; validation rejects disallowed files.
5. Registration creates only an allowed low-privilege role, verifies unique accounts, rate limits as appropriate; password recovery securely proves account control and invalidates used recovery secrets.
6. Searches, filters, reports and PDF export do not leak another user's requests or private documents.
7. In-app notification recipients and comments follow request-level access policy; historical events and persisted records remain consistent.
8. Critical UI flows work in Thai and English, light/dark themes and smaller viewports, with accessible validation/error feedback.
9. Full Sprint 1–3 regression suite (including DB concurrency, API permissions, integration, and selected E2E) passes on the final tagged release.

## Hard risks and compact implementation constraints

- `O11`/`O12`: cloud instances may scale to zero; use a **durable schedule / external trigger**, not an in-process timer as the sole scheduler. Scheduled handlers must be idempotent.
- `O02`: use private object storage and authorize each upload/download; no public-by-default user files. Avoid introducing unsupported cloud dependencies without a deployment plan.
- `O27`: email notifications `O04` were **not** selected. Password recovery can use a suitably secure recovery-code flow or a narrowly scoped identity-verification delivery mechanism; the approach is **TBD**, not implemented by assumption.
- `O07`/`O08`/`O15`: reuse the same approval policy/transaction service, not separate approval logic paths.
- `O24`/`O25`: adopt reusable design tokens and internationalization keys; do not hardcode translations into each screen.
- **Very high schedule risk:** the selected optional scope is large for a two-person team and overlaps with 1–11 Dec exams. Aim to implement most high-risk rules **before 29 Nov**; the assignment to Sprint 3 is not a promise they fit after that date.

## Final Delivery evidence (13 Dec)

- Full working web/API/PostgreSQL product released through reviewed Git workflow and GCP CI/CD; document tag/commit and deployed version.
- All selected capabilities tracked with test-backed acceptance criteria, including negative/boundary cases; actual results, unresolved issues and supported scope changes are disclosed.
- Current SRS, SDS, feature contracts, traceability, independent UAT/re-tests, regression evidence, final self-contained PDF and a joint demonstration video.
- Source handouts differ on video maximum duration (4 vs 10 minutes); confirm instructor policy, or aim for <= 4 minutes as a conservative choice.

## Delivery rules (course requirements)

- The team consists of two students; use the **same GitHub monorepo** throughout the course.
- Keep one root `AGENTS.md`, Bun workspaces, React Router 7 hybrid SSR/frontend, Elysia + Bun backend, PostgreSQL + Drizzle, and one shared `packages/contracts` using Zod.
- **Elysia must enforce authentication, permissions, ownership and workflow rules**; a hidden frontend button never replaces authorization.
- Before implementing each feature, version its feature SDS, UI/API/data contract, numbered acceptance criteria (AC), test specifications (STS) and DoD. Maintain requirement -> feature -> sprint -> AC -> test traceability.
- Use GitHub Issues/project board, feature branches off sprint staging, teammate-reviewed PRs, integration/release PR to `main`, tag/commit, meaningful test evidence and a brief AI-use declaration.
- Use automated unit tests for policy rules, API+real DB integration tests for persistence/permissions, selected critical UI/E2E flows, and meaningful TDD red/green evidence.
- These are **proposed allocations**, not a frozen scope or evidence of implementation. Completion status for every listed feature is **PLANNED / NOT TESTED** until work and checks actually run.

## Coverage / review

**Assigned IDs (18):** `R12`, `R13`, `R14`, `R17`, `O01`, `O02`, `O03`, `O07`, `O08`, `O09`, `O11`, `O12`, `O15`, `O21`, `O24`, `O25`, `O26`, `O27`

**Feature status:** planned; no implementation or verification asserted.
