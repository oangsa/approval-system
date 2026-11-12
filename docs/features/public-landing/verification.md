# Public landing verification

Executed 2026-11-13 on `feature/public-landing-page`, based on `sprint-1-staging` commit `be08785187ffd7d2a839b3af4069fa84b41f35e6`.

| Check | Actual result |
| --- | --- |
| `npm run check` | Passed: all workspace typechecks, ESLint, 41 Vitest files / 357 tests, and API/web/contracts builds |
| `npx playwright test e2e/smoke.spec.ts` | Passed: 5 Chromium checks against production builds and isolated loopback listeners |
| `npm run test:release` | Passed: 11 checks, including new public-content, earlier-page rollback compatibility, wrong-SHA and unhealthy-API smoke regressions |
| Final `npm run typecheck` / `npm run lint` | Passed after release-smoke changes |
| `git diff --check` | Passed |

LAND-01–03: public HTML includes the introduction, illustrative progress and sign-in link. Desktop 1440×900 and mobile 390×844 hydrate with no browser errors, no page overflow and no API requests. Keyboard Skip to content focuses main; overview anchors and sign-in navigation work. Both sizes run with reduced motion. A separate JavaScript-disabled browser confirms SSR content and native links.

LAND-04: component regression verifies an already authenticated client session redirects to `/dashboard`; the public route does not initiate session restoration or business queries. LAND-05: release smoke no longer depends on the obsolete milestone slogan; it validates the product title and main landmark while preserving release-SHA/health checks and compatibility with earlier public pages during rollback.

Full-page previews were visually inspected at both sizes; ignored artifacts are `artifacts/playwright/landing-1440.png` and `artifacts/playwright/landing-390.png`. No artifacts, secrets or environment files belong in the change.

Limits: Firefox/Safari and full product E2E/PostgreSQL suites were not run for this public presentation slice. Global theme/language preference handling remains outside this change; no claim of completing UI-01/UI-09. Existing React Router v8 future-flag build warnings remain. No production deployment or branch promotion performed; teammate review remains required.
