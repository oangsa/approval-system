# Issue #26 — release design and readiness

Date: 2026-11-12. Baseline: `5cd1a0675257afa9276aab31b67219141e24d0dd`,
identical to the locally recorded `origin/sprint-1-staging`. Required branch
`feature/26-lab5-gcp-cd-release` already existed, with a clean working tree.
The owner subsequently authorized scoped source commits, feature-branch push and
a teammate-review PR into sprint staging. Cloud configuration and production DB
execution remain human-gated. Remote refs can become stale.

## Authority and frozen deployment topology

Use root AGENTS.md, Sprint 1 contracts under `docs/specs/`, Lab 5 handout
sections 4, 7–9 and 12, Student Guide Episodes 5–8 and the locally extracted
starter `deploy.yml`, `release.sh` and smoke examples. Adapt Prisma/static SPA
assumptions to Node 24, Drizzle, Elysia and React Router SSR.

The owner reconfirmed on 2026-11-12: **keep one Cloud Run service and existing
Supabase PostgreSQL**. This agrees with the
[owner's issue comment](https://github.com/oangsa/approval-system/issues/26#issuecomment-6798415159)
and supersedes #26's older two-service/Cloud SQL text. No Cloud SQL provisioning.
Reuse `cpe334-514311` (142175982679), Bangkok `asia-southeast3`, Supabase project
`nomoieoovqhcaojufgfu`, Free/Sydney. Service: 0.5 CPU, 512 MiB, gen1,
request-based billing, concurrency 1, min 0/max 3. Scale-to-zero adds cold starts;
limits and the THB 250 alert are not a spending cap. No paid upgrade is approved.

Final owner confirmation, 2026-11-12: **Supabase PostgreSQL + Google Cloud Run**
is accepted instead of Cloud SQL + Cloud Run. Owner's operating budget target is
**US$20 total over two months**, including the application and release support.
The discussed US$3–10 estimate assumes light lab traffic, available free quotas,
bounded image storage and no paid database upgrade; it is not a spending cap or
an independently verified account forecast. Review effective billing/usage before
provisioning. Reducing max instances from 3 to 1 and enabling a Cloud Run spend
cap were recommendations, not separate approved settings; retain the existing
approved max 3 until the owner chooses. No cloud, billing or IAM action follows
automatically from this architecture acceptance. Human configuration/release gates
remain pending; the approval below supersedes the earlier pending sizing decision.

The owner explicitly reconfirmed **0.5 vCPU / 512 MiB for the application service**
when authorizing publication. Keep this setting. The owner subsequently approved
the separate migration job at **1 vCPU / 512 MiB**, one task, retries zero,
600-second timeout, release execution only. The owner will monitor costs and
reconsider the approach if they grow; no continuously running migration instance,
paid Supabase upgrade, new spending cap or change to application sizing is approved.
At the owner's later planning assumption of 25,000 requests/day and 3–4 releases
per month, the earlier light-lab cost estimate is not a forecast: request duration,
response sizes, startup time and available free allowances must be measured.

Owner amendment, 2026-11-12: explicitly authorize a database-backed health check
and periodic calls to reduce Supabase Free inactivity. Reuse existing `GET /health`:
execute `SELECT 1` (no application tables/data), return the unchanged shared
`200 {"status":"ok"}` only on success; use the existing sanitized 503 error
envelope on probe failure and `Cache-Control: no-store`. API runtime always wires
the real probe; in-memory test compositions may supply a probe without a DB.
Add a main-only GitHub schedule every six hours, enabled only after reviewed
deployment via a non-secret repository variable. No DB credentials/IAM or paid
scheduler service. This supersedes the earlier no-keepalive decision, not the
human execution/review boundaries. Four calls/day may incur normal Cloud Run
request/cold-start usage. Neither a Free project nor GitHub's best-effort
schedule guarantees 24/7 availability or prevents every pause. Test probe success,
failure sanitization/no caching and real PostgreSQL execution.

The canonical browser hostname is the provisioned service's **default HTTPS
run.app URL**, recorded as `PUBLIC_ORIGIN` before the first release. No custom
domain is introduced. A single ingress listener routes `/api` and `/api/*` to
loopback Elysia, `/health` to its existing health handler, and all other paths
to the existing SSR server. Prefixes, Origin, Authorization, Cookie and multiple
Set-Cookie headers survive. Keep Secure/HttpOnly/SameSite=Strict refresh cookies
and exact `AUTH_ALLOWED_ORIGINS=PUBLIC_ORIGIN`. No new product endpoint or CORS
relaxation. Vite remains development-only; `/api` stays compiled into the client.

One release image contains both workspace builds and their supervisor/proxy.
Separate existing Dockerfiles remain useful for local/CI isolation; the combined
Dockerfile adapts their Node 24/root-lockfile/non-root build pattern. One digest
and Cloud Run revision identify both processes. A visible public Lab 5 marker
and `X-Release-Sha` header provide read-only release evidence.

## Release sequence and failure boundaries

Only `push main` invokes deployment. Reuse the entire CI workflow against that
exact SHA; no success bypass, branch parameter, manual unverified release or
production seed. Serialize with cancellation disabled. A protected `production`
environment restricts the mutation job to main. The owner subsequently declined
an additional environment reviewer requirement, retaining the existing reviewed
PR/branch rules. Therefore there is no separate manual approval at the deployment
job: human review of the exact SHA, migration SQL, backup and configuration must
be completed before the release PR merges into main. The owner must configure the
environment before enabling CD; YAML cannot enforce its settings.

Build/tag full SHA, push, resolve/validate digest. Update the precreated migration
job to that digest with exact `npm run db:migrate` from `/app`; execute and wait.
No service update or traffic switch on migration failure. Deploy a revision
without traffic, verify ready revision/digest and smoke its tagged HTTPS URL,
then switch 100% to that exact revision. Smoke the canonical URL and record SHA,
digest, revision and job execution. Failure after traffic switch requires the
human-reviewed rollback procedure; DB migration is not automatically undone.

## Initialization contract

Existing APIs cannot administer accounts/roles/published definitions in Sprint 1.
Existing development/test seeds deliberately reject production. Add a separate
human-invoked initializer using protected configuration: explicit production
acknowledgment, exact expected DB host/user, TLS verification, distinct requester
and reviewer emails/passwords and trusted department. It creates the minimum
GENERAL request definition and eligible route, with no requests/demo records.

Use one transaction and advisory lock. Insert missing records; preserve existing
account hashes, identities, permissions and configuration. Reject incompatible
existing data and roll back all attempted inserts; never repair, reset or
escalate existing accounts silently. Repeated compatible execution changes
nothing. Production initialization is never a CD/startup step. Local tests call
the implementation only against the existing guarded disposable test database.

## Verification and outstanding human gates

Automated source checks: typecheck, lint, unit/API/contracts, builds; release
failure tests; proxy header/cookie/body tests; PostgreSQL initializer repetition,
preservation and rollback tests; production Docker build and browser regression.
Record actual execution in a separate verification ledger. A local HTTP cookie
test is not secure-cookie HTTPS evidence. Health tests connectivity only, not
schema readiness, initialization or the authenticated workflow.

Manual gates remain: resource inventory/reuse; owner-approved migration-job
sizing/cost and backup/restore plan; Supabase TLS/session-pool limits and runtime
DB least privilege; review of IAM/WIF/environment settings; exact canonical URL;
protected initialization values/execution; substantive teammate review and all
three reviewed branch promotions; live C-04, C-05 and C-06 evidence. Owner-reported
nine migrations/Data API off are historical evidence, not new inspection.

The existing pool maximum is 5 per API instance: up to 15 steady connections at
max 3, plus migration/initialization and overlapping rollout revisions. Confirm
provider limits and reserve headroom before deployment. Per-process login
throttling is not shared across replicas; review the existing limitation before
exposure. No unrequested product throttling redesign is included.

Issue #26 is assigned to @oangsa and labelled `lab5` (connected read on
2026-11-12). Its project card/history is unverified. The already-existing remote
branch means the precreation board gate cannot be retroactively inferred;
owner must reconcile it. #24/#25 source availability does not prove acceptance:
their ledgers retain independent-review/board/resource limitations. Known
dependency advisories tracked in #35 need a production risk decision/remediation.

Owner: budget/configuration/execution decisions. Reviewer: @kittipichcha,
independent specific review of the final source and evidence. AI assistance:
readiness/source inspection and implementation/verification preparation, never
substituted for either human's participation or approval. #27 assembles evidence.
