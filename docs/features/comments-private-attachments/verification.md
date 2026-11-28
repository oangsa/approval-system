# Verification Log — Issue #13: Comments & Private Attachments

**Feature:** Issue #13 — `O01` Comments / Discussion (`FR-041`, `AC-041`) and `O02` File Attachments (`FR-042`, `AC-042`)  
**Branch:** `feature/13-sprint-3-full-stack-comments-private-attachments`  
**Baseline Commit:** `4b372f768de1dec0bfd4b0e081120feba906c491` (`origin/dev`, includes Issue #12 migration `0016_strong_sway.sql`)  
**Status:** Phase 0 documentation initialized; implementation and automated verification not yet run.

---

## 1. Environment & Precondition Notes

- **Target Runtime:** Node.js 24, npm Workspaces, TypeScript, Elysia (`@elysia/node`), React Router 7 Framework Mode (`ssr: true`).
- **Database:** PostgreSQL 18 (local development/test container) / PostgreSQL 17 (CI container).
- **Object Storage:**
  - Ordinary unit, contract, API, PostgreSQL integration, and Playwright E2E tests use the isolated `InMemoryPrivateObjectStorage` test adapter (`ATTACHMENT_STORAGE_DRIVER=memory`).
  - **Live GCS Verification (`GCS-IT-01..08`):** `BLOCKED` until GCP Application Default Credentials (`gcloud auth application-default login` / Workload Identity) and an isolated GCS test bucket (`GCS_TEST_BUCKET`) are configured in the execution environment. Production bucket `gs://approval-system-attachments` (project `cpe334-514311`, `asia-southeast1`) must never be targeted by automated tests.

---

## 2. Verification Evidence Matrix (`EV-13-01` – `EV-13-12`)

| Evidence ID | Scope | Planned Command / Check | Status | Actual Result / Log |
| --- | --- | --- | --- | --- |
| `EV-13-01` | Phase 0 Docs & ADR-13 | Review `docs/adr/ADR-13-gcs-private-attachment-storage.md` and `docs/features/comments-private-attachments/{sds,acceptance-criteria,sts,verification}.md` | `NOT_RUN` | Pending |
| `EV-13-02` | Workspace Typecheck | `npm run typecheck` | `NOT_RUN` | Pending |
| `EV-13-03` | Workspace Lint | `npm run lint` | `NOT_RUN` | Pending |
| `EV-13-04` | Workspace Build | `npm run build` | `NOT_RUN` | Pending |
| `EV-13-05` | Contract & Unit Tests (`CMT-CT-*`, `ATT-CT-*`, `ACC-UT-*`, `CMT-UT-*`, `ATT-UT-*`) | `npm test` (or scoped Vitest run + full `npm test`) | `NOT_RUN` | Pending |
| `EV-13-06` | API Route & Header Tests (`CMT-API-*`, `ATT-API-*`) | `npm run test:api` | `NOT_RUN` | Pending |
| `EV-13-07` | PostgreSQL Migration & Privileges (`MIG-13-01..08`) | `NODE_ENV=test npm run db:test:migrate` + `apps/api/tests/postgres/attachmentMigration.test.ts`, `runtimePrivileges.test.ts` | `NOT_RUN` | Pending |
| `EV-13-08` | PostgreSQL Functional, Concurrency & Cleanup Recovery (`CMT-PG-*`, `ATT-PG-*`, `ATT-CX-*`, `ATT-REC-*`) | `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` | `NOT_RUN` | Pending |
| `EV-13-09` | Live GCS Storage Integration (`GCS-IT-01..08`) | Opt-in live GCS test run (`GCS_TEST_BUCKET=<isolated>`) | `BLOCKED` | GCP ADC and isolated GCS test bucket not configured locally |
| `EV-13-10` | Web Component & Accessibility Tests (`CMT-UI-*`, `ATT-UI-*`) | `npm run test:web` | `NOT_RUN` | Pending |
| `EV-13-11` | Browser E2E Collaboration Journey (`E2E-12`) + Full E2E Regression | `npm run test:e2e -- e2e/comments-private-attachments.spec.ts` and `npm run test:e2e` | `NOT_RUN` | Pending |
| `EV-13-12` | Diff Hygiene & Release Tooling | `git diff --check` and `npm run test:release` | `NOT_RUN` | Pending |

---

## 3. Test Case Status Summary

- **Contract (`CMT-CT-01..04`, `ATT-CT-01..05`):** `NOT_RUN` (0 / 9 passed)
- **Domain & Service Unit (`ACC-UT-01..02`, `CMT-UT-01..02`, `ATT-UT-01..13`):** `NOT_RUN` (0 / 17 passed)
- **API Integration (`CMT-API-01..05`, `ATT-API-01..15`):** `NOT_RUN` (0 / 20 passed)
- **PostgreSQL Functional (`CMT-PG-01..05`, `ATT-PG-01..08`):** `NOT_RUN` (0 / 13 passed)
- **PostgreSQL Concurrency (`ATT-CX-01..09`):** `NOT_RUN` (0 / 9 passed)
- **Cleanup & Recovery (`ATT-REC-01..10`):** `NOT_RUN` (0 / 10 passed)
- **Migration & Privileges (`MIG-13-01..08`):** `NOT_RUN` (0 / 8 passed)
- **Live GCS Integration (`GCS-IT-01..08`):** `BLOCKED` (0 / 8 passed — requires GCP ADC + isolated GCS test bucket)
- **Frontend Component (`CMT-UI-01..05`, `ATT-UI-01..14`):** `NOT_RUN` (0 / 19 passed)
- **Browser E2E (`E2E-12`):** `NOT_RUN` (0 / 1 passed)

---

## 4. Executed Runs & Disclosures

*No verification commands have been executed yet in Phase 0.*
