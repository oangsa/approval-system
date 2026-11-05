# Bootstrap testing verification — 2026-11-04

These are actual results from this workspace. No commit, push, PR, reference-repository edit, schema migration, reset, seed, or deployment was performed. `AGENTS.md` was preserved. The mounted `.git` directory contains no usable repository metadata, so Git branch/status checks are unavailable here.

## Toolchain and installation

Node.js v24.18.1; npm 11.16.0. Project tooling no longer invokes or imports Bun. The requested npm-only correction takes precedence over the earlier Bun-based setup.

`npm install --ignore-scripts --fetch-retries=0 --fetch-timeout=5000` failed with `EAI_AGAIN` resolving registry.npmjs.org. Offline resolution also lacks required packages. A complete workspace installation and genuine root `package-lock.json` could not be produced. No lockfile was fabricated.

Validation used copies of cached third-party packages in ignored `node_modules`, including Vitest 4.1.10 and compatible Vite 6.4.3. This is not an installed or verified production workspace graph; the declared frontend Vite 7/framework toolchain still requires registry access. Missing packages include the React Router framework CLI, Elysia's Node adapter, and the V8 coverage provider.

## Executed commands and outcomes

| Command                                                                                   | Actual result                                                                                                                                |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                                                | 6 files, **51 passed, 0 failed, 0 skipped**                                                                                                  |
| `npm run test:web`                                                                        | 2 files, **4 passed, 0 failed, 0 skipped**                                                                                                   |
| `npm run test:api`                                                                        | 3 files, **41 passed, 0 failed, 0 skipped**                                                                                                  |
| `npm run test:contracts`                                                                  | 1 file, **6 passed, 0 failed, 0 skipped**                                                                                                    |
| `npm test -- --reporter=default --reporter=junit --outputFile=artifacts/vitest/local.xml` | **51 passed**, JUnit evidence emitted                                                                                                        |
| `npm run lint`                                                                            | ESLint and Prettier passed after formatting                                                                                                  |
| `tsc -p tsconfig.json` via installed local executable                                     | Root tooling/E2E configuration types passed                                                                                                  |
| `npm run typecheck --workspace @workflow/contracts`                                       | Contracts source, tests, config, and type assertions passed                                                                                  |
| `npm run typecheck`                                                                       | Failed: missing `@elysia/node` types and React Router framework CLI; not a full typecheck pass                                               |
| Direct web TypeScript check                                                               | Blocked by uninstalled framework/Tailwind and UI utility packages                                                                            |
| `npm run build`                                                                           | API bundle and contracts declarations built; web build failed because React Router CLI is unavailable                                        |
| `CI=true npm run test:coverage`                                                           | Blocked: `@vitest/coverage-v8` unavailable; no coverage percentage reported                                                                  |
| `npm run test:integration` with explicit local `workflow_test` URL and `NODE_ENV=test`    | Database setup failed with actionable instructions; **1 failed suite, 0 passed tests, 3 skipped tests**. No successful real PostgreSQL query |
| `npm run test:integration` with a `workflow_dev` target                                   | Guard rejected config before any database connection/test execution                                                                          |
| `npm run test:e2e`                                                                        | Blocked during required frontend build; **no browser test executed**                                                                         |
| `npm exec --no -- playwright test --list`                                                 | Configuration loaded and discovered **4 Chromium smoke tests**; discovery is not execution                                                   |
| Development Compose `config --quiet`                                                      | Passed with local API environment                                                                                                            |
| Disposable test Compose `config --quiet`                                                  | Passed with test example environment; no database started                                                                                    |

The PostgreSQL setup failure is a failing integration invocation, not a passing or silently skipped integration run. Ordinary unit/API tests exercised the real Elysia request handler without binding a network port. No real-browser or live-listener success is claimed. Docker daemon access is denied in this environment; PostgreSQL connectivity and Docker image builds remain unverified.

## Guard regression ledger

- Initial ordinary suite: 49 passing tests.
- New PGPORT regression: 1 failed, 39 passed in the API project. The guard accepted a missing-port test URL even when postgres.js would choose PGPORT and hit the configured baseline target.
- Source trace: postgres.js resolves port as explicit options, URL port, PGPORT, then 5432. A connection-free driver assertion verified that an explicit URL port disproves a blanket override hypothesis. The same probe confirmed encoded database paths remain literal in postgres.js.
- With the encoded-path regression added: 2 failed, 39 passed. Both failures reproduced before changing the guard.
- Guard updated to reject ambient PGPORT and require the literal /workflow_test path: API project 41 passed; aggregate suite 51 passed. No connection was opened by the parser/port probes.

## Completion prerequisites

1. Restore registry access, run `npm install`, and commit the generated root `package-lock.json`.
2. Run `npm run check` and `npm run test:coverage` using that complete dependency graph.
3. Copy/configure `apps/api/.env.test.example` to ignored `.env.test`, run `npm run db:test:up`, then `npm run test:integration` against the isolated `workflow_test` service.
4. Run `npm run test:e2e:install` followed by `npm run test:e2e` for actual Chromium, SSR, hydration, and API-listener verification.
5. Validate Docker image builds once daemon access is available. CI is configured for these checks but has not run in this session.
