# Actual verification — Issue #9

2026-11-25. Branch `feature/9-policies-routing-budget`; base commit `a7cac0b58ec7066d22706a46fb2498e5fec710c5`. Implementation is an **uncommitted working tree**, not a claim of published commits or passing remote CI. No commit, push, PR, merge or release was authorized/performed. Owner @oangsa; independent @kittipichcha review remains pending.

## Environment and scope

Linux; Node.js v24.18.1, npm 11.16.0, PostgreSQL 17 Alpine in loopback-only disposable Docker containers; Vitest 4.1.10 and Playwright 1.60.0 Chromium. Existing shared test database was used for development. Final complete CI-order run used a separate fresh `workflow_test` instance on loopback port 55439 (`approval-issue9-verification`), removed after execution; no development or production database was migrated. Additional fresh initialization ran independently in `approval-issue9-initialization`, also removed. No credentials, cookies or trace tokens are committed.

User confirmed scope option 1: Issue #9 implements current routing/ceiling configuration and a tested historical department/form resolution seam; full return/resubmit lifecycle remains Issue #7. Staged decision execution and approver display keep their original ownership. No simulation endpoint, balance ledger or funds mutation was added.

## Executed checks

| Command | Actual result |
|---|---|
| `npm run typecheck` | Passed all workspaces and root TypeScript |
| `npm run lint` | Passed |
| `npm test` | 54 files, 479 tests passed; zero skips |
| `npm run build` | API, React Router client + SSR, and contracts builds passed |
| `NODE_ENV=test npm run db:test:migrate` | All migrations, including 0011–0013, applied to fresh PostgreSQL |
| `NODE_ENV=test npm run test:initialization` | 1 file / 1 test passed on fresh database; lifecycle seed and repeated initialization preserved |
| `NODE_ENV=test npm run db:test:seed` | Passed before integration/browser run |
| `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` | 12 files / 124 tests passed; zero skips, including built HTTP smoke tests |
| `NODE_ENV=test npm run test:e2e` | All 45 Chromium tests passed in 58.7s after fresh migration/initialization/seed/integration sequence |
| `NODE_ENV=test npm run test:integration --workspace @workflow/api -- configuration.test.ts` | Final policy-only rerun: 9 tests passed after DTO simplification |
| `npm run test:release` | 13 tests passed with loopback listener access |
| `git diff --check` | Passed; new source whitespace checked separately |

Final targeted browser follow-up after the lookup debounce guard: 1/1 passed in 14.4s. It additionally checks actual dark CSS token serialization, reduced-motion transition suppression and both mobile screenshots. The full 45-test run covers the same functional configure-to-submit flow. Final `npm run check` was repeated after the last code change; the table above records that run.

## Coverage and evidence

- Contracts: one/two ordered stages, strict ALL-only shape, SLA default, exact inclusive amount bounds, positive ceilings, endpoint search allowlists and PATCH omission preservation.
- API/security: admin POST/search/PATCH/configuration actions, direct frozen DTOs, publish key, 401/403 denial, stale 409, X-Pagination, minimal eligible-reviewer projection, no admin request-content read grant and CORS POST/PATCH/header checks.
- PostgreSQL: concurrent publication produces one immutable version; same-key replay survives later branching; changed payload rejects; transactional before/after audit is immutable. Invalid reviewer references/merged bounds produce no configuration or audit mutation. Runtime grants exercise actual policy publication, mapping creation and budget updates; migrator ownership includes the new tables.
- Resolution: exact ceilings immediately below/at/above, department-specific limit override, highest numeric priority/tie, no route, all reviewers in all stages including inactive/self-only later mappings, atomic no-cycle/audit/outbox failure and trusted department-specific/global mapping resolution. Accepted snapshots are unchanged after disable/mapping edits. Multi-reviewer mappings create actual parallel ALL slots; existing decision engine requires all votes.
- Issue #7 seam: historical department and pinned form remain intact after membership/form changes; new amount resolves the current published two-stage policy. This is an internal integration test, not an assertion that the absent return/resubmit lifecycle shipped.
- Browser E2E-08: admin eligible reviewer lookup, mapping creation, type selection, local preview, policy v1/branch/v2 publication, stage-3 absence, ceiling creation and duplicate-scope 409 feedback, requester role denial, above-ceiling 422 display, corrected at-ceiling submit and actual two-stage slots. SSR response contains no configured private page data. Mobile overflow and reduced motion are checked.
- Local screenshots: `artifacts/policies-routing-budget/admin-budget-desktop.png`, `request-submitted.png`, `policy-mobile.png`, `policy-mobile-dark.png`. Artifacts remain ignored local verification outputs.

## Failures found and resolved during development

1. Collection-route HTTP create initially returned 500 because Elysia omitted `params`; defaulting to `{}` fixed the route. The same PostgreSQL HTTP regression now passes.
2. Zod partial schemas applied defaults to omitted department/amount fields; explicit optional PATCH fields now preserve existing scopes/bounds. Shared and database regressions cover this.
3. Browser publication exposed missing CORS Idempotency-Key/PATCH support. Added shared preflight handling and regression assertions; the real browser flow passes.
4. Global deduplication changed existing per-stage snapshot ordering. Restored per-stage snapshots and deduplicate slot insertion only within a stage; existing PostgreSQL regression passes.
5. Narrow layout overflow came from adjacent lookup buttons; wrapping fixes it. Navigation regression expectation was updated for the three newly shipped admin routes.
6. Initial broad browser run was interrupted after three older tests timed out because new test fixtures inherited the label “General request.” Unique fixture names fixed the collision. Fresh CI-order rerun passed all 45 tests without removing/skipping/weakening tests.
7. Browser/test-only assertion corrections: duplicate display names now use a unique reviewer fixture; exact save notices avoid loading-status ambiguity; existing request wizard button/step names are used; OKLCH token assertion accepts equivalent fractional/percentage serialization.
8. Default sandbox blocked Docker/network listeners and one release proxy check. Authorized reruns with loopback/Docker access passed. No unresolved auto-review rejection.

## Remaining gates

Independent teammate review, authorized atomic commits/push, feature PR to `sprint-2-staging`, reviewed promotion to `dev`, and release-reviewed promotion to `main` remain pending. Safari/Firefox, production migration/deployment and complete Issue #7 lifecycle were not claimed or performed. Frozen specifications were preserved; feature traceability, numbered AC, STS and DoD are versioned locally.

Final workspace check on 2026-11-25 at 11:44 Asia/Bangkok: `npm run check` passed (typecheck, lint, 54 files / 479 tests, API/client/SSR/contracts builds). Targeted E2E follow-up passed with actual light/dark mobile screenshots and reduced-motion assertion. Verification evidence posted to [Issue #9 comment](https://github.com/oangsa/approval-system/issues/9#issuecomment-7153135001). Issue remains open; no commit/push/PR/merge/release performed.
