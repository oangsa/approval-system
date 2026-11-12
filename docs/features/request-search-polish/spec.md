# Request collection and navigation polish

## Scope and authority

Owner requested this bounded implementation on 2026-11-13, bringing the My Requests portion of issue [#12](https://github.com/oangsa/approval-system/issues/12) and shell presentation portion of [#17](https://github.com/oangsa/approval-system/issues/17) forward. Neither issue is completed by this slice. Review Queue advanced filters, PDF, full-product theme/language preferences and other future workflows remain with their owners. Develop on `feature/12-request-search-filter-pagination`; this owner-requested early slice targets the active `sprint-1-staging` branch. Subsequent promotion still requires reviewed dev and main PRs. The owner separately authorized scoped commits, feature-branch push and opening a PR on 2026-11-13; no merge or deployment is authorized.

Use only [maintenance-tracking-system](https://github.com/oangsa/maintenance-tracking-system/tree/03c7801ba265cf90ed3403d29679f2d597b42e55) as the published UI reference. The Approval System's frozen requirements/API/UI contracts govern behavior. Keep neutral semantic tokens, Lucide, Tailwind, existing base primitives and native accessible controls; introduce no dependency or new endpoint.

## Design and numbered acceptance criteria

1. Navigation has distinct icons, role-union visibility, grouped workspace destinations, an accessible icon rail/mobile drawer, account footer and current-page context. Remove New request from navigation, preserving `/requests/new` and the My Requests primary action. Keyboard users can skip to main content. No unimplemented links or fake counts.
2. My Requests uses a search/filter toolbar, applied filter chips, sortable allowlisted columns, server counts, page-size choices 10/20/50/100 and equivalent compact mobile cards. Default size remains 20. Zero results never display page 1 of 0; an empty out-of-range page recovers once to the server's last valid page.
3. Advanced filters expose status EQUAL/NOTEQUAL; typeId EQUAL; priority EQUAL; createdAt/updatedAt/submittedAt date ranges; submittedAt ISNULL/ISNOTNULL; title/requestNumber EQUAL/CONTAINS/STARTWITH. Date ranges include Bangkok calendar days using `>= start` and `< next-day end` UTC instants. Reject malformed/reversed dates and incompatible submission constraints. No arbitrary OR/IN, multi-sort or client-only filtering.
4. Opening filters copies applied state. Apply validates and commits atomically at page 1; Cancel/Escape discards; Reset clears the draft only; Clear all commits immediately. Each chip clears only its field/range. Filters, search, sort, page and page size restore from URL/back/forward. Legacy status/updatedOn links remain supported. Invalid URL criteria show recoverable validation feedback without issuing an unfiltered request.
5. Request-type selection is server-backed and paged through existing enabled published metadata; no directory download or permission widening. Existing unavailable selections remain visible with safe fallback and Clear guidance. Historical disabled-type discovery remains an API gap, not an invented endpoint.
6. Keep transport in API layer and request orchestration in services. Infer shared query types from Zod; retain owner scoping, exact array/X-Pagination transport and cancellation/generation isolation. Filter edits do not fetch until Apply. Loading, refreshing, empty dataset/no matches and retryable/terminal failures remain distinct; previous-account data must never render.

## Verification plan and traceability

AC 1: shell component and browser keyboard/mobile/navigation tests. AC 2–4: query unit tests, list/collection components and desktop/mobile browser journeys covering URL restoration, Apply/Cancel/Reset/chips, sorting, pagination recovery and zero results. AC 5: paged metadata/error/cancellation tests. AC 6: existing contract/API/real-PostgreSQL privacy suites, list account/query-race tests and authenticated SSR checks. Run typecheck, lint, ordinary suites, build and applicable PostgreSQL/browser suites; record actual results separately, not as implied passes.

Maps to FR-005/037/038/039/040, AC-005/037/038/039/040, UT-12, SEC-02/03/11, UI-16/20/23, E2E-13/15; root traceability and test plan link this slice. Shared collection changes also require My Reviews regressions. No DB schema or wire-contract change is planned.
