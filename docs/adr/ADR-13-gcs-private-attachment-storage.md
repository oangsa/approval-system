# ADR-13: Google Cloud Storage (GCS) for Private Attachment Storage

- **Status:** Accepted (2026-11-27)
- **Issue / Scope:** Issue #13 — `O01` / `O02` (Comments & Private Attachments; `FR-042`, `AC-042`, `BR-059`, `BR-060`, `BR-061`, `BR-072`, `CX-11`, `OPS-08`)
- **Authority:** [System SDS](../../specs/system-sds.md) §11 & §14 ("Adjustable with an ADR: attachment storage provider, cleanup mechanism"), [API Spec](../../specs/api-specs.md) §§5.7 & 6.7, [Feature SDS](../features/comments-private-attachments/sds.md)

## Context

The Workflow & Approval System requires private binary file storage for request attachments (`O02`). Frozen product and API specifications mandate:

- Binaries must reside in private object storage with **no public permanent URLs**, **no direct unrestricted bucket URLs**, and **no exposure of storage object keys** in any API DTO, HTML payload, or client log (`BR-060`, `SEC-09`, `SEC-16`).
- Every upload (`POST /api/v1/requests/:id/attachments`), deletion (`DELETE /api/v1/requests/:id/attachments/:attachmentId`), and download (`GET /api/v1/attachments/:id/download`) must authenticate the caller and enforce server-side resource authorization before reading or committing attachment metadata (`BR-060`, `BR-061`).
- PostgreSQL and external object storage do not share a distributed transaction (`system-sds.md` §11). Staged uploads, ambiguous database commit failures, working-revision deletions, and post-upload rejections require durable compensation and retryable cleanup rather than assuming atomic two-phase commit (`CX-11`, `OPS-08`).
- The system deploys to Google Cloud Platform (`asia-southeast1` Cloud Run services and jobs; see `deploy/release.sh`).

## Decision

### 1. Cloud Storage Target & Bucket Security Posture

Adopt **Google Cloud Storage (GCS)** in project **`cpe334-514311`** as the private object storage backend for request attachments:

- **Project ID:** `cpe334-514311`
- **Region:** `asia-southeast1` (co-located with Cloud Run deployment region)
- **Bucket:** `gs://approval-system-attachments`
- **Storage Class:** `Standard`
- **Public Access Prevention:** `Enforced` (blocks all public IAM bindings and ACLs)
- **Uniform Bucket-Level Access:** `Enabled` (IAM-only access control; no per-object ACLs)
- **Soft Delete:** `7 days` retention window on deleted objects

### 2. Identity & SDK Authentication (No JSON Keys)

- **SDK:** Official `@google-cloud/storage` Node.js package in `apps/api`.
- **Authentication:** Application Default Credentials (ADC) exclusively:
  - On Cloud Run, the runtime authenticates via the attached service account **`approval-runtime@cpe334-514311.iam.gserviceaccount.com`**.
  - Locally (when live GCS verification is opted in), developers/operators authenticate via `gcloud auth application-default login` or workload identity federation.
  - **No service account JSON key files** are generated, stored in the repository, mounted as files, or placed in `.env` variables.
- **Least-Privilege IAM:** `approval-runtime@cpe334-514311.iam.gserviceaccount.com` holds bucket-scoped **`roles/storage.objectUser`** on `gs://approval-system-attachments` (permitting `storage.objects.create`, `get`, `delete`, and `list` within that bucket only, without bucket-admin or project-wide storage permissions).

### 3. Clean Architecture Port & Test Isolation

- **Domain Port (`IPrivateObjectStorage`):** Defined in `apps/api/src/Domains/Requests/Ports.ts` (or dedicated `AttachmentPorts.ts` under `Domains/Requests/`) with storage-agnostic operations (`PutObject`, `ReadObjectStream`, `DeleteObject`, `HeadObject`), opaque storage keys (`attachments/<requestId>/<revisionId>/<attachmentId>`), and domain storage error mapping (`SERVICE_UNAVAILABLE` on transient provider faults). Domain and Application layers never import `@google-cloud/storage`.
- **Infrastructure Adapter (`GcsPrivateObjectStorage`):** Implemented under `apps/api/src/Infrastructures/Storage/` wrapping `@google-cloud/storage` with ADC, configured via validated environment settings (`ATTACHMENT_STORAGE_DRIVER`, `GCS_ATTACHMENT_BUCKET`).
- **Test Isolation:**
  - Ordinary unit, contract, API, and PostgreSQL integration tests in local/CI environments use an isolated **in-memory / test `IPrivateObjectStorage`** implementation (`InMemoryPrivateObjectStorage` / fault-injectable stub) so tests stay deterministic, fast, and free of cloud credentials or network dependencies.
  - Live GCS verification (`GCS-IT-01..08`) is **opt-in** via environment configuration pointing to a dedicated, isolated GCS test bucket (never `gs://approval-system-attachments` production data) and requires valid GCP ADC.

### 4. Backend-Mediated Streaming & Opaque Keys

- **No public URLs and no signed URLs:** Clients never upload directly to GCS or download via pre-signed GCS URLs.
- **Upload:** Clients send `multipart/form-data` to `POST /api/v1/requests/:id/attachments`. Elysia validates authentication, `REQUESTER` ownership, `DRAFT`/`RETURNED` state, working-revision match, file size, declared MIME, and binary magic-byte signature before writing the object to GCS under an opaque UUID-based key.
- **Download:** Clients request `GET /api/v1/attachments/:id/download` with Bearer authorization. The backend re-checks current participant authorization against PostgreSQL, then streams the binary from GCS to the HTTP response with `Content-Type`, `Content-Disposition: attachment` (sanitized RFC 5987 / ASCII fallback filename), `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, and `Content-Length`.
- **No object key leakage:** `storage_key` is persisted in PostgreSQL (`attachments` and `attachment_upload_reservations`) and excluded from every Zod response schema (`AttachmentDTO`) and error payload (`BR-072`).

### 5. Durable Upload Reservations & Retryable Cleanup Worker

To preserve PostgreSQL/GCS consistency without a distributed transaction (`CX-11`, `OPS-08`):

1. **Upload Reservation (`attachment_upload_reservations`):** Before uploading bytes to GCS, the API records a durable `UPLOADING` reservation in PostgreSQL (holding `attachment_id`, `request_id`, `revision_id`, `storage_key`, `uploaded_by`, and timestamps).
2. **Storage Put & Metadata Commit:** The API streams/writes the validated binary to GCS, then runs a transaction locking the request row (`FOR UPDATE`), re-verifying `DRAFT`/`RETURNED` + matching `working_revision_id`, inserting the `attachments` row, and marking the reservation `FINALIZED`.
3. **Compensation on Abort/Conflict/Failure:** If validation, lock re-check, or database commit fails after GCS upload (e.g., concurrent `Submit()` transitioned the request to `PENDING`), the handler attempts immediate cleanup or marks the reservation `ABANDONED` and enqueues a durable job in **`attachment_cleanup_jobs`**.
4. **Ambiguous Commit Reconciliation:** If the database commit outcome is ambiguous or the API process crashes mid-upload, stale `UPLOADING` reservations and `ABANDONED` tombstones remain visible to reconciliation and cleanup processing.
5. **Working-Revision Delete:** `DELETE /api/v1/requests/:id/attachments/:attachmentId` deletes the `attachments` row and atomically enqueues an `attachment_cleanup_jobs` entry inside the same PostgreSQL transaction, ensuring the GCS object is removed asynchronously with retries rather than failing the user delete or leaving silent orphans.
6. **Scheduled Cleanup Command:** A dedicated CLI entrypoint (`npm run attachments:cleanup` / `apps/api/scripts/cleanup-attachments.ts`) claims pending jobs with `FOR UPDATE SKIP LOCKED`, lease tokens, and exponential backoff (`1, 2, 4, 8, 16, 32, 60` minutes; max `10` attempts -> `FAILED`), deletes objects from GCS via `IPrivateObjectStorage.DeleteObject`, and reconciles expired `UPLOADING` / `ABANDONED` reservations.

## Alternatives Considered

1. **Amazon S3 / Self-Hosted MinIO (Superseded):**
   - *Reason rejected:* The system's approved deployment target is Google Cloud Platform (`deploy/release.sh`, Cloud Run in `asia-southeast1`). Introducing AWS S3 adds cross-cloud credential management, and operating self-hosted MinIO adds stateful container management, backups, and TLS operations inside a stateless Cloud Run architecture. `system-sds.md` §14 explicitly allows selecting the storage provider via ADR.
2. **Pre-Signed GCS URLs for Direct Browser Upload/Download:**
   - *Reason rejected:* Signed URLs allow a holder of the URL to download (or upload) directly against GCS after authorization has been revoked (e.g., request withdrawn, reviewer reassigned/disabled) until URL expiry, and risk leaking bucket/object topology or failing strict `Cache-Control: no-store` / `X-Content-Type-Options: nosniff` and MIME-sniffing enforcement (`BR-060`, `SEC-09`).
3. **Storing File Binaries in PostgreSQL (`bytea`):**
   - *Reason rejected:* Violates `BR-060` ("File binaries shall reside in private object storage"), bloats relational backups/WAL, and degrades connection pool memory under concurrent uploads/downloads.

## Consequences

### Positive
- Aligns storage infrastructure with existing GCP Cloud Run deployment (`cpe334-514311`, `asia-southeast1`) and keyless ADC security posture.
- Preserves strict Clean Architecture boundaries (`IPrivateObjectStorage` port) so local/CI tests remain deterministic without network/cloud dependencies.
- Guarantees zero public exposure, zero signed-URL revocation gaps, and zero storage-key leaks in client payloads.
- Guarantees orphan-free recovery across crashes, concurrent `Submit()` races, and temporary GCS outages via `attachment_upload_reservations` and `attachment_cleanup_jobs`.

### Negative / Trade-offs
- Backend process handles multipart buffering/validation and download streaming, bounding max file size (`10 MiB` per file) and requiring careful stream cleanup and memory limits.
- Requires an external scheduler (e.g., Cloud Scheduler / Cloud Run Job) to run `npm run attachments:cleanup` periodically in production so orphaned objects are pruned promptly.

## Operational Notes

- **Soft Delete vs. Live Object Deletion:** `gs://approval-system-attachments` enforces a **7-day Soft Delete** policy at the bucket level. When `DeleteObject` executes (during `DELETE` cleanup or `ABANDONED`/`UPLOADING` compensation), GCS removes the live object immediately (subsequent `GetObject` / `HeadObject` calls return 404/not found and the cleanup job completes as `SUCCEEDED`), while GCS retains an inaccessible soft-deleted generation internally for 7 days as an operational safety net against accidental infrastructure deletion. Application queries and downloads never resolve soft-deleted generations.
- **IAM & Bucket Provisioning:** Bucket creation, public access prevention, uniform bucket-level access, soft-delete retention, and `roles/storage.objectUser` binding for `approval-runtime@cpe334-514311.iam.gserviceaccount.com` are provisioned out-of-band by infrastructure/human review before production deployment (matching `deploy/release.sh` precreated-resource policy).
- **Secrets Discipline:** Never commit `.json` key files or set `GOOGLE_APPLICATION_CREDENTIALS` to a committed key file. Production relies on Cloud Run runtime service account metadata; local live tests rely on ephemeral developer ADC (`gcloud auth application-default login`) and an isolated test bucket.
