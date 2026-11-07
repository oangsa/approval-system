# Verification evidence — Issue #3

[PR #20 Verification run](https://github.com/oangsa/approval-system/actions/runs/42351241674), job 128339637631, passed on 2026-11-07. Merge `828b6f930cb0fc668b21dc1da2f2e2d71112c8c8` combined feature HEAD `223304ca095bdae005314fc25c7cacceb5ebefa1` with base `3978a02c670d1d71331b99d9fd5bda9adf44baca`. Environment: Ubuntu 24.04, Node 24.22.2, npm 11.19.1, PostgreSQL 17.11, Chromium 148.0.7778.96.

| Command | Result |
| --- | --- |
| `npm ci`, `npm run typecheck`, `npm run lint` | Passed |
| `npm run test:web`, `npm run test:api`, `npm run test:contracts` | Passed: 96, 174, 13 tests respectively |
| `npm run build` | Passed |
| `npm run db:test:migrate`, `npm run db:test:seed` | Passed on fresh CI database |
| `RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` | Passed: 47 tests |
| `npm run test:e2e:install`, `npm run test:e2e` | Passed: 19 browser tests |

Local `npm run check` on unchanged code at `223304c` passed outside the Windows sandbox: typecheck, lint, 28 Vitest files / 283 tests, and workspace build. An earlier sandbox attempt failed with EPERM while renaming the Vitest cache before test execution; the outside-sandbox retry passed.

[STS](sts.md) records case-level scope. A disposable loopback PostgreSQL 18 `workflow_test` database was populated from baseline-compatible migrations 0000–0003. `npm run db:test:migrate` exited 0 twice: the migration journal progressed from 4 to 5 to 5 entries, and the owner updated index was absent before migration and present afterward. Complete row checksums were preserved for 21 requests, 21 revisions and 12 cycles. An owner-filtered `EXPLAIN` with `updated_at DESC NULLS LAST` and `id`, limited to 20 rows, chose a sequential scan and sort on this 21-row fixture; representative index performance remains unmeasured.

A baseline native PostgreSQL 18 restart probe used two fresh Node processes to exercise the real authenticated Elysia `app.handle` GET before and after `pg_ctl -m fast -w stop` and start. Both asserted 200, no-store, schema, database PENDING status, number, version, submitted and working revision pointers, and current cycle. The full JSON digest was identical.

Separate local post-fix results apply to the worktree patch atop `223304c`: the focused PostgreSQL test first failed because both exact text lookups returned zero, then passed 1/1 after the fix. `npm run check` exited 0: typecheck, lint, 283 root tests and build passed. `RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` exited 0: 47/47 passed, no skips. The 19 browser tests above apply to the earlier CI run only. Independent teammate review remains pending. These results do not establish completion of other features or the full global request/approval journey.
