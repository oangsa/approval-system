# Sidebar, request collection and landing refinement

Owner requested implementation on 2026-11-13 after reviewing `sprint-1-staging` at `8708058`. Develop on `feature/ui-refinement`, targeting the active `sprint-1-staging` through teammate review; retain reviewed dev/main promotion. This is a further bounded #12/#17 slice, not completion of either issue. The owner subsequently authorized scoped commits, feature-branch push and opening a PR. Merge and deployment remain unauthorized.

## References and boundaries

Use only the local AXONS frontend at `/run/media/oangsa/CE666BB9666BA0C7/Code/Repos/AXONS-PROJ/axons-frontend/` and [Maintenance Tracking System](https://github.com/oangsa/maintenance-tracking-system) as design references. Adapt AXONS' grouped criteria/operator/date controls and Maintenance's sidebar/header/footer and collection composition to existing Tailwind, neutral semantic tokens, Lucide and base primitives. No Ant Design, Less, new dependency, business navigation, fake metrics or new API is adopted. Approval System frozen product/API/UI and shared styling/search/lookup guidelines govern behavior.

## Design and acceptance

- **POL-01:** Shared action styling and product identity unify the Sidebar and Landing Page. Page headings and collection controls use consistent spacing, focus, disabled, hover and reduced-motion treatments. Compose existing primitives; do not add feature behavior to raw UI primitives.
- **POL-02:** Sidebar has a clear brand header, named Workspace section, aligned active links/icon rail, readable account footer and managed mobile drawer. Tablet uses a compact rail by default, desktop expands; explicit collapse/expand remains usable. Keep existing role union, shipped destinations, skip link and focus return. The account trigger's accessible name remains the display name.
- **POL-03:** My Requests uses a responsive search/filter toolbar, readable applied chips, same desktop table/mobile card data, clear server totals/page range and existing 10/20/50/100 sizes. Preserve query/debounce/URL/back/cancellation/account isolation and shared My Reviews collection behavior.
- **POL-04:** A selected enabled request type retains its name/code in the dialog and applied chip after Apply, reopen, URL reload and back navigation. Resolve restored selection only through the existing authenticated type read. Disabled/inaccessible selections retain an explicit unavailable fallback and Clear; temporary failures offer Retry. Selection metadata is account-scoped memory only; discarded drafts never change the applied type.
- **POL-05:** Advanced filters group basic, date and text criteria with a deliberate small-screen footer. Retain all existing field/operator options, inclusive Bangkok ranges, flat AND, Reset-draft/Cancel/Apply/Clear semantics and page reset. No nested OR/IN, saved-filter management or multi-sort.
- **POL-06:** Invalid filter fields/ranges have specific inline messages, `aria-invalid` and associated descriptions; applying focuses the first invalid field, preserving draft state. Submission/date conflicts identify the relevant controls. Query validation continues to reject malformed URL criteria without unfiltered fallback.
- **POL-07:** Landing retains its public SSR introduction, static illustrative progress, three-step overview, working sign-in/anchor/skip links and known-client-session redirect. Refine typography, whitespace, CTA and shared identity. No business queries or user-derived SSR data.

## Verification and definition of done

POL-01/02: shell component and desktop/tablet/mobile keyboard, rail, account and focus browser checks. POL-03: existing collection/list/review unit/component/browser regressions. POL-04: Apply/reopen/reload/back, unavailable/retry/cancellation and account-generation tests. POL-05/06: query and component field/error/draft regressions plus real-browser validation/focus at 320/390px and desktop. POL-07: existing public SSR/no-JavaScript/zero-business-query smoke. Inspect light/dark rendering and reduced motion, long labels and viewport overflow. Run workspace typecheck, lint, tests, build and applicable browser suite; record actual results and any blocked/unrun PostgreSQL/browser cases separately.

Maps to FR-005/037–040, AC-005/037–040, UI-AC-07/10/17/20, UT-12, SEC-02/03/11/14 and E2E-13/15; LAND-01–04 remain applicable. No backend, shared wire schema, DB migration, global theme/language preference, notification, reporting or workflow change. Acceptance requires actual evidence; neither existing issue is closed through this slice.
