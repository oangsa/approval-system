# Attachment Cleanup Job & Scheduler Runbook (Issue #13 / B03)

## Overview

Abandoned upload reservations (`> 5` minutes old in `UPLOADING`) and deleted working-revision attachments (`WORKING_DELETED`) are reclaimed by `npm run attachments:cleanup` ([cleanup-attachments.ts](../../../apps/api/scripts/cleanup-attachments.ts)).

In production (`cpe334-514311`, `asia-southeast1`), the worker runs as a dedicated Cloud Run Job triggered on a schedule by Cloud Scheduler, using the same image, runtime service account (`approval-runtime@cpe334-514311.iam.gserviceaccount.com`), database configuration, and private GCS bucket (`approval-system-attachments`) as the API service.

## Policy & Limits

| Setting | Value | Reason |
| --- | --- | --- |
| Cloud Run Job | `approval-attachments-cleanup` | Single-purpose worker job |
| Service account | `approval-runtime@cpe334-514311.iam.gserviceaccount.com` | Least-privilege bucket (`roles/storage.objectUser`) + runtime DB access |
| Command | `npm run attachments:cleanup` | Runs one bounded reconciliation + cleanup batch |
| Tasks / parallelism | `--tasks=1 --parallelism=1` | Prevents overlapping job executions |
| Max retries / timeout | `--max-retries=1 --task-timeout=5m` | Bounded execution; DB backoff handles transient storage errors |
| Schedule | `*/10 * * * *` (`Asia/Bangkok`) | Reconciles stale reservations and retries within 10 minutes |

## Provisioning (One-Time in GCP)

1. Create the Cloud Run Job (mirroring `--set-secrets` and `--set-cloudsql-instances` from the API service):

```bash
gcloud run jobs create approval-attachments-cleanup \
  --project=cpe334-514311 \
  --region=asia-southeast1 \
  --image="<CURRENT_API_IMAGE>" \
  --service-account="approval-runtime@cpe334-514311.iam.gserviceaccount.com" \
  --command="npm" \
  --args="run,attachments:cleanup" \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=1 \
  --task-timeout=5m \
  --set-env-vars="NODE_ENV=production,NODE_EXTRA_CA_CERTS=/var/run/secrets/supabase/ca.crt,ATTACHMENT_STORAGE_DRIVER=gcs,GCS_PROJECT_ID=cpe334-514311,GCS_BUCKET_NAME=approval-system-attachments" \
  --set-secrets="DATABASE_URL=approval-runtime-database-url:1,/var/run/secrets/supabase/ca.crt=approval-supabase-ca:1"
```

2. Create a dedicated scheduler caller service account with `roles/run.invoker` on the job only, then create the Cloud Scheduler trigger:

```bash
gcloud iam service-accounts create approval-scheduler \
  --project=cpe334-514311 \
  --display-name="Approval Attachment Cleanup Scheduler"

gcloud run jobs add-iam-policy-binding approval-attachments-cleanup \
  --project=cpe334-514311 \
  --region=asia-southeast1 \
  --member="serviceAccount:approval-scheduler@cpe334-514311.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud scheduler jobs create http approval-attachments-cleanup-schedule \
  --project=cpe334-514311 \
  --location=asia-southeast1 \
  --schedule="*/10 * * * *" \
  --time-zone="Asia/Bangkok" \
  --uri="https://run.googleapis.com/v2/projects/cpe334-514311/locations/asia-southeast1/jobs/approval-attachments-cleanup:run" \
  --http-method=POST \
  --oauth-service-account-email="approval-scheduler@cpe334-514311.iam.gserviceaccount.com"
```

3. Set GitHub Actions repository variable `CLEANUP_JOB_NAME=approval-attachments-cleanup` so [deploy.yml](../../../.github/workflows/deploy.yml) and [release.sh](../../../deploy/release.sh) update the cleanup job image on every `main` release.

## Verification, Monitoring & Recovery

- **Manual drill:** Run `gcloud run jobs execute approval-attachments-cleanup --project=cpe334-514311 --region=asia-southeast1 --wait` and confirm structured JSON log `{"code":"ATTACHMENT_CLEANUP_COMPLETED",...}` in Cloud Logging (`resource.type="cloud_run_job"`).
- **Failure monitoring:** Alert on `jsonPayload.code="ATTACHMENT_CLEANUP_FAILED"` or non-zero Cloud Run Job execution exit status.
- **Terminal job recovery:** Jobs that exceed 10 attempts (`status='FAILED'`) remain recorded in `attachment_cleanup_jobs` with sanitized `last_error`. After resolving the underlying IAM/GCS issue, reset `status='PENDING', attempt_count=0, next_attempt_at=NOW()` for those rows and trigger `gcloud run jobs execute approval-attachments-cleanup --wait`.
- **Rollback:** Pause `approval-attachments-cleanup-schedule` with `gcloud scheduler jobs pause approval-attachments-cleanup-schedule --project=cpe334-514311 --location=asia-southeast1`, or roll back the job image to the previous known-good digest via `gcloud run jobs update approval-attachments-cleanup --image="<PREVIOUS_DIGEST>"`.
