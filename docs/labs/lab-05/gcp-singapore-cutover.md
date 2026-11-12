# Singapore and custom-domain cutover

Owner requested this move on 2026-11-13. Humans review and execute these commands
one block at a time, stopping on errors. No cloud changes have been executed by
the agent. Keep Bangkok available until verification completes; do not delete it
as part of this procedure. There is no database move, initialization or password
reset. Existing accounts and requests remain in the same Supabase database.

Cloud Run direct mapping supports Singapore, but is Preview and is not recommended
by Google for production services. Managed TLS can take up to 24 hours:
[domain mapping documentation](https://docs.cloud.google.com/run/docs/mapping-custom-domains).
This selected lab approach preserves the existing refresh cookie. Preserve all
approved sizing. Temporary duplicate traffic, cross-region image transfer and
registry retention may add charges; this is not a new spending cap.

## 1. Publish the configuration change first

Review and promote this source using the usual staging/dev/main PR path. It allows
Bangkok during transition and Singapore after cutover. It separates the image
registry location (`ARTIFACT_REGION`) from the execution region (`GCP_REGION`).
Existing workflows without ARTIFACT_REGION keep their original same-region behavior.
Do not edit the old workflow manually in the Console.

## 2. Read the working Bangkok release

In Cloud Shell, set these non-secret values and inspect the current resources:

```sh
export PROJECT_ID=cpe334-514311
export REGION=asia-southeast1
export SERVICE_NAME=approval-system
export MIGRATE_JOB_NAME=approval-migrate
export RUNTIME="approval-runtime@$PROJECT_ID.iam.gserviceaccount.com"
export MIGRATOR="approval-migrator@$PROJECT_ID.iam.gserviceaccount.com"
export DEPLOYER="approval-deployer@$PROJECT_ID.iam.gserviceaccount.com"
export CUSTOM_ORIGIN=https://approval-system.oangsa.com
export RUNTIME_DB_VERSION=1 MIGRATION_DB_VERSION=1 JWT_VERSION=1 CA_VERSION=1
gcloud run services list --project="$PROJECT_ID" --region="$REGION"
gcloud run jobs list --project="$PROJECT_ID" --region="$REGION"
export BKK_ORIGIN="$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region=asia-southeast3 --format='value(status.url)')"
export BKK_REVISION="$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region=asia-southeast3 --format='value(status.latestReadyRevisionName)')"
export DIGEST_IMAGE="$(gcloud run revisions describe "$BKK_REVISION" --project="$PROJECT_ID" --region=asia-southeast3 --format='value(spec.containers[0].image)')"
[[ "$DIGEST_IMAGE" =~ @sha256:[a-f0-9]{64}$ ]]
echo "$DIGEST_IMAGE"
```

Confirm Bangkok's traffic is 100% on BKK_REVISION and the image matches the accepted
main CD summary. Copy its full release SHA to RELEASE_SHA for later smoke testing.
Use actual reviewed numeric secret versions if they differ from 1. If Singapore
resources already exist, inspect them before changing create to update/deploy.

## 3. Create Singapore migration job, then application

Same database, same image digest, same approved 1 CPU / 512 MiB job:

```sh
gcloud run jobs create "$MIGRATE_JOB_NAME" \
  --project="$PROJECT_ID" --region="$REGION" --image="$DIGEST_IMAGE" \
  --service-account="$MIGRATOR" --cpu=1 --memory=512Mi \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=600s \
  --command=npm --args=run,db:migrate \
  --set-env-vars=NODE_ENV=production,NODE_EXTRA_CA_CERTS=/var/run/secrets/supabase/ca.crt \
  --set-secrets="DATABASE_URL=approval-migrator-database-url:$MIGRATION_DB_VERSION,/var/run/secrets/supabase/ca.crt=approval-supabase-ca:$CA_VERSION"
gcloud run jobs execute "$MIGRATE_JOB_NAME" --wait --project="$PROJECT_ID" --region="$REGION"
```

Require success. Do not execute simultaneous Bangkok/Singapore release migrations.
Then create the private application with the accepted 0.5 CPU / 512 MiB:

```sh
gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT_ID" --region="$REGION" --image="$DIGEST_IMAGE" \
  --service-account="$RUNTIME" --execution-environment=gen1 \
  --cpu=0.5 --memory=512Mi --cpu-throttling --no-cpu-boost \
  --concurrency=1 --min-instances=0 --max-instances=3 --port=3000 \
  --ingress=all --no-allow-unauthenticated \
  --set-env-vars=NODE_ENV=production,HOST=0.0.0.0,AUTH_COOKIE_SECURE=true,AUTH_ALLOWED_ORIGINS=https://initialization.invalid,AUTH_JWT_ISSUER=workflow-approval-api,AUTH_JWT_AUDIENCE=workflow-approval-web,NODE_EXTRA_CA_CERTS=/var/run/secrets/supabase/ca.crt \
  --set-secrets="DATABASE_URL=approval-runtime-database-url:$RUNTIME_DB_VERSION,AUTH_JWT_SECRET=approval-jwt-secret:$JWT_VERSION,/var/run/secrets/supabase/ca.crt=approval-supabase-ca:$CA_VERSION"
export PUBLIC_ORIGIN="$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
[[ "$PUBLIC_ORIGIN" =~ ^https://[a-z0-9-]+\.([a-z0-9-]+\.)?run\.app$ ]]
gcloud run services update "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --update-env-vars="^|^AUTH_ALLOWED_ORIGINS=$PUBLIC_ORIGIN,$CUSTOM_ORIGIN"
```

The custom gcloud separator preserves the comma inside AUTH_ALLOWED_ORIGINS.
Both the canonical Singapore origin and custom HTTPS origin are accepted.

## 4. Resource-scoped IAM and public invocation

Reuse the already reviewed custom role and identities; existing actAs and secret
grants apply to these same identities. Grant the custom role on the NEW resources:

```sh
gcloud run services add-iam-policy-binding "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --member="serviceAccount:$DEPLOYER" --role="projects/$PROJECT_ID/roles/approvalReleaseUpdater"
gcloud run jobs add-iam-policy-binding "$MIGRATE_JOB_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --member="serviceAccount:$DEPLOYER" --role="projects/$PROJECT_ID/roles/approvalReleaseUpdater"
gcloud run services add-iam-policy-binding "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --member=allUsers --role=roles/run.invoker
```

Test login, refresh, logout and request/approval on PUBLIC_ORIGIN first, using the
existing accounts. Record serving revision/image/SHA. No new seed or initializer.

## 5. Map the custom domain and configure DNS

In Cloud Run Domain mappings, add a mapping for **approval-system (asia-southeast1)**.
Verified base domain: **oangsa.com**. Subdomain: **approval-system**, without https://.
Copy the exact DNS records the wizard provides into the domain's DNS provider.
Do not change unrelated DNS records or guess target IPs. Wait for certificate
provisioning and test https://approval-system.oangsa.com with valid TLS.

Log in again on the custom domain: host-scoped cookies from run.app do not transfer.
Verify refresh/logout and the same existing request history on the custom domain.

## 6. Switch GitHub deployment and monitoring

Only after Singapore is ready, set production environment variables:

| Variable | Value |
| --- | --- |
| GCP_REGION | asia-southeast1 |
| ARTIFACT_REGION | asia-southeast3 |
| ARTIFACT_REPOSITORY | approval-releases |
| SERVICE_NAME | approval-system |
| MIGRATE_JOB_NAME | approval-migrate |
| PUBLIC_ORIGIN | Singapore default HTTPS run.app URL, not the custom domain |

Project/WIF variables stay unchanged. Rerun the accepted-main Production release
and verify it updates Singapore and still fetches/pushes images in Bangkok.
The release script checks the canonical run.app origin, so replacing it with the
custom domain would fail. CD preserves the configured two allowed origins.
Update the repository-level PUBLIC_ORIGIN availability variable to the verified
custom domain (or Singapore canonical origin) and retain AVAILABILITY_CHECK_ENABLED.

Keep Bangkok as fallback until both teammates verify Singapore/custom-domain
authentication, persistence and successful automatic CD. Removal of old resources
requires a separate explicit owner decision; do not delete secrets, database or
registry. Capture updated URL/SHA/digest/revision evidence for #26/#27.
