# Filter and search guideline

**Status:** Derived engineering guideline, 2026-11-06; implementation baseline corrected 2026-11-13. The guideline itself does not authorize new routes, permissions or contract changes.

**Authority:** [API specification](../api-specs.md) §§2.2–2.4, 4, 6.5.1, 6.8, 6.10; [UI specification](../ui-specs.md) §§6, 8, 10–14; [system design](../system-sds.md); [SRS](../srs.md); root [AGENTS.md](../../../AGENTS.md). Frozen behavior wins. QueryBuilder structure and numeric defaults are recommendations, not new product/API authority.

## 1. Approval System collection scope

Use this guideline for My Requests, My Reviews, own delegations/notifications, authorized reports, and administrator configuration/escalation collections. Each query begins with the authenticated actor's permitted resources; a generic search component or SQL helper cannot broaden them.

| Project behavior            | Required adaptation                                                                                                            | Authority                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Request number/title search | Only authorized request summaries; status/date filtering and deterministic pages                                               | FR-005, FR-037–039; API §2.3 |
| Reviewer task queue         | Current assigned/delegated slots; WAITING is distinct from ACTIONABLE; no historical assignment-based current-record discovery | FR-008; API §4               |
| Admin escalation            | Minimal routing metadata and requestNumber search only; active PENDING-cycle scope, server-derived overdue                     | API §6.5.1; UI-12            |
| Own inbox / delegations     | Actor-scoped results and counts; Admin does not act as every reviewer                                                          | API §§4, 5.6, 5.8            |
| Reports / PDF               | Same authorized filter schema and visibility, without private payloads by default                                              | FR-050; API §6.8             |

The approved search envelope below is authoritative; widget layout, filter-dialog reset behavior, text-matching recommendations and internal QueryBuilder structure remain implementation defaults until finalized under the project's change control. Do not import maintenance resource fields, soft-delete controls, inventory/repair reports, generic download flags or additional collection endpoints. Reference source notes are retained in §§5.1 and 7 for provenance only.

## 2. Frozen transport contract

Use `POST /api/v1/<resource>/search` only where that route is listed in the API specification. Example for requests:

```json
{
  "pageNumber": 1,
  "pageSize": 20,
  "search": [
    { "name": "status", "condition": "EQUAL", "value": "PENDING" },
    {
      "name": "createdAt",
      "condition": "GREATEROREQUAL",
      "value": "2026-11-01T00:00:00.000Z"
    }
  ],
  "searchTerm": { "name": "requestNumber,title", "value": "equipment" },
  "orderBy": "createdAt desc"
}
```

The effective predicate is:

```text
serverVisibility
AND endpointBusinessScope
AND (filter1 AND filter2 ...)
AND (textField1 matches term OR textField2 matches term ...)
```

- `search` is flat AND. `searchTerm.name` is a comma-separated, server-allowlisted list of textual fields joined by OR. Combine the two groups with AND. Omit unused groups instead of emitting meaningless blank conditions.
- Request-type `visibleWhen` / `requiredWhen` condition groups are a separate form-definition contract. Their bounded `all` / `any` logic does not authorize nested AND/OR trees in collection search. Request statuses and task statuses likewise use their own endpoint schemas, not one combined enum.
- Operators are exactly `EQUAL`, `NOTEQUAL`, `CONTAINS`, `STARTWITH`, `ENDWITH`, `GREATER`, `LESSER`, `GREATEROREQUAL`, `LESSEROREQUAL`, `ISNULL`, `ISNOTNULL`; each field permits only compatible operators and typed values.
- `orderBy` contains one public allowlisted field and `asc`/`desc`. The server adds a stable unique UUID tiebreaker. The UI must not send a second sort key.
- Nested database paths, unapproved joins, raw SQL, unbounded conditions and broad wildcard queries are prohibited. Filters cannot override actor/department visibility.
- Unsupported keys/fields/operators, malformed values, invalid paging or sort combinations return `422 VALIDATION_ERROR`, never silent ignored predicates or accidental full scans.
- Defaults from API §2.3: page 1, size 20, maximum size 100, maximum 20 conditions and 5 text fields. These numeric limits are **implementation defaults, not frozen values**. UI default page choices are 10/20/50/100. The reference's 25-row choices do not override them.

Ordinary paged success returns a **direct JSON array**, with JSON metadata in exposed `X-Pagination`:

```json
{
  "currentPage": 1,
  "pageSize": 20,
  "totalPages": 3,
  "totalCount": 51,
  "hasPrevious": false,
  "hasNext": true
}
```

Expose the header through `Access-Control-Expose-Headers`. Return `[]` and truthful zero totals for no results. The API does not return `{data, pagination}`; an internal typed client result may combine parsed body/header without changing the wire format. Private JSON uses `Cache-Control: no-store`.

The old frontend describes metadata `pageSize` as rows returned, whereas this API's §2.2 example uses 20 for a 51-record/three-page query. Follow the current contract/schema; derive the visible current-page row count from array length and never equate requested page capacity with rows returned. Define and test final-page and zero-result metadata explicitly before implementation. A missing/malformed header is a protocol error, not permission to invent zero totals.

## 3. UI query lifecycle

1. Define a feature query configuration using shared Zod schemas, translated labels and endpoint-supported search/filter/sort fields. The frontend may narrow controls but never defines server authority. Render unsupported columns as unsortable.
2. Keep text input separate from committed query state. Debounce about 300ms; commit search/filter/sort/page-size changes together with `pageNumber=1` to avoid fetching an obsolete page.
3. Open the filter dialog with a copy of applied filters. Apply validates and commits; Cancel discards draft changes. Proposed default: Reset clears draft controls and Apply commits the reset; toolbar Clear all commits immediately. Specify these labels consistently. Each applied chip removes only its condition and resets page 1.
4. Preserve applied search/filter/sort/page in URL parameters for linkable collections, restore them on back/forward navigation, and validate decoded state. The HTTP request remains POST. Lookup dialog query state can remain local. Never put secrets, private payloads or attachment URLs into query strings; avoid persisting/logging private search state beyond required navigation.
5. Abort/ignore previous requests when query, scope or identity changes. Accept only the latest matching response, and clear previous-account data before rendering. Share this orchestration between table/card views and lookup adapters.
6. Show loading/refresh, successful empty dataset, successful no matches with Reset, validation failure, and recoverable error with Retry distinctly. Show the real server count and page state. If a mutation leaves an empty out-of-range page, refetch the last valid page (or page 1 for zero results) once using authoritative metadata; avoid loops.
7. On successful mutations, revalidate relevant collections and selection/eligibility caches. Never set final approval status before the server confirms it. Clear stale selected tasks or require explicit reconfirmation after query changes before bulk operations; do not imply all matching tasks were selected.

Use [styling](./styling-contract.md) for toolbar/chips/states, labelled controls, keyboard-operable sort buttons/`aria-sort`, pagination names, and mobile layouts. All visible labels and accessible messages support Thai/English.

## 4. Filter semantics and endpoint scope

| Input                      | Mapping and limitation                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text search                | Only configured textual fields; request number/title where allowed. Define bounded lengths and literal matching behavior in shared schema/tests                                                                                       |
| Enum/UUID/boolean          | Validate against declared field types; preserve stable enum keys and UUIDs. Never translate API values                                                                                                                                |
| Date range over instants   | Map start to `GREATEROREQUAL` and an exclusive next-day end to `LESSER` when the UI means inclusive calendar days; convert Bangkok boundaries to UTC once                                                                             |
| Date-only field            | Preserve calendar value and use that field's schema; no accidental timezone conversion                                                                                                                                                |
| Decimal comparison         | Preserve validated exact decimals through PostgreSQL numeric handling; do not infer types via `Number()` heuristics                                                                                                                   |
| Null check                 | Use `ISNULL`/`ISNOTNULL` under a field-specific shared schema; do not compare `EQUAL` with the string `"null"`. Settle required/omitted operator value representation in that schema                                                  |
| Multiple selected statuses | **No IN or arbitrary OR filter operator is approved.** Do not encode `PENDING,RETURNED` as EQUAL, or repeat EQUAL conditions expecting OR. Use a single-select filter until a coordinated API revision approves multi-value semantics |

For example, an inclusive Bangkok date range of November 1–2, 2026 becomes `>= 2026-10-31T17:00:00.000Z` and `< 2026-11-02T17:00:00.000Z`. Reject reversed/malformed ranges. Case sensitivity, Thai collation and literal `%`/`_` escaping must be documented and tested as implementation decisions; default recommendation is literal case-insensitive text matching, not client-supplied wildcard patterns.

Resource boundaries:

- Requests permit number/title text search, status, request type, priority and allowed date fields within actor visibility. Declare the complete field/operator/sort matrix in the endpoint Zod contract before implementing controls; this guideline does not authorize arbitrary fields.
- Review queue uses the caller's current/delegated task scope and permitted actionable/overdue attributes. Historical reviewer involvement never grants full current request discovery.
- Admin escalation uses the exact API §6.5.1 allowlist: `status`, `overdue`, `stageNumber`, `assignedReviewerId`, `dueAt`, `requestNumber`, each with its specified operators. Text search is requestNumber only. Sort is `dueAt`, `updatedAt`, `createdAt` or `requestNumber` plus server UUID tie. No title/body search, request content or blanket admin read bypass.
- With no explicit escalation filter, use overdue ACTIONABLE slots in active PENDING cycles, earliest due first. Explicit WAITING filters may show future slots; WAITING is never overdue. For ACTIONABLE, overdue uses non-null dueAt and server `now >= dueAt`. Keep active-PENDING scope even with explicit filters.
- Users/departments/admin configuration searches retain their admin-only audiences. Notifications are own-inbox only. [Lookup guidance](./lookup-table-guideline.md#5-approved-endpoint-fit-and-unresolved-gaps) records the reviewer-delegation candidate gap; do not solve it by widening admin search permissions.
- Report JSON and PDF use the same authorized filter schema and visibility logic. Do not export just the currently loaded page or introduce CSV, `isDownload` or unbounded normal search.

## 5. Backend fit and Global QueryBuilder guidance

### 5.1 What the old API demonstrates

Reference backend reviewed at commit `94ae60d3f023ff10bad4708f7cf00b97da63bc29`:

| Source                                                                                                                                                                                             | Evidence                                                                                          | Recommendation                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Infrastructure QueryBuilder](https://github.com/oangsa/maintenance-tracking-system-api/blob/94ae60d3f023ff10bad4708f7cf00b97da63bc29/src/Infrastructures/Repositories/Extensions/QueryBuilder.ts) | Common Drizzle SQL helper for AND filters, OR text search and ordering, with parameterized values | Reuse the idea of one shared SQL translator behind resource-specific definitions                |
| [DepartmentRepository](https://github.com/oangsa/maintenance-tracking-system-api/blob/94ae60d3f023ff10bad4708f7cf00b97da63bc29/src/Infrastructures/Repositories/Master/DepartmentRepository.ts)    | Applies builder expressions to a base projection and reuses WHERE for data/count                  | Preserve predicate reuse; add actor visibility and accurate root-record counting                |
| [Request normalizer](https://github.com/oangsa/maintenance-tracking-system-api/blob/94ae60d3f023ff10bad4708f7cf00b97da63bc29/src/Shared/Utilities/RequestFeatures/NormalizedRequestParameters.ts)  | Defaults/caps paging but bypasses the cap for size 999 and uses `MAX_SAFE_INTEGER` for downloads  | Do not carry bypasses into normal search; validate bounded inputs and use the approved PDF path |

The old builder is **not sufficient unchanged**. It accepts arbitrary/dotted identifiers, lowercases supplied fields, skips missing filter names/conditions, supports comma-separated sort keys, defaults unrecognized directions to ASC, and heuristically converts numeric/date/boolean values. Its explicit sorts lack a guaranteed unique tiebreaker. SQL value parameterization does not establish field authorization, type safety or scope isolation. These concrete differences conflict with API §2.3 and must be addressed in any future adaptation.

### 5.2 What exists in this repository

**Outdated assessment replaced (2026-11-13):** The health-only baseline `8d02023` no longer describes this repository. Owner-scoped request search now runs through [RequestRoutes](../../../apps/api/src/Presentations/Routes/RequestRoutes.ts), [RequestService](../../../apps/api/src/Applications/Requests/RequestService.ts) and [RequestRepository](../../../apps/api/src/Infrastructures/Database/Repositories/RequestRepository.ts). Shared [request collection schemas](../../../packages/contracts/src/requestCollection.ts) define the field/operator matrix and omit values for null checks. The [HTTP client](../../../apps/web/app/api/http.ts) parses direct arrays and X-Pagination and rejects missing/invalid metadata. Product tables and real-PostgreSQL search tests exist.

The repository uses resource-specific Drizzle composition rather than a global QueryBuilder; do not add another abstraction solely to match the recommendation below. [Request search polish](../../features/request-search-polish/spec.md) defines the bounded My Requests UI implementation, URL validation and page recovery. Review Queue expansion and other future collections remain separate. Existing tests are not proof of a new execution; record actual verification separately.

### 5.3 Recommended shared boundary

Use a small reusable Infrastructure QueryBuilder when implementation is requested. “Global” means shared query translation, not a singleton carrying actor state, a generic unrestricted CRUD endpoint or a new application framework. Start with Drizzle's existing SQL composition rather than adding a query library.

| Layer                       | Future responsibility                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts`        | Shared bounded search envelope primitives, per-resource schemas/allowlists, typed values and pagination metadata; no Drizzle or business authorization            |
| Presentation                | Authenticate active caller; validate the endpoint's shared schema; map errors to frozen codes; return direct DTO array/header and CORS exposure                   |
| Application                 | Derive trusted caller and operation scope; enforce use-case authority through inner interfaces; pass validated criteria and scope to repository                   |
| Domain                      | Own business eligibility/visibility rules and repository contracts; no Elysia, HTTP or Drizzle imports                                                            |
| Infrastructure repository   | Define approved public-key-to-column/expression mappings, joins, projections and mandatory scope predicates; invoke shared translation and execute data/count     |
| Infrastructure QueryBuilder | Translate only resolved, validated fields/operators/values into parameterized Drizzle predicates, single sort + unique tie, limit/offset; no permission decisions |

Conceptual flow: authenticated caller + endpoint Zod validation → application scope → resource repository field mapping → shared SQL translation → scoped rows/count → minimal DTO projection → array + header. This is a responsibility model, not a new API signature.

Safety and correctness requirements for a future implementation:

1. Maintain an explicit per-resource mapping of public camelCase keys to known Drizzle columns or server-owned expressions, with compatible operators, value parsers, text-search and sort flags. Never pass request names into `sql.identifier`, `sql.raw`, relation traversal or automatic joins. Reject unknown fields rather than dropping them.
2. Compose mandatory visibility/business predicates outside client-controllable groups. Scope applies to list rows, counts, reports and lookup candidates identically. An optional requester/department filter can narrow an authorized scope, never replace it. Keep minimal admin escalation projections separate from private request projections.
3. Parameterize values; escape literal wildcard characters for recommended text matching. Validate the declared field type before SQL. Keep decimal precision and UTC/date-only distinctions. Derived overdue uses one server clock value consistently for rows/count and treats WAITING as false.
4. Reject malformed sort syntax/direction and multi-sort input. Add a deterministic UUID tiebreaker; define null ordering for nullable due dates. Do not trust column display keys or object enumeration order as SQL sort declarations.
5. Apply bounded integer pagination and validated condition/text limits before execution; reject bypass flags and unsafe offset arithmetic. Reuse exactly the same predicate for data and total count. Joins must not duplicate root records; use appropriate EXISTS/distinct/base projection and test totals. If exact same-response row/count consistency matters under concurrent writes, use one statement or a suitable read snapshot; two parallel queries alone do not guarantee it.
6. Project only approved DTO fields; no `SELECT *` serialization of joined/private data. Do not expand detail permissions because a summary row exists. Keep SQL/driver failures internal and map user validation to `422`, with normal `401`/`403` handling.
7. Keep the helper stateless and independent of HTTP, sessions and domain transitions. Mutation authorization, eligibility rechecks, optimistic versions, idempotency and audit transactions remain in the planned use cases. Record the final internal choice with an ADR as required by SDS §16 before implementation.

## 6. Planned verification and change control

| Verification        | Expected evidence / existing traceability                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract/unit       | AND/OR grouping, type/operator compatibility, null/date/decimal parsing, unknown/dotted fields, invalid sort/page/length rejection, stable tie; `UT-12`, `API-05`                                                                       |
| Real PostgreSQL/API | Parameter safety, Thai/English text and literal wildcard behavior, duplicate-join counts, identical scoped rows/count, equal timestamp pages, zero/final pages and X-Pagination/CORS; `FT-037`–`FT-039`                                 |
| Security            | Direct HTTP scope-spoof attempts, hidden field/count leakage, own inbox, historical reviewer limits, admin escalation projection and WAITING/overdue boundaries; `SEC-02`, `SEC-08`, `SEC-10`, `SEC-12`, `API-11`                       |
| UI/browser          | Debounce/page reset, Apply/Cancel/reset/chips, URL/back-forward, stale responses, missing header/error versus empty, keyboard sort, table/card parity, locale/theme and account switch; `UI-16`, `UI-AC-07`, `09`–`12`, `17`, `19`–`20` |
| Reports/lookups     | JSON/PDF same filters and visibility, no page-only export; candidate permissions and mutation-time eligibility; `FT-050` and [lookup acceptance](./lookup-table-guideline.md#6-backend-requirements-and-planned-acceptance)             |

Consult the full [test plan](../test.md) and preserve [traceability](../traceability.md). These are future checks, not executed results. Before implementation, finalize resource field matrices, typed null/value representation, text matching, pagination edge semantics and the unresolved delegation-candidate API. Any new endpoint, permission or multi-value filter behavior requires coordinated approved API/UI/test revisions; do not change frozen contracts through a generic helper.

## 7. Reference source notes

The frontend [DataTable](https://github.com/oangsa/maintenance-tracking-system/blob/03c7801ba265cf90ed3403d29679f2d597b42e55/app/components/Common/DataTable/index.tsx) at commit `03c7801ba265cf90ed3403d29679f2d597b42e55` has debounced text search, a draft filter dialog with Apply/Cancel/Reset, removable active chips, sortable columns and paged service results. [ListPickerModal](https://github.com/oangsa/maintenance-tracking-system/blob/03c7801ba265cf90ed3403d29679f2d597b42e55/app/components/Common/ListPickerModal/index.tsx) applies a similar pattern to selection dialogs and ignores outdated responses. [Search types](https://github.com/oangsa/maintenance-tracking-system/blob/03c7801ba265cf90ed3403d29679f2d597b42e55/app/api/types/core/search.types.ts) distinguish conditions, multi-field text search and pagination. Adapt these patterns through feature services and shared contracts.

Do not inherit the reference's database-style field names, numeric identity, comma-encoded multi-select filter values, permissive sorts, `deleted` flag, pagination metadata assumptions or large-page downloads. The Approval System API remains authoritative. Main request/review desktop tables and mobile cards use one query/result/action model; never filter just the loaded page and describe it as a server-wide result.
