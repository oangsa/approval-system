# UI refinement verification

Executed 2026-11-13 on `feature/ui-refinement`, based on `sprint-1-staging` commit `87080586003dcfa4a2d939689e4075f0c7a84a0a`, in `/tmp/approval-ui-polish`. Verification ran before source commits. The owner subsequently authorized scoped commits, feature-branch push and a PR to active `sprint-1-staging`; merge and deployment remain unauthorized. The deployment checkout and its pre-existing edits were preserved.

## Actual results

| Check | Result |
| --- | --- |
| `npm run check` | PASS: workspace/root TypeScript checks, ESLint, 43 Vitest files / 387 tests, API/web/contracts production builds. Existing React Router v8 future-flag warnings remain. |
| `npm run test:integration` | PASS: 10 real-PostgreSQL files, 71 passed / 2 skipped. Used a separate migrated/seeded Docker Compose project `approval-ui-refinement`, loopback port 55519 and disposable `workflow_test`; no production database. |
| `E2E_WEB_PORT=14411 E2E_API_PORT=14412 npm run test:e2e` | PASS: all 26 Chromium tests against real API/PostgreSQL and production web/API builds. Final run includes the added type-label Apply/reopen/reload and field-associated validation/focus checks. |
| `npm run test:release` | PASS: all 11 local release/smoke regressions. No deployment performed. |
| `git diff --check` | PASS. |

The two skipped PostgreSQL checks are the existing opt-in built-listener session lifecycle and API-restart replay cases, requiring `RUN_BUILT_HTTP_SMOKE=1`; that opt-in was not enabled. Browser tests separately execute real built API listeners, but do not replace those exact opt-in assertions. Firefox/Safari and an assistive-technology session were not run.

## Acceptance evidence

- **POL-01/02:** Shared action styles compose the existing Button; ProductIdentity is shared by Landing, Sidebar and drawer. PageHeader is consumed by Requests and Reviews. Shell tests preserve role-union visibility, account sign-out, drawer trap/return and rail semantics; a new matchMedia regression covers tablet compact/desktop expanded defaults and listener cleanup. Browser authentication/shell regressions pass.
- **POL-03:** Existing list/query/race/account tests and My Reviews regressions pass. Collection regression verifies the actual final-page row range (`Showing 21–21`, rather than requested capacity). Browser sorts, pages, URL reload/back, requester/reviewer navigation and mobile card parity pass. Mobile toolbar keeps the sort label readable and refresh adjacent to Search.
- **POL-04:** Reproduced label loss from the original staging baseline: `Operations (OPS)` became generic after Apply/reopen. New component and browser assertions retain the name/code after Apply, reopen and URL restoration through the existing authorized type read. Component tests cover discarded drafts, aborted old-account resolution, unavailable metadata and Retry. Label metadata stays in account-generation-scoped React memory; no browser storage, directory download or new endpoint.
- **POL-05/06:** Criteria are grouped into Request details, Dates and Specific text. Native date inputs stack on narrow screens; footer gives Cancel/Apply equal deliberate columns. Reversed dates identify their range, associate messages with invalid controls and center the first invalid field above the sticky footer. Query tests cover exact error fields and submission conflicts. Real-browser checks verify dialog-internal overflow at 320px and that the focused invalid control lies above Apply; existing Apply/Cancel/Reset/Clear, Bangkok boundaries, debounce, URL and account isolation still pass.
- **POL-07:** Existing public SSR, no-JavaScript navigation, zero public API requests, responsive hydration, skip/anchor/sign-in and known-client-session redirect checks pass. Public workflow content remains static and explicitly illustrative.

## Visual checks

Final screenshots were generated against the tested production build with synthetic intercepted API responses, separately from the real-API browser suite. Inspected desktop Requests/filters, 768px tablet rail, 390px cards/toolbar, 320px validation, light/dark filter rendering, collapsed rail and desktop/mobile Landing. No observed whole-page horizontal overflow or browser page errors. Native dark calendar controls report `color-scheme: dark`; dark rendering was selected manually for inspection, not through a new preference feature.

Ignored local evidence under `artifacts/ui-refinement/`: `requests-1440.png`, `requests-768.png`, `requests-390.png`, `filters-1440.png`, `filters-320-error.png`, `filters-dark.png`, `sidebar-rail.png`, `landing-1440.png`, `landing-390.png`, `browser-observations.json` and the browser audit script. The repository browser suite also writes `artifacts/playwright/request-filters-320-validation.png`, other request/landing captures and its HTML report. All identities/records in screenshots are synthetic.

## Iteration record and boundaries

The first full browser run exposed an implicit-label regression in the revised Priority control; explicit labels corrected it without weakening the existing assertion. Screenshot review also corrected operator sizing, fieldset grid flow, native-date overflow, dark calendar icons and error placement. Final workspace and complete browser reruns passed. A separate synthetic screenshot harness initially lacked CORS handling for the final build's API origin; correcting that ignored harness allowed the final capture pass, without changing application CORS.

Only the owner's AXONS and Maintenance Tracking System references were used. No backend behavior, wire schema, migration or dependency change; only optional cancellation/generation parameters were added to the existing frontend type-read adapter. Full-product theme/language preferences, notifications, reports, Review Queue advanced filters and additional query operators remain with their existing owners. This slice does not close #12 or #17. The owner subsequently authorized scoped commits, feature-branch push and a PR; merge and deployment remain unauthorized.
