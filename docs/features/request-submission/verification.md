# Request submission — actual local verification

Date: 2026-11-06 (Asia/Bangkok). Branch: `feature/2-request-submit-validation`. Baseline HEAD: `bc128df61fb32aa493fe9838fadaf957f5a9589f`. Initial verification ran against the implementation working tree on that baseline. The owner subsequently authorized scoped commits, feature-branch push and PR creation; the source/configuration commits are listed below. No remote CI result, PR approval, merge or release is claimed. Planned independent reviewer: @kittipichcha. The next authorized feature PR must target `sprint-1-staging`, then reviewed promotion to `dev`, then release-reviewed `main`.

## Environment and database setup

Node.js 24.18.1, npm 11.16.0, Docker Engine 29.9.2, PostgreSQL 17 via the repository Compose services. Development is loopback port 5432 / `workflow_dev`, with a persistent Docker volume. Tests use loopback port 55432 / `workflow_test`, with disposable tmpfs storage. Both services were started during setup. The disposable test service was restored and reseeded before the later one-worker browser verification. The existing development environment file was preserved and completed with missing application settings; a separate test environment was created. Real database and local login credentials exist only in ignored `apps/api/.env` and `apps/api/.env.test`, mode 0600. A scan found zero occurrences of those real local credentials in Git-visible files, and `git check-ignore` confirmed both files are ignored and untracked.

Applied migrations to both databases:

- `0001_legal_longshot.sql`: form/policy versions, draft/submission tables, revision items, stages/slots, audit/outbox, idempotency records, sequence and FK/unique/check constraints.
- `0002_submission-immutability.sql`: immutable published form/policy content, submitted revisions/items, original request identity/department/number and cycle snapshots.
- `0003_tranquil_iceman.sql`: unique active type-wide and department-specific budget ceilings.

`npm run db:seed` provisioned a General request definition, Operations department, local Requester/Reviewer accounts and a one-stage eligible review route. Passwords are generated locally and retained in the ignored API environment. `NODE_ENV=test npm run db:test:seed` installed the deterministic synthetic test identities, definition and routing, and passed again after migrations. Seeding does not reset existing accounts or overwrite a later published-version pointer. `npm run db:check` passed: PostgreSQL connection verified.

## Final checks

| Command | Actual outcome |
| --- | --- |
| `npm run check` | PASS: all workspace/root typechecks, lint, 257 tests across 22 files, API/web/contracts production builds |
| `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` | PASS: 45 tests across 5 files; no skips; includes real built Node HTTP listener |
| `NODE_ENV=test npm run test:e2e` | PASS: 18 Chromium tests using one worker (12.0s on the final sequential run), including complete real-database submission, accepted-response loss and unchanged-key replay, fresh retrieval and private-SSR isolation |
| `npm run db:migrate` / `NODE_ENV=test npm run db:test:migrate` | PASS on development/test respectively |
| `npm run db:seed` / `NODE_ENV=test npm run db:test:seed` | PASS |
| `npm run db:check` | PASS |
| `git diff --check` and private-credential/ignore checks | PASS |

Browser screenshots/traces/report are local ignored artifacts under `artifacts/playwright/`. The saved-result screenshot was visually inspected. Build emitted existing React Router v8 future-flag notices and Playwright emitted color-environment notices; these did not fail checks. Docker image builds, hosted CI, teammate review and deployment were not run.

## Recheck and repairs

The agent applied an end-to-end scrutinize pass focused on major mismatches: strict transport → current identity/owner authorization → version and durable replay fence → stored-definition validation → trusted department/policy/reviewer resolution → transaction → immutable response → wizard retry/result display. Existing authentication/session and browser regressions were retained.

A major mismatch found during this pass was incomplete item drafts reusing a computed zero total as a manual monetary authority on later edits. Content reconstruction now uses the stored form's line-item capability; a real-PostgreSQL regression creates an incomplete item draft, adds rows, and successfully submits with the exact total. Explicit competing client monetary authorities still fail validation. Budget uniqueness and bounded repository-side metadata queries were also checked. No unresolved major mismatch was found within this slice; this agent check is not independent teammate approval.

Earlier failed runs were corrected rather than hidden: static Elysia routes supplied no params object (guarded with an empty default); browser config initially omitted private test DB credentials (now loads the same guarded test environment); one E2E label selector matched both section/control (made exact); preexisting navigation expectations were updated for the new link, while auth-only CORS header behavior was preserved. An initial migration attempt was denied loopback access by the sandbox and succeeded with authorized local-database access. A test migration without explicit test mode was rejected by the isolation guard and passed with `NODE_ENV=test`. No tests were removed, weakened or skipped to obtain these results.

## Coverage and scope

- FT-004/014/015/016, CT-01/02: strict draft/submit/revision contracts, generated OpenAPI, conditional dependency order, false-as-present, hidden-field rejection, exact decimals and totals.
- EP-023/024/033/035/036, API-03/08/09: active/published metadata reads, 201/Location/direct DTO, malformed/unknown authority rejection, patch/submit conflicts, CORS, current authentication, owner/current-reviewer visibility and no Admin bypass.
- DB-01/03/04/09, CX-07/08/09/14: real commits observed through another connection; precommit failure after submission writes rolls back revision/cycle/slots/number/audit/outbox/claim; concurrent distinct numbers; DB number-collision rejection; same-key concurrency and durable replay across repository instances; changed-body conflict; stale-write prevention; inactive/missing/self reviewer, stale form, department and budget rejection; immutable evidence and original department/cycle preservation.
- UI-05/08/20, E2E-01 submission portion: incomplete draft saves, Back/Next values, conditional validation and first-error focus, skipped unavailable item/upload step, explicit confirmation, accepted-response loss/retry using identical action keys, authoritative read-only result, retrieval after reload, and no private data in public SSR.

This implements submission persistence infrastructure only. Full Save/Resume listing/edit routes, RETURNED working-revision creation/resubmission, reviewer queues/decisions, configuration UI, uploads and behavior-specific downstream transaction proofs remain with their owning issues. Fixed-point money uses at most 16 integer digits/two fractional digits; quantities allow up to 18 integer/six fractional digits, with positive quantities and nonnegative unit amounts. Per-line money rounds half-up to two places; totals sum exact cents, with server range validation. Request numbers are `REQ-` plus an eight-digit-minimum sequence. Rolled-back sequence allocations may leave gaps; uniqueness and immutability, rather than gaplessness, are the contract.

Actual results were also recorded on [Issue #2](https://github.com/oangsa/approval-system/issues/2#issuecomment-6689229045). The issue remains open pending the required teammate review and authorized integration workflow.

## Authorized source commits and sequential browser follow-up

Source/configuration through `9701501c49d436efd1c8c371de8a944a7c75e08e` is split into scoped commits:

- `18b9ba7` — submission design and acceptance documents.
- `d77d1f1` — shared contracts/runtime field validation and contract tests.
- `b6c0204` — atomic API/domain/database submission behavior and related tests/migrations.
- `3e733c8` — client-loaded wizard and browser regression.
- `0a6fb89` — local/test seed entry points and safe configuration examples.
- `1466b3e` — guarded test database configuration and single-worker Playwright runs.
- `9701501` — explicit CI test mode for that database guard.

The owner's resource-use preference is now `workers: 1`, `fullyParallel: false` for both local and CI browser runs. The first sequential attempt encountered a stopped disposable PostgreSQL service (11 failures, 7 passes). After restoring the service, rerunning migrations and seed, all 18 browser tests passed in 12.0 seconds using one worker. Root TypeScript checking, Playwright-config lint and diff whitespace checks passed for this configuration change. No tests were weakened to work around the unavailable service.

The documentation/verification commit follows these source commits. Independent review remains pending; the agent does not approve its own PR or authorize merging it.

Before push, the request HTTP integration fixture was made independent of private local auth settings: it now supplies explicit synthetic JWT/origin configuration and consumes only the guarded test database target. Its 14-test PostgreSQL request suite, API TypeScript check and targeted ESLint check passed after that change. The source change and this evidence are committed together under the test scope.
