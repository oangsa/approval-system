# Lab 5 — Deployment and Release Verification

## 1. Purpose, baseline and authoritative references

This is the evidence and operations index for issue [#27](https://github.com/oangsa/approval-system/issues/27). Documentation branch baseline: `85183136bae4128f63cad75f131455bfe907dfb8`; historical local checks used `d3fa16789cfde91b6134b10ddde6f380216a4b94`. Neither claims that this documentation was deployed. The observed serving SHA was `e00b2642ccc7e8d7d2e7c0938e77d3177cd27eeb` (§13). The [handout](../../../examples/Lab-5/01_SE_Lab_5_updated.pdf), especially sections 4.1, 4.3, 4.4, 5, 7, 8, 9, 11 and 12, governs over the [student guide](../../../examples/Lab-5/03_Student-Guide-GCP-Deployment-and+CI+CD-V1_1.pdf) and [starter ZIP](../../../examples/Lab-5/02_lab5-starter-kit.zip). The guide's episodes 0–10 cover setup through teardown; the kit is a TokTickIT/Prisma/Cloud SQL template, not this application's implementation. The handout requires no separate `tests.md`. See [system design](../../specs/system-sds.md), [API](../../specs/api-specs.md), [tests](../../specs/test.md), [traceability](../../specs/traceability.md) and [Sprint 1](../../sprints/sprint-1.md).

| Handout requirement (paraphrased; sections 4.1, 4.3) | Evidence/procedure in this guide |
| --- | --- |
| R-01 Clean-clone Docker build and working container | §§4–5, C-03 |
| R-02 Environment settings documented, no real secrets | §3, C-03 |
| R-03 Public GCP UI/API/database business workflow | §§8, 11, C-04 |
| R-04 Persistent data after restart and redeploy | §9, C-05 |
| R-05 Relevant PR builds and meaningful automated tests | §8, C-01 |
| R-06 Required failing check blocks release path; temporary PR | §8, C-02 |
| R-07 Reviewed accepted main releases via repeatable pipeline | §§7–8, C-06 |
| R-08 Release commit identity and repeatable procedure | §§7, 10, C-06 |
| R-09 Issues, board, feature branches, specific independent reviews and release PR | §§7, 10, 14, C-06 |
| R-10 Label Lab 5 issues/PRs, preserve history and mandatory CI | §§7, 10, 14 |
| R-11 Both members participate in all areas and record contributions | §14 |
| R-12 Public repository through grading | §15 |

Forward and reverse audit: each R-01–R-12 row maps a handout requirement to a procedure or evidence gate, and C-01–C-06 map back to their applicable requirements in §8. This mapping is complete; execution and human acceptance remain limited by the statuses below.

Handout source audit: sections 4.1 and 4.3 map to R-01–R-12 above; 4.4 to the account gate in §7; 5 to the adaptation ledger in §5; 7 to architecture and procedures in §§2–7; 8 to test evidence in §8; 9 to contributions in §14; 11 to submission in §15; and 12 to the deadline. These mappings do not establish completion of pending evidence.

## 2. Architecture and deployed resource inventory

One Cloud Run image supervises React Router SSR, Elysia and a same-origin ingress: `/api` routes to API, `/health` to API and other paths to SSR. Drizzle uses durable Supabase PostgreSQL, not the starter's Cloud SQL; the owner selected the existing database to avoid Cloud SQL cost. Browser access is through the API, not Supabase Auth. See [design](gcp-release-design.md) and [container readiness](container-readiness.md).

| Resource | Reviewed target / source | Live status |
| --- | --- | --- |
| GCP project | `cpe334-514311` (number `142175982679`) | Release workflow records project; independent current inventory Not Verified |
| Cloud Run service/job | `approval-system` / `approval-migrate`; Singapore `asia-southeast1` target; Bangkok `asia-southeast3` retained for fallback | Historical release run records Singapore service and revision (§13); independent current inventory and Bangkok fallback Not Verified; [cutover](gcp-singapore-cutover.md) is a procedure |
| Service | 0.5 vCPU, 512 MiB, gen1, request-based, concurrency 1, min 0/max 3 | Not Verified |
| Migration job | 1 vCPU, 512 MiB, one task, zero retries, 600s | Not Verified |
| Artifact Registry | `approval-releases`, Bangkok `asia-southeast3` | Release run records registry region (§13); independent current inventory Not Verified |
| Identities | `approval-runtime`, `approval-migrator`, `approval-deployer` in project; names require inventory | Not Verified |
| Database | Existing Supabase `nomoieoovqhcaojufgfu`, Free, Sydney `ap-southeast-2`; session pooler | Owner-reported historical evidence only; current status Not Verified |
| Origins | CD uses exact Singapore default HTTPS `run.app` `PUBLIC_ORIGIN`; custom `https://approval-system.oangsa.com` is separately verified | Both origins responded to point-in-time HTTPS checks (§13); current Cloud Run configuration and DNS records Not Verified |

## 3. Environment configuration inventory

Sources: [API example](../../../apps/api/.env.example), [web example](../../../apps/web/.env.example), [test example](../../../apps/api/.env.test.example), [readiness inventory](container-readiness.md), [release workflow](../../../.github/workflows/deploy.yml), [availability workflow](../../../.github/workflows/availability.yml), and [runbook](gcp-release-runbook.md). No actual secret values belong here. Combined rows share owner, classification and injection phase.

| Variable | Owner | Purpose | Classification | Required/default | Source | Injection phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | API | PostgreSQL | Secret | Required; local developer or versioned Secret Manager; production verified TLS session pool | API example, runbook | API/job runtime | API example, runbook |
| `AUTH_JWT_SECRET` | API | signing | Secret | Required, ≥32 UTF-8 bytes; private generated value | API example, Secret Manager | API runtime | API example, Secret Manager |
| `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE` | API | token scope | Non-secret | Required; examples `workflow-approval-api`, `workflow-approval-web` | API example | Runtime | API example |
| `AUTH_ALLOWED_ORIGINS` | API | exact browser origins | Non-secret | Required, comma-separated origins; reviewed canonical and custom HTTPS origins | API example, cutover | Runtime | API example, cutover |
| `AUTH_COOKIE_SECURE` | API | cookie security | Non-secret | Required; `true` in production | API example | Runtime | API example |
| `NODE_ENV` | API/web | mode | Non-secret | Example development; test `test`; image production | examples, Dockerfile | Runtime | examples, Dockerfile |
| `HOST`, `PORT` | API/web | listener | Non-secret | API default 127.0.0.1:3001; standalone web 0.0.0.0:3000; combined ingress defaults 0.0.0.0:3000, Cloud Run injects port; children use loopback 3001/3002 | examples, `deploy/start.ts` | Runtime | examples, `deploy/start.ts` |
| `VITE_API_BASE_URL` | Web | browser API base | Public | `/api` default | web example | Build time | web example |
| `API_PROXY_TARGET` | Web | development proxy | Non-secret | `http://127.0.0.1:3001` default; not production routing | web example | Development runtime | web example |
| `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PORT` | Local Compose | DB identity/port | Non-secret | Developer values; examples `workflow`, `workflow_dev`, `5432` | API example | Local Compose | API example |
| `POSTGRES_PASSWORD` | Local Compose | DB password | Secret | Developer supplied | API example | Local Compose | API example |
| `DEV_REQUESTER_PASSWORD`, `DEV_REVIEWER_PASSWORD` | Local development seed | Local development seed | Secret | Required for guarded local seed; distinct developer values | API example | Local seed | API example |
| `TEST_DATABASE_URL`, `TEST_POSTGRES_PASSWORD` | Disposable test DB | Disposable test DB | Secret | Developer-supplied loopback `workflow_test`; never production | test example | Test runtime/Compose | test example |
| `TEST_POSTGRES_PORT` | Disposable test DB port | Disposable test DB port | Non-secret | `55432` example | test example | Test Compose | test example |
| `RUN_BUILT_HTTP_SMOKE` | Integration listener/restart tests | Integration listener/restart tests | Non-secret | Optional `1` enables built HTTP smoke | readiness inventory | Test runtime | readiness inventory |
| `PRODUCTION_INIT_ACK`, `PRODUCTION_DB_HOST`, `PRODUCTION_DB_USER` | Initializer guard | Initializer guard | Non-secret, protect host/user | Required exact acknowledgement `initialize-minimum-sprint-1` and reviewed DB identity | runbook §4 | Protected initializer runtime | runbook §4 |
| `INIT_REQUESTER_EMAIL`, `INIT_REQUESTER_NAME`, `INIT_REVIEWER_EMAIL`, `INIT_REVIEWER_NAME` | Initial accounts | Initial accounts | Sensitive identity | Required, distinct reviewed identities | runbook §4 | Protected initializer runtime | runbook §4 |
| `INIT_REQUESTER_PASSWORD`, `INIT_REVIEWER_PASSWORD` | Initial accounts | Initial accounts | Secret | Required distinct strong passwords | runbook §4 | Protected initializer runtime | runbook §4 |
| `NODE_EXTRA_CA_CERTS` | API/migration/initializer TLS CA | API/migration/initializer TLS CA | Non-secret path | Needed when reviewed CA is not system-trusted; mounted CA from Secret Manager | runbook §3 | Runtime | runbook §3 |
| `RELEASE_SHA` | Image identity | Image identity | Public | Required full 40-character SHA | `deploy/Dockerfile` | Combined image build arg and runtime | `deploy/Dockerfile` |
| `GCP_PROJECT_ID`, `GCP_REGION`, `ARTIFACT_REGION`, `ARTIFACT_REPOSITORY`, `SERVICE_NAME`, `MIGRATE_JOB_NAME` | CD resource selection | CD resource selection | Non-secret | Production environment variables; `ARTIFACT_REGION` falls back to `GCP_REGION` | deploy workflow | GitHub Actions | deploy workflow |
| `PROJECT_ID`, `REGION`, `REGISTRY`, `REGISTRY_REGION`, `IMAGE_TAG`, `GITHUB_REF` | Release script | Resource selection and release identity | Non-secret | `PROJECT_ID`, `REGION`, `REGISTRY`, `IMAGE_TAG` required; `REGISTRY_REGION` defaults to `REGION`; `GITHUB_REF` must be `refs/heads/main`; `IMAGE_TAG` must be a full lowercase 40-character SHA | Workflow maps these respectively from `GCP_PROJECT_ID`, `GCP_REGION`, `ARTIFACT_REPOSITORY`, `ARTIFACT_REGION` (fallback `GCP_REGION`), `github.sha`; GitHub supplies `GITHUB_REF` | GitHub Actions release job; validated before authentication, then used for image build and release script | deploy workflow, `deploy/release.sh` |
| `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT` | CD federated identity | CD federated identity | Non-secret | Required reviewed provider and deployer identity | deploy workflow | GitHub production environment | deploy workflow |
| `PUBLIC_ORIGIN` | CD and availability target | CD and availability target | Public | Required verified default HTTPS `run.app` origin; production environment and repository variables are separate | workflows | GitHub Actions | workflows |
| `AVAILABILITY_CHECK_ENABLED` | Availability schedule | Availability schedule | Non-secret | Only `true` enables main-only check | availability workflow | GitHub repository variable | availability workflow |

The [cutover runbook](gcp-singapore-cutover.md) permits a custom availability origin, but the checked-in availability workflow accepts only `run.app`. Use the verified canonical origin until that discrepancy is separately resolved. Availability calls are best effort and do not establish uninterrupted service.

## 4. Clean-clone and local verification

Use Node 24, npm 11 and Docker Compose v2. In a separate temporary clean checkout, record the full SHA and configure ignored files from examples with private local values. Review [README](../../../README.md) for the full local setup and [test isolation](../../../README.md#testing-commands). Do not copy production credentials.

```sh
git clone https://github.com/oangsa/approval-system.git
cd approval-system
git switch sprint-1-staging
git rev-parse HEAD
node --version
npm --version
npm ci
npm run check
npm run test:release
```

For real PostgreSQL tests copy `apps/api/.env.test.example` to ignored `apps/api/.env.test`, set `NODE_ENV=test` and the guarded loopback `workflow_test` URL and password, then run:

```sh
npm run db:test:up
npm run db:test:migrate
npm run db:test:seed
npm run test:integration
npm run db:test:down
```

The test database is disposable; `db:test:down` discards its tmpfs contents. Never aim these commands at Supabase or a shared database. Use README's local `db:up`, `db:migrate`, `db:seed`, and `npm run dev` setup to run the app; development seed is guarded for local `workflow_dev` only. C-03 requires recorded fresh-clone build **and running container with database**, not just these commands.

## 5. Docker and production image verification

From the repository root:

```sh
docker build -f apps/api/Dockerfile -t approval-api:lab5 .
docker build -f apps/web/Dockerfile -t approval-web:lab5 .
docker build -f deploy/Dockerfile --build-arg RELEASE_SHA="$(git rev-parse HEAD)" -t approval-release:lab5 .
```

The first two images are standalone verification artifacts; the last is the combined production artifact. For safe local container run commands and a private external runtime env file see [container readiness](container-readiness.md#clean-buildrun-procedure-for-27). Run against a migrated disposable database, verify UI/API/database together, and record output; a build alone does not pass C-03. No secret goes in build arguments, logs or image layers.

### Handout §5 recommendation and adaptation ledger

The starter's application/database stack is adapted to same-origin React Router SSR and Elysia, Drizzle migrations and existing Supabase PostgreSQL (§2); no infrastructure change is proposed. Release smoke uses /health, /, and /auth/login; §11 covers the unauthenticated API check. Full-SHA Actions pinning is partial: Google deployment actions are pinned, while other actions use version tags. Dependabot configuration and coverage are unverified; address these separately.

## 6. PostgreSQL migrations and safe initialization

The release runs `npm run db:migrate` in a separate gated job using the same image digest; failure stops before service update. A human reviews SQL, journal, backup and recovery first. Production initialization is a separate human-invoked `npm run db:initialize-production`, never startup or CD. It requires the explicit acknowledgement, exact expected host/user, verified TLS and protected distinct account values in [runbook §4](gcp-release-runbook.md#4-explicit-safe-initialization). It preserves compatible existing accounts and fails on conflicts; do not reset them or use development/test seed in production. See [first deployment](gcp-first-deployment.md) for the complete human procedure.

## 7. Deployment and reviewed branch promotion

Use labelled issues and PRs with substantive independent teammate review: feature/fix → `sprint-1-staging` → `dev` → `main`. Preserve history and CI; do not approve one's own PR. Before main merge review exact SHA, CI, migration SQL, backup and settings. Main push invokes [production release](../../../.github/workflows/deploy.yml): reverify, build/tag full SHA, resolve digest, run migration job, create no-traffic revision, smoke, switch traffic and smoke again. Follow [release runbook](gcp-release-runbook.md) and [cutover](gcp-singapore-cutover.md); cloud administration and production database actions require human review and execution. Historical release evidence in §13 is point-in-time, not current Cloud Run readback.

**Handout §4.4 human gate:** The account owner must confirm their personal Gmail has never used the GCP Free Trial, that the team reused one project, and that the teammate has Editor access. Do not prepay or choose Upgrade to resolve billing. If billing blocks the work, capture a sanitized screenshot and inform the TA. These facts remain unverified; this guide does not authorize billing or IAM changes.

On November 14 the user reported that the teammate's GCP account has Gemini Pro and has not used the GCP trial. This is an owner-supplied statement about trial history, not verification of billing eligibility. Gemini Pro does not establish project reuse or teammate Editor access; those confirmations remain pending.

## 8. C-01–C-06 verification procedures

| Check / requirement | Procedure and evidence needed | Current result |
| --- | --- | --- |
| C-01 / R-05 | Inspect normal PR build and meaningful test summary, tested SHA and workflow. Historical [PR #34](https://github.com/oangsa/approval-system/pull/34), [run 43150681028](https://github.com/oangsa/approval-system/actions/runs/43150681028); see [ledger](ci-quality-gates.md). | PR #59 [verification run 43545335057](https://github.com/oangsa/approval-system/actions/runs/43545335057) passed for head `83f079469c8fedec5afc3609ca97ef7deab5d3ba`; historical PR #34 evidence remains in the ledger |
| C-02 / R-06 | Inspect temporary PR's deliberately failing required `verify`, blocked merge and closed-unmerged outcome: [PR #37](https://github.com/oangsa/approval-system/pull/37), [run 43153171069](https://github.com/oangsa/approval-system/actions/runs/43153171069). Missing approval was a separate gate; see ledger. | Historical technical demonstration; current rules inspected (§15), human approval not enforced |
| C-03 / R-01–02 | Clean clone, configure example values, build and run container with disposable DB; capture commands, output and full SHA. | Passed locally: clean-clone combined build and container with disposable DB (§13); sanitized evidence linked in §13 |
| C-04 / R-03 | On verified public HTTPS URL sign in, submit request, reviewer decides, requester sees persisted history; demonstrate rule or access rejection and no unauthorized change. Capture URL and sanitized results. | Passed functionally on user-supplied workflow and wrong-role search sequence (§13); positive control privately retained because it contains session material |
| C-05 / R-04 | Execute all three observations in §9 against the same record and database. | Operator reports restart and redeploy completed; matching history passed, with identity limitations (§9) |
| C-06 / R-07–10 | Inspect reviewed labelled promotion chain, main CI/CD, digest, revision, marker and full SHA as §10. | Technical chain and matching release header verified; no submitted reviews for PRs #57 and #58 at the November 14 inspection (§13) |

For handout §8, capture the exact test names, files, commands, run and output. Examples: `apps/api/tests/integration/authorization.test.ts` with `npm run test:api`, `apps/api/tests/postgres/requests.test.ts` with `npm run test:integration`, and `e2e/approval-decisions.spec.ts` with `npm run test:e2e`; see [README testing commands](../../../README.md#testing-commands) for prerequisites. [Hosted verification run 43391534002](https://github.com/oangsa/approval-system/actions/runs/43391534002) reports successful typecheck, lint, tests, integration, browser tests and builds for `28e2e3edc701522afc4dec8f1d4a2ee6ba9f60d2`; inspect its logs for individual test names. Automated tests do not establish C-04 or C-05.

## 9. Persistence test: restart and redeploy

Human operators use a synthetic lab record created through the public UI, no direct SQL insertion. Preconditions: verified HTTPS, initialized workflow, eligible requester/reviewer, confirmed persistent DB and reviewed restart/release procedure. Do not reset, truncate, delete, reseed or replace production data.

1. **Before:** sign in, create and submit a request; retrieve it again. Capture stable ID, safe identifying fields, status, source SHA, revision and database identity.
2. **Restart:** use the approved Cloud Run restart procedure or deploy the same immutable image as a new serving revision. Prove a new instance/revision served the request; a browser refresh is insufficient. Retrieve the original ID and compare fields and status.
3. **Redeploy:** promote an independently justified, reviewed distinct commit through staging → dev → main; verify CD, digest and new serving revision. Retrieve the original ID and compare it to both observations. Do not manufacture a commit solely for this check.

| Field | Before | After restart | After distinct main redeploy |
| --- | --- | --- | --- |
| Request | `452ab860-ea25-4e1f-b0d7-9c7b0314a0f4`, `REQ-00000001`, Lab 5 verification, Approved | Operator reports same approved record | Matching Approved history, cycle `eca66d0e-ed67-4b55-94aa-11025d91f48c`, business revision `ce14a9e9-36e4-4325-bfc4-ac4e284b6b71` |
| Database identity | Not independently established | Not independently established | Not independently established |
| Serving revision / instance | Not independently established | Restart reported; exact serving metadata not independently established | Release job reported `approval-system-00007-mig` at 100% at 15:12:13 UTC |
| Source SHA / digest | Baseline at capture unverified | Unverified | `e00b2642ccc7e8d7d2e7c0938e77d3177cd27eeb` / `sha256:b218cd82d7331591aadeefde5481e90ee0f1ef26d3c11eadbcb6e5e58447917e` in release output |
| Result | Observed | Operator-reported complete | Operator-reported complete; history comparison Passed |

The operator confirmed both operations. Exact restart serving metadata and database identity were not independently proved; the distinct release and matching history are documented below.

## 10. Release identity and traceability

Record feature PR → staging, staging → dev PR, dev → main release PR with specific independent reviews and merge SHAs; then link main verification and successful CD, migration execution, image digest/OCI revision, Cloud Run serving revision and traffic, public marker and `X-Release-Sha`. Compare each to the accepted full main SHA. One image/revision contains both UI and API. [Runbook §6](gcp-release-runbook.md#6-traceability-and-actual-acceptance) describes the evidence; source configuration and closed issues alone do not establish a deployed release.

## 11. Security and authorization verification

For an approved verified public origin, a read-only `GET /health` should return `200 {"status":"ok"}` after a DB `SELECT 1`, or sanitized 503 on probe failure; it does not prove schema or business workflow. `GET /api/v1/auth/me` without credentials must return HTTP 401 with `statusCode: 401`, `code: "UNAUTHENTICATED"`, `message: "Authentication required"`, `error: "Unauthorized"`, and a nonempty `requestId` matching the `X-Request-Id` response header. For a controlled second actor, verify server-side denial of an inaccessible request and no unauthorized mutation using the UI or existing test helpers; do not print bearer tokens, passwords, cookies or personal data. Verify Secure, HttpOnly, SameSite=Strict refresh cookie and refresh/logout over actual HTTPS. See [API specification](../../specs/api-specs.md) and [release verification](gcp-release-verification.md). The anonymous checks and user-supplied controlled-actor and cookie observations are recorded in §13. Server-side logout revocation and replay were not verified live.

## 12. Recovery, rollback, pause and teardown

Stop on build or migration failure; preserve prior traffic and inspect logs/journal. Initializer conflicts require investigation, not resets. Candidate smoke failure retains prior traffic; after a live failure a human reviews the known-good accepted SHA/digest and schema compatibility before rollback. Never automatically reverse migrations; use reviewed forward recovery if incompatible. Back up privately and test restore to an isolated destination before changes to populated data. For Supabase outage inspect connectivity/provider status, never reinitialize data. Retain Bangkok pending separately authorized removal. See [runbook recovery](gcp-release-runbook.md#5-backup-migration-failure-and-rollback). Keep service available through grading; only afterward may the owner decide pause/teardown, disabling CD/availability first and preserving database, backups and release images until separately authorized.

If a secret is exposed, the responsible owner must rotate the actual credential at its provider and in Secret Manager, redeploy with the replacement, and inform the TA. Deletion alone does not revoke the credential. Preserve sanitized incident evidence.

## 13. Evidence index and known limitations

For each executed check record **evidence ID, exact R/C requirement, procedure, full source revision, target, timestamp with timezone, direct PR/workflow/revision link, assertion, result, limitation and owner**. Allowed results: Planned, Not Run, Passed, Failed, Blocked, Environment Failure, Not Applicable, or explicitly operator-reported complete. Passed requires inspected execution evidence; historical results retain their original SHA/date and are not new runs.

| Evidence ID | Requirement | Procedure | Source revision | Target | Timestamp | PR/workflow/revision | Assertion | Result | Limitation | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C01-01 | R-05 | Normal PR CI | `528af9d420b8d114e23df596e48af9ef5a058d44` checkout; source `b18f09afb8f1873c55f8f38dacc3b73084118a46` | GitHub CI | 2026-11-12 03:48:55 to 03:53:32 UTC | [PR #34](https://github.com/oangsa/approval-system/pull/34), [run](https://github.com/oangsa/approval-system/actions/runs/43150681028) | Build and tests | Passed | Historical source-inspected run only; current PR Not Run; human verification pending | CI owner |
| C02-01 | R-06 | Temporary failing PR | `43498736f6c763d98b068212e5ad96a3db457416` checkout; source `45b2069dc9927ba9defc43ed78c3f7b9ad53d6f8` | GitHub CI | 2026-11-12 04:11:42 to 04:13:25 UTC | [PR #37](https://github.com/oangsa/approval-system/pull/37), [run](https://github.com/oangsa/approval-system/actions/runs/43153171069) | Intentionally failing required check and blocked merge | Passed | Gate demonstration passed: the intentionally failing CI check failed and the PR remained unmerged; review was a separate gate. Human verification pending | Repository owner |
| C03-01 | R-01 to R-02 | Public clean clone, combined image build and container with disposable DB | `d3fa16789cfde91b6134b10ddde6f380216a4b94` | Local Docker / disposable PostgreSQL | 2026-11-13 20:24–20:31 ICT | Local continuation logs below | Build, health, protected API and login SSR | Passed | Local evidence; sanitized excerpts linked below; does not prove a business action or live acceptance | Implementer |
| C04-01 | R-03 | User-supplied workflow screenshots; public action and denial | Serving SHA at event time unverified | User-reported public URL | 2026-11-13 20:42–20:43 Bangkok (history events); capture time unknown | [Screenshot index](#c04-screenshot-index) | Workflow and wrong-role search denial observed in user-supplied evidence | Passed | Functional check based on operator-reported role and sequence; positive control privately retained because it contains session material; serving SHA at event time unverified | Both members |
| C05-01 | R-04 | Before restart | Unverified | Public URL | Capture time unverified | [Screenshot index](#c05-screenshot-index) | Approved record observed | Passed | Database and serving identity unverified | Operator |
| C05-02 | R-04 | After restart | Unverified | Cloud Run / public URL | Capture times unverified | [Screenshot index](#c05-screenshot-index) | Restart and matching approved record reported | Operator-reported complete | Exact serving revision and database identity unverified | Operator |
| C05-03 | R-04 | After distinct redeploy | Unverified at capture | Public URL / user-supplied history | List clock 2026-11-13 22:24 Bangkok; history capture time unverified | [Screenshot index](#c05-screenshot-index) | Matching Approved request and history | Operator-reported complete; history comparison Passed | Database identity and serving baseline unverified | Operator |
| C06-01 | R-07 to R-10 | Promotion to serving identity | `e00b2642ccc7e8d7d2e7c0938e77d3177cd27eeb` | GitHub / production | 2026-11-13 UTC | REL-02 and LIVE-02 below | Technical promotion chain and matching header | Passed | PR #56 approved; no submitted reviews for #57 and #58 at inspection; current resource readback unverified | Release owner |
| REL-01 | R-07–08 | Release workflow migration, revision and smoke | `28e2e3edc701522afc4dec8f1d4a2ee6ba9f60d2` | Cloud Run / GitHub | 2026-11-13 08:22:54–08:23:33 UTC | [release job](https://github.com/oangsa/approval-system/actions/runs/43391534162/job/131774769882) | Migration and candidate/public smoke passed, traffic switched | Passed | Historical workflow output; current configuration and independent review pending | Release owner |
| REL-02 | R-07–08 | Distinct main release workflow | `e00b2642ccc7e8d7d2e7c0938e77d3177cd27eeb` | GitHub | 2026-11-13 after 15:03:12 UTC merge | [PR #58](https://github.com/oangsa/approval-system/pull/58), [verification](https://github.com/oangsa/approval-system/actions/runs/43448678409), [production release](https://github.com/oangsa/approval-system/actions/runs/43448678495) | Main merge and workflow conclusions | Passed | Workflow conclusions alone do not establish current traffic, database identity, or same-record persistence | Release owner |
| LIVE-02 | R-03, R-08 | `deploy/smoke.ts` against custom HTTPS | Expected and observed `e00b2642ccc7e8d7d2e7c0938e77d3177cd27eeb` | Custom HTTPS | 2026-11-13 15:19:05–15:19:07 UTC | Read-only command output | Health, public SSR and login smoke with matching release header | Passed | Point-in-time smoke; does not prove C-04 or C-05 | Implementer |
| LIVE-01 | R-03, R-08 | `node --import tsx deploy/smoke.ts https://approval-system.oangsa.com 28e2e3edc701522afc4dec8f1d4a2ee6ba9f60d2`; `deploy/smoke.ts` | Script baseline `d3fa16789cfde91b6134b10ddde6f380216a4b94`; expected and observed serving `28e2e3edc701522afc4dec8f1d4a2ee6ba9f60d2` | Custom HTTPS | 2026-11-13 approximately 08:52:25–08:52:40 UTC | Read-only command output | Health, public SSR and login smoke with matching release header | Passed | Does not prove C-04 or C-05 | Implementer |
| LOCAL-01 | R-05, R-08 | `npm run test:release`; `deploy/tests/*.test.ts` | `d3fa16789cfde91b6134b10ddde6f380216a4b94` | Clean archive, Git Bash | 2026-11-13; log last written 08:53:10 UTC, start unknown | Local log below | 11 tests pass | Passed | Local ignored log; earlier WSL attempt failed | Implementer |
| LOCAL-02 | R-03–04 | `npm run db:test:migrate`, `npm run db:test:seed`, `npm run test:integration`; `apps/api/tests/postgres/*.test.ts` | `d3fa16789cfde91b6134b10ddde6f380216a4b94` | Disposable PostgreSQL 17 on loopback port 55439 | 2026-11-13 integration 15:54:09–15:55:30.79 ICT; migration/seed logs last written 08:53:57/08:54:01 UTC, starts unknown | Local continuation logs | Migration, seed and integration | Passed | 10 files, 71 passed, 2 skipped; built HTTP smoke disabled; does not prove live persistence | Implementer |
| GOV-01 | R-11 | Contribution and participation review | Pending | Project records | Pending | Pending | Both members participated in all required areas | Blocked | Human contribution evidence and review pending | Both members |
| GOV-02 | R-12 | Anonymous access | `e00b2642ccc7e8d7d2e7c0938e77d3177cd27eeb` | Repository, issue, PR, run and service | 2026-11-13 16:33:07 UTC | [Issue #27](https://github.com/oangsa/approval-system/issues/27), [PR #58](https://github.com/oangsa/approval-system/pull/58), [release run](https://github.com/oangsa/approval-system/actions/runs/43448678495) | Anonymous access | Passed | Point-in-time only; availability through grading cannot be guaranteed | Repository owner |

### C04 screenshot index

The user-supplied screenshots show a request titled `Lab 5 verification`, type General request, priority Low and department Operations. The displayed request number `REQ-00000001` is a human-readable number, not the request UUID. They show submission as Pending approval, a separate reviewer task, an approval dialog with `Test approval`, and the requester's Approved list and history. The user supplied the [request detail URL](https://approval-system.oangsa.com/requests/452ab860-ea25-4e1f-b0d7-9c7b0314a0f4), identifying the claimed public target and request UUID. The history shows REQUEST CREATED and REQUEST SUBMITTED at 20:42, then DECISION APPROVE by Reviewer Estza with `Test approval` and REQUEST APPROVED at 20:43 on 2026-11-13 Bangkok time. The overview displays last updated `13/11/2569 20:43:22`; screenshot capture time is unknown. The serving SHA at event time is unverified; business record cycle and revision UUIDs are not Git release SHAs. The workflow and narrow wrong-role search denial are observed in user-supplied evidence, with role and sequence reported by the operator. The anonymous 401 in §11 is separate evidence and does not demonstrate controlled-actor denial. This URL, UUID, title, Approved status and history are a C-05 baseline candidate only; database identity and serving revision have not been established, and the initial C-05 screenshots alone do not establish a restart or redeploy; later distinct-release evidence is described below.

1. [Request type](evidence/c04/01-type.png).
2. [Basic information](evidence/c04/02-basic-info.png).
3. [Request details](evidence/c04/03-details.png).
4. [Review before submission](evidence/c04/04-review-submit.png).
5. [Submission confirmation](evidence/c04/05-confirm-submit.png).
6. [Submitted request](evidence/c04/06-submitted.png).
7. [Reviewer task list](evidence/c04/07-reviewer-list.png).
8. [Approval dialog](evidence/c04/08-approval-dialog.png).
9. [Requester approved list](evidence/c04/09-requester-approved-list.png).
10. [Requester approved detail overview](evidence/c04/10-requester-approved-detail.png).
11. [Requester decision and status history](evidence/c04/11-requester-history.png).
12. [Reviewer search denied](evidence/c04/12-reviewer-search-denied.png): the edited read-only `POST /api/v1/approval-tasks/search` with `{}` returned HTTP 403. The operator reports a requester session and that an unchanged `POST /api/v1/requests/search` first returned 200. The original positive-control capture contains session material and is retained privately; no public recapture is required for this packet. The response body and request ID are not shown. This was a search, not a mutation attempt; the existing Approved history records the workflow outcome.
13. [Signed-out view](evidence/c04/13-signed-out.png): sign-in UI and the selected request shows no request cookies. This does not prove server-side revocation or a replay test.

A separate user-supplied private cookie capture shows the public domain, path `/api/v1/auth`, Secure and HttpOnly checked, and SameSite Strict. It contains a cookie value prefix and is retained privately; no public recapture is required for this packet. Refresh rotation and server-side logout revocation were not verified by these captures.

### C05 screenshot index

1. [Cloud Run revision dialog](evidence/c05/01-revision-dialog.png): Singapore `approval-system` shows “No changes made”; “Serve this revision immediately” is unchecked and deployment is pending. The desktop clock reads 21:08 on 2026-11-13.
2. [Public approved request list](evidence/c05/02-public-approved-list.png): the public domain shows `REQ-00000001`, `Lab 5 verification`, Approved. The list does not display the request UUID, serving revision or capture time. This visually corroborates the C-04 workflow but does not establish controlled-actor denial.
3. [Old image tag](evidence/c05/03-old-image-tag.png): Artifact Registry shows tag `28e2e3edc701522afc4dec8f1d4a2ee6ba9f60d2` and digest prefix `92f0bbe7635d`.
4. [New image tag](evidence/c05/04-new-image-tag.png): Artifact Registry shows tag `e00b2642ccc7e8d7d2e7c0938e77d3177cd27eeb` and digest prefix `b218cd82d733`.
5. [History after distinct release](evidence/c05/05-after-distinct-release-history.png): user-supplied cropped history, reported after the distinct release; capture time and serving release are not visible.

The registry screenshots show published images; their cropped project context does not independently establish full resource identity. They do not establish deployment, serving traffic, or persistence.

The user reports the dialog first, this public list before redeploy, and a third, privately retained screenshot after redeploy showing the same request number and Approved status. The third screenshot is omitted from public evidence because unrelated personal browser tabs are visible; the later cropped history is included below. Its desktop clock reads 21:05 on the same date, so the visible clocks do not corroborate the reported order. These screenshots do not establish completed deployment, traffic, a replacement instance, image digest, database identity, or a distinct committed redeploy. The operator confirmed both restart and redeploy were completed. Exact restart serving metadata and database identity remain unverified.

For the distinct release, [PR #56](https://github.com/oangsa/approval-system/pull/56) carried the one-line health documentation change from `fix/lab5-health-documentation` to staging. [CI run 43442755649](https://github.com/oangsa/approval-system/actions/runs/43442755649) passed for source commit `6bbfa55d92ba19503fb7e4560af817eef7852123`; oangsa approved at 14:41:00 UTC and it merged at 14:41:07 UTC as `85183136bae4128f63cad75f131455bfe907dfb8`. [PR #57](https://github.com/oangsa/approval-system/pull/57) merged staging to dev at 14:53:15 UTC as `c1e4572c9a9f8e62eb6e5f59b126efcf9f3f67de`; [PR #58](https://github.com/oangsa/approval-system/pull/58) merged dev to main at 15:03:12 UTC as `e00b2642ccc7e8d7d2e7c0938e77d3177cd27eeb`, all on 2026-11-13. PR #56 had the `lab5` label; PRs #57 and #58 had no labels at the earlier inspection; `lab5` was added on November 13 at approximately 16:31 UTC. Their review submission endpoints remained empty on November 14, so independent review of those promotions is unverified. PRs #56–#59 have the `lab5` label.

[PR #59](https://github.com/oangsa/approval-system/pull/59) carried issue #27 documentation to staging at head `83f079469c8fedec5afc3609ca97ef7deab5d3ba`. oangsa approved it on 2026-11-14 at 03:51:35 UTC; it merged at 03:51:42 UTC as `4ab9bcf01a23b455bb9e4b3c5c7888bb90c659db`. This later approval does not establish review of historical PR #57 or #58 promotions.

[Verification run 43448678409](https://github.com/oangsa/approval-system/actions/runs/43448678409) and [production release run 43448678495](https://github.com/oangsa/approval-system/actions/runs/43448678495) completed successfully. The [release job](https://github.com/oangsa/approval-system/actions/runs/43448678495/job/131967668710) reported image digest `sha256:b218cd82d7331591aadeefde5481e90ee0f1ef26d3c11eadbcb6e5e58447917e` pushed at 15:10:06 UTC, Singapore service region `asia-southeast1`, migration `approval-migrate-7p9jc` completed at 15:11:37, revision `approval-system-00007-mig` at 0% at 15:11:59, candidate smoke passed at 15:12:06, 100% traffic at 15:12:13 and canonical smoke passed at 15:12:14. A read-only custom-origin smoke at 15:19:05–15:19:07 UTC passed health JSON, public SSR and login HTML checks with the new release header. These are workflow output and point-in-time HTTP evidence, not independent current Cloud Run configuration readback or proof of persistence.

A user-supplied screenshot after the distinct release shows the public My Requests list with `REQ-00000001`, `Lab 5 verification`, and Approved; its visible desktop clock reads 22:24 on 2026-11-13 Bangkok time. This is partial post-deployment list evidence. The original is privately retained because unrelated personal browser tabs are visible. The list does not establish the request UUID, compare history, or prove the serving SHA at capture.

The user subsequently supplied the [cropped history](evidence/c05/05-after-distinct-release-history.png), reporting it was captured after the distinct release. It shows Approved and the same creation, submission, approval decision, reason and approval events as the [earlier history](evidence/c04/11-requester-history.png), including cycle `eca66d0e-ed67-4b55-94aa-11025d91f48c` and business revision `ce14a9e9-36e4-4325-bfc4-ac4e284b6b71`. These matching business identifiers strongly correlate the record; they are not Git SHAs. The narrow history comparison passed on user-supplied evidence. The crop has no browser origin, title, request UUID, capture time or release header, so its post-release provenance is the user’s sequential report, supported by the earlier [known request URL](https://approval-system.oangsa.com/requests/452ab860-ea25-4e1f-b0d7-9c7b0314a0f4), post-release list and independent release evidence above, rather than an independently authenticated observation. The previously reported 21:05 Bangkok after screenshot predates the 22:12 Bangkok release. The operator reports that both restart and redeploy were executed. Exact restart serving revision and database identity remain unverified; one recorded release event cannot independently establish both operations.

Local verification on baseline `d3fa16789cfde91b6134b10ddde6f380216a4b94` plus the current documentation-only diff used Windows, Node 24.22.1 and npm 11.19.1 on 2026-11-13 approximately 14:28 to 14:41 Asia/Bangkok. `npm.cmd ci` passed after a sandbox `EACCES` and an approved `ECONNRESET` retry. The initial sandbox `npm.cmd run check` failed with esbuild ancestor `AccessDenied`; its approved rerun exited 0 for typecheck, lint, 387 tests in 43 files and all workspace builds, with existing React Router future warnings. The initial sandbox `npm.cmd run test:release` failed in the loader with `os.userInfo` `ENOMEM` before assertions. Its approved run exited 1 (8 passed, 3 failed): the migration-failure fixture missed expected stub calls, and success and Singapore fixtures reported `PROJECT_ID` null under `C:\Windows\system32\bash.exe` (WSL). This is an observed failure with a Windows environment limitation; a source defect is not established. The ignored `artifacts/issue-27-check-approved.log` and `artifacts/issue-27-release-tests-approved.log` are not durable public evidence. In that earlier session Docker was absent, so Docker, integration and E2E checks were not run and C-03 was not passed. Later local results and user-supplied C-04 and C-05 evidence follow.

Current cloud resource state, board and complete human contribution coverage remain unverified. [Issue #35](https://github.com/oangsa/approval-system/issues/35) was closed as completed by kittipichcha on 2026-11-12 at 04:34:52 UTC with no comments; its acceptance boxes remain unchecked and no remediation or accepted-risk evidence was found. The service's process-local login throttle is not distributed across replicas. Do not infer success from issue closure or health alone.

On 2026-11-13, [release run 43391534162, job 131774769882](https://github.com/oangsa/approval-system/actions/runs/43391534162/job/131774769882) recorded main SHA `28e2e3edc701522afc4dec8f1d4a2ee6ba9f60d2` and image digest `sha256:92f0bbe7635d46ccae47d52222ea0ca1cdbd41f0bb7f76b9eb84b3167169c077`. It reported Singapore service region `asia-southeast1`, registry `asia-southeast3`, migration `approval-migrate-jl2pz` complete at 08:22:54 UTC, revision `approval-system-00004-vun` at 0% at 08:23:22, candidate smoke passed at 08:23:28, traffic at 100% at 08:23:31, and public smoke passed at 08:23:33. This historical workflow output is not independent current Cloud Run readback. The documentation baseline `d3fa16789cfde91b6134b10ddde6f380216a4b94` is distinct from this newer main and observed serving SHA.

Read-only HTTPS checks at 08:51:48–08:51:50 UTC on 2026-11-13 returned `200` and `{"status":"ok"}` for `/health` on both [canonical origin](https://approval-system-142175982679.asia-southeast1.run.app) and [custom origin](https://approval-system.oangsa.com); custom `/` returned 200 and `/api/v1/auth/me` returned the §11 unauthenticated envelope with matching request ID header. Responses carried `X-Release-Sha: 28e2e3edc701522afc4dec8f1d4a2ee6ba9f60d2`. Initial sandbox DNS failed; an approved unrestricted retry produced these results. At approximately 08:52:25–08:52:40 UTC, `node --import tsx deploy/smoke.ts https://approval-system.oangsa.com 28e2e3edc701522afc4dec8f1d4a2ee6ba9f60d2` exited 0: health JSON, public SSR marker and sign-in page smoke passed; `deploy/smoke.ts` checks `/health`, `/`, `/auth/login` and release headers. These point-in-time checks do not prove a business workflow or persistence. PRs [#52](https://github.com/oangsa/approval-system/pull/52), [#53](https://github.com/oangsa/approval-system/pull/53), [#54](https://github.com/oangsa/approval-system/pull/54), and [#55](https://github.com/oangsa/approval-system/pull/55) had empty review endpoints when inspected; independent approval is not verified.

Fresh local follow-up: on 2026-11-13 a clean archived `d3fa16789cfde91b6134b10ddde6f380216a4b94` snapshot completed `npm ci` with npm 11 install-script warnings and no policy change. With Git Bash on PATH, `npm run test:release` exited 0 with 11 passed, 0 failed and 0 skipped; the earlier WSL failure above remains part of the record. The original local log is private; [sanitized excerpts](evidence/c03/results.txt) are included. The later guarded disposable PostgreSQL migration and seed passed; integration exited 0 with 10 files, 71 passed and 2 skipped in 81.79 seconds (`RUN_BUILT_HTTP_SMOKE` was not enabled). Local logs are `C:\Users\kitti\approval-system\artifacts\issue-27-continuation-{db,migrate,seed,integration}.log`. A public clean clone at the same SHA was confirmed clean. Standalone API and web Docker builds exited 0 (logs `C:\Users\kitti\approval-system\artifacts\issue-27-continuation-docker-{api,web}.log`). On 2026-11-13 around 20:25 ICT, standalone runtime assertions returned API `/health` 200, unauthenticated `/api/v1/auth/me` 401, and web `/auth/login` 200 with sign-in SSR HTML; the initial sandbox loopback request was denied and the approved retry passed. The local log is `C:\Users\kitti\approval-system\artifacts\issue-27-continuation-standalone-assertions.log`. The earlier combined-image retry failed in `npm ci` with esbuild `spawnSync ETXTBSY` (log `C:\Users\kitti\approval-system\artifacts\issue-27-continuation-docker-release-retry.log`, last written 16:00 ICT). The sequential combined build from the public clone exited 0 (2026-11-13, started 20:24:48 ICT; log `C:\Users\kitti\approval-system\artifacts\issue-27-continuation-clone-release-retry.log`). The combined container started at 20:30:01 ICT against disposable PostgreSQL. At 20:30:19, `/health` returned 200 with status `ok`, unauthenticated `/api/v1/auth/me` returned 401, and `/auth/login` returned 200 with sign-in SSR HTML; each response carried the matching `X-Release-Sha` for `d3fa16789cfde91b6134b10ddde6f380216a4b94`. An invalid-login assertion initially expected 401 without an Origin but received 403 from the origin guard; retrying with the configured allowed Origin at 20:31:14 returned 401 and the matching release header. This was a setup correction, not a product fix. Assertions are in `C:\Users\kitti\approval-system\artifacts\issue-27-continuation-clone-release-assertions.log`. Sanitized excerpts are in [C-03 results](evidence/c03/results.txt); they do not establish a business action.


## 14. Team contributions and independent review

Both members must participate in requirements, testing, AI supervision, implementation, review and deployment, and either must explain sampled steps. Record actual work with issue, commit, PR and specific review links; pair work names both members. Equal commit counts are not required.

| Person | Actual contribution / evidence |
| --- | --- |
| kittipich charoenthanachot (kittipichcha) | Authored [PR #56](https://github.com/oangsa/approval-system/pull/56) and [PR #59](https://github.com/oangsa/approval-system/pull/59). The user supplied screenshots and operator attestation. |
| suthang sukrueangkun (oangsa) | Approved [PR #56](https://github.com/oangsa/approval-system/pull/56) and [PR #59](https://github.com/oangsa/approval-system/pull/59); authored [PR #57](https://github.com/oangsa/approval-system/pull/57) and [PR #58](https://github.com/oangsa/approval-system/pull/58). |

Complete participation in every required area remains unverified; student IDs are omitted from this public evidence. [AI assistance](../../../ai_use.md) does not substitute for teammate review.

## 15. Submission checklist and references

Prepare one concise PDF named `lab5_sec<section>_<group name>.pdf`, upload manually to LEB2 by **2026-11-15 23:59 ICT** (handout §12), and keep service/repository public through grading. Give direct links and one or two sentences each; use screenshots only where links cannot show proof, with numbered captions identifying check, commit/run/URL; crop legibly at 100% and redact secrets.

- [ ] **Answer Part 0: Team and Evidence Index:** team number/topic, both names, student IDs and GitHub usernames; public repository, submitted commit/tag, public URL and serving SHA; contribution table with issue/PR links; at least one evidence row per rubric part.
- [ ] **Answer Part 1: CI and Quality Gate:** CI file, passing PR/build/test summary C-01, main required-check setting, failing temporary PR and blocked merge C-02.
- [ ] **Answer Part 2: Docker and Reproducible Configuration:** Dockerfile/.dockerignore, clean build and container with DB C-03, examples and §3 without secrets.
- [ ] **Answer Part 3: GCP Deployment and Persistence:** URL and live UI/API/database action and rejection C-04, service/database evidence and same-record restart/redeploy C-05.
- [ ] **Answer Part 4: Repeatable Release Pipeline:** labelled issue and reviewed PR chain, CI, main release and deployment, matching running revision/commit C-06, and §7 procedure.
- [ ] Both members inspect the final redacted PDF, links and actual evidence; verify public repository, issues, PRs, runs and service. The C-04 functional check and C-05 operator report are recorded in §13.

### Submission source index

| Part | Evidence and limits |
| --- | --- |
| 0 | [Issue #27](https://github.com/oangsa/approval-system/issues/27), §14 and [evidence index](evidence/README.md); team section and student IDs belong in the external PDF. |
| 1 | [CI ledger](ci-quality-gates.md), [passing PR #34](https://github.com/oangsa/approval-system/pull/34), [failing PR #37](https://github.com/oangsa/approval-system/pull/37); current rules below. |
| 2 | [Configuration](#3-environment-configuration-inventory), [C-03 excerpts](evidence/c03/results.txt), [Docker procedure](#5-docker-and-production-image-verification); local results do not prove live workflow. |
| 3 | [C-04](#c04-screenshot-index), [C-05](#c05-screenshot-index), [persistence matrix](#9-persistence-test-restart-and-redeploy); operations operator-reported, with identity limits. |
| 4 | [PR #56](https://github.com/oangsa/approval-system/pull/56) → [#57](https://github.com/oangsa/approval-system/pull/57) → [#58](https://github.com/oangsa/approval-system/pull/58), [release job](https://github.com/oangsa/approval-system/actions/runs/43448678495/job/131967668710); no submitted reviews for #57 and #58 at inspection. |

### Remaining submission work and observations

- Account owner: confirm §4.4 Free Trial, reused project and teammate Editor access; handle billing blocks as described in §7.
- Both members: complete contribution coverage, final PDF review and submission. Restart and redeploy are operator-reported complete, with the limits in §9.
- Project-board authorized member: verify board status. Issue #27 is open, assigned to kittipichcha and labelled `lab5`; [Project 6](https://github.com/users/oangsa/projects/6) branch automation [run 43545288052, job 132295071558](https://github.com/oangsa/approval-system/actions/runs/43545288052/job/132295071558) succeeded for `feature/27`; the successful step without a skip indicates a move from Specified to Started. Missing `read:project` scope prevents current board readback.
- Submission owner: upload the redacted PDF to LEB2 and retain public access through grading.

On 2026-11-13 approximately 16:31 UTC, the GitHub rulesets API showed active [rulesets](https://github.com/oangsa/approval-system/rules) `protect-main` (27084320), `protect-dev` (27084322), and `protect-sprint-1-staging` (27084285), each targeting its named branch, requiring a pull request and the `verify` integration 15368 check with strict up-to-date branches. The configured approving review count was **0**; these settings do not enforce a mandatory human approval. No settings were changed.

At 16:33:07 UTC on November 13 anonymous Node fetches returned 200 for the repository API, issue #27, PR #58 and release run 43448678495 pages; the custom origin `https://approval-system.oangsa.com` returned 200 for `/health` with JSON status `ok` and for `/auth/login`, with release header `e00b2642ccc7e8d7d2e7c0938e77d3177cd27eeb`. These are point-in-time observations, not a guarantee through grading.

On November 14 at 04:18:36–04:18:57 UTC (11:18 Bangkok), [anonymous HTTP results](evidence/anonymous-access-2026-11-14.json) recorded 200 for the repository, issues #27/#35, PRs #34/#37/#56–#59, the selected CI/release pages and immutable published guide/screenshot links. Public landing, sign-in and health returned 200 with release header `e00b2642ccc7e8d7d2e7c0938e77d3177cd27eeb`; unauthenticated `/api/v1/auth/me` returned 401. These requests supplied no Authorization or Cookie header and used no browser profile. They establish anonymous HTTP access, not an observed InPrivate browser session or anonymous artifact-download access.

[PR #60](https://github.com/oangsa/approval-system/pull/60) prepares the reviewed staging documentation for `dev`; independent review, merge and its normal CI remain pending. The subsequent `dev` → `main` PR requires that promotion first. Issue #27 remains open while those release steps and the explicitly identified evidence limits remain outstanding.
