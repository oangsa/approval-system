# Issue #26 — human-reviewed production release procedure

This is the source procedure for #26, an input to #27's final evidence guide.
It is **not evidence of a deployed service**. Read the [design](gcp-release-design.md)
and [verification ledger](gcp-release-verification.md). All cloud, IAM, billing
and production DB actions below are performed by humans after reviewing the
exact command/configuration. Never paste secrets into chat, issues, screenshots,
command arguments, workflow summaries or source. No setup script runs these steps.

## 1. Reconcile readiness before provisioning

@oangsa inventories existing resources in `cpe334-514311` / 142175982679; reuse
matches, do not create another project/account or duplicate resources. Record
sanitized Console links, names, regions, timestamp and teammate verification for:

- Artifact Registry Docker repositories, immutable-tag policy, storage/cleanup
  and scanning choices/cost. Preserve all released and rollback digests.
- Cloud Run services/jobs, identities, Secret Manager names/versions, WIF
  pools/providers, enabled APIs and existing SQL/storage resources. Do not delete
  unused resources automatically. Prior screenshots of empty lists are historical.
- Billing linkage, usable credits/expiry, saved project-scoped budget and alert
  delivery. A budget alert is not a cap. No signup, upgrade or payment here.
- Supabase Free project `nomoieoovqhcaojufgfu`, Sydney; current schema/migration
  journal, Data API disabled, access, session-pool connection quota and availability.
  Confirm the recorded nine migrations against hashes/history, not just count.

The one Cloud Run service is approved at 0.5 vCPU / 512 MiB, gen1,
request-based billing, concurrency 1, min 0/max 3 in Bangkok. Review memory/cold
start behavior with both Node processes; changes require an owner cost decision.
Owner reconfirmed Supabase + Cloud Run and a US$20 total/two-month budget target
on 2026-11-12. The light-traffic US$3–10 estimate is conditional on unused free
allowances, bounded storage and actual usage. Inventory all charges; do not
interpret that estimate as a guaranteed cap or permission for a paid upgrade.
Max 1 was recommended for tighter control but has not been selected. A human may
review a [Cloud Run spend cap](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps):
it is monthly, service-specific, based on gross estimated costs and can pause the
application; delayed enforcement can overshoot and other services remain billed.
Its availability/amount/uptime trade-off requires an owner decision. Preserve the
existing alerts-only budget until a human reviews and executes any replacement.
The owner subsequently explicitly approved the separate job at **1 CPU / 512 MiB**,
one task/parallelism 1, retries 0, timeout 600s, execution during releases only.
The owner will monitor actual costs and reconsider the approach if they grow.
Jobs bill execution time with a minimum duration, subject
to billing-account free allowances; a ten-minute timeout is not a fixed charge.
Use the current [pricing page](https://cloud.google.com/run/pricing) and regional
calculator when reviewing actual costs before provisioning. This approval does
not change the application's 0.5 CPU / 512 MiB or authorize a Supabase paid upgrade.

Check #35's dependency advisories and record remediation/risk disposition before
production exposure. Per-process login throttling is shared neither across
replicas nor across restarts. The loopback proxy also changes the network peer;
check the existing throttle's observed keying during live verification. Do not
claim this release implements a distributed rate limiter.

## 2. Identities, secrets and main-only trust

Proposed names below are examples until inventoried and human-reviewed:
`approval-releases` (registry), `approval-system` (service),
`approval-migrate` (job), `approval-runtime`, `approval-migrator`,
`approval-deployer` (service accounts). Keep runtime and migration DB credentials
separate. Runtime DB role needs only the application's table/sequence operations;
migrator owns/changes application schema and Drizzle history. Initialization
needs account/configuration insert/select and only initial publication update.
Have a human review actual PostgreSQL grants/ownership, including existing
Supabase ownership; do not grant browser access or adopt Supabase Auth.
The one-time named-object ownership SQL is versioned in
[`deploy/migrator-ownership.sql`](../../../deploy/migrator-ownership.sql).
The owner executed it and supplied partial owner readback; complete effective
readback/independent review remains distinct from the local PostgreSQL test.

Runtime identity: Secret Accessor on only runtime DB URL/JWT secret (and mounted
CA if needed). Migrator: only migration DB URL/CA secrets. Deployer: registry
writer on the selected repository, permissions to read/update the selected Run
service/job and execute the job, plus actAs on only their assigned runtime
identities. It must not administer IAM, billing, secrets or databases. Prefer
resource-scoped/custom permissions where supported; review any broader role.
Use job execution without overrides; retries are deliberately zero. No JSON keys.

Create/reuse GitHub environment **production**, restrict to main. Owner explicitly
declined another environment reviewer requirement on 2026-11-12 and retained the
existing reviewed PR/branch rules. There is no additional deployment approval
click. Before merging each release PR into main, inspect the exact SHA, CI, SQL
diff, backup/recovery record and configuration. Capture effective settings; an
environment name in YAML does not establish protection. Preserve existing branch
rules requiring `verify` and independent teammate review. No new ruleset is needed.

WIF issuer: `https://token.actions.githubusercontent.com`; default provider
audience. Map `google.subject=assertion.sub` and
`attribute.repository_id=assertion.repository_id`. The human validates this
condition against the signed GitHub claims:

```text
assertion.repository_id == '1446443279' &&
assertion.repository_owner_id == '71574088' &&
assertion.ref == 'refs/heads/main' &&
assertion.workflow_ref == 'oangsa/approval-system/.github/workflows/deploy.yml@refs/heads/main' &&
assertion.environment == 'production' &&
assertion.event_name == 'push'
```

Repository/owner IDs were read from the connected GitHub repository on
2026-11-12. Use the signed environment claim directly, independently of legacy or
immutable subject formatting. The subject mapping remains `assertion.sub`.
Restrict deployer impersonation to that repository attribute and provider.
Confirm no deployer keys exist. Retain sanitized provider/condition/binding and
environment readbacks plus @kittipichcha's specific verification. Official
[WIF guidance](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
and [auth action](https://github.com/google-github-actions/auth) apply.

Production environment **variables** (non-secret):

| Variable | Value/source |
| --- | --- |
| `GCP_PROJECT_ID` | `cpe334-514311` |
| `GCP_REGION` | `asia-southeast3` |
| `ARTIFACT_REPOSITORY` | Inventoried registry repository name, no slashes |
| `SERVICE_NAME`, `MIGRATE_JOB_NAME` | Exact reviewed precreated resource names |
| `WIF_PROVIDER` | `projects/142175982679/locations/global/workloadIdentityPools/POOL/providers/PROVIDER` |
| `WIF_SERVICE_ACCOUNT` | Dedicated deployer email |
| `PUBLIC_ORIGIN` | Exact default HTTPS run.app service origin, no trailing slash |

DB URLs, JWT signing key and initialization passwords stay in version-pinned
Secret Manager secrets. CD does not read their values. The auth action creates
a temporary runner credential file; `.dockerignore` excludes `gha-creds-*.json`.

## 3. Packaging, first deployment and connection configuration

Use the ordered, human-executed commands in
[first deployment](gcp-first-deployment.md) for exact resource creation, secret/CA
mounts, initializer invocation, resource-scoped deployer permissions and final
acceptance. The following describes the sequence and operational boundaries.

The combined image's `/app` working directory supports `npm run db:migrate`
and `npm run db:initialize-production`. Default startup launches Elysia on
loopback 3001, SSR on loopback 3002, and same-origin ingress on HOST/PORT.
The child processes are supervised together; either child's exit fails the
container. No startup migration or initialization. Both builds share one
`RELEASE_SHA`, OCI revision label and immutable image digest.

Human first-deployment sequence, only **after the exact source reaches accepted
main through all reviewed PRs and CI**:

1. Inventory/configure registry, identities and versioned secrets. Review SQL
   and review recovery before DB execution. Job sizing is now owner-approved.
2. Build the accepted SHA from a clean checkout using the command below. For
   manual bootstrap use tag `bootstrap-FULL_SHA`, so an immutable registry does
   not conflict with CD's later full-SHA tag. Push through the human's reviewed
   registry authentication; resolve and record its digest. This is the initial
   human release, not C-06 proof of automated deployment. Never use a feature
   branch image as the public application.
3. Create the migration job at that digest, workdir `/app`, command `npm`, args
   `run,db:migrate`, approved sizing, one task, retries zero; inject the separate
   production migration identity/DB secret. Execute and wait for success before
   creating/updating the app. Do not use dev/test seed or `drizzle-kit push`.
4. Create the single application service at the same digest and approved settings,
   dedicated runtime identity and runtime secrets. Initially use a non-serving
   allowed origin such as `https://initialization.invalid` while reading the
   assigned default service URL. Then set exact `AUTH_ALLOWED_ORIGINS` to that
   URL and record it as `PUBLIC_ORIGIN`; no wildcard/HTTP cookie exception.
   Human handles public invocation IAM separately. Initial absence of accounts
   is resolved by step 5, never by relaxing authentication.
5. Perform the guarded initialization below; test real HTTPS sign-in, refresh,
   submit, decision and rejection. Record first deployment evidence. Configure
   verified WIF/environment variables, then enable/approve CD for accepted main.
   If its first push run failed while setup was incomplete, retain that failure
   and rerun it only after preparation; no rewritten history or feature deploy.

```sh
# Local verification build only unless a human has accepted this SHA for release.
docker build -f deploy/Dockerfile --build-arg RELEASE_SHA="$ACCEPTED_SHA" \
  -t "$REGION-docker.pkg.dev/$PROJECT_ID/$REGISTRY/application:bootstrap-$ACCEPTED_SHA" .
```

Runtime non-secrets: `NODE_ENV=production`, `HOST=0.0.0.0`, ingress PORT 3000,
`AUTH_COOKIE_SECURE=true`, exact `AUTH_ALLOWED_ORIGINS`, existing
`AUTH_JWT_ISSUER=workflow-approval-api`, `AUTH_JWT_AUDIENCE=workflow-approval-web`.
The child API overrides only HOST/PORT internally; client `/api` remains relative.
Runtime secrets: `DATABASE_URL`, `AUTH_JWT_SECRET`. Use the existing Supabase
**session** pooler port 5432, not transaction pooler 6543; preserve prepared
statements/migration compatibility. Require `sslmode=verify-full`. If its CA is
not system-trusted, mount the reviewed CA and set `NODE_EXTRA_CA_CERTS` for all
Node migration/runtime/initializer processes; never disable verification.
Test TLS and effective DB role privately from the job/runtime network.

For the restricted `approval_runtime` database login, review
[`deploy/runtime-grants.sql`](../../../deploy/runtime-grants.sql) against the live
Sprint 1 object inventory before a human executes it as the existing owner.
It changes grants only on named application objects, with no schema/data/password
changes or access to Drizzle history. Runtime cannot administer accounts,
password hashes, role values, routing content or schema with these direct grants.
Existing `SELECT ... FOR SHARE` queries require UPDATE on at least one column;
the script grants that on named identity columns. This still permits rekeying
an otherwise unconstrained identity column, so do not describe these permissions
as read-only configuration access. Existing constraints/immutability triggers stay.
No grants on future tables are automatic: review grants with later migrations.
Check inherited/PUBLIC permissions separately after execution; this additive
script does not revoke unrelated existing grants or change Supabase roles/RLS.

Existing postgres-js pool maximum is 5 per process; reserve at least 15 steady
API connections plus rollout overlap and migration/initializer connections.
Confirm actual provider limits before enabling max 3. Review Bangkok–Sydney
latency/egress and Free-project pause policy. Keep the app/DB available through
grading. The owner explicitly authorized periodic DB health calls on 2026-11-12,
superseding the earlier no-keepalive decision; no paid upgrade or teardown.

`GET /health` now executes `SELECT 1`, without accessing application tables or
writing any data. It returns the unchanged `{"status":"ok"}` only when the
runtime DB connection works, otherwise sanitized HTTP 503. Responses are not
cached. Connectivity alone does not verify schema, migrations or business data.

After reviewed main deployment, humans may enable `availability.yml` by setting
repository **variables** `PUBLIC_ORIGIN` (same canonical origin as production)
and `AVAILABILITY_CHECK_ENABLED=true`. It makes four public HTTPS health calls
per day at 00:23/06:23/12:23/18:23 UTC, with no DB credentials, WIF, paid scheduler,
initialization or writes. It does not keep Cloud Run instances permanently warm
and does not change min instances. Normal request/cold-start usage can be billed;
no guarantee of zero additional charges is made. Disable the variable before any
owner-approved pause/teardown; inspect failed runs and provider warning emails.

Supabase says a few user database requests per day are typically enough to avoid
inactivity pausing, but does not guarantee that this particular probe prevents it
([pausing guidance](https://supabase.com/docs/guides/platform/free-project-pausing)).
GitHub schedules can be delayed/dropped and public-repository schedules disable
after 60 days without repository activity
([schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)).
This is best-effort availability monitoring/activity, **not guaranteed 24/7
uptime**. A paused project still requires human resume; no paid upgrade is implied.

## 4. Explicit safe initialization

Run once after migrations, then safely repeat when needed. Humans review the
accepted image/configuration and execute an isolated job or protected operator
session; never add this command to CD or container startup. Do not use `db:seed`.

Use protected environment injection for `DATABASE_URL`, `NODE_ENV=production`,
`PRODUCTION_INIT_ACK=initialize-minimum-sprint-1`, `PRODUCTION_DB_HOST` and
`PRODUCTION_DB_USER` copied exactly from the reviewed migration/initializer
connection identity. This guard accepts only verified-TLS Supabase session
connections to `postgres`. Inject these account values privately:

- `INIT_REQUESTER_EMAIL`, `INIT_REQUESTER_NAME`, `INIT_REQUESTER_PASSWORD`.
- `INIT_REVIEWER_EMAIL`, `INIT_REVIEWER_NAME`, `INIT_REVIEWER_PASSWORD`.

Choose distinct real application identities and strong passwords of 16–1024
characters; no sample/test credentials in production. New accounts receive
REQUESTER/REVIEWER respectively, primary active OPS membership, the published
GENERAL form and one eligible `general-review` assignment. No administrator
account, business request, synthetic test record or Supabase Auth user is created.
Roles include the existing ADMINISTRATOR code only, without granting it.

```sh
# Inside the reviewed /app image, with protected environment already injected:
npm run db:initialize-production
```

One transaction/advisory lock serializes initialization. Existing hashes,
names, records and permissions remain unchanged. Existing accounts must already
have the compatible role and trusted membership; incompatible IDs, disabled
accounts/type, changed publication/form/policy or reviewer routing fail and roll
back attempted inserts. No password reset, silent repair or privilege escalation.
Inspect conflicts privately and resolve through a separately reviewed change.
After success revoke/remove initializer password injections and credentials
where operationally appropriate; retain only sanitized result/SHA/job evidence.

## 5. Backup, migration failure and rollback

Before every migration approval, a human reviews all pending SQL against the
current journal. Permit reviewed non-destructive, backward-compatible changes
only. This pipeline cannot infer SQL safety or provide a backup automatically.
The separate job uses **`npm run db:migrate`** at `/app`; the root script invokes
the existing API `drizzle-kit migrate`. Never run generate/push/reset/test seed
against production. Preserve the original nine migration files and journal.

Free-plan provider recovery is not assumed. A human takes a private encrypted
logical backup with a matching supported PostgreSQL client and tests recovery
to an isolated destination. For example, configure protected libpq service and
password files outside the repo, then inspect these commands before running:

```sh
PGSERVICE=approval-production pg_dump --format=custom --no-owner --no-acl \
  --file=/secure/backup/approval-before-release.dump
pg_restore --list /secure/backup/approval-before-release.dump
# Only to a separately reviewed EMPTY recovery destination, never live:
pg_restore --dbname='service=approval-recovery' --no-owner --no-acl \
  --single-transaction /secure/backup/approval-before-release.dump
```

Record backup timestamp, SHA/journal, private storage reference, restore result
and RPO/RTO decision without dump content or credentials. Dumps contain production
data/authentication material: never upload them as GitHub evidence. Human reviews
restored ownership/grants and tests the journey before considering cutover. No
automatic rollback/reset of the database. If backup/restore is unproven, defer
migration approval for databases containing application data. For this initial
setup only, the owner stated the database had no application data and explicitly
waived the restore exercise. A 93 KiB public+drizzle archive was created successfully
using pg_dump 17.11 with the Supabase CA, and pg_restore --list succeeded; that is
not proof of restoration. Keep this waiver bounded to the empty initial setup.
Before future migrations with populated data, review backup/recovery again.

Migration failure: release script exits before service update. Keep serving the
old revision; inspect sanitized execution failure and journal privately. Take a
fresh backup, reconcile actual state, and fix forward via reviewed additive SQL
and the normal branch path. Never edit applied migrations or mark them applied
without execution. A job timeout is a failure requiring inspection, not a retry
invitation. Candidate startup/smoke failure likewise preserves previous traffic.

App rollback: choose a previously recorded **accepted main SHA and digest** whose
code is compatible with the current schema/secrets. Verify its image OCI revision
and prior successful release evidence. A human inspects and executes these commands
with non-secret variables; they do not run migration or initialization:

```sh
gcloud run services update "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --image="$PREVIOUS_DIGEST_IMAGE" --no-traffic --tag=rollback --quiet
# Read latestCreatedRevisionName/readiness and image digest; smoke tagged URL:
node --import tsx deploy/smoke.ts "$ROLLBACK_CANDIDATE_ORIGIN" "$PREVIOUS_SHA"
gcloud run services update-traffic "$SERVICE_NAME" --project="$PROJECT_ID" \
  --region="$REGION" --to-revisions="$PREVIOUS_REVISION=100" --quiet
node --import tsx deploy/smoke.ts "$PUBLIC_ORIGIN" "$PREVIOUS_SHA"
```

Use the newly ready rollback revision in `PREVIOUS_REVISION`, or switch to the
existing recorded revision directly after verifying readiness/image/configuration.
Never guess a tag/digest/revision. Forward recovery redeploys the accepted fixed
main release with normal verification/migration gates. Failure after traffic switch
does not trigger automatic rollback; the human diagnoses and chooses recovery.

## 6. Traceability and actual acceptance

Implementation PR: `Closes #26`, label `lab5`, base `sprint-1-staging`, specific
independent review by @kittipichcha. Preserve scoped commits and CI history.
Promote by reviewed PR to dev, then release-reviewed PR to main with plain #26
references. No direct pushes to integration branches. Project-board completion
or automatic issue closure on staging merge does not establish release completion.

For each release record: full main SHA; reviewed source/promotion/release PRs;
CI/CD run links; digest/OCI revision; migration execution; serving revision; exact
public URL; marker and `X-Release-Sha` readback. Confirm 100% traffic is the expected
revision. Both API and SSR run within that one digest/revision. Read-only smoke
checks DB connectivity/HTML/marker only; it does not verify schema/authenticated
behavior or write test data. A rerun reuses an existing full-SHA image after
digest/OCI-label verification instead of overwriting an immutable registry tag.

C-04 requires actual human HTTPS browser evidence: requester login/submission,
eligible reviewer login/decision, requester persisted history, refresh cookie
Secure/HttpOnly/Strict/path, refresh rotation/logout, and ownership/rule rejection.
C-05 requires the same record before/after restart and redeploy, not just health.
C-06 requires the labelled reviewed branch chain, automatic CD and matching live
SHA/digest/revision/visible marker. Record both members' specific contribution and
verification links. Leave unexecuted checks pending. #27 assembles the final PDF.

After grading only, the owner decides pause/teardown. Before any Supabase pause,
disable pending CD and avoid main merges. To resume, restore DB availability,
verify TLS/connection/journal, validate service secret versions and approved
settings, then run read-only smoke and human journey before re-enabling releases.
Do not pause during grading or an active migration/pipeline; deleting resources,
backups or images requires a separate owner decision.
