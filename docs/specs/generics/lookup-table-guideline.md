# Lookup table guideline

**Status:** Derived engineering guideline, 2026-11-06; no implementation authorized by this document.

**Authority:** [UI specification](../ui-specs.md) §§6, 11, 13–14; [API specification](../api-specs.md) §§2.2–2.3, 4, 5.2–5.3, 6.5–6.6; [system design](../system-sds.md); root [AGENTS.md](../../../AGENTS.md). Frozen routes, audiences, DTOs and validation take precedence. Proposed defaults and unresolved API needs are identified below.

## 1. Approval System lookup scope

A lookup table here means a searchable, paged record picker for an approved form or filter, not a database table or a generic CRUD screen. Use static selects for small enums such as request status/priority; use a server-backed picker only for an authorized resource and operation.

| Approval flow                            | Value being chosen / displayed                                                         | Required boundary                                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request wizard                           | Active published request type; trusted department displayed from identity              | Requester cannot choose a department to change routing or nominate approval reviewers. The server resolves reviewers from policy and trusted membership |
| Returned request edit                    | Existing pinned request type/form version                                              | A lookup must not switch to the newest definition or silently replace the pinned version                                                                |
| Admin membership / routing configuration | Department, eligible reviewer or assignment mapping as specified by its write contract | Only Admin manages trusted membership/mappings; eligibility and no self-approval remain backend rules                                                   |
| Policy stages                            | Stable reviewer assignment keys, resolved to actual eligible reviewers on submission   | Policy `reviewerAssignmentKeys` are not reviewer UUIDs; a picker must map to the exact policy contract, with one/two stages and parallel ALL            |
| Admin reassignment                       | One eligible replacement reviewer UUID                                                 | Same undecided slot and due date; reason, expectedVersion and Idempotency-Key; no request-content fetch                                                 |
| Reviewer delegation                      | One `delegateUserId`, UTC interval and optional own task-ID scope                      | Original reviewer retains authority; first valid committed vote wins. Candidate discovery gap is recorded in §5                                         |

Authority: [product decisions](../specifications.md) DEC-02, DEC-08, DEC-10–13 and DEC-15; [API](../api-specs.md) §§4, 6.5–6.6; [UI](../ui-specs.md) §§8, 11. The component must fit these operations rather than importing maintenance-domain workflows.

The modal, read-only display field, Clear action, debounce and multi-select interaction design below are **proposed implementation defaults** where the UI spec leaves widget details open. They do not introduce a new lookup endpoint or make a single-value write multi-value. Reference source notes are retained in §7 for provenance only.

## 2. Responsibility boundaries

| Owner                         | Responsibility                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared `LookupField` / picker | Display label, open/close, selection controls, loading/error/empty, keyboard/focus, paging UI                                                                                |
| Feature lookup definition     | Typed columns, localized names, stable contract identity key, label formatter, supported sort/search fields, service callback and authorized context                         |
| Feature form/service          | Selected contract identities, safe display summary, requiredness, dependency resets, request DTO mapping and submission                                                      |
| API/HTTP layer                | Transport, Bearer/session handling, response validation, `X-Pagination` parsing, centralized errors, cancellation                                                            |
| Backend application/domain    | Caller authority, eligibility, no self-approval and context-specific business restrictions, including revalidation on mutation                                               |
| Backend Infrastructure        | Parameterized, scoped queries and minimal read projection; see [filter/search backend guidance](./filter-search-guideline.md#5-backend-fit-and-global-querybuilder-guidance) |

Keep transport in the API layer and UI request orchestration in services. Define props as `I`-prefixed interfaces, infer DTOs from `packages/contracts`, and avoid a separate frontend DTO copy. Prefer shared composition over duplicating fetch/pagination behavior inside every picker.

## 3. Selection and display behavior

1. Show a localized human label/code in a labelled read-only control. Store the contract's identity separately: UUID for resource selections, stable assignment key for policy `reviewerAssignmentKeys`. Never substitute one for the other or submit a display name as identity; do not use a raw UUID as the primary label.
2. Open a named, focus-managed shadcn dialog with search, useful columns, explicit Select actions, page controls and Cancel. Load only while open and authorized. Fetch a bounded page; do not download the directory for local filtering.
3. Debounce text search around 300ms and reset to page 1 when search, sort, page size or dependency scope changes. Accept only endpoint-allowed sort fields. Cancel/ignore older responses and all responses after close, account change or permission loss.
4. Single-select commits the contract identity and display summary atomically, closes and restores focus. Cancel/escape/backdrop close leaves the previous value unchanged. Selection buttons use `type="button"` inside forms.
5. Clear removes both identity and display summary. Required fields then show normal validation; clearing must not submit the form. Disabled/read-only contexts disable all mutating selection actions.
6. An existing selection remains visible even when absent from the current results page. Hydrate its label from an authorized parent DTO or an authorized existing detail endpoint, not by fetching all pages. On inaccessible/deactivated records, show a safe unavailable indication and reselect/clear guidance; do not retrieve or retain forbidden metadata.
7. When request type/department/policy/stage dependencies change, clear or explicitly revalidate dependent selections. Do not keep a formerly eligible reviewer silently selected. Eligibility must be checked again by the backend at submit/reassign time.

Use multi-select only where an approved contract accepts multiple identities, such as policy assignment keys or a delegation's optional own-task scope; reviewer replacement and `delegateUserId` remain single-value. Keep draft selection keyed by the contract identity across pages, explicit Apply/Cancel, deduplication and a clear selected-count summary. Cancel discards draft edits. Apply validates documented field limits and commits the complete selection. Do not offer “select all matching records” or treat the current page as the entire directory. The exact multi-value write shape must come from the relevant shared contract; a picker cannot invent it.

## 4. States, accessibility and responsive layout

- Distinguish loading, refresh, empty directory, no search matches, failed request and forbidden access. Keep retry available for recoverable errors; a failed request is not an empty success. Map API error codes to localized messages.
- Keep selection unavailable for stale/loading rows. Preserve the form's committed selection during retry. On `401`, follow session handling; on `403`, stop the lookup; on inaccessible `404`, avoid disclosing record existence; on `422`, associate safe validation feedback with the relevant input.
- Use labels for search and page size, named pagination buttons, real keyboard-operable sort buttons with `aria-sort`, accessible Select names identifying the row, and focus trap/return. Avoid row-click-only selection.
- Use [styling contract](./styling-contract.md) semantic tokens. Constrain dialog width/height to the viewport and scroll inside it; use readable compact rows/cards where helpful. Test narrow screens, touch, zoom, long Thai/English labels and both themes. The frozen mobile card requirement specifically covers main request/review collections, not every administration lookup.
- Keep lookup caches scoped to authenticated identity, permissions, locale and dependency context. Clear them on logout/role changes. Do not persist private directories or selection summaries to localStorage/public SSR.

## 5. Approved endpoint fit and unresolved gaps

All paths below are relative to `/api/v1`. A shared picker does not grant access to a search route.

| Use                                        | Existing API authority                                                                    | Guideline / limitation                                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin department picker                    | `POST /departments/search`, Administrator                                                 | Bounded department summaries, authorized admin context only                                                                                                               |
| Admin user picker                          | `POST /users/search`, Administrator                                                       | Minimum needed summary; never reuse as a public directory                                                                                                                 |
| Admin reviewer mapping/policy/reassignment | `POST /reviewers/eligible/search`, Administrator configuring roles/rules                  | Confirm exact operation context and field schema; mutation rechecks candidate eligibility                                                                                 |
| Requester request-type choice              | `POST /request-types/search`, authenticated active-type metadata                          | Only permitted published/active choices; use authorized definition/detail reads for form fields                                                                           |
| Current member's department label          | `GET /departments/:id`, authorized admin/current member, limited DTO                      | Can resolve an already authorized department; does not permit enumerating departments                                                                                     |
| Reviewer chooses a delegation target       | UI §11.1 requires eligible-reviewer lookup, but API §5.2 eligibility search is admin-only | **Unresolved contract gap:** define/approve a bounded reviewer-authorized candidate contract before implementation; do not relax the admin endpoint from a generic picker |
| Non-admin department discovery, if needed  | Department search is admin-only                                                           | Prefer trusted current-user context for assigned department; a new browse capability needs approved API/spec/test changes                                                 |

The reference's `buildLookupPayload`/service adapter is a useful reuse pattern, not evidence that the Approval System already has those endpoints or eligibility guarantees. If a context needs additional candidate parameters, DTO fields or read permissions, revise the authoritative API/schema/test traceability first. Do not invent `/lookups/*`, a public user directory or a client-side permission override here.

## 6. Backend requirements and planned acceptance

Picker search uses the same validated search envelope and pagination header as normal collections. Candidate scope is server-derived from the authenticated actor and validated operation context; client filters only narrow it. Return only necessary summary fields. List and count must use identical visibility/eligibility predicates, so counts cannot reveal hidden people or records.

Lookup-time eligibility is advisory: submission, delegation and reassignment must revalidate active status, role, department/policy/stage restrictions, ownership and self-approval rules where applicable. Preserve existing version/conflict handling and transactional audit behavior; selection is never authorization.

At current local baseline `8d02023`, the API has health infrastructure, an empty table schema and a health-only contracts export. Search, authorization, eligibility and these shared picker components are **planned, not implemented**. The current HTTP helper also does not parse pagination metadata. Use the companion [backend fit assessment](./filter-search-guideline.md#5-backend-fit-and-global-querybuilder-guidance) before implementation.

Future verification should cover selection/cancel/clear, stable resource UUIDs/assignment keys and labels, required/disabled states, preserved selections across pages, dependency invalidation, stale response suppression, retry versus no matches, multi-select Apply/Cancel if used, keyboard focus, Thai/English and narrow screens. API/DB tests must cover unauthorized lookup, accurate scoped counts, invalid fields/page sizes, eligibility changes before mutation, and attempts to spoof department/reviewer context.

Map these to existing [test plan](../test.md) `UT-12`, `API-05`, relevant endpoint/security suites, `FT-003`, `FT-007`, `FT-036`, `FT-044`–`FT-045`, `FT-053` and UI acceptance `UI-AC-05`–`07`, `09`–`10`; preserve [traceability](../traceability.md). These are planned checks; resolving the delegation lookup gap requires explicit specification/test impact, not a passing claim here.

## 7. Reference source notes

Frontend reference reviewed at commit `03c7801ba265cf90ed3403d29679f2d597b42e55`:

| Source                                                                                                                                                                                             | Observed behavior                                                                                         | Adaptation                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [LookupField](https://github.com/oangsa/maintenance-tracking-system/blob/03c7801ba265cf90ed3403d29679f2d597b42e55/app/components/Common/LookupField/index.tsx)                                     | Read-only label, Lookup/Clear actions, generic definition and selection callback                          | Keep identity separate from label and feature form state                         |
| [ListPickerModal](https://github.com/oangsa/maintenance-tracking-system/blob/03c7801ba265cf90ed3403d29679f2d597b42e55/app/components/Common/ListPickerModal/index.tsx)                             | Debounced search, sorting, server pagination, Select action, close after selection; ignores stale results | Reuse collection/query behavior, add explicit error/retry and accessible sorting |
| [Department lookup definition](https://github.com/oangsa/maintenance-tracking-system/blob/03c7801ba265cf90ed3403d29679f2d597b42e55/app/components/Common/LookupField/lookups/department.lookup.ts) | Columns/labels and fetch adapter call the department service and map pagination                           | Use feature definitions consuming shared Zod DTOs and the common HTTP adapter    |
| [TableModal](https://github.com/oangsa/maintenance-tracking-system/blob/03c7801ba265cf90ed3403d29679f2d597b42e55/app/components/Common/TableModal/index.tsx)                                       | Read-only tabular dialog                                                                                  | Keep read-only presentation distinct from selecting a form value                 |

Do not copy numeric IDs, row-index key fallbacks, fixed desktop dialog dimensions, inline appearance styles or catch-to-empty error behavior. The reference picker is single-select; multi-select below is a proposed composition for the shared single-/multi-select capability already described in UI §6, not an observed reference implementation.
