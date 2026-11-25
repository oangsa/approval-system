Issue #8 verification record — PR #88 (`feature/8-configurable-forms-items-priority` -> `sprint-2-staging`)

- **PR:** https://github.com/oangsa/approval-system/pull/88
- **Tested commit:** `<FINAL_TESTED_SHA>`
- **Final CI run:** `<FINAL_CI_RUN_URL>`

### Implemented PR #88 Repairs (`B01`–`B06`)
- **`B01`:** Added `assertPublishedDefinition()` runtime Zod (`publishedRequestTypeSchema`) and semantic graph/constraint (`validateRequestTypeDefinition()`) validation before requester reads and mutations (`Type`, `Types`, `TypeVersion`, `create`, `patch`, `submit`, `validateContent`, `editableContent`, `resolvePlan`), failing corrupted or cyclic stored configurations with `409 CONFIGURATION_INCOMPLETE` and zero database mutation.
- **`B02`:** Updated `validateFields()` to distinguish omitted fields from explicitly supplied `null`, empty, or whitespace-only values, returning `422 VALIDATION_ERROR` (`INVALID_VALUE`) for visible fields and `422 FORM_FIELD_NOT_APPLICABLE` for hidden fields while preserving incomplete draft saves when fields are omitted.
- **`B03`:** Added `hasOwnField`, `getFieldValue`, `createFieldRecord` (`Object.create(null)`), and `setFieldValue` across shared contracts, backend evaluation, and wizard/preview state so inherited `Object.prototype` properties (`constructor`, `toString`, `valueOf`, `hasOwnProperty`) never activate conditions and hidden dependencies remain unset downstream.
- **`B04`:** Replaced comma-splitting `IN` text input in `ConditionBuilder` with typed membership controls per field kind (`BOOLEAN` checkboxes, `SELECT` option checkboxes, and multi-entry inputs for `TEXT`/`TEXTAREA`/`DECIMAL`/`DATE` preserving comma-containing literals).
- **`B05`:** Added `formatMoney()` using `BigInt` whole-part grouping and `Intl.NumberFormat.formatToParts` across `LineItemsEditor`, `LineItemsSummary`, `RequestWizard`, and `RequestResult` without converting canonical decimal strings to floating-point numbers.
- **`B06`:** Extended `e2e/configurable-forms.spec.ts` to verify hidden-key `422` zero DB rows, client validation alert/`aria-invalid`/focus on missing conditionally required fields, incomplete draft save, server `422` rejection on submit/patch with zero DB mutation, and localized currency formatting.

### Local Verification Results (pre-push, after final code/test edit)
- **Environment:** Node.js `v24.18.1`, npm `11.16.0`, Vitest `4.1.10`, Playwright `1.60.0` (headless Chromium), PostgreSQL `17-alpine` (`workflow_test`).
- **`npm run check` (`typecheck`, `lint`, `test`, `build`):** PASS — `51` test files, `468` tests passed, `0` failed, `0` skipped; all workspace builds passed.
- **`npm run db:test:down -- -v && npm run db:test:up && NODE_ENV=test npm run db:test:migrate && NODE_ENV=test npm run test:initialization`:** PASS — `1` test file, `1` test passed, `0` skipped.
- **`NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration`:** PASS — `11` PostgreSQL test files, `115` tests passed, `0` failed, `0` skipped.
- **`NODE_ENV=test npm run test:e2e`:** PASS — `44` Playwright Chromium tests passed (`50.7s`), `0` failed, `0` skipped.
- **`npm run test:release`:** PASS — `13` tests passed, `0` failed, `0` skipped.
- **`git diff --check`:** PASS — zero whitespace or conflict markers.
- **Not rerun locally in this pass (deferred to CI):** `npm ci` and production Docker image builds.

### CI Verification Results
- Pending commit/push and final GitHub Actions `Verification` run; replace placeholders above with actual CI results and any failures or skips before posting to Issue #8.

Independent teammate approval by `@kittipichcha` on PR #88 and reviewed promotion (`sprint-2-staging` -> `dev` -> `main`) remain required external gates.
