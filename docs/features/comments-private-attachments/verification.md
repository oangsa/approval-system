# Verification Log — Issue #13: Comments & Private Attachments

**Feature:** Issue #13 — `O01` Comments / Discussion (`FR-041`, `AC-041`) and `O02` File Attachments (`FR-042`, `AC-042`)
**Branch:** `feature/13-sprint-3-full-stack-comments-private-attachments`
**Baseline Commit:** `4b372f768de1dec0bfd4b0e081120feba906c491` (`origin/dev`, includes Issue #12 migration `0016_strong_sway.sql`)
**Status:** Implemented and verified locally except live GCS (`BLOCKED`) and the independent subagent review (`NOT_RUN`, quota exhaustion; see §5). No merge or deployment.

---

## 1. Environment & Precondition Notes

- **Runtime:** Node.js 24, npm Workspaces, Windows host, Docker PostgreSQL test container (`workflow_test`), Chromium via Playwright.
- **Object storage in tests:** unit, API, PostgreSQL and E2E tests use `InMemoryPrivateObjectStorage` (`ATTACHMENT_STORAGE_DRIVER=memory`).
- **Live GCS (`GCS-IT-01..08`):** `BLOCKED`. No GCP Application Default Credentials and no isolated `GCS_TEST_BUCKET` exist locally. `npm run test:storage` runs the production-bucket isolation guard (passes) and skips the eight live cases with a clear diagnostic. The production bucket `gs://approval-system-attachments` is never targeted by tests.
- **Windows sandbox notes:** a transient `EPERM: mkdir` on `apps/web/build/server/.vite` occurred once during `npm run build` and passed on retry. `deploy/tests/release.test.ts` needs a Git Bash on `PATH`; with `C:\Program Files\Git\bin` first it passes 14/14.

---

## 2. Verification Evidence Matrix

| Evidence ID | Scope | Command / Check | Status | Actual Result |
| --- | --- | --- | --- | --- |
| `EV-13-01` | Phase 0 docs and ADR-13 | Committed in `0b28911` | `PASS` | ADR-13, SDS, AC, STS committed before implementation |
| `EV-13-02` | Typecheck | `npm run typecheck` | `PASS` | All workspaces and root `tsconfig.json` (includes `e2e/`) exit 0 |
| `EV-13-03` | Lint | `npm run lint` | `PASS` | exit 0 |
| `EV-13-04` | Build | `npm run build` | `PASS` | API (`--external:@google-cloud/storage`), web SSR+client, contracts built |
| `EV-13-05` | Contracts | `npm run test:contracts` | `PASS` | 11 files, 64/64 |
| `EV-13-06` | API unit + route tests | `npm run test:api` | `PASS` | 32 files, 268/268 |
| `EV-13-07` | Migration and privileges (`MIG-13-01..08`) | `npm run db:test:migrate` + `attachmentMigration`, `migratorOwnership`, `runtimePrivileges` | `PASS` | Migration `0017_polite_absorbing_man.sql` applied cleanly; ownership 32 tables / 9 functions |
| `EV-13-08` | Real PostgreSQL (`CMT-PG`, `ATT-PG`, `ATT-CX`, `ATT-REC`) | `npm run test:integration` on a freshly reset, migrated and seeded DB | `PASS` | 21 files, 235 passed, 2 skipped (pre-existing), 0 failed after the fixes in §4 |
| `EV-13-09` | Live GCS (`GCS-IT-01..08`) | `npm run test:storage` | `BLOCKED` | Guard test passes (1); 8 live cases skipped (no ADC / `GCS_TEST_BUCKET`) |
| `EV-13-10` | Web components (`CMT-UI`, `ATT-UI`) | `npm run test:web` | `PASS` (pre-existing exception) | 297/299; only `adminRequestTypes.test.tsx` two >5 s timeouts, identical to the Phase 0 baseline |
| `EV-13-11` | Browser E2E (`E2E-12` + regression) | `npm run test:e2e` on a freshly reset, migrated and seeded DB | `PASS` | 54/54 (the `B03` regression was fixed, see §4; a re-run of `draft-withdraw` + `comments-private-attachments` passed 13/13) |
| `EV-13-12` | Release tooling | `npm run test:release` (Git Bash on `PATH`) | `PASS` | 14/14 including the new GCS env-var test |
| `EV-13-13` | Self-review greps | `git grep` on `apps/web/app`, `apps/api/src/Presentations`, migrations | `PASS` | No `dangerouslySetInnerHTML`; no `storageKey`/`sha256` in presentation or web code; `ReviewTaskPage.tsx` untouched; only `0017_*` added (journal updated, `0000`–`0016` untouched); no key material or `GOOGLE_APPLICATION_CREDENTIALS` |
| `EV-13-14` | Independent review (`review-pr` subagent) | Three launches | `NOT_RUN` | All runs ended with `RESOURCE_EXHAUSTED (429)` before producing findings |

---

## 3. Test Case Status Summary

- Contract (`CMT-CT-01..04`, `ATT-CT-01..05`): pass
- Domain and service unit (`ACC-UT-01..02`, `CMT-UT-01..02`, `ATT-UT-01..13`): pass
- API integration (`CMT-API-01..05`, `ATT-API-01..15`): pass
- PostgreSQL functional (`CMT-PG-01..05`, `ATT-PG-01..08`): pass
- PostgreSQL concurrency (`ATT-CX-01..09`): pass
- Cleanup and recovery (`ATT-REC-01..10`): pass
- Migration and privileges (`MIG-13-01..08`): pass
- Live GCS (`GCS-IT-01..08`): **blocked**
- Frontend component (`CMT-UI-01..05`, `ATT-UI-01..14`): pass
- Browser E2E (`E2E-12`): pass

---

## 4. Defects Found During Verification

1. **`CMT-PG-05` test input.** The blank-body case used `"   \n\t  "`, which `btrim(body)` does not strip (it trims spaces only), so the check constraint correctly accepted it. The test now uses a spaces-only body. No product change.
2. **`B03` regression (E2E).** `RequestAccessPolicy` denied read access to an active owner whose `REQUESTER` role was revoked, but the existing contract returns that owner's request read-only with `availableActions: []`. Fixed: owner read access no longer requires the `REQUESTER` role; commenting and working-attachment mutation still do (`FORBIDDEN`). `requestAccessPolicy.test.ts` updated with the explicit read-only boundary.
3. **E2E on a reused database.** Running `test:e2e` after `test:integration` on the same database failed 22 tests because integration tests leave configuration state behind. A freshly reset, migrated and seeded database passed. Run E2E on a fresh database.

---

## 5. Disclosures and Remaining Gates

- **Live GCS tests are blocked** until ADC and an isolated test bucket are available. Run `GCS_TEST_BUCKET=<isolated> npm run test:storage` after `gcloud auth application-default login`.
- **Independent defect review not completed** because the review subagent hit quota. Only the targeted self-review in `EV-13-13` was done; teammate review of the PR remains required.
- **Delegation test coverage:** the schema has no delegation table, so `CMT-PG-01` exercises owner, `ACTIONABLE` and `WAITING` reviewers against PostgreSQL; delegate rules are covered by `ACC-UT-01` only.
- **Operations:** production needs a scheduler (Cloud Scheduler or Cloud Run Job) for `npm run attachments:cleanup`, and the bucket/IAM provisioning from ADR-13.
- **Pre-existing:** two `adminRequestTypes.test.tsx` timeouts and 2 skipped PostgreSQL tests are unrelated to this change.
