# Issue #26 — human first deployment

Follow these sections in order, one block at a time. These are commands for a
human to inspect and execute, not an automatic provisioning script. Stop on any
error; do not paste the entire document into a terminal. No cloud commands here
have been executed by the agent. The [runbook](gcp-release-runbook.md) covers
recovery and the [acceptance ledger](gcp-release-verification.md) records actual
evidence. Do not close #26 until the live acceptance checks pass.

## 1. Accept the release before building

Obtain specific teammate review of PR #38, then use reviewed promotion PRs through
`sprint-1-staging`, `dev`, and `main`. Resolve/disposition #35 before public exposure.
GitGuardian incident 39983502 points to a synthetic parser fixture, not a live
credential; the fixture now constructs its URL explicitly. A human with scanner
access must classify the historical alert as a test fixture; do not rewrite history.

Your GitHub production environment permits only main, without an extra environment
reviewer requirement, as explicitly chosen by the owner. The first main CD run
may fail while resources/variables are absent. Preserve it and rerun after setup.

In a clean checkout of this repository in Cloud Shell, fetch and inspect the exact
reviewed main commit. All following build commands run from the repository root:

```sh
git fetch origin main
test -z "$(git status --porcelain)"
export ACCEPTED_SHA="$(git rev-parse origin/main)"
git show --no-patch --format=fuller "$ACCEPTED_SHA"
git switch --detach "$ACCEPTED_SHA"
```

Confirm that this is the release-reviewed commit and its required CI passed.
Use the existing project, not a new project or billing account:

```sh
export PROJECT_ID=cpe334-514311
export REGION=asia-southeast3
export REGISTRY=approval-releases
export SERVICE_NAME=approval-system
export MIGRATE_JOB_NAME=approval-migrate
export DEPLOYER="approval-deployer@$PROJECT_ID.iam.gserviceaccount.com"
export RUNTIME="approval-runtime@$PROJECT_ID.iam.gserviceaccount.com"
export MIGRATOR="approval-migrator@$PROJECT_ID.iam.gserviceaccount.com"
gcloud config get-value project
gcloud services list --enabled --project="$PROJECT_ID" --format='value(config.name)'
gcloud run services list --project="$PROJECT_ID" --region="$REGION"
gcloud run jobs list --project="$PROJECT_ID" --region="$REGION"
```

Check Run, Artifact Registry, Secret Manager, IAM Credentials and STS APIs are
enabled; a human enables only missing required APIs. Inspect existing resources
before creation. If the chosen service/job already exists, inspect its configuration
instead of blindly recreating it. Verify the registry's immutable tags and disabled
scanning, and the existing alerts-only budget. Budget alerts are not a spending cap.

## 2. Verify secrets and build one accepted image

In Secret Manager, inspect each secret's enabled numeric version and its per-secret
access. Do not display values. Set these version numbers to those actually reviewed
(the following assumes each has version 1):

```sh
export RUNTIME_DB_VERSION=1
export MIGRATION_DB_VERSION=1
export JWT_VERSION=1
export CA_VERSION=1
```

| Secret | Service account with Secret Accessor |
| --- | --- |
| `approval-runtime-database-url` | `approval-runtime` |
| `approval-migrator-database-url` | `approval-migrator` |
| `approval-jwt-secret` | `approval-runtime` |
| `approval-supabase-ca` | Both runtime and migrator |

Runtime DB login is `approval_runtime.nomoieoovqhcaojufgfu`; migration login is
`approval_migrator.nomoieoovqhcaojufgfu`. Both URLs use the copied session-pooler
host, port 5432, database postgres and exactly `?sslmode=verify-full`. Encode password
characters in URLs. Mount the downloaded Supabase CA: system roots failed during
the owner's backup and the explicit CA succeeded. Never weaken TLS to proceed.

The owner already ran [runtime grants](../../../deploy/runtime-grants.sql) and
[migration ownership](../../../deploy/migrator-ownership.sql). These are recorded
for review/recovery, not instructions to reset the database or rerun all migrations.
Local verification subsequently exposed one missing grant in the original setup:
Drizzle executes `CREATE SCHEMA IF NOT EXISTS drizzle`, which checks database
CREATE even if the schema exists. Before the first migration, the owner must run
this additional statement as postgres in Supabase SQL Editor:

```sql
GRANT CREATE ON DATABASE postgres TO approval_migrator;
```

This permits creation of schemas inside postgres, not creation of databases or
access to existing Supabase-managed schema objects. It is included in the versioned
ownership SQL for future setup. Keep it off the runtime role.
Review the journal and effective grants/owners, including inherited/PUBLIC access.

Build and push the reviewed main source under a separate bootstrap tag:

```sh
export BOOTSTRAP_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REGISTRY/application:bootstrap-$ACCEPTED_SHA"
gcloud auth configure-docker "$REGION-docker.pkg.dev"
docker build -f deploy/Dockerfile --build-arg RELEASE_SHA="$ACCEPTED_SHA" -t "$BOOTSTRAP_IMAGE" .
docker push "$BOOTSTRAP_IMAGE"
export DIGEST_IMAGE="$(gcloud artifacts docker images describe "$BOOTSTRAP_IMAGE" --project="$PROJECT_ID" --format='value(image_summary.fully_qualified_digest)')"
[[ "$DIGEST_IMAGE" =~ @sha256:[a-f0-9]{64}$ ]]
test "$(docker image inspect "$BOOTSTRAP_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$ACCEPTED_SHA"
```

The OCI label must equal ACCEPTED_SHA. Record the registry digest; a local Docker
image ID is not the registry manifest digest. If the immutable bootstrap tag already
exists, inspect/pull its digest and label rather than trying to overwrite it.

## 3. Create and execute the migration job

Owner approved 1 vCPU / 512 MiB, one task, zero retries, 600-second timeout, no
schedule. This job bills execution time, not a continuously allocated monthly CPU.
It uses only migration DB/CA secrets. No JWT or initializer account passwords:

```sh
gcloud run jobs create "$MIGRATE_JOB_NAME" \
  --project="$PROJECT_ID" --region="$REGION" \
  --image="$DIGEST_IMAGE" --service-account="$MIGRATOR" \
  --cpu=1 --memory=512Mi --tasks=1 --parallelism=1 \
  --max-retries=0 --task-timeout=600s \
  --command=npm --args=run,db:migrate \
  --set-env-vars=NODE_ENV=production,NODE_EXTRA_CA_CERTS=/var/run/secrets/supabase/ca.crt \
  --set-secrets="DATABASE_URL=approval-migrator-database-url:$MIGRATION_DB_VERSION,/var/run/secrets/supabase/ca.crt=approval-supabase-ca:$CA_VERSION"
gcloud run jobs execute "$MIGRATE_JOB_NAME" --wait --project="$PROJECT_ID" --region="$REGION"
```

Require a successful execution before creating the application. Existing applied
migrations are skipped using the journal; this does not recreate tables or seed data.
Inspect failures privately. Do not put raw database errors/connection URLs in evidence.

## 4. Create the application privately and set its origin

The approved application settings remain 0.5 vCPU / 512 MiB, gen1, request-based,
concurrency 1, minimum 0 and maximum 3. CPU boost is disabled to keep startup allocation
explicit. Set a temporary non-serving origin until the default URL is assigned:

```sh
gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT_ID" --region="$REGION" \
  --image="$DIGEST_IMAGE" --service-account="$RUNTIME" \
  --execution-environment=gen1 --cpu=0.5 --memory=512Mi \
  --cpu-throttling --no-cpu-boost --concurrency=1 \
  --min-instances=0 --max-instances=3 --port=3000 \
  --ingress=all --no-allow-unauthenticated \
  --set-env-vars=NODE_ENV=production,HOST=0.0.0.0,AUTH_COOKIE_SECURE=true,AUTH_ALLOWED_ORIGINS=https://initialization.invalid,AUTH_JWT_ISSUER=workflow-approval-api,AUTH_JWT_AUDIENCE=workflow-approval-web,NODE_EXTRA_CA_CERTS=/var/run/secrets/supabase/ca.crt \
  --set-secrets="DATABASE_URL=approval-runtime-database-url:$RUNTIME_DB_VERSION,AUTH_JWT_SECRET=approval-jwt-secret:$JWT_VERSION,/var/run/secrets/supabase/ca.crt=approval-supabase-ca:$CA_VERSION"
export PUBLIC_ORIGIN="$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
[[ "$PUBLIC_ORIGIN" =~ ^https://[a-z0-9-]+\.([a-z0-9-]+\.)?run\.app$ ]]
gcloud run services update "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --update-env-vars="AUTH_ALLOWED_ORIGINS=$PUBLIC_ORIGIN"
```

This creates a second revision with the same accepted image and exact allowed
origin. Leave public invocation disabled until initialization and the pre-exposure
review are complete. Never loosen Secure-cookie or origin checks.

## 5. Initialize once from the accepted image

Use Cloud Shell's downloaded `prod-ca-2021.crt`. The human operator may access
the migration secret; the GitHub deployer must not. Enter application identities
and passwords privately in the same shell. No sample accounts/passwords:

```sh
set +x
set +v
export DATABASE_URL="$(gcloud secrets versions access "$MIGRATION_DB_VERSION" --secret=approval-migrator-database-url --project="$PROJECT_ID")"
test -n "$DATABASE_URL"
export NODE_ENV=production
export PRODUCTION_INIT_ACK=initialize-minimum-sprint-1
read -r -p 'Copied session pooler host: ' PRODUCTION_DB_HOST
export PRODUCTION_DB_HOST
export PRODUCTION_DB_USER=approval_migrator.nomoieoovqhcaojufgfu
read -r -p 'Requester email: ' INIT_REQUESTER_EMAIL
read -r -p 'Requester display name: ' INIT_REQUESTER_NAME
read -r -s -p 'Requester password (8+ characters): ' INIT_REQUESTER_PASSWORD
echo
read -r -p 'Reviewer email: ' INIT_REVIEWER_EMAIL
read -r -p 'Reviewer display name: ' INIT_REVIEWER_NAME
read -r -s -p 'Reviewer password (8+ characters): ' INIT_REVIEWER_PASSWORD
echo
export INIT_REQUESTER_EMAIL INIT_REQUESTER_NAME INIT_REQUESTER_PASSWORD
export INIT_REVIEWER_EMAIL INIT_REVIEWER_NAME INIT_REVIEWER_PASSWORD
test -s "$HOME/prod-ca-2021.crt"
docker run --rm \
  --mount "type=bind,src=$HOME/prod-ca-2021.crt,dst=/var/run/secrets/supabase/ca.crt,readonly" \
  -e DATABASE_URL -e NODE_ENV -e PRODUCTION_INIT_ACK -e PRODUCTION_DB_HOST -e PRODUCTION_DB_USER \
  -e INIT_REQUESTER_EMAIL -e INIT_REQUESTER_NAME -e INIT_REQUESTER_PASSWORD \
  -e INIT_REVIEWER_EMAIL -e INIT_REVIEWER_NAME -e INIT_REVIEWER_PASSWORD \
  -e NODE_EXTRA_CA_CERTS=/var/run/secrets/supabase/ca.crt \
  "$DIGEST_IMAGE" npm run db:initialize-production
```

Require exit 0 and the sanitized success message. To verify repeat safety, rerun
only the same docker command with the same protected input; record a second success.
Then clear the account inputs and DB URL from the shell even if initialization failed:

```sh
unset DATABASE_URL INIT_REQUESTER_EMAIL INIT_REQUESTER_NAME INIT_REQUESTER_PASSWORD
unset INIT_REVIEWER_EMAIL INIT_REVIEWER_NAME INIT_REVIEWER_PASSWORD
unset PRODUCTION_INIT_ACK PRODUCTION_DB_HOST PRODUCTION_DB_USER
```

Initialization inserts minimum configuration/accounts only; it never changes an
existing password, grants a user administrator access, or generates business requests.

## 6. Grant the deployer only the selected resources

Inspect [release-role.yaml](../../../deploy/release-role.yaml): no IAM administration,
secret access, job overrides, creation or deletion. A human creates this custom role
once, then binds it only to the precreated service and job. If a role with this ID
already exists, inspect its permissions before separately reviewing an update.
Artifact Registry Writer on the one repository and WIF impersonation already exist.

```sh
gcloud iam roles create approvalReleaseUpdater --project="$PROJECT_ID" --file=deploy/release-role.yaml
gcloud run services add-iam-policy-binding "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --member="serviceAccount:$DEPLOYER" --role="projects/$PROJECT_ID/roles/approvalReleaseUpdater"
gcloud run jobs add-iam-policy-binding "$MIGRATE_JOB_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --member="serviceAccount:$DEPLOYER" --role="projects/$PROJECT_ID/roles/approvalReleaseUpdater"
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --project="$PROJECT_ID" \
  --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser
gcloud iam service-accounts add-iam-policy-binding "$MIGRATOR" --project="$PROJECT_ID" \
  --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser
```

Capture sanitized effective-policy evidence, including inherited grants. The first
OIDC run must establish that these permissions work in this project; a local stub
test cannot establish IAM correctness. Diagnose a specific missing permission
instead of granting project Owner/Editor, Secret Accessor, or service-account keys.
References: [Cloud Run IAM](https://docs.cloud.google.com/run/docs/securing/managing-access),
[job creation](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/create),
[secret mounts](https://docs.cloud.google.com/run/docs/configuring/services/secrets).

## 7. Open public access, verify and run CD

After the release/configuration/security review, a human grants public invocation
on this service only:

```sh
gcloud run services add-iam-policy-binding "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --member=allUsers --role=roles/run.invoker
docker run --rm "$DIGEST_IMAGE" node --import tsx deploy/smoke.ts "$PUBLIC_ORIGIN" "$ACCEPTED_SHA"
```

The smoke check runs using Node 24/tsx inside the accepted image; Cloud Shell
does not need a separate Node/npm installation. Set the remaining GitHub
**production environment variables** `SERVICE_NAME`,
`MIGRATE_JOB_NAME` and `PUBLIC_ORIGIN` to the exact values above. Read back the full
`WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT` values, not truncated screenshots.
Rerun the Production release workflow for this accepted main SHA. It builds the
normal full-SHA tag, runs verification/migration, prepares a candidate, smokes it,
and switches traffic. Record the run link and matching SHA/digest/revision.

Both teammates verify on the real HTTPS URL: sign-in/refresh/logout, request
submission, assigned-reviewer approval, an authorization rejection, and persisted
history before/after restart or redeploy. Record sanitized C-04/C-05/C-06 evidence.
Do not upload passwords, tokens, cookies, database URLs, data dumps or request bodies
containing personal/business data. Capture the visible release marker and response
`X-Release-Sha`. Afterward enable the approved six-hour availability check using the
repository variables in the runbook. Observe actual billing, latency, connections,
image growth and Supabase storage/egress; no paid database upgrade is authorized.

Only then complete #26's live acceptance checkboxes and project card. #27 assembles
the final report; it does not substitute for these executions or independent review.
