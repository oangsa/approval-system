# Verification Log — Issue #13: Comments & Private Attachments

**Feature:** Issue #13 — `O01` Comments / Discussion (`FR-041`, `AC-041`) and `O02` File Attachments (`FR-042`, `AC-042`)
**Branch:** `feature/13-sprint-3-full-stack-comments-private-attachments`
**Baseline Commit:** `4b372f768de1dec0bfd4b0e081120feba906c491` (`origin/dev`, includes Issue #12 migration `0016_strong_sway.sql`)
**Status:** Implemented and verified locally, including live GCS (`GCS-IT-01..08`) and bounded upload regression (`B01`). Independent teammate review and GitHub Verification CI remain required (`B04`), plus production cleanup scheduling (`B03`). No merge or deployment.

---

## 1. Environment & Precondition Notes

- **Runtime:** Node.js 24, npm Workspaces, Windows host, Docker PostgreSQL test container (`workflow_test`), Chromium via Playwright.
- **Object storage in tests:** unit, API, PostgreSQL and E2E tests use `InMemoryPrivateObjectStorage` (`ATTACHMENT_STORAGE_DRIVER=memory`).
- **Live GCS (`GCS-IT-01..08`):** `PASS` (verified 2026-11-28 against isolated test bucket `approval-system-attachments-test` in `cpe334-514311` via ADC, `GCS_PROJECT_ID=cpe334-514311`, `GCS_TEST_BUCKET=approval-system-attachments-test`). The production bucket `gs://approval-system-attachments` is never targeted by tests.
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
| `EV-13-06` | API unit + route tests | `npm run test:api` | `PASS` | 32 files, 270/270 (includes bounded upload tests `ATT-API-05b`, `ATT-API-05c`) |
| `EV-13-07` | Migration and privileges (`MIG-13-01..08`) | `npm run db:test:migrate` + `attachmentMigration`, `migratorOwnership`, `runtimePrivileges` | `PASS` | Migration `0017_polite_absorbing_man.sql` applied cleanly; ownership 32 tables / 9 functions |
| `EV-13-08` | Real PostgreSQL (`CMT-PG`, `ATT-PG`, `ATT-CX`, `ATT-REC`) | `npm run test:integration` on a freshly reset, migrated and seeded DB | `PASS` | 21 files, 235 passed, 2 skipped (pre-existing), 0 failed after the fixes in §4 |
| `EV-13-09` | Live GCS (`GCS-IT-01..08`) | `GCS_PROJECT_ID=cpe334-514311 GCS_TEST_BUCKET=approval-system-attachments-test npm run test:storage` | `PASS` | 1 file, 9/9 passed (production-bucket guard + `GCS-IT-01..08`, 0 skipped) |
| `EV-13-10` | Web components (`CMT-UI`, `ATT-UI`) | `npm run test:web` | `PASS` (pre-existing exception) | 297/299; only `adminRequestTypes.test.tsx` two >5 s timeouts, identical to the Phase 0 baseline |
| `EV-13-11` | Browser E2E (`E2E-12` + regression) | `npm run test:e2e` on a freshly reset, migrated and seeded DB | `PASS` | 54/54 (the `B03` regression was fixed, see §4; a re-run of `draft-withdraw` + `comments-private-attachments` passed 13/13) |
| `EV-13-12` | Release tooling & container packaging | `npm run test:release` (Git Bash on `PATH`) + `deploy/Dockerfile` container `npm run attachments:cleanup` | `PASS` | 14/14 release tests pass (ordering + failure + `CLEANUP_JOB_NAME`); built container lists `attachments:cleanup` and exits 0 (`ATTACHMENT_CLEANUP_COMPLETED`) against local test PostgreSQL |
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
- Live GCS (`GCS-IT-01..08`): **pass** (9/9 with production-bucket guard)
- Frontend component (`CMT-UI-01..05`, `ATT-UI-01..14`): pass
- Browser E2E (`E2E-12`): pass

---

## 4. Defects Found During Verification

1. **`CMT-PG-05` test input.** The blank-body case used `"   \n\t  "`, which `btrim(body)` does not strip (it trims spaces only), so the check constraint correctly accepted it. The test now uses a spaces-only body. No product change.
2. **`B03` regression (E2E).** `RequestAccessPolicy` denied read access to an active owner whose `REQUESTER` role was revoked, but the existing contract returns that owner's request read-only with `availableActions: []`. Fixed: owner read access no longer requires the `REQUESTER` role; commenting and working-attachment mutation still do (`FORBIDDEN`). `requestAccessPolicy.test.ts` updated with the explicit read-only boundary.
3. **E2E on a reused database.** Running `test:e2e` after `test:integration` on the same database failed 22 tests because integration tests leave configuration state behind. A freshly reset, migrated and seeded database passed. Run E2E on a fresh database.

---

## 5. Disclosures and Remaining Gates

- **Live GCS tests (`B02`):** `PASS` on 2026-11-28 against isolated test bucket `approval-system-attachments-test` (`cpe334-514311`) via ADC.
- **Independent defect review not completed** because the review subagent hit quota. Only the targeted self-review in `EV-13-13` was done; teammate review of the PR remains required.
- **Delegation test coverage:** the schema has no delegation table, so `CMT-PG-01` exercises owner, `ACTIONABLE` and `WAITING` reviewers against PostgreSQL; delegate rules are covered by `ACC-UT-01` only.
- **Operations:** `deploy/release.sh` and `.github/workflows/deploy.yml` now update `CLEANUP_JOB_NAME` (`npm run attachments:cleanup`) with `--tasks=1 --parallelism=1 --max-retries=1` after migration, candidate smoke, traffic switch, and production smoke; see [cleanup-runbook.md](cleanup-runbook.md) for provisioning, monitoring, and rollback. GCP resources (`approval-attachments-cleanup`, `approval-attachments-cleanup-schedule` in `PAUSED` state, `CLEANUP_JOB_NAME` variable) are provisioned; manual production acceptance and scheduler resume (`B03`) remain gated on releasing the PR #97 image.
- **Pre-existing:** two `adminRequestTypes.test.tsx` timeouts and 2 skipped PostgreSQL tests are unrelated to this change.
