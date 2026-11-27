# Issue #12 implementation verification

Executed 2026-11-27 on Linux, Node 24.18.1, npm 11.16.0, PostgreSQL 17 disposable Docker database, Chromium. Base commit `3ad347c`; checks ran against the working-tree implementation now recorded on `feature/12-request-search-filter-pagination-v2` in source commits `0880c96` (API/contracts), `5889959` (indexes) and `9de318a` (UI/tests), preceded by specification commit `0db125c`. The owner subsequently authorized commits, push and a PR targeting `sprint-3-staging`. Independent review by @kittipichcha remains required, followed by reviewed dev/main promotions. No merge or deployment is authorized. Issue remains open.

## Actual checks

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed all workspaces and root |
| `npm run lint` | Passed |
| `npm run build` | Passed API, web SSR/client, contracts; final API/web source rebuilt successfully by Playwright |
| `npm test -- --maxWorkers=1` | 559 passed across 64 files |
| `NODE_ENV=test npm run db:test:migrate` | Generated migration 0016 applied to isolated test database |
| `NODE_ENV=test npm run db:test:seed` | Synthetic fixtures seeded |
| `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` | 198 passed across 16 files, zero skips, including built listener/restart and existing workflow races |
| `NODE_ENV=test npm run test:e2e -- e2e/reviewer-queue.spec.ts e2e/request-list-detail.spec.ts` | 4 passed; request search/list/detail, reviewer desktop/mobile privacy, SSR isolation, URL/back-forward/date/chips/page-size checks |
| `git diff --check` | Passed |

Ordinary tests include shared contracts, endpoint authentication/header handling, query and component tests, debounce, stale query/account isolation and transport protocol checks. Real PostgreSQL checks exercise AND/OR/literal matching, exact/inequality UTC and microsecond comparisons, own/foreign rows and counts, 0/1/45/101-row pages, equal sort ties, null-last sorting, invalid fields and header/CORS. Browser screenshot at 390px was visually inspected; dates/chips/page sizes and empty result state fit without horizontal overflow. The full browser suite, other engines, production deployment and performance load benchmarking were not run.

## Index and query evidence

Migration `0016_strong_sway.sql` and generated Drizzle snapshot add `request_owner_status_created_id_idx` (requesterId/status/createdAt descending/id) and `approval_slot_reviewer_status_due_id_idx` (reviewerId/status/dueAt/id). Existing requester/updatedAt/id and reviewer/status indexes remain. These support scoped status/date narrowing and queue due ordering. No claim that PostgreSQL must choose an index for tiny fixtures or arbitrary substring queries; title substring remains a scoped scan and arbitrary sort combinations may require sorting.

RequestRepository now computes total and page in one CTE statement with aggregate-left-page join, preserving counts for empty/out-of-range pages under the same statement snapshot. ApprovalTaskRepository retains its equivalent CTE query. Both use the identical mandatory visibility + AND filters + OR text group for count and rows; UUID ascending breaks ties and null values sort last. Queue UTC comparisons bind original strings directly, avoiding JavaScript Date truncation of fractional precision. Existing Domain/Application role/owner/current-task gates remain authoritative.

## Failures and corrections

- Initial typecheck exposed a Drizzle CTE projection typing error; fixed by explicitly selecting the approved summary columns.
- First ordinary run: 549 passed/1 failed because an old negative test prohibited newly supported date EQUAL. Updated the test to reject incompatible CONTAINS instead and added all date comparison cases. Second run: 557 passed/1 failed because an old URL test rejected newly supported ENDWITH; replaced the negative case with unsupported IN and added a positive suffix test. Final ordinary suite passed.
- Initial test migration/seed commands omitted required NODE_ENV=test; the safety guard rejected them before touching data. Corrected commands passed. Docker access and local database/browser listeners required sandbox escalation, which was approved.
- One browser run was interrupted because a simultaneous root build rewrote its asset directory. Reran after the build completed. Next browser run: 3 passed/1 failed on long-search mobile overflow. A temporary diagnostic measured 390px viewport/834px scroll, traced the excess to the chip's inline span, and proved flex layout reduced scroll width to 390px. Reused ActionButton flex layout and Lucide remove icon. Final browser run passed all four tests. Temporary diagnostic removed.
- First PostgreSQL run: 196 passed/2 optional built-listener tests skipped by their existing environment flag. Rerun with RUN_BUILT_HTTP_SMOKE=1 passed all 198.
- Public web fetch and local gh could not retrieve the owner's reference repositories; the connected GitHub tool retrieved both references successfully. Existing repository controls were reused, with no copied permissive identifier/multi-sort builder.

Raw final PostgreSQL/browser logs are in `evidence/`. The tested implementation was committed without further source changes. These results are local verification, not teammate approval or release evidence.

## Issue update delivery

The prepared update is in `issue-comment.md`. An attempted GitHub comment was not posted: the connector requires PR-oriented parameters, and automatic approval review rejected `pr_number: 12` because issue #12 was the requested destination. No alternate write path was attempted. An issue-specific posting interface/confirmed destination is required before posting; local implementation and evidence are complete independently of this delivery block.
