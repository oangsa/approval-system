# Testing foundation

Scope: infrastructure only; npm Workspaces, Node.js, React Router, Elysia, PostgreSQL/Drizzle, and Zod. No application features or fictional domain fixtures.

## Reference inspection

Inspected TokTickIT's actual `client/vite.config.ts`, `client/tests/setup.ts`, frontend component/API tests, `server/vitest.config.ts`, health tests, `server/tests/lab-03/postgres/testDatabase.ts`, database/schema tests and disposable Compose service, `server/src/databaseTargetGuard.ts`, `playwright.config.ts`, `playwright.global-setup.ts`, responsive/browser specs, and verification workflows.

Retained separate fast/database/browser suites, setup/teardown, semantic UI queries, explicit database-target validation, disposable PostgreSQL, managed Playwright servers, failure evidence, and CI checks. Replaced Express/Supertest with Elysia's real `.handle()` and Prisma with Drizzle. Removed business fixtures, labs, seed/reset steps, authentication, hardcoded application roles, and duplicated E2E guards. No Playwright global setup is needed for a liveness-only suite with no schema or seeds. MSW starts strict instead of bypassing unknown requests; browser mocks are added only if real components require them.

## Acceptance criteria and evidence

| Requirement                             | Implementation/evidence                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starter is accessible                   | `apps/web/tests/components/home.test.tsx`: main, level-one heading, visible description                                                                                                     |
| Transport boundary and workspace import | `apps/web/tests/unit/http.test.ts`: cookie credentials, shared schema, server error, empty response via MSW                                                                                 |
| Safe HTTP initialization                | `apps/api/tests/integration/application.test.ts`: no listener, shared health contract, 404, safe 500 from a test-only throwing route                                                        |
| Valid environment                       | `apps/api/tests/unit/environment.test.ts`: defaults and malformed/missing URL, protocol, host, port rejection                                                                               |
| Guard fails closed                      | `apps/api/tests/unit/testDatabaseTargetGuard.test.ts`: explicit local test URL, protocols, env, names, aliases, encoded identities, remote/query/fragment rejection, credential-safe errors |
| Real DB behavior                        | `apps/api/tests/postgres/connection.test.ts`: Drizzle `SELECT 1`, database identity, failed authentication, unsafe-target rejection, resource closure                                       |
| Contracts stay independent              | `packages/contracts/tests/health.test.ts`: real export, valid/invalid inputs, inferred-type equality; TypeScript checks test files                                                          |
| SSR and real browser                    | `e2e/smoke.spec.ts`: HTML before JS, heading/title, observed React commit, no console/page errors, 1440px/390px overflow, real API health                                                   |
| Evidence retained                       | CI JUnit, Playwright HTML/screenshots/traces, V8 coverage, all generated under ignored artifacts                                                                                            |

The static starter has no interaction to test. user-event is ready for future components; no artificial button was added. Exception testing adds a throwing route only on a test-local instance, exercising the production error handler without inventing an application feature or mocking it.

## Safety and extension rules

The shared guard is the single authority for PostgreSQL test connections and test migration configuration. It returns only verified explicit test URLs, never development fallbacks. Loopback names normalize conservatively for identity checks; remote targets cannot be opted in by changing a test flag. TEST_DATABASE_URL cannot contain query parameters that override driver connection options. The exact literal test database name is workflow_test; encoded target spellings are rejected to match postgres.js parsing. PGPORT must be unset because it overrides a missing URL port and can invalidate identity comparisons. Future reset/cleanup tools must call the same guard before constructing any database client and must never accept DATABASE_URL as a fallback.

Ordinary Vitest projects do not load application environment files. PostgreSQL configuration loads only the optional API `.env.test`, with injected environment taking precedence. Connections are closed even on failed tests. Browser servers are separate processes with test-specific ports and API database settings and never reuse external listeners. No test performs destructive SQL at this stage.

Future features should add tests in these existing projects: domain/application units, `.handle()` authorization/error tests, guarded persistence/transaction tests, and real browser journeys as features appear. Keep fixtures deterministic, mocks at external boundaries, resource teardown explicit, and assertions tied to public behavior.
