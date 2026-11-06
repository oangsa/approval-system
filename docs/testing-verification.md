# Verification evidence — 2026-11-06 (Issue #1, authentication & role access)

Environment: Windows 11, Node.js v24.22.1, npm 11.19.1, Docker 29.7.2 (PostgreSQL 17-alpine test service), Chromium 148 via Playwright 1.60.

Tested revision: the four packet commits of PR18 ending at `5ed9696` on `feature/1-identity-auth-access`, plus the documentation edits described below. No secrets, generated artifacts, or lockfile changes were staged.

This document replaces the 2026-11-04 bootstrap record, which described an environment without registry access. Every command below was executed in this workspace and its result is actual.

## Installation

| Command  | Result                                                                                                                                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci` | **PASS** — 540 packages installed from the committed root `package-lock.json` in 1m; registry reachable (`npm ping` PONG 352ms). npm reported 11 known dependency advisories (10 moderate, 1 high) in the existing dependency graph; no dependency versions were changed by this work. |

## Executed commands and outcomes

| Command                    | Result   | Evidence                                                                                                                       |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`        | **PASS** | All four workspace typechecks plus root `tsc -p tsconfig.json`                                                                 |
| `npm run lint`             | **PASS** | ESLint (Allman/quotes/semi) and `prettier --check .` clean                                                                     |
| `npm test`                 | **PASS** | 19 files, **250 passed, 0 failed, 0 skipped**                                                                                  |
| `npm run test:web`         | **PASS** | 6 files, **75 passed** (transport, token store, auth service, session, login form, shell)                                       |
| `npm run test:api`         | **PASS** | 11 files, **167 passed**                                                                                                        |
| `npm run test:contracts`   | **PASS** | 2 files, **8 passed**                                                                                                           |
| `npm run build`            | **PASS** | API bundle 69.0 kB; web client 1861 modules plus SSR server bundle; contracts declarations                                      |
| `npm run check`            | **PASS** | typecheck → lint → 250 tests → build, all green                                                                                |
| `npm run db:test:up`       | **PASS** | Disposable `workflow_test` container healthy on `127.0.0.1:55432` (tmpfs)                                                      |
| `npm run db:test:migrate`  | **PASS** | Reviewed Drizzle migration applied to an empty database                                                                        |
| `npm run db:test:seed`     | **PASS** | Idempotent synthetic identity fixtures inserted (2 departments, 6 users, 3 roles)                                              |
| `npm run test:integration` | **PASS** | 4 files, **31 passed, 0 failed** with `RUN_BUILT_HTTP_SMOKE=1` (real PostgreSQL, independent connections, built HTTP listener) |
| `npm run test:coverage`    | **PASS** | Statements 72.99%, branches 82.67%, functions 62.17%, lines 73.22% (report under `artifacts/coverage/`)                        |
| `npm run test:e2e:install` | **PASS** | Chromium 148.0.7778.96 plus headless shell downloaded                                                                          |
| `npm run test:e2e`         | **PASS** | **16 passed, 0 failed** (8 workers) against real PostgreSQL and a real browser                                                 |
| `npm run db:test:down`     | **PASS** | Test container stopped and removed                                                                                             |

The E2E run is self-contained: Playwright builds both applications before starting them, so no external `VITE_API_BASE_URL` is required.

## What the browser suite proved

- IA-E2E-01: a real login with seeded credentials reaches `/dashboard` with the current identity.
- IA-E2E-02: a returning browser bootstraps identity from the HttpOnly refresh cookie (refresh → me) without re-entering credentials; the cookie is `httpOnly`.
- IA-E2E-03: logout revokes the session, protected routes redirect to `/auth/login?from=…`, and switching accounts never renders the previous identity.
- IA-E2E-03: a delayed bootstrap response cannot replace an identity established later, and a failed logout clears the private UI while a retry revokes both the bearer and the refresh credential.
- IA-E2E-04: wrong credentials show the generic error and never reach the shell; equivalent denials, an injected 429, and network abort/recovery are all exercised in the browser, and API-level throttling (429 with `Retry-After`) is additionally proven in `test:api`.
- IA-E2E-05: public server-rendered HTML contains no identity data and no serialized JWT.
- IA-WEB-05: the mobile drawer is a native `<dialog>` modal that wraps Tab and restores focus to the trigger; the desktop collapse rail and account disclosure are keyboard operable.
- Login validation: invalid fields are reported from the shared contract schema and focus moves to the first invalid field.
- Infrastructure: SSR and hydration without console errors at 1440px and 390px, plus `/health` through the real Node listener.

## Defects found and fixed during verification

1. **Duplicated `Cache-Control` header** on auth responses (`no-store, no-store`): the route-level header was appended on top of the application-level one. Fixed and verified with `curl` against a live listener on both the 401 and 200 paths.
2. **Redundant bootstrap refresh after login**: navigating to a protected page right after signing in triggered a second refresh whose abort could clear the refresh cookie. Bootstrap now runs only when no identity exists, and an aborted bootstrap no longer revokes a valid session.
3. **Drawer initial focus** landed on the close button instead of the first navigation link.
4. **Vite proxy stripped the `/api` prefix**, so `/api/v1/*` could never reach the API during development; the rewrite was removed.
5. **Playwright used a deliberately unreachable database URL**, so no auth journey could run; it now targets the disposable `workflow_test` database with an explicit CORS origin.

## GitHub Actions

Both verification runs for this branch passed on 2026-11-06 with the full pipeline, every step green:

- Push run `42214377956` — PASS (2m44s)
- Pull request run `42214385459` for #18 — PASS (2m39s)

Steps executed in order: `npm ci`, typecheck, lint, web/api/contracts suites, build, `db:test:migrate`, `db:test:seed`, `test:integration`, `test:e2e:install`, `test:e2e` (12 passed in 15.8s), artifact upload. Runner: `ubuntu-24.04` (Playwright 1.60.0 cannot install on the Ubuntu 26.04 image that `ubuntu-latest` now resolves to; the first run failed at browser installation and was fixed by adopting main's runner pin).

Note: those two runs are history from the earlier revision (`20b2769`, 12 browser tests). The results in the tables above come from the later local runs on the PR18 packet commits (`250` ordinary / `31` PostgreSQL / `16` browser), which supersede them; a fresh CI run is expected on the updated branch.

## Outstanding and not claimed

- **IA-E2E-04 is complete**: credential failure, equivalent denials, an injected throttle response, and browser network abort/recovery are all covered by the browser suite; API-level throttling is separately proven at the socket-peer and pair levels.
- **IA-DB final-state assertions** run at suite level (31 tests); individual cases are not itemized per ID in the STS.
- **`npm audit` advisories** in the existing dependency graph are unaddressed; no versions were changed in this feature.
- **Docker image builds** (`apps/api/Dockerfile`, `apps/web/Dockerfile`) were not executed.
- **E2E-01 and E2E-15 are partially covered**: only their identity portions (login, bootstrap, logout, account switch) are proven. Request creation, approval, and FT-003 business-resource journeys remain with their owning issues (#2, #3, #4, #11).
- **Ownership masking and role-denial coverage** comes from the real-PostgreSQL API/security suites; no test-only fixture route is registered in the production route registry.
- **TDD red/green history** lives in the commit sequence. Individual red states were observed during development (for example the failing single-flight refresh test before its handler was corrected) but were not archived as separate artifacts.

## AI-use declaration

GitHub Copilot (agent mode) drafted and revised the implementation, tests, and documentation in this repository, under the author's review. All code was reviewed, executed, and verified in this workspace before being committed; the results above are actual command outputs, not estimates.
