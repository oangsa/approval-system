## Issue #9 — local implementation and verification

Implemented R09/O10/O18/O19 on `feature/9-policies-routing-budget` as an **uncommitted working tree** based on `a7cac0b58ec7066d22706a46fb2498e5fec710c5`. No implementation commit, push, PR, merge, deployment or passing remote CI is claimed.

The change adds strict shared contracts; Clean Architecture admin policy draft/patch/branch/publish/disable operations; versioned/audited reviewer groups and hard ceilings; Drizzle migrations 0011–0013; admin-only eligible reviewer metadata; and React Router admin configuration pages with paged lookups, version controls, ALL labels, priority ambiguity explanation, exact ceilings and 409/422 recovery. Submit validates every stage before mutation and snapshots actual slots. Published policy/mapping edits affect future cycles only. No balance ledger or simulation endpoint.

Owner explicitly selected the bounded scope: Issue #7 keeps the full return/resubmit lifecycle. Issue #9 provides and tests current-policy resolution using the historical server-owned department and pinned form, including changed amount and changed current membership/form configuration. Two-stage execution remains with its primary issue; existing decisions are regression-tested for multi-reviewer ALL groups.

Actual local verification on 2026-11-25: Linux, Node v24.18.1, npm 11.16.0, PostgreSQL 17 Alpine, Vitest 4.1.10 and Playwright 1.60.0 Chromium.

- Typecheck, lint and builds passed across API, client/SSR and contracts.
- Vitest: 54 files / 479 tests passed, zero skips.
- Fresh migrations, initialization (1/1), and seeding passed in a separate disposable loopback PostgreSQL instance.
- Real PostgreSQL integration with `RUN_BUILT_HTTP_SMOKE=1`: 12 files / 124 tests passed, zero skips. This includes publication concurrency/idempotency, stale versions, atomic rollback, minimal authorization projections, historical routing seam, runtime grants and migrator ownership.
- Full Chromium suite after fresh migration/initialization/seed/integration: 45/45 passed. E2E-08 configures reviewer mapping, policy v1/branch/v2 and budget limit, verifies duplicate-scope 409 and over-ceiling 422, then submits at the exact ceiling with actual two-stage slots. Targeted follow-up also checks mobile layout, actual dark tokens and reduced motion.
- Release tests: 13/13 passed. Diff whitespace check passed.

Development failures were repaired before final verification: omitted Elysia params, Zod partial defaults, CORS Idempotency-Key/PATCH support, snapshot ordering, mobile lookup wrapping and nonunique fixture names. An initial broad browser run was interrupted after fixture-name collisions; the fresh full rerun passed all 45 tests. Default sandbox listener/Docker restrictions required authorized reruns. No unresolved test failure or skip remains in the listed final checks.

Feature SDS/contracts, PRB-AC-01–10, STS, DoD and detailed evidence are in `docs/features/policies-routing-budget/`; feature links are appended to `docs/specs/traceability.md`. Local screenshots remain under ignored `artifacts/policies-routing-budget/`. Exact prompts and assistance reflections are appended to root `ai_use.md`.

Still pending: independent @kittipichcha review, separately authorized scoped atomic commits/push, feature PR to `sprint-2-staging`, reviewed promotion to `dev`, then release-reviewed promotion to `main`. Production deployment, Safari/Firefox and Issue #7's full lifecycle were not performed or claimed.
