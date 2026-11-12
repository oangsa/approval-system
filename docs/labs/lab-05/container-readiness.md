# Issue #24 — container readiness and handoff

Current repository/acceptance status is recorded in the
[2026-11-12 release-process correction](release-process-verification.md).
PR #32 has merged; #24 was reopened because acceptance remains incomplete.
Earlier draft-state observations below are historical.

Local audit dated 2026-11-11; R-01/R-02/R-04, C-03 and C-05 prerequisites.
This is input to #27, not its final `deployment.md`. Cloud resources/trust belong
to #26; CI gates belong to #25. No cloud execution or release acceptance is claimed.
Actual local checks and limitations are recorded in [verification](container-verification.md).

## Baseline and existing behavior (before edits)

Branch `feature/24-lab5-cloud-docker` already existed, with clean worktree at
`b01d3db4313c145075431e22cd9020117b30505a`, equal to local
`origin/sprint-1-staging`. Local `sprint-1-staging` was stale at `bc128df`;
no branch/history reset was performed. The baseline includes merged Sprint 1
identity, submission, list/detail, reviewer routing and decisions/history work
and PR #31 course materials. Git ancestry alone does not establish human release
acceptance; verify accepted release/review links before promotion.

Read root AGENTS/README, Sprint 1 scope and feature evidence, SDS/API/test/
traceability and SRS/UI boundaries, current CI, application configuration,
contracts exports, database schema/repositories, and Lab 5 handout, guide Episodes
2–3 and starter Docker/proxy/environment examples. Extracted examples stayed in
`/tmp/approval-lab5-reference`; their Prisma/static-SPA stack was not copied.
Handout requirements and repository contracts take precedence: no new readiness
endpoint, product feature or migration was introduced.

Already present:

- Both Dockerfiles install from root manifests and lockfile using `npm ci`, copy
  shared contracts, build the selected workspace and run its production start
  script on Node 24 as non-root `node`. API bundles contracts; web retains SSR.
  No build secret ARG/ENV is used. Dockerfiles remain unchanged after successful builds.
- Container defaults are `HOST=0.0.0.0`, API `PORT=3001`, web `PORT=3000`;
  runtime PORT overrides are supported. API passes HOST/PORT into its Node adapter.
- API `/health` returns `{ "status": "ok" }` (liveness only). Web `/` is an
  SSR page, not a database readiness endpoint. Do not treat health as DB evidence.
- PostgreSQL stores users, roles, session families, hashed refresh tokens,
  request revisions/items, assignments, cycles/stages/slots, decisions,
  idempotency, audit and outbox records. Repository units use transactions.
  No required business record was found stored only on the container filesystem.
  Sprint 1 has no implemented attachment upload route; future storage is out of scope.
- Access JWT is browser-memory state; durable refresh/session authority is DB-backed.
  Login throttle is process-local (documented in source), resets on restart and
  does not aggregate across replicas. #26 must account for that scaling limitation;
  this audit does not introduce a new security store.

Confirmed maintenance changes: exclude generated React Router/test/build metadata,
logs, local DB files/dumps, uploads and common credential exports from Docker context;
clarify build/runtime configuration in environment examples. Existing `.env*`
exclusion and `.env.example` exception remain. No generic pattern can recognize
all arbitrarily named secrets: inspect files before building and never put real
credentials inside application source. Runtime images currently retain source/dev
dependencies; slimming is not required for correctness and was not added.

## Configuration inventory

Placeholders only. Production secrets must be runtime-injected, never build args,
VITE variables, issue comments, screenshots or logs. Example `.env` files are local
configuration; web production `react-router-serve` does not load them automatically.

| Variable | Classification | Required/default and value source |
| --- | --- | --- |
| API `DATABASE_URL` | Secret | Required PostgreSQL URL; #26 supplies reviewed durable DB connection via secret injection; local developer supplies loopback URL |
| API `AUTH_JWT_SECRET` | Secret | Required, at least 32 UTF-8 bytes; owner generates securely and injects same value across API replicas/restarts |
| API `AUTH_JWT_ISSUER` | Non-secret | Required nonempty identifier; deployment configuration, example `workflow-approval-api` |
| API `AUTH_JWT_AUDIENCE` | Non-secret | Required nonempty identifier; deployment configuration, example `workflow-approval-web` |
| API `AUTH_ALLOWED_ORIGINS` | Non-secret | Required comma-separated exact HTTP(S) origins, no wildcard/path; selected browser HTTPS origin from #26 |
| API `AUTH_COOKIE_SECURE` | Non-secret | Required `true`/`false`; production enforces `true`; local tests/development may use `false` |
| API `NODE_ENV` | Non-secret | Required development/test/production; image sets production |
| API `HOST` | Non-secret | Parser default 127.0.0.1; image overrides 0.0.0.0 |
| API `PORT` | Non-secret | Parser/image default 3001; Cloud Run supplies service PORT |
| Web `HOST` / `PORT` | Non-secret | Server runtime; image 0.0.0.0 / 3000; Cloud Run supplies PORT |
| Web `NODE_ENV` | Non-secret | Image production; supplied by runtime environment |
| Web `VITE_API_BASE_URL` | Public | Build-time browser URL, default `/api`; existing Dockerfile builds default. Runtime injection cannot change compiled assets |
| Web `API_PROXY_TARGET` | Non-secret | Vite development proxy only, default http://127.0.0.1:3001; developer supplies local API address |
| `POSTGRES_USER` / `POSTGRES_DB` | Non-secret | Local Compose requires values; example workflow/workflow_dev, selected by developer; not API runtime settings |
| `POSTGRES_PASSWORD` | Secret | Local Compose required; developer chooses; URL-encode matching password in DATABASE_URL |
| `POSTGRES_PORT` | Non-secret | Local Compose default 5432; developer chooses unused local port |
| `DEV_REQUESTER_PASSWORD` / `DEV_REVIEWER_PASSWORD` | Secret | Required only by development seed, developer-chosen distinct local passwords; never used as production seed settings |

Test-only configuration is separately documented in `apps/api/.env.test.example`:
`TEST_DATABASE_URL`, `TEST_POSTGRES_PASSWORD`, `TEST_POSTGRES_PORT`, `NODE_ENV` and
comparison `DATABASE_URL`; test runner requires guarded loopback `workflow_test`.
`RUN_BUILT_HTTP_SMOKE=1` enables real listener/restart tests. Do not reuse the
synthetic test seed/accounts in production. Development seed rejects non-loopback,
non-workflow_dev and non-development targets; #26 must arrange reviewed production
accounts/configuration without bypassing those guards.

## Routing and persistence handoff to #26/#27

### Approved database provider decision — 2026-11-11

Owner @oangsa approved **Supabase PostgreSQL instead of Google Cloud SQL** in
this session, citing Cloud SQL expense. Keep the web/API on GCP Cloud Run in
existing project `cpe334-514311`; use Supabase only as the PostgreSQL provider
through the existing Elysia/Drizzle backend. Preserve application email/password
authentication, JWT/refresh-session behavior and versioned Drizzle migrations;
this decision does not adopt Supabase Auth or direct browser database access.

Handout §5 lists Cloud SQL as recommended, while R-03 requires GCP application
deployment and R-04 requires durable database persistence. Record this alternative
and its cost rationale in #26 and #27's final deployment guide. Owner approval is
not instructor approval or evidence of deployed persistence.

Cost implication: avoid provisioning a Cloud SQL instance. The owner subsequently
identified the existing Free-plan Sydney project below; no paid upgrade is
approved. Quotas, availability/pause policy and sanitized cost implications still
need verification before execution. #26 must verify the selected Supabase connection
mode, TLS, connectivity, connection limits and migration compatibility. Inject
credentials into API runtime secrets only. No cloud/database resource was
created, changed or deleted to record this decision. Existing-resource inventory
still applies, including any already-existing Cloud SQL resources; do not delete
them automatically. Independent teammate configuration review remains pending.

### Existing Supabase project — owner evidence, 2026-11-11

- [Project dashboard](https://supabase.com/dashboard/project/nomoieoovqhcaojufgfu),
  reference `nomoieoovqhcaojufgfu`; reuse this project rather than create another.
- Plan: Free, reported by owner. Supplied database screenshot shows Oceania
  (Sydney), `ap-southeast-2`, Nano. This is separate from approved Cloud Run
  Bangkok (`asia-southeast3`). No migration to another region is authorized.
- Owner's Connect screenshot shows Session pooler, port 5432, database `postgres`.
  Host/user must be copied privately from Connect, not reconstructed from a
  cropped screenshot. No password or complete credential-bearing URL is recorded.
- These are owner-supplied observations, not independent account inspection,
  teammate-access verification or a successful database connection.
- Free projects may pause after low activity over a seven-day period. Check
  availability before demos/grading; owner must decide the operational response.
  No upgrade or artificial keep-alive job is authorized. See
  [Supabase pausing documentation](https://supabase.com/docs/guides/platform/free-project-pausing).
- Bangkok-to-Sydney database calls cross regions/providers: measure workflow
  latency and check network usage/cost implications under #26; no estimate or
  performance pass is asserted here.
- Before applying migrations, the human must inventory existing application
  tables and migration history and confirm this project's intended data ownership.
  Retain Elysia authorization; disable unused Supabase Data API access before
  exposing application tables, following reviewed dashboard configuration.
- Owner supplied a successful SQL Editor result on 2026-11-11 for
  `information_schema.tables` filtered to `public` and `drizzle`: no rows returned.
  No visible tables in those two schemas were found; this does not establish that
  other schemas are empty or independently verify connectivity from the app.
  At that inventory step, application connection verification and migration execution were pending; subsequent results follow.
- Owner reported `PostgreSQL connection verified.` from
  `node --env-file=/tmp/approval-supabase-check.env --import tsx apps/api/scripts/check-database.ts`
  on 2026-11-11 after correcting local environment formatting. This proves the
  owner's local `SELECT 1` check, not Cloud Run connectivity or schema migration.
  The earlier attempt failed because HOST was joined to the URL database path;
  no source change was required. No credentials are included in this evidence.
- Owner then executed the existing Drizzle migration command from `apps/api`,
  loading the same private `/tmp/approval-supabase-check.env`. Reported result on
  2026-11-11: `[✓] migrations applied successfully!`. PostgreSQL issued two
  identifier-truncation NOTICE messages for long foreign-key constraint names;
  no migration failure was reported. This is human-executed, owner-supplied
  evidence, not agent execution or independent schema inspection. Migration
  journal verification, Data API disablement confirmation, accounts/configuration,
  teammate access/review and deployed workflow/persistence checks remain pending.
- Owner supplied a SQL Editor screenshot showing
  `SELECT count(*) AS applied_migrations FROM drizzle.__drizzle_migrations;`
  returning **9** on 2026-11-11. This confirms nine recorded migration entries
  in the owner's selected database; it is not a full schema-drift audit or a
  deployed workflow test. Journal count verification is complete; Data API
  disablement confirmation and the other setup gates above remain pending.
- Owner confirmed Data API disabled on 2026-11-11 and supplied the dashboard
  screenshot showing Enable Data API off and no schemas queryable. Recorded as
  owner confirmation, not independent REST-endpoint verification. Supabase is
  used through backend PostgreSQL connections only. Remaining initialization
  work is reviewed application accounts/configuration under #26; do not bypass
  the existing local-only development/test seed guards.

### Approved Cloud Run settings — 2026-11-11

Owner @oangsa selected `asia-southeast3` (Bangkok), **0.5 vCPU / 512 MiB**
for the application service, and the remaining compatible starter-kit settings:

| Setting | Approved target |
| --- | --- |
| Project | Existing `cpe334-514311` |
| Application topology | One public Cloud Run service, one browser origin for UI and `/api` |
| Region | `asia-southeast3` (Bangkok), replacing example Singapore |
| Service CPU / memory | 0.5 vCPU / 512 MiB |
| Scaling | Minimum 0, maximum 3 instances |
| Ingress container port | 3000 via PORT; bind 0.0.0.0 |
| Public endpoint | Public invocation with application authentication/authorization retained |
| Runtime secrets / identity | Secret Manager injection and dedicated runtime service account; adapt names and minimal permissions |
| Migration / releases | Separate migration job before service update; commit-tagged images deployed by digest |
| Database | Supabase PostgreSQL; omit example Cloud SQL provisioning, attachments and permissions |

For fractional CPU, Google requires concurrency **1**, **request-based billing**
and the **first-generation execution environment**. These are required adaptations
to the owner's CPU choice, not unchanged example defaults. Sources checked
2026-11-11: [CPU constraints](https://docs.cloud.google.com/run/docs/configuring/services/cpu)
and [Bangkok region](https://docs.cloud.google.com/run/docs/locations).
The 0.5 vCPU selection applies to the application service; migration job resource
settings need their own compatible review, not a blind copy of service CPU.

Cost/availability implications: scale-to-zero permits cold starts; concurrency 1
limits each instance to one request at a time. CPU/memory/scaling choices are
limits, not a spending cap or guarantee of free operation. Actual runtime,
request volume, registry/build/secret usage and Supabase/network charges still
need sanitized cost verification under #26. No cloud command was executed.

The one-service topology is approved; SSR-compatible packaging and routing still
require implementation/verification under #26. The example's static-SPA server
cannot replace React Router SSR unchanged. The existing build expects a
single HTTPS browser origin whose `/api/*` routes reach the API with prefix,
Authorization, Origin, Cookie and Set-Cookie preserved. Vite proxy is development
only; deploying two standalone Cloud Run URLs does not supply this routing.
Refresh cookie is HttpOnly, Secure in production, SameSite=Strict and scoped to
`/api/v1/auth`; retain those safeguards. Unrelated web/API sites are incompatible
with that cookie even if CORS is allowed. Do not change cookie policy to conceal
a topology problem. Configure the exact browser origin in AUTH_ALLOWED_ORIGINS.

#26 must provide reviewed same-origin routing, durable Supabase PostgreSQL, reviewed
migration execution and seed strategy, secret injection and connectivity. Do not
run migrations or seed automatically on every service startup. Existing migrations
are under `apps/api/src/Infrastructures/Database/migrations`. Health alone cannot
prove migration state. Verify authenticated submit → decision → history, refresh
rotation, restart and redeploy against the actual selected HTTPS topology.

## Clean build/run procedure for #27

From a clean checkout of the reviewed SHA, Node 24/npm 11 and Docker:

```sh
npm ci
npm run check
docker build -f apps/api/Dockerfile -t approval-api:lab5 .
docker build -f apps/web/Dockerfile -t approval-web:lab5 .
# API runtime file lives outside the repository, contains reviewed values,
# HOST=0.0.0.0 and a reachable migrated test DATABASE_URL; never publish it.
docker run --rm --env-file /tmp/approval-api.runtime.env -e PORT=8080 -p 127.0.0.1:8081:8080 approval-api:lab5
docker run --rm -e PORT=8080 -p 127.0.0.1:8082:8080 approval-web:lab5
```

These separate listeners require the reviewed HTTPS routing layer to test browser
authentication with production Secure cookies. For local fixture checks only,
NODE_ENV=test/AUTH_COOKIE_SECURE=false permit HTTP; that is not production proof.
Use README's guarded test migrate/seed/integration commands against an isolated
loopback workflow_test database, not a cloud or shared development DB. Retain the
DB while restarting/replacing app containers; compare record IDs, final history
and refresh continuity. Remove disposable fixtures after testing, not real data.

## Existing project inventory and human gates

Owner supplied project ID `cpe334-514311`, number `142175982679`, display name
`CPE334-2026-Approval-System` in this session. These are reported, not independently
verified. A project has no single region: inventory existing resources separately.
The owner selected Bangkok and the one-service topology above for this deployment;
existing resource locations have not been verified. `gcloud` is absent in this
execution environment; no cloud command ran.

Owner supplied a Console screenshot on 2026-11-11 showing Cloud Run Admin API
(`run.googleapis.com`) status **Enabled**, after the create-service page had
reported it disabled/unused. This records human-executed API enablement only;
it does not establish a deployed service, resource inventory, billing status or
teammate access. No agent cloud execution was performed.

Owner supplied a Cloud Run **Services** screenshot for
`console.cloud.google.com/run/services?project=cpe334-514311` on 2026-11-11.
The filter field is empty and the visible service list has no rows. Record:
**no services shown in the owner's Console inventory**. Jobs and other resource
types remain unverified; this does not prove that the whole project is empty.

Owner subsequently supplied the Cloud Run **Jobs** screenshot for the same
displayed project on 2026-11-11. The filter field is empty and no job rows are
visible. Record: **no jobs shown in the owner's Console inventory**. Together
with Services, this completes the supplied Cloud Run service/job list evidence;
Artifact Registry and other project resource/access/billing checks remain pending.

Owner supplied the Artifact Registry **Repositories** screenshot for the same
displayed project on 2026-11-11: **No repositories to display**, with no filter
entered. The page also shows vulnerability scanning disabled. No repository was
created and no scanning option was enabled in this session. Repository creation
and any scanning/cost decision belong to #26; other inventory, billing and
independent teammate access checks remain pending.

Owner supplied Billing Overview screenshots on 2026-11-11 showing **Paid account**,
with November 1–11 cost THB 4.35, savings THB 4.35, net cost THB 0.00 and
forecast THB 0.24. These are displayed account-level figures, not a future cost
guarantee or independently attributed project charges. The incentive milestone
tile shows zero active credits; the Credits page and any trial-credit expiry
have not been inspected. Do not record this as verified Free Trial status.
Project-to-billing linkage, account open/payment status and alerts-only budget
remain to be verified without recording account IDs or payment details.
The paid-account state differs from the handout's Free Trial setup; owner should
confirm acceptability with a TA before additional paid-resource provisioning.
No upgrade, payment or billing modification was performed by the agent.

Subsequent owner screenshots on 2026-11-11 clarify credits and budgets:

- Credits page shows two **Available** Google Developer Program premium benefit
  credits: THB 335.93 remaining (100%) and THB 293.80 remaining (89%), totaling
  THB 629.73 at capture time. Credit expiry and eligible usage are not visible;
  this is not Free Trial status or a guarantee all deployment costs are covered.
  Credit IDs and billing identifiers are deliberately omitted from this record.
- Budgets list shows an account-scoped monthly THB 5 budget, thresholds 50%,
  90%, 100%, 150%, and spend-cap status **Not applicable**.
- A second budget named `CPE334 Aleart` shows THB 250 for November 10–December 15,
  2026, thresholds 50%, 90%, 100%, and spend-cap status **Not applicable**.
  Its scope is displayed only as `Project...`; target project, recipients and
  credit-accounting options still need verification in budget details.
- These screenshots establish existing credits/budget entries, replacing the
  earlier unknown-credit/budget observations above. They do not prove the
  credit expiry, target-project billing linkage, an enforced spending cap, or
  owner-approved notification recipients. Do not create duplicate budgets.

Owner supplied `CPE334 Aleart` edit-page screenshots on 2026-11-11 confirming:
**Alerts only**, custom November 10–December 15, 2026 range, THB 250 target,
actual-spend thresholds 50%/THB 125, 90%/THB 225 and 100%/THB 250, all services.
Billing-admin/user email notifications are checked; project-owner emails are
unchecked. Monitoring email channel `main` is selected under notification project
`cpe334-514311`; Pub/Sub is unchecked. Savings-program and other-savings boxes
are unchecked in the supplied view. The budget's **Projects** scope remains
collapsed as `1 out of 2 projects`; the notification-channel project alone does
not establish the selected budget-scope project. Scope identity, actual email
recipient/channel verification and saved-state confirmation remain pending.
No agent budget changes were made and no enforced spending cap is claimed.

Owner then supplied the expanded Projects selector showing
`CPE334-2026-Approval-System` / `cpe334-514311` checked and the other project
unchecked. The selected budget scope is therefore confirmed for the intended
project in the supplied editor view. Actual notification delivery and saved-state
confirmation remain separate from this scope evidence.

Owner supplied the project's IAM principals screenshot on 2026-11-11 showing
two human principals with **Owner (Legacy)** and **Editor (Legacy)** roles,
and the default compute service account with **Editor (Legacy)**. Personal
names/email addresses are omitted from this record. The screenshot supports
existing human role grants; teammate sign-in/project-opening confirmation is
still pending and is not inferred from a listed grant. No IAM change was made.
The broad default compute-account grant is existing inventory, not approval to
use that identity for runtime; #26 retains the dedicated least-privilege
runtime identity configuration and independent review responsibility.

| Evidence needed | Status / accountable human |
| --- | --- |
| Resource inventory | Owner screenshots: no Cloud Run services/jobs or Artifact Registry repositories; API enabled; remaining SQL/storage/secret/trust inventory and teammate verification pending |
| Both members can open the existing project | Owner confirmed teammate access in follow-up; IAM grants supplied; independently authored teammate verification still pending |
| Billing/credits | Paid account and THB 629.73 available credits shown; expiry/eligibility and project linkage pending; no signup/upgrade/payment |
| Alerts-only budget | THB 250, intended project selected, dates/thresholds confirmed above; delivery/saved state pending; not a cap |
| Database provider | Supabase PostgreSQL approved by @oangsa on 2026-11-11; replace planned Cloud SQL provisioning, preserve existing backend/auth/contracts |
| Cloud Run region/sizing/topology | Owner-approved Bangkok, 0.5 vCPU/512 MiB, min 0/max 3, one public service; fractional CPU constraints above apply; implementation/review pending |
| Supabase project/plan/region | Existing nomoieoovqhcaojufgfu, Free, Sydney ap-southeast-2; owner supplied screenshots/link; local connection and 9 migrations confirmed; independent access verification pending |
| Budget, availability and teardown details | Pending @oangsa; Free-plan pause and cross-region implications recorded; no paid upgrade or resource execution performed |
| Issue tracking | GitHub issue #24 fetched during final recheck: open, assigned to @oangsa, lab5 label present; board/history verification pending; branch already existed |
| Specific independent teammate review | @kittipichcha approved 5b50bab with empty body; specific rationale and final-revision coverage still pending; see verification follow-up |

Supply sanitized Console/resource links and dated findings to #24/#26/#27; never
include secret values or service-account key downloads. #24 implementer remains
planned @oangsa and reviewer @kittipichcha; actual human contributions must be
recorded by them, not inferred from AI work. AI assisted audit, configuration documentation, exclusions and local verification.
The owner performed the Console changes and Supabase migration recorded above.
No agent cloud deployment, IAM/billing change or hosted database change occurred. Implementation
PR needs `lab5`, `Closes #24`, target `sprint-1-staging`, then reviewed promotion
through dev and release-reviewed main. Only accepted main deploys.

## Current acceptance handoff

The [merge-readiness response](container-verification.md#merge-readiness-review-response--2026-11-11)
records hosted CI, the actual teammate approval, owner-confirmed teammate access,
restored draft status, missing sprint-staging branch protection and project-board
inspection limits. Earlier chronological pending observations above are historical;
this section and the current evidence table govern the follow-up status. #24 is
not marked complete. #26 must apply the owner-approved Supabase/single-service
Bangkok decisions instead of its earlier Cloud SQL/two-service wording, while
preserving SSR, existing auth and accepted-main-only deployment. #25 owns the
missing enforced merge gate; no repository settings were changed here.
