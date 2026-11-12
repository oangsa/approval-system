# Request search and shell polish verification

Executed locally on 2026-11-13 against the implementation on `feature/12-request-search-filter-pagination`, based on integrated staging commit `b5be291`. This is a bounded #12/#17 implementation; it does not close either issue or authorize promotion/publication.

## Results

| Check | Actual result |
| --- | --- |
| Workspace typecheck, ESLint, build | Passed. API Node bundle, React Router client/SSR build and contracts build succeed. Existing Router v8 future-flag warnings remain. |
| `npm test` | 43 files, 377 tests passed. Includes query validation, Bangkok date bounds, Apply/Cancel/Reset/chips, invalid URL recovery, page-size/sort/page recovery, focus wrapping/return, type lookup pages/errors/cancellation, account/query races and existing My Reviews regressions. |
| `npm run test:integration` | 10 files, 71 passed and 2 explicitly skipped. Dedicated disposable PostgreSQL was migrated/seeded through repository test scripts. Optional process-restart/session built-listener cases require `RUN_BUILT_HTTP_SMOKE=1`; that opt-in was not enabled. |
| `npm run test:e2e` | 25 Chromium tests passed. Real API/PostgreSQL request creation/detail, type/status/date filtering, URL reload/back restoration, keyboard sort focus, desktop/mobile overflow, native dialog focus trap/return, reduced motion, role/account isolation, private SSR and existing decision/review flows exercised. |
| Visual inspection | Desktop 1280px and mobile 390px request collections and advanced-filter dialogs inspected from Playwright screenshots. Mobile uses cards; dialog scrolls while preserving visible footer actions. |
| `git diff --check` | Passed. |

A reproduced debounce/dialog remount race was corrected by preserving the draft across query commits while retaining account-generation remounts; a regression covers the combined search/filter result.

Initial browser runs exposed a missing reduced-motion rule and dialog keyboard-edge behavior; both were corrected without weakening assertions. Filter labels were made explicit for stable control association. One intermediate run was interrupted after concurrent builds replaced browser assets; the final full browser run used a single completed build and passed. No production database/service was used.

## Generated evidence

The browser test writes ignored local artifacts (not source/history): `artifacts/playwright/request-list-desktop.png`, `request-list-mobile.png`, `request-filters-desktop.png`, `request-filters-mobile.png`, and the Playwright HTML report. Re-run the suite to regenerate them. Screenshots contain synthetic test identities and records only.

## Limits

- Chromium only; Safari/Firefox not executed.
- No API/schema/permission changes or new dependencies. Filters remain flat AND; multi-status OR and nested condition groups are not supported by the frozen search contract.
- Type discovery remains enabled published metadata only. Disabled historical selections can be cleared, but this slice does not invent an endpoint to discover them.
- Full-product themes/localization, notifications, reports and Review Queue advanced-filter controls remain with their existing owning issues.
- Verification ran before source commits. The owner subsequently authorized scoped commits, feature-branch push and a PR to active `sprint-1-staging`; merge and deployment remain unauthorized. Existing deployment worktree edits remain separate.
