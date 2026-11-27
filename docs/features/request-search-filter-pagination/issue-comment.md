# Historical unposted issue update

Prepared before the owner authorized commit/push/PR publication. The current commit references and publication status are in verification.md and the feature PR; the draft below records the earlier working-tree verification snapshot.

Implemented R12/R13/R14 locally on `feature/12-request-search-filter-pagination-v2`, based on `3ad347c`. The implementation remains an **uncommitted working-tree diff**; no source commit, push or PR exists yet.

- Reused existing Domain/Application authorization, POST search endpoints, direct arrays, no-store and exposed X-Pagination. Added compatible date EQUAL/NOTEQUAL and text ENDWITH; retained bounded endpoint allowlists and single-field sort with UUID tie.
- Request rows/count now share one CTE statement snapshot, including empty/out-of-range pages. Queue comparisons preserve PostgreSQL fractional timestamp precision by binding validated UTC strings directly.
- Review Queue now supports strict URL validation, Bangkok due ranges, removable chips/reset, page sizes 10/20/50/100, accessible shared desktop/mobile sorting and page recovery. Existing debounce, cancellation/account isolation and request advanced-filter dialog remain integrated.
- Generated Drizzle migration 0016 adds requester/status/createdAt/id and reviewer/status/dueAt/id indexes; existing indexes retained. Arbitrary substring search remains an authorized scoped scan; no performance benchmark claim.
- Added feature SDS, API/UI/data contracts, numbered AC, STS, DoD and traceability before implementation. Local record: `docs/features/request-search-filter-pagination/verification.md` with final PostgreSQL/browser logs.

Actual verification on 2026-11-27: Linux, Node 24.18.1, npm 11.16.0, disposable PostgreSQL 17 and Chromium:
- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- `npm test -- --maxWorkers=1`: **559 passed**, 64 files.
- `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration`: **198 passed**, 16 files, **zero skips**, including existing workflow races and built listener/restart checks.
- `NODE_ENV=test npm run test:e2e -- e2e/reviewer-queue.spec.ts e2e/request-list-detail.spec.ts`: **4 passed**, including responsive privacy/SSR, URL/back-forward, UTC date mapping, chips and page size.
- `git diff --check`: passed.

Corrections disclosed: initial CTE typing error; two obsolete negative tests for newly supported operators; test setup initially rejected by the NODE_ENV safety guard; interrupted browser run during a concurrent build; long search-chip mobile overflow reproduced at 834px scroll/390px viewport and corrected using the shared flex action control. The initial PostgreSQL run skipped two opt-in listener tests; the final opt-in run passed both. Full browser suite/other engines, production deployment and load benchmarks were not run.

Independent teammate review by @kittipichcha is still required. Keep this issue open. Intended feature PR target is `sprint-3-staging`, then reviewed promotion through `dev` and release-reviewed `main`; no merge/deployment authorization is implied.
