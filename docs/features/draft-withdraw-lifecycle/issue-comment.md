Issue #6 verification record — PR #87 (`feature/6-draft-withdraw-lifecycle` -> `sprint-2-staging`)

- **PR:** https://github.com/oangsa/approval-system/pull/87
- **Tested commit:** `<FINAL_TESTED_SHA>`
- **Final CI run:** `<FINAL_CI_RUN_URL>`

### Implemented PR #87 Repairs (B01–B07)
- **B01:** Reconstruct saved draft content using its original immutable form definition before applying and validating target-version changes.
- **B02:** Synchronize `/requests/:id/edit` URL via `replace` after a type change creates a new draft without duplicate creation.
- **B03:** Revalidate unchanged draft saves through authoritative `GET` checks without no-op `PATCH` writes, version increments, or false success.
- **B04:** Clear incompatible monetary/item state on confirmed form-version migration and render the review summary from canonical `payload()`.
- **B05:** Compare draft field maps independent of object key order in `RequestEditingSession`; unchanged saves with reordered `fields` keys execute `GET` with zero `PATCH` writes or audit entries.
- **B06:** Emit canonical bracket-form validation paths (`lineItems[0].quantity`, `lineItems[0].description`) from `RequestRoutes` and `RequestRules`, and map them to existing input IDs in `RequestWizard` to mark invalid fields and focus the affected input.
- **B07:** Restore keyboard focus to the `Withdraw` trigger when surviving, or move focus to the updated detail status badge (`RequestDetailTabs`) or list search input (`RequestListPage`) when `Withdraw` disappears.

### Local Verification Results (pre-push, after final code/test edit)
- **Environment:** Node.js v24.18.1, npm 11.16.0, Vitest 4.1.10, Playwright 1.60.0 (headless Chromium), PostgreSQL 17-alpine disposable `workflow_test` database.
- **`npm run check` (`typecheck`, `lint`, `test`, `build`):** PASS — 46 test files, 448 tests passed, 0 failed, 0 skipped; all workspace builds passed.
- **`NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration`:** PASS — 10 PostgreSQL test files, 109 tests passed, 0 failed, 0 skipped.
- **`NODE_ENV=test npm run test:e2e`:** PASS — 43 Playwright browser tests passed (47.5s), 0 failed, 0 skipped.
- **Not rerun locally in this pass (deferred to CI):** `npm ci`, `npm run test:initialization`, `npm run test:release`, and production Docker image builds.

### CI Verification Results
- Pending commit/push and final GitHub Actions `Verification` run; replace placeholders above with actual CI results and any failures or skips before posting to Issue #6.

Independent teammate approval by `@kittipichcha` on PR #87 and reviewed promotion (`sprint-2-staging` -> `dev` -> `main`) remain required external gates.
