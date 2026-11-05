# CPE334 Theme 5 — Workflow and Approval System

**Document:** `ui-specs.md` — UI Engineering Specification  
**Version:** **1.0.0 — FROZEN**  
**Product authority:** [`specifications.md`](./specifications.md) — frozen v1.0  
**Wire/API authority:** [`api-specs.md`](./api-specs.md) — frozen v1.0.1 (additive, admin-only escalation search amendment)  
**UI reference only:** [Maintenance Tracking System frontend](https://github.com/oangsa/maintenance-tracking-system)  
**Scope:** All 54 selected capabilities; no additional product features; no lab requirements.

> **Authority:** `shall` and `must` are binding UI requirements. The 54 features and all 15 product decisions remain defined by `specifications.md`; wire/security contracts remain defined by `api-specs.md` (additive v1.0.1). `[IMPLEMENTATION DEFAULT — NOT FROZEN]` values are adjustable without changing approved behavior. **The Maintenance Tracking System frontend is the only UI reference.** No implementation or passing tests are asserted.

> **D-01 — approved engineering amendment (2026-11-05):** [Owner decision, Issue #1](https://github.com/oangsa/approval-system/issues/1) replaces the earlier Bun runtime/toolchain with Node.js 24, npm Workspaces, one root `package-lock.json`, Elysia through `@elysia/node`, TypeScript, Vitest for unit/API/contract/real-PostgreSQL integration tests, and Playwright for browser E2E. React Router 7, shadcn/ui + Tailwind CSS, PostgreSQL + Drizzle ORM and shared Zod contracts remain. This amendment changes no feature scope, FR/BR/AC/test identifiers, product/API/UI behavior, ownership or effort estimates; baseline contract versions remain unchanged. It records engineering alignment only, not implementation or passing verification.

## 1. UI goal and reference boundary

Deliver a minimal, professional, black-and-white application for requesters, reviewers, and administrators. Use whitespace, hierarchy, strong typography, crisp dividers, and restrained surfaces. Reserve limited semantic colors for request status, warnings, errors, success, and focus/validation. Avoid colorful decorative gradients, glassmorphism, heavy shadows, ornamental illustrations, and chart-heavy dashboards.

Adapt these **structural patterns** from the Maintenance Tracking System frontend; do not copy its business domain or carry over its app-specific routes:

| Reference pattern                                     | CPE334 adaptation                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `app/routes.ts` and role-aware route layouts          | Public auth routes; shared authenticated shell; route-level permission gates        |
| `app/layouts/LayoutMain.tsx`, common Sidebar          | Sidebar + top header + mobile drawer, role-filtered navigation                      |
| `app/components/Common/DataTable`                     | One type-safe, API-driven collection foundation for all tabular screens             |
| `app/components/Common/Form`, `useManagedForm`        | One config-based Zod-driven form foundation and runtime request-type field renderer |
| `LookupField`, `LineItemsEditor`                      | Reviewer/department lookups and dynamic request line-item editing                   |
| `Maintain/PageHeader`, `DetailPage`, `DetailSections` | Shared page shell and readable request details                                      |
| Dashboard cards, auth pages, shadcn/ui primitives     | Minimal dashboard and account experiences                                           |

Reuse principles and composition, **not** implementation verbatim. All behavior follows CPE334's already-frozen product/API contracts.

## 2. Styling and visual tokens

### 2.1 CSS policy — selected by user

- **Tailwind CSS only** for application styling. Use Tailwind utility classes, component variants (`class-variance-authority`/`cn`) and Tailwind design tokens.
- `shadcn/ui` provides accessible headless/component primitives styled by Tailwind; keep its necessary Tailwind imports and CSS variable token definitions in the central stylesheet.
- No extra hand-written component CSS selectors, CSS Modules, SCSS/Sass, CSS-in-JS, styled-components, Emotion, Bootstrap, or another component styling framework. Avoid inline style props for appearance; motion-library inline transforms/opacity generated for animation are an exception.
- Layout, focus ring, dark theme and component states are expressed through Tailwind classes and semantic variables. No arbitrary hex values scattered through feature components.

### 2.2 Proposed neutral visual system — IMPLEMENTATION DEFAULT

| Token/element         | Light theme                                    | Dark theme                |
| --------------------- | ---------------------------------------------- | ------------------------- |
| Main background       | `#FFFFFF`                                      | `#09090B`                 |
| Subtle app background | `#FAFAFA`                                      | `#0F0F11`                 |
| Surface/card          | `#FFFFFF`                                      | `#18181B`                 |
| Primary text          | `#09090B`                                      | `#FAFAFA`                 |
| Secondary text        | `#71717A`                                      | `#A1A1AA`                 |
| Divider/border        | `#E4E4E7`                                      | `#27272A`                 |
| Main action button    | Almost black, white text                       | Almost white, black text  |
| Secondary action      | Outlined or quiet neutral                      | Outlined or quiet neutral |
| Font                  | Inter; system sans fallback                    | Same                      |
| Radius                | 8–12px for controls/cards                      | Same                      |
| Elevation             | Borders first, very soft shadow only if needed | Same                      |

Use explicit text labels and icon/shape to indicate state. Color is **supplementary**, never the sole status communication.

### 2.3 Semantic state colors — FROZEN

| Request state | Color family     | Visible label         |
| ------------- | ---------------- | --------------------- |
| `DRAFT`       | Neutral/slate    | Draft                 |
| `PENDING`     | Amber            | Pending approval      |
| `RETURNED`    | Blue             | Returned for revision |
| `APPROVED`    | Green            | Approved              |
| `REJECTED`    | Red              | Rejected              |
| `WITHDRAWN`   | Neutral/dim gray | Withdrawn             |

`WAITING` and `ACTIONABLE` task statuses use visually distinct neutral/amber tokens. Overdue uses danger/warning indicators but **does not overwrite** the formal request state. Dark variants must preserve sufficient contrast, and status chips show localized text with icons where useful. Priority is distinct from request status and must not use the same visual meaning.

### 2.4 Theme and localization

- **UI-01 [FROZEN]:** On first visit, theme follows `prefers-color-scheme` (system light/dark). An explicit user selection overrides the system setting and persists across navigation/reloads; provide a **System / Light / Dark** control. When set to System, respond to subsequent system theme changes. Do not access browser-only APIs during SSR render; avoid hydration mismatch and conspicuous theme flashes. This non-secret preference may use local storage.
- **UI-09 [FROZEN]:** On first visit, determine preferred language from the browser (`navigator.languages` / request language hints where SSR is involved): prefer Thai if the first supported preference is Thai, English if English, otherwise English fallback. User language selection overrides detection and persists; choices are **Thai / English**. All UI navigation, workflows, errors, confirmation dialogs, tables, statuses, notifications and accessibility labels are translated. Do not infer user language solely from physical location.
- Server `code` + `details[].code` map to translated UI messages; English server fallback remains available. Do not translate stable enum/API keys.
- Configurable type/field/option labels display requested language with **English fallback** as specified by API contract.
- Format instants in `Asia/Bangkok` for users; retain calendar-only dates without unintended timezone conversion. Business hours are Monday–Friday 09:00–17:00 Asia/Bangkok.

## 3. Motion and accessibility

- Animation is optional enhancement, not part of any critical interaction or approval transaction.
- Prefer Tailwind `transition-*` for ordinary hover, focus, sidebar/collapse, and color transitions.
- **UI-11 [FROZEN]:** Use Tailwind transitions as the default. Modern **Motion for React** (`motion/react`) is optional for justified component transitions; do **not** use the separate legacy `react-motion` library. Motion must not introduce a second styling system or replace Tailwind CSS.
- **[IMPLEMENTATION DEFAULT — NOT FROZEN]** Motion durations of ~120–220ms for small opacity/translate transitions, sidebar expansion, tabs and dialog presence. Never animate loading to conceal data changes, delay submit results, or obscure actionable controls.
- Respect `prefers-reduced-motion: reduce`, and disable nonessential transitions/entry animations. Keep keyboard focus and screen-reader announcements stable through transitions.
- Keyboard, semantic labels, error associations, usable focus rings, dialog focus trap/return and non-color status cues are required. Do not reproduce a reference implementation's CSS rules that suppress accessible focus outlines.

## 4. Application shell and responsive behavior

### 4.1 App shell

**UI-02 [FROZEN]:** Shared authenticated `AppShell` uses a collapsible left sidebar on desktop, sticky top header, and a focus-managed mobile drawer. Header includes breadcrumb/page title, account menu, **notification bell** (UI-08), and accessible theme/language controls. The sidebar contains only destinations the current user can use. Multiple-role users see relevant combined sections (rather than choosing a pretend client-side role to bypass permissions).

Sections: **Workspace** (Dashboard, My Requests, My Reviews, Delegations, Notifications, Reports where allowed); **Administration** (Users, Departments, Request Types, Approval Policies, Reviewer Assignments, Budget Policies and Escalations as authorized). Do not show empty sections.

The frontend's role checks are for navigation/UX only; server permissions still govern all requests. On logout/role removal/account disable, clear in-memory access token and all user-scoped caches.

### 4.2 Responsive layout — IMPLEMENTATION DEFAULT

- Desktop `>=1024px`: sidebar approximately 248px expanded, collapsible to icon rail, content max-width approximately 1440px.
- Tablet `768–1023px`: compact sidebar or drawer, single/two-column adaptable forms.
- **UI-07 [FROZEN]:** Mobile `<768px` uses a drawer sidebar, single-column forms/detail and **compact accessible cards for the main Requests and Review Queue collections** instead of squeezed data tables. Each card preserves identity, status, priority/due date where relevant, and actions. Admin/configuration tables may use a constrained horizontally scrollable table where a card layout would lose meaning. A sticky action area must not obstruct content or keyboard; no whole-page horizontal overflow.
- Use breakpoint utilities (`sm`, `md`, `lg`, `xl`) rather than viewport-specific CSS sheets. Respect touch target sizing.

## 5. Route and navigation proposal

All paths below are **frontend React Router paths**, not API routes. Reuse feature modules under `app/modules/` with thin route adapters under `app/routes/`, as in the Maintenance System's modular organization.

| Frontend route                                                | UI                                                      | Audience                        | Primary API                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------- |
| `/`                                                           | Public landing / redirect to dashboard if authenticated | Public                          | —                                                             |
| `/auth/login`                                                 | Sign in                                                 | Public                          | `POST /auth/login`                                            |
| `/auth/register`                                              | Register + recovery-code issuance flow                  | Public                          | `POST /auth/register`                                         |
| `/auth/recover`                                               | Recovery-code password reset                            | Public                          | `POST /auth/recovery/password`                                |
| `/auth/assisted-reset`                                        | Redeem admin-assisted one-time reset grant              | Public                          | `POST /auth/recovery/admin-grants/redeem`                     |
| `/dashboard`                                                  | Role-aware dashboard                                    | Authenticated                   | `GET /dashboard`                                              |
| `/requests`                                                   | My Requests / permitted requests                        | Requester, authorized reviewers | `POST /requests/search`                                       |
| `/requests/new`                                               | Multi-step request wizard (create DRAFT + submit)       | Requester                       | `POST /requests`, request-type lookup                         |
| `/requests/:id`                                               | Request detail, history, revisions, comments, files     | Authorized current participant  | `GET /requests/:id` and scoped subresources                   |
| `/requests/:id/edit`                                          | Multi-step wizard for working DRAFT / RETURNED revision | Owner only                      | `PATCH /requests/:id/draft`                                   |
| `/reviews`                                                    | Assigned task queue, bulk actions                       | Reviewer                        | `POST /approval-tasks/search`                                 |
| `/reviews/:taskId`                                            | Task decision + current permitted request context       | Assigned/delegated reviewer     | `GET /approval-tasks/:id`                                     |
| `/delegations`                                                | My delegation list + create/revoke                      | Reviewer                        | `/delegations/*`                                              |
| `/notifications`                                              | Persistent notifications                                | Authenticated                   | `/notifications/*`                                            |
| `/reports`                                                    | Authorized summary + PDF export                         | Authenticated per scope         | `/reports/requests/*`                                         |
| `/settings`                                                   | Account, theme, language, recovery-code regeneration    | Authenticated                   | `/auth/me`, recovery endpoint                                 |
| `/admin/users` and `/admin/users/:id`                         | User/roles/department management                        | Admin                           | `/users/*`                                                    |
| `/admin/departments`                                          | Department management                                   | Admin                           | `/departments/*`                                              |
| `/admin/request-types` and `/admin/request-types/:id`         | List, create, draft/edit/publish, disable               | Admin                           | `/admin/request-types/*`                                      |
| `/admin/approval-policies` and `/admin/approval-policies/:id` | Versioned one-/two-stage policy editor                  | Admin                           | `/admin/approval-policies/*`                                  |
| `/admin/reviewer-assignments`                                 | Reviewer mappings/eligible reviewer lookup              | Admin                           | `/admin/reviewer-assignments/*`, `/reviewers/eligible/search` |
| `/admin/budget-policies`                                      | Amount ceilings and threshold references                | Admin                           | `/admin/budget-policies/*`                                    |
| `/admin/escalations`                                          | Minimal overdue/escalation queue and reassignment       | Admin                           | `POST /admin/approval-tasks/search` (API v1.0.1)              |
| `/unauthorized`                                               | Access forbidden explanation                            | Authenticated                   | —                                                             |
| `*`                                                           | Not found                                               | Any                             | —                                                             |

`/requests/:id` must **not** be shown as a full-current-record page to a historic-only reviewer. Historical task/revision projection is limited to exactly the data authorized in `api-specs.md`.

## 6. Shared component foundation

| Reusable component                                    | Requirement                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `AppShell`, `AppSidebar`, `PageHeader`, `Breadcrumbs` | Consistent navigation, responsive structure                                      |
| `DataTable<T>`                                        | Search, allowlisted filters, sort, page, row actions, loading/error/empty states |
| `ManagedForm<T>`, `FieldRenderer`                     | Labels, hints, errors, required markers, validation, disable/busy behavior       |
| `LookupField<T>`                                      | Authorized server-backed single-/multi-select for departments/reviewers          |
| `LineItemsEditor`                                     | Editable rows, exact decimal displays, totals from server                        |
| `StatusBadge`, `PriorityBadge`, `StageProgress`       | Semantic text/status visuals, no color-only meaning                              |
| `DetailSections`, `RequestSummary`, `RevisionViewer`  | Read-only request context and pinned historical form displays                    |
| `AuditTimeline`, `DecisionHistory`                    | Historical event list, chronological/accessible labels                           |
| `DecisionDialog`, `ConfirmDialog`                     | Explicit action confirmation and reasons                                         |
| `AsyncState`, `ErrorState`, `EmptyState`, `Skeleton`  | Unified fetching and recoverable feedback                                        |
| `NotificationEntry`, `NotificationList`               | Own inbox and read state                                                         |
| `AttachmentList`, `UploadField`                       | Safe private attachment actions; no public direct URLs                           |

`DataTable` always consumes server results and can render **table rows on desktop / compact cards on mobile** for main request/review collections using the _same_ server-authorized result, query state, and row-action definitions; never fork the business logic. `X-Pagination` is parsed by the shared HTTP client and exposed as typed metadata. An empty dataset and a filtered zero-match list have different explanatory text.

**IMPLEMENTATION DEFAULT:** page-size choices 10/20/50/100 bounded by frozen API max 100; debounced search 300ms; list state stored in URL search params when beneficial for deep links and navigation preservation. No client-side filtering of a paged server dataset as a substitute for authorized backend queries.

## 7. Authentication and account screens

### 7.1 Public landing and login

- Quiet centered auth card, high-contrast text, no decorative marketing section required.
- Email/password inputs, proper labels/autocomplete, show/hide password, submit busy state, generic invalid-credential message, clear navigation to Register and Recover.
- The UI never asks user to select a role or department during login/registration.
- On success, navigate to `/dashboard`; token remains only in memory and refresh cookie is managed by browser/backend.

### 7.2 Self-registration and first recovery-code issuance

- Registration fields: display name, email, password and confirmation.
- Once accepted, show the **one-time recovery-code display** from the first successful API response with an accessible copy/print action and explicit save acknowledgment before proceeding.
- Warn clearly that codes cannot be viewed again; do not store them in localStorage, sessionStorage, analytics, logs, error telemetry or screenshots.
- Never silently repeat registration if a network response is lost; use contract-defined retry/error behavior.
- After registration, tell the user that an administrator must assign a department before departmental request submission is enabled.

### 7.3 Password recovery and assisted reset

- Standard recovery form: email, recovery code, new password, confirm password.
- Assisted reset form: user-identifying inputs and one-time grant code from the verified out-of-band administrative process. Do not imply the application itself verifies real-world identity.
- Admin issuance UI shows a one-time grant code once, requires deliberate handoff, and never offers a 'view old code' control.
- On successful password reset, clear local authenticated state and navigate to login.

### 7.4 Account settings

- Current profile/department/roles read-only summary, password change, regeneration of recovery codes after reauthentication.
- Language/theme preferences in the header and/or settings, with no sensitive fields saved in browser persistence.

## 8. My Requests and request creation

### 8.1 My Requests (`/requests`)

- Reuse `DataTable` with request number, title, request type, priority, status, last update, and optional date/department where authorized.
- Search request number/title; filter status and date; sort and paginate through `/requests/search`.
- Primary action **New request**. Row primary action **Open details**; optional contextual **Edit draft/returned**, **Withdraw** when `availableActions` permits.
- Status labels and timestamps must reflect server state; do not optimistically fabricate terminal approval status.
- A newly registered user without a department may save permitted drafts but receives a clear department-assignment explanation before submission.

### 8.2 New/Edit request wizard (`/requests/new`, `/requests/:id/edit`) — UI-03 [FROZEN]

A **multi-step wizard** is mandatory for creating and editing a request; it must remain compatible with dynamically configured fields and incomplete drafts. It is _not_ a separate type-specific hardcoded flow. The wizard uses the existing Maintenance-style shared form foundation and Tailwind components.

| Step | Title                   | Required behavior                                                                                                                                                                                                                                                |
| ---- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Request Type**        | Select active/published type; display description and definition version. Warn before switching away from a type with incompatible unsaved values. For existing DRAFT/RETURNED, preserve the pinned eligible definition; do not silently change a returned type. |
| 2    | **Basic Information**   | Title, description/justification, priority and trusted department display. Server remains authoritative for identity/department.                                                                                                                                 |
| 3    | **Request Details**     | Render all type-defined fields, conditional visibility and requiredness, contextual help and field-specific validation.                                                                                                                                          |
| 4    | **Items & Attachments** | Show line-item editor only when enabled; show authorized working-revision uploads only when the feature is available. If neither applies, skip this step without blank content.                                                                                  |
| 5    | **Review & Submit**     | Readable summary of applicable fields, totals, attachment names and policy-relevant notices; choose **Save Draft** or **Submit/Resubmit** with explicit confirmation. Final status and request number come only from the server.                                 |

- Show a clear numbered step indicator and **Back / Next** navigation; label completed/current steps with text, not just color. Keyboard and screen-reader users can identify their current step. Allow returning to prior completed steps without losing inputs.
- **Save Draft** is available from any wizard step **after selecting a valid published request type and version** (required by `POST /requests`), including when all other fields are incomplete. Before type selection the Save control explains why it is unavailable. For a never-saved request create DRAFT through `POST /requests`, then use `PATCH /requests/:id/draft` with its current `expectedVersion`; for a returned request edit its working revision via that same PATCH endpoint. Draft Save is not a Submit and must not create approval tasks or a request number.
- **Next** validates the currently visible applicable step fields with client-side Zod/runtime rules where feasible; it must not prevent intentionally incomplete **Save Draft**. **Submit/Resubmit** performs full client feedback then sends the canonical server request. Map server `details[].field` errors (including `fields.<key>` and indexed line items) back to their owning step; focus the first failed step/field after validation.
- On initial submit, use `POST /requests/:id/submit`; on returned revision use `POST /requests/:id/resubmit`. Both use `expectedVersion` and a stable `Idempotency-Key` per unchanged logical attempt. Never duplicate an operation by regenerating the key during a same-payload retry. Show backend-generated tracking number only after success.
- Warn on unsaved navigation, browser refresh, closing the wizard, or type changes; saved drafts remain resumable. Never claim silent autosave unless implemented and confirmed by the server.
- Dynamic form metadata uses active/pinned published version as appropriate. If first submission returns `409 FORM_DEFINITION_CHANGED`, show a **Review updated form** recovery path instead of overwriting existing inputs automatically.
- For API validation of hidden/nonapplicable dynamic fields, remove hidden keys from outgoing values; keep transient hidden values only in safe in-memory state when appropriate. Submitted revision snapshots remain immutable.
- On small screens, use a compact step progress label and a non-obstructing Back/Next/Save action stack; do not rely on fixed-height panels that clip long dynamic forms.

### 8.3 Dynamic conditional fields

- Evaluate `visibleWhen` and `requiredWhen` as defined in `api-specs.md` using the same `all` / `any` atom semantics.
- When a condition hides a field, remove its key from the **submitted payload**, retaining any inactive value only in safe transient UI memory as appropriate; it must not be submitted to server because `FORM_FIELD_NOT_APPLICABLE` is a frozen validation error.
- If a hidden field becomes visible again, revalidate it; if upstream values change, recompute every dependent field in acyclic order.
- Requiredness shows both label indication and screen-reader-accessible validation.
- Handle stale published form at first submission: `409 FORM_DEFINITION_CHANGED` displays refresh/review action and warns before discarding/transforming draft data.
- A returned request renders the **original pinned** form version, never silently switches to a new published definition.

### 8.4 Request line items

- Use reusable `LineItemsEditor`: add row, edit description/quantity/unit amount, delete editable row, show subtotal/total and validation per row.
- Display localized currency formatting without converting the canonical decimal strings in the API into inaccurate floating-point business values.
- Read-only when the submitted revision is not editable. Show backend-confirmed totals on details.

## 9. Request detail, revisions and collaboration

**UI-04 [FROZEN]:** Use a **four-tab Request Detail** layout: **Overview**, **Approval**, **History**, and **Discussion / Files**. Maintain a shared persistent request header above the tabs (number, title, state, priority and authorized actions). Each tab is keyboard accessible, preserves contextual tab selection when safe, and loads only data the actor is allowed to receive. Tabs are organizational UI, not separate permission boundaries.

Header: request number/title, type, status, priority, requester, department, last updated, available permitted actions. No controls may promise unauthorized behavior.

- **Overview:** pinned submitted/working fields, line items, computed amount, justification, relevant annotations.
- **Approval:** stage 1/2 progress, active stage, minimal current approver labels, ALL voting indicators, actionable task links only when authorized.
- **History:** event timeline with actor, time, cycle and revision; revision list and immutable authorized revision snapshots; no side-by-side revision comparison.
- **Discussion / Files:** time-ordered comments separated from formal decisions, a compose area for authorized participants, and attachment metadata/download controls within the same tab (distinct sections).
- **Files sub-section:** private metadata/download; upload/delete only while requester has editable DRAFT/RETURNED working revision; past evidence remains read-only. Former reviewers cannot access historical files from historical access alone.
- **State actions:** Submit/Resubmit/Withdraw use explicit final confirmation, optimistic `expectedVersion` and idempotency key. After success replace with server-authoritative DTO, not a locally invented status.
- Historical reviewer context is read-only and limited to the exact handled revision/decision; never use broad current request read.

## 10. Review Queue and decisions

### 10.1 Queue (`/reviews`)

`DataTable` shows current own/delegated task requests only: request number/title if permitted, stage, delegated/original assignee context, task status, due time, priority, and allowed actions. Permission-controlled bulk selection is limited to currently actionable items.

`POST /approval-tasks/search` authorizes the dataset, independent of frontend role navigation. A non-reviewer cannot see the queue or retrieve its rows.

### 10.2 Task detail (`/reviews/:taskId`)

Show task status, allowed reviewer action, authoritative submitted revision information where current reviewer access permits, stage progress and remaining ALL votes. If not eligible, show a safe unavailable/not-found state without revealing protected request existence.

### 10.3 Formal decision UI — UI-06 [FROZEN]

**Use a confirmation `DecisionDialog` for every formal Approve, Reject and Return action:**

- **Approve:** concise confirmation; reason/comment optional.
- **Reject:** mandatory nonblank reason, danger emphasis.
- **Return:** mandatory nonblank reason, clear explanation that requester must revise and restart review.
- The dialog displays exactly which request/stage is affected and prevents accidental double activation while pending.
- Send `expectedVersion` and a stable `Idempotency-Key` for the logical action. Do not regenerate the key on a retry of unchanged payload.
- On `409 APPROVAL_TASK_STALE`/state conflict, close the unsafe action and offer **Reload task**; retain typed reason until user chooses to discard it.
- On `201`, refetch task/request and show the server's current status/current stage. No assumed final approval after just one parallel vote.

### 10.4 Bulk decisions

- Only selected eligible actionable tasks may enter a bulk action.
- One review dialog indicates item count and required reason for bulk rejection/return if enabled by the API contract.
- Render per-item success/failure results from backend, with failed rows identifiable and retryable as separate new actions if permitted. Do not display a single misleading success toast when some items failed.
- The API/feature baseline requires **bulk approval**, not unlimited bulk rejection/return; UI must not invent additional batch operation permissions.

## 11. Delegation, administration and workflow configuration

### 11.1 My delegation

Form for eligible original reviewer: choose an eligible reviewer from lookup, effective start and end timestamps, bounded scope; list owned active/expired/revoked delegations. Revoke with confirmation. Explain that original or valid delegate may decide and first valid vote wins.

### 11.2 Administrator users and departments

- Reuse DataTable + ManagedForm + DetailSections patterns for users/departments.
- Admin may set activation state, roles and trusted department; role selectors never permit unsafe privilege escalation.
- Account recovery grant issuer confirms an out-of-band identity verification step before issuance. Show issued secret once with strict visual warning.
- Backend still blocks any unsafe operation; client cannot determine final permissions.

### 11.3 Request-type configuration editor — UI-05 [FROZEN]

**Use a structured field-list editor with conditional rules and preview**, not a drag-and-drop canvas:

1. Request type metadata, enabled/published/draft versions.
2. Field list with add, edit, remove (draft only), reorder up/down.
3. Field editor: key, localized label/description, kind, base required, options and constraints.
4. Condition builder for `visibleWhen` and `requiredWhen`: condition rows with `all` / `any` groups, field references, allowed typed operator and comparison value.
5. Live local preview of fields with different example values, using the **same shared runtime evaluator** as requester form UI.
6. Publish confirmation with server-side validation, version impact, and `409` handling; published versions are immutable.

No arbitrary scripts, nested condition trees beyond API bounds, third-party visual workflow builder, or manual JSON editing required from ordinary admins.

### 11.4 Approval-policy editor

- Choose applicable request type, department, amount/priority ordering policy as permitted by API.
- Configure exactly 1 or 2 ordered stages; each stage has one or more parallel slots; clearly display **ALL must approve**.
- Choose eligible reviewers through lookup and set per-stage business-hour SLA duration; show policy priority and an overlap/ambiguity warning.
- Versioned Draft/Publish controls. A third stage has no UI affordance, and backend validation remains mandatory.
- Provide preview/explanation of a sample routing outcome without promising a backend dry-run API that does not exist; final server publication remains authoritative.

### 11.5 Reviewer assignments and budget limits

- Reviewer assignments: lookup by department/policy/stage, create/update authorized mappings and display active/inactive status.
- Budget policies: select type/department, configure hard ceiling; explain that no actual department balance is tracked. Threshold-related routing is configured via approval policies.

### 11.6 Escalation and reassignment — UI-12 [FROZEN; API v1.0.1]

- `/admin/escalations` uses the approved **admin-only** `POST /api/v1/admin/approval-tasks/search` returning a minimum routing-only projection. It defaults to overdue actionable slots, with permitted controls for due-date, task status, stage and reviewer; no request-form body, attachments, comments, requester private details, or unauthorized current request detail.
- Show request number (not confidential title), stage, assigned reviewer display name, task status, dueAt, overdue indicator, and current `version`; support server paged search, accessible empty/loading/error states, and safe refresh. A task with `WAITING` future stage may be shown when explicitly filtered but is not classified as overdue until actionable with a due date.
- **Reassign** opens a confirmation dialog showing current/new eligible reviewer, required reason, preserved SLA due date and authoritative version. Send `POST /api/v1/approval-tasks/:id/reassign` with `Idempotency-Key` and `expectedVersion`; on success refresh the search row rather than fetching confidential request details.
- Backend alone authorizes admin access and determines eligibility. The UI must not offer Approve/Reject/Return to an administrator unless the same person separately has an eligible Reviewer task. Old reviewer/delegate authorization must be rechecked after any reassignment.
- Admin escalation notifications may link to the filtered `/admin/escalations` view via safe task UUID only; do not create a privileged deep link to current request contents.

## 12. Notifications, reports and dashboard

### 12.1 Notifications

**UI-08 [FROZEN]:** Persistent own inbox at `/notifications` **and a notification bell in the top header**, with unread count, accessible label, read/unread state, timestamp and safe navigation to authorized targets; poll via existing `POST /notifications/search`, refresh on visibility return, mark read via PATCH. Do not promise real-time push or email delivery. Current user loses data/caches on logout.

### 12.2 Dashboard

Use Maintenance-style summary cards and small recent lists, but **not** standalone advanced analytics charts. Show only metrics and links in the role-aware `/dashboard` DTO and authorized follow-up collections.

- Requester: own pending, returned, approved/rejected and recent requests.
- Reviewer: own actionable/delegated slots, pending counts, overdue notices and recent decisions only where permitted.
- Administrator: configuration health, permitted organizational aggregates and escalation metadata; never an unrestricted request viewer.
- Avoid presenting a misleading global administrative count as permission to read underlying protected requests.

### 12.3 Reports and PDF

Minimal filterable report tables/summaries. The UI sends the exact same authorized filters for displayed report and PDF export. Show generating/downloading/binary error states. Avoid CSV controls or chart dashboards, which are not selected features.

## 13. System feedback and failure matrix

| Situation                                                    | UI requirement                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Initial loading                                              | Skeleton that approximates shape; avoid layout shift                                        |
| Empty dataset                                                | Explain no records and offer relevant primary action                                        |
| No filter matches                                            | Explain no matches; Reset filters action                                                    |
| `401 UNAUTHENTICATED`                                        | Try permitted refresh once; otherwise clear private state and redirect to login             |
| `403 FORBIDDEN`                                              | Access explanation; safe navigation, no protected content remains rendered                  |
| `404 NOT_FOUND`                                              | Generic unavailable state, indistinguishable missing/inaccessible private record            |
| `422 VALIDATION_ERROR`                                       | Field-level translated errors, retain editable inputs, focus first invalid field            |
| `422 FORM_FIELD_NOT_APPLICABLE`                              | Re-evaluate conditions, remove nonapplicable submitted key, preserve safe edits             |
| `409 FORM_DEFINITION_CHANGED`                                | Explain first-submit version conflict; explicitly review updated definition before retry    |
| `409 APPROVAL_TASK_STALE`                                    | Disable old action, refetch authoritative task; do not silently resubmit                    |
| `409 CONFIGURATION_INCOMPLETE` / `AMBIGUOUS_APPROVAL_POLICY` | Preserve draft/returned work and explain route/configuration issue; do not claim submission |
| `409 IDEMPOTENCY_CONFLICT`                                   | Block key reuse for changed payload; show safe retry/new-attempt pathway                    |
| `413` / `415`                                                | Explain file size/type; preserve other attachment selections where possible                 |
| `429 RATE_LIMITED`                                           | Rate-limit message and retry guidance; do not reveal account existence                      |
| `500` / `503`                                                | Recoverable page-level error with Request ID/copyable support identifier; no stack/SQL      |
| Bulk partial failure                                         | Per-item status and reasons, not one global success                                         |
| Successful terminal decision                                 | Refetch authoritative request/task status and clear stale queue actions                     |

Use accessible toast for noncritical confirmations; destructive/irreversible operations require dialogs. Avoid success-only UI states that are not confirmed by API response. Never leak data from previous account/session while a new user loads.

## 14. Data-fetching and URL state

- Use shared typed API clients that consume `/api/v1`, Bearer token, refresh cookie, direct DTO results, `X-Pagination`, and centralized errors; no UI component reimplements HTTP details.
- HTTP `Cache-Control: no-store` applies to private data. Client caching, if used, is per authenticated user/session and invalidated on role change or logout.
- Preserve search/filter/sort/page in query strings for linkable collections, while the actual request is server-authorized `POST /search`.
- Race-safe fetches: cancel/ignore stale requests when query or identity changes. Clear previous user's data before rendering next user's view.
- Local optimistic UX can indicate pending actions, but must not set final APPROVED/REJECTED status before server result.
- Use correct idempotency key and expectedVersion across visible actions, after refresh and retry.
- Do not expose refresh tokens, recovery codes or private attachment URLs in HTML source, analytics, browser persistence or downloadable client logs.

## 15. UI acceptance criteria and feature coverage

### 15.1 Cross-cutting acceptance

- **UI-AC-01:** All 54 selected features have discoverable entry points, contextual actions, read surfaces, or appropriate admin controls mapped to their frozen FR/AC.
- **UI-AC-02:** Auth, registration and recovery flows never expose secrets after the one-time issuance screen or accidentally persist tokens in storage.
- **UI-AC-03:** Dynamic conditional fields reflect `all`/`any` rules, clear absent hidden keys from payload, validate and show errors; pinned returned forms remain unchanged.
- **UI-AC-04:** One/two-stage and parallel ALL progress conveys partial approvals as PENDING; no premature Approved display.
- **UI-AC-05:** Invalid/forbidden/stale/unauthorized actions do not mutate views optimistically or reveal private data; forms preserve safe user input.
- **UI-AC-06:** Reassignment, delegation and batch decisions keep actual server authority and represent partial failures correctly.
- **UI-AC-07:** Desktop, tablet and mobile flows are keyboard accessible, non-color-dependent, functional in dark/light and Thai/English.
- **UI-AC-08:** Request reports and PDFs use matching filters/visibility and do not show unauthorized data.
- **UI-AC-09:** Same API contracts, resource UUIDs and status enum values are used by shared client DTOs; UI never creates its own contradictory business state.
- **UI-AC-10:** Empty-data, no-results, skeleton, validation, 401/403/404/409/422/429/500/503, upload failures and retry flows are tested.
- **UI-AC-11:** Fresh theme uses system preference; System/Light/Dark manual overrides work and persist. No SSR hydration mismatch; switching system theme updates UI only in System mode.
- **UI-AC-12:** Browser language preference determines initial Thai/English language, user selection overrides it, fallback is English, and status/error/form messages are localized consistently.
- **UI-AC-13:** Multi-step wizard supports dynamic and pinned conditional fields, incomplete Save Draft from any step after type selection, step navigation, unsaved-change protection, correct field-to-step error routing, idempotent submit/resubmit and no false success.
- **UI-AC-14:** Four request-detail tabs preserve permitted data isolation, focus/keyboard navigation and historical-view restrictions; former reviewers never receive current private detail or attachments.
- **UI-AC-15:** Admin request-type builder supports structured field list, constrained AND/OR editor, safe preview, immutable publish semantics, and invalid-dependency feedback.
- **UI-AC-16:** Every formal Approve, Reject and Return action opens confirmation; Reject/Return require a nonblank reason, and stale/conflicting tasks cannot be re-voted without reload.
- **UI-AC-17:** Request/review collections display server-consistent tables on desktop and action-equivalent compact cards on mobile; search/sort/filter/page state and privacy remain intact.
- **UI-AC-18:** Header notification bell and inbox share own scoped data; polling pauses/revalidates appropriately, and updates cannot leak across logout or account switch.
- **UI-AC-19:** Administrator escalation queue uses only the minimal v1.0.1 projection; filter/search/reassign works without request-content access, and stale assignments show safe conflict feedback.
- **UI-AC-20:** Monochrome light/dark style uses restrained semantic status colors, accessible labels and focus; Tailwind remains the only styling system and optional Motion respects reduced motion.

### 15.2 Selected feature-to-UI coverage (complete)

| Module                   | Feature IDs                                                | Primary UI coverage                                                                  |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Identity & Access        | M01, M02, M03, O09, O26, O27                               | Auth, account settings, user/department admin and recovery                           |
| Request Management       | M04, M05, M06, M15, M17, R01, R05, R06, R07, O02, O16, O17 | New/edit requests, list, detail, drafts, line items, attachments, type configuration |
| Assignment & Policy      | M07, M13, R09, R10, O07, O08, O10, O18, O19                | Approver panel, reviewer lookup, admin routing/budget, reassignment/delegation       |
| Approval Workflow        | M08, M09, M10, M11, M12, R08, R11, O13, O15                | Reviewer queue/task/decisions, 2-stage progress, bulk actions                        |
| Revision & Collaboration | M14, R02, R03, R04, R16, O01                               | Revision edit/resubmit, timeline, discussion                                         |
| Search & Experience      | R12, R13, R14, R15, R17, O24, O25                          | Lists, dashboard, responsive design, dark mode, localization                         |
| Reporting                | M16, O21                                                   | Aggregate report table + PDF                                                         |
| Notifications & SLA      | O03, O11, O12                                              | Inbox, deadlines, reminders, escalations                                             |

## 16. Approved API coordination — additive amendment, resolved

**API-UI-ADD-01 [APPROVED]:** A minimal administrator-only escalation/task search is included in `api-specs.md` **v1.0.1** as `POST /api/v1/admin/approval-tasks/search`. It is additive to frozen API v1.0; all existing endpoints, product rules and authorizations remain unchanged.

- Response shape: `AdminApprovalTaskSummary[]` plus `X-Pagination`; task UUID, request UUID/number, stage number, current slot status, minimal assigned reviewer summary, current version, UTC due/created/updated timestamps and calculated overdue flag only.
- Default queue returns active PENDING-cycle overdue actionable slots; allowlisted filters may include stage, status, reviewer and due date. A `WAITING` future-stage slot with no due date is never overdue.
- Admin privileges allow routing discovery and the _existing_ reassignment mutation, **not** private request detail, decision participation, attachments, comments or current-revision viewing.
- The admin screen handles safe 401/403/404/409/422/error results without exposing private content. API test coverage must prove non-admin denial, projection minimization, allowlisted filtering and versioned reassignment.

## 17. Frozen UI decision register

| ID    | Frozen decision                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------- |
| UI-01 | First visit follows system theme; user can set persistent System/Light/Dark                        |
| UI-02 | Collapsible desktop sidebar, sticky top header, mobile drawer                                      |
| UI-03 | Multi-step request creation/editing wizard; Save Draft from any step once request type is selected |
| UI-04 | Four-tab detail: Overview, Approval, History, Discussion / Files                                   |
| UI-05 | Structured admin field-list + conditional-rule builder + preview                                   |
| UI-06 | Confirmation dialog for every formal Approve, Reject and Return                                    |
| UI-07 | Mobile compact cards for primary request/review collections                                        |
| UI-08 | Header bell and full persistent notification inbox                                                 |
| UI-09 | Initial UI language from browser preference, then explicit user override                           |
| UI-10 | Monochrome base plus neutral/amber/blue/green/red semantic status accents                          |
| UI-11 | Tailwind transitions; optional modern Motion for React (`motion/react`)                            |
| UI-12 | Admin-only minimal escalation task search API amendment approved                                   |

**[IMPLEMENTATION DEFAULT — NOT FROZEN]** Inter font, exact neutral token hex values, mobile breakpoints, card density, spacing, icon choices, search debounce, page-size selection within API caps, transition duration, header notification polling interval, wizard step URL/bookmark design, and skeleton counts. Changes to these values cannot weaken approved layout, language/theme behavior, accessibility, or authorization requirements.

## 18. UI freeze and consistency statement

**This document is FROZEN as `ui-specs.md` v1.0.0.** It is the presentation/interaction contract for all 54 selected CPE334 capabilities. Product decisions, feature allocation, request states and approval authority remain exclusively governed by frozen `specifications.md` v1.0; the HTTP/DTO/permission contract remains governed by frozen `api-specs.md` with the single additive v1.0.1 amendment in §16.

- UI pages and controls may not authorize API operations or bypass revision/cycle/version requirements.
- Tailwind CSS and shadcn/ui are the only styling/component system; optional Motion for React supplies animation, not CSS styling.
- Only the Maintenance Tracking System frontend was used as a UI architectural reference; its business terminology, colors and exact UI designs are not carried over.
- No additional feature (visual workflow builder, universal administrator request viewer, email notifications, realtime push, CSV export or accounting ledger) is authorized by this UI specification.
- Future behavior/route/API changes require documented compatible contract revisions and adjusted tests. This document makes **no** claim of implemented or tested behavior.
