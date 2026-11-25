# Issue #8 Verification Record (`R07`, `O16`, `O17`)

- **Branch:** `feature/8-configurable-forms-items-priority`
- **Base commit (`HEAD`):** `cecf33e` (all Issue #8 work verified in uncommitted working tree before commit/PR authorization)
- **Verification date:** `2026-11-25` (re-verified ~`09:41 +07:00` after `/scrutinize` audit fixes)
- **Environment:** Linux, Node.js `v24.18.1`, npm `11.16.0`, PostgreSQL `postgres:17-alpine` (Docker test database `workflow_test`), Playwright `1.60.0` (Chromium)

## Checks Executed and Results

| Scope | Command | Outcome | Observed Counts & Notes |
|---|---|---|---|
| Typecheck, lint, unit/API/contract/component Vitest suites, builds | `npm run check` | Passed (exit `0`) | Ran after all code/test edits: workspace & root `tsc` passed, `eslint "**/*.{ts,tsx}"` passed, Vitest `51` test files / `464` tests passed (`0` skipped), `@workflow/contracts`, `@workflow/api`, `@workflow/web` built cleanly. |
| Fresh unseeded PostgreSQL production initialization | `npm run db:test:down -- -v && npm run db:test:up && NODE_ENV=test npm run db:test:migrate && NODE_ENV=test npm run test:initialization` | Passed (exit `0`) | Ran after schema and migration `0010_fine_dreaming_celestial.sql` (no schema/migration edits afterward): `1` test file / `1` passed (`fresh initialization is repeatable, preserves existing hashes/data and rolls back conflicts`). |
| Seeded real-PostgreSQL integration, security, concurrency, ownership & runtime grants | `NODE_ENV=test npm run test:integration` | Passed (exit `0`) | Ran after all backend, contract, and test edits: `11` test files passed, `111` passed, `2` skipped (`113` total). The `2` skipped tests are pre-existing environment-gated built-listener smokes (`test.skipIf(process.env.RUN_BUILT_HTTP_SMOKE !== "1")` in `apps/api/tests/postgres/auth.test.ts:200` and `apps/api/tests/postgres/decisions.test.ts:424`). `migratorOwnership.test.ts` (`total: 25, owned: 25`) and `runtimePrivileges.test.ts` (including `RequestTypeService` as `approval_runtime`) passed. |
| Deployment & release pipeline scripts | `npm run test:release` | Passed (exit `0`) | Ran after deploy SQL edits (no deploy edits afterward): `13` tests passed, `0` failed, `0` skipped. |
| Browser E2E suite (Playwright Chromium) | `NODE_ENV=test npm run test:e2e` | Passed (exit `0`) | Ran after all code/test edits: `44` tests passed (`51.0s`), `0` failed, `0` skipped, including `e2e/configurable-forms.spec.ts` (`E2E-03` and `E2E-08`). |
| Diff hygiene | `git diff --check` | Passed (exit `0`) | Zero whitespace/conflict markers across working tree diff. |

*Note on run ordering:* `npm run check`, `NODE_ENV=test npm run test:integration`, `NODE_ENV=test npm run test:e2e`, and `git diff --check` all ran and passed after the final code and test edits; `test:initialization` and `test:release` passed earlier after all migration and deploy SQL edits (unchanged during the post-audit code fixes).

## Initial Failures Diagnosed and Fixed

1. **`Button` prop type mismatch (`apps/web`):** `Button` primitive lacks `variant="outline"`. Replaced with `ActionButton variant="outline"` in `RequestTypeEditorPage.tsx` and `RequestTypesListPage.tsx`.
2. **`requestList.test.tsx` text matcher regression:** Rendering `<PriorityBadge>` inside mobile cards split `"High · Finance"`. Preserved `<PriorityBadge>` in desktop rows and kept `{requestPriorityLabel(item.priority)} · {department}` single-string rendering in mobile cards.
3. **`adminRequestTypes.test.tsx` strict label & alert scopes:** Scoped preview assertions with `within(screen.getByRole("complementary", { name: "Live form preview" }))` and removed duplicate inner `role="alert"` from `FieldEditorCard`.
4. **`OPTIONS /api/v1/admin/request-types` CORS preflight returned `403` (`apps/api/tests/postgres/requestTypes.test.ts:234`):** `apps/api/src/Presentations/cors.ts` `preflight()` omitted `/api/v1/admin/request-types` from `PATCH` method and `Idempotency-Key` header allowances. Extended `preflight()` with `adminRequestTypeResource` (`POST, PATCH` + `Idempotency-Key`) and added a `PATCH /api/v1/admin/request-types/:id/draft` preflight test.
5. **Immutable `TypeVersion` snapshot mutation (`apps/api/tests/postgres/requests.test.ts:751`):** Overlaying live `requestTypes.isEnabled` inside `RequestRepository.TypeVersion()` caused existing `SEC-03` tests (expecting the immutable snapshot verbatim after disablement) to receive `isEnabled: false`. Restored `RequestRepository.TypeVersion()` to return the stored immutable `request_type_versions.definition` verbatim while keeping live `isEnabled` in `Type()`, `Types()`, and admin endpoints.
6. **Direct `/admin/request-types` page load stuck on `Loading…` (`e2e/configurable-forms.spec.ts:102`):** `needsSession()` in `apps/web/app/modules/auth/sessionContext.tsx` omitted `/admin` paths, leaving `SessionProvider` in `idle` on direct browser navigation to `/admin/*`. Added `/admin` matching to `needsSession()` and added a unit regression in `apps/web/tests/components/session.test.tsx` (after first fixing a stale `{ accessToken, expiresIn }` mock shape in the new test that failed strict `refreshResponseSchema` parsing).
7. **Post-`/scrutinize` audit fixes:** Fixed `ConditionBuilder` `IN` keystroke stripping and incompatible operator/option selector desync, removed the polymorphic `AdminRequestTypeDetail` fallback on default `GET /api/v1/request-types/:id` (with `?view=admin` OpenAPI and `Location` alignment), tightened `editableLineItemSchema` to 17 integer digits for `numeric(24, 6)` readbacks, tracked full 3+ node cycles in `validateRequestTypeDefinition`, normalized UUID checks in `RequestService`, added `RequestTypesListPage` `"Published only"` (`hasDraft=false`) + `Reset filters`, preserved unsaved draft edits on editor Enable/Disable, restored dialog focus, and unified `preferredBrowserLocale()` across wizard/detail views.

## Remaining Gates Before Merge

- Independent teammate PR review by `@kittipichcha` (required; never self-reviewed).
- Feature PR from `feature/8-configurable-forms-items-priority` into `sprint-2-staging`, followed by reviewed promotion `sprint-2-staging -> dev -> main`.
- Updating GitHub Issue #8 with final reviewed commit SHA, PR link, CI run results, and verified disclosure.
