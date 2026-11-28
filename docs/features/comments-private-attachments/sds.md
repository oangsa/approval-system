# Comments & Private Attachments Software Design Specification — Issue #13

**Status:** Phase 0 design & specification lock (before source implementation)  
**Scope:** Issue #13 — `O01` Comments / Discussion (`FR-041`, `AC-041`) and `O02` File Attachments (`FR-042`, `AC-042`)  
**Authorities:** [Product Specifications](../../specs/specifications.md) (`FR-041`–`042`, `BR-054`, `BR-058`–`061`, `BR-072`), [API Specs](../../specs/api-specs.md) (§§2.4–2.6, 4, 5.7, 6.7, 6.9), [UI Specs](../../specs/ui-specs.md) (§§8.2, 9, 13), [System SDS](../../specs/system-sds.md) (§§8, 11, 14), [Test Spec](../../specs/test.md), and [ADR-13](../../adr/ADR-13-gcs-private-attachment-storage.md)  
**Deliverables:** [Acceptance Criteria](acceptance-criteria.md) | [System Test Spec (STS)](sts.md) | [Verification Log](verification.md)

---

## 1. Baseline & Migration Numbering

- **Git Baseline:** Branched from `origin/dev` at commit `4b372f768de1dec0bfd4b0e081120feba906c491` on `feature/13-sprint-3-full-stack-comments-private-attachments`.
- **Existing Schema Baseline:** Includes all migrations through Issue #12 (`0016_strong_sway.sql` under `apps/api/src/Infrastructures/Database/migrations/`).
- **Issue #13 Migration:** All schema additions, composite foreign keys, triggers, and indexes for Issue #13 are delivered in **`0017_*`** (Drizzle-generated SQL + custom trigger/FK migration). Existing migrations `0000`–`0016` must not be modified.

---

## 2. Storage Architecture & ADR-13 Summary

Per [ADR-13](../../adr/ADR-13-gcs-private-attachment-storage.md):

- **Provider & Bucket:** Google Cloud Storage (GCS) in project `cpe334-514311`, region `asia-southeast1`, bucket `gs://approval-system-attachments`, storage class `Standard`, Public Access Prevention `Enforced`, Uniform Bucket-Level Access `Enabled`, Soft Delete `7 days`.
- **Auth & SDK:** `@google-cloud/storage` using Application Default Credentials (ADC) with runtime service account `approval-runtime@cpe334-514311.iam.gserviceaccount.com` granted bucket-scoped `roles/storage.objectUser`. **No service account JSON keys** are committed or configured.
- **Clean Architecture Boundary:**
  - `Domains/Requests/`: `IPrivateObjectStorage` port (`PutObject`, `ReadObjectStream`, `DeleteObject`, `HeadObject`).
  - `Infrastructures/Storage/`: `GcsPrivateObjectStorage` (ADC-backed GCS adapter) and `InMemoryPrivateObjectStorage` (deterministic test adapter for unit/API/PostgreSQL/CI tests). Live GCS tests (`GCS-IT-01..08`) are opt-in against an isolated GCS test bucket.
- **Privacy & Delivery:** No public URLs, no signed URLs, and no `storage_key` fields are exposed to clients. Uploads traverse `POST /api/v1/requests/:id/attachments`; downloads stream through `GET /api/v1/attachments/:id/download` after server-side authorization.
- **Durability & Compensation:** Uses `attachment_upload_reservations` + `attachment_cleanup_jobs` + CLI worker `npm run attachments:cleanup` (note: GCS 7-day soft delete retains deleted generations internally as a bucket safety net while live object reads return 404).

---

## 3. Database Schema & Privileges (`0017_*`)

### 3.1 Prerequisite Composite Key on `request_revisions`

`request_revisions` currently enforces `PRIMARY KEY (id)` and `UNIQUE (request_id, revision_number)`. To enforce relational integrity that every attachment belongs to a revision **of the same request**, `0017_*` adds:

```sql
ALTER TABLE public.request_revisions
    ADD CONSTRAINT request_revisions_request_id_id_uq UNIQUE (request_id, id);
```

### 3.2 `request_comments`

| Column | Type | Constraints / Default |
| --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY` |
| `request_id` | `uuid` | `NOT NULL REFERENCES public.requests(id)` |
| `author_id` | `uuid` | `NOT NULL REFERENCES public.users(id)` |
| `body` | `text` | `NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000)` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

- **Index:** `request_comments_request_created_id_idx` on `(request_id, created_at ASC, id ASC)` for stable chronological pagination.
- **Immutability:** Comments are append-only via public API (no `PATCH`/`DELETE` comment routes).

### 3.3 `attachments`

| Column | Type | Constraints / Default |
| --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY` |
| `request_id` | `uuid` | `NOT NULL REFERENCES public.requests(id)` |
| `revision_id` | `uuid` | `NOT NULL` |
| `uploaded_by` | `uuid` | `NOT NULL REFERENCES public.users(id)` |
| `file_name` | `text` | `NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 255)` |
| `media_type` | `text` | `NOT NULL` |
| `size_bytes` | `integer` | `NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760)` |
| `storage_key` | `text` | `NOT NULL UNIQUE` |
| `sha256` | `text` | `NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$')` |
| `uploaded_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

- **Composite Foreign Key:** `FOREIGN KEY (request_id, revision_id) REFERENCES public.request_revisions(request_id, id)`. Prevents attaching a file to a revision belonging to a different request.
- **Indexes:**
  - `attachments_request_revision_uploaded_idx` on `(request_id, revision_id, uploaded_at ASC, id ASC)`
  - `attachments_revision_idx` on `(revision_id)`
- **Database Immutability Trigger (`protect_submitted_attachment`):**
  - Attached `BEFORE INSERT OR UPDATE OR DELETE ON public.attachments FOR EACH ROW`.
  - Rejects `INSERT`, `UPDATE`, or `DELETE` when the referenced `request_revisions` row (for `NEW.revision_id` or `OLD.revision_id`) has `submitted_at IS NOT NULL` (`ERRCODE = '23514'`, message `'Submitted attachments are immutable'`).
  - Also rejects `UPDATE` on `attachments` even on working revisions for immutable identity/storage columns (`id`, `request_id`, `revision_id`, `storage_key`, `sha256`, `uploaded_by`, `size_bytes`, `media_type`) — working-revision management supports `INSERT` and `DELETE` only.

### 3.4 `attachment_upload_reservations`

| Column | Type | Constraints / Default |
| --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY` |
| `attachment_id` | `uuid` | `NOT NULL UNIQUE` |
| `request_id` | `uuid` | `NOT NULL REFERENCES public.requests(id)` |
| `revision_id` | `uuid` | `NOT NULL` |
| `uploaded_by` | `uuid` | `NOT NULL REFERENCES public.users(id)` |
| `storage_key` | `text` | `NOT NULL UNIQUE` |
| `file_name` | `text` | `NOT NULL` |
| `media_type` | `text` | `NOT NULL` |
| `size_bytes` | `integer` | `NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760)` |
| `sha256` | `text` | `NOT NULL` |
| `status` | `text` | `NOT NULL CHECK (status IN ('UPLOADING', 'FINALIZED', 'ABANDONED'))` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `expires_at` | `timestamptz` | `NOT NULL` |
| `finalized_at` | `timestamptz` | `NULL` |
| `abandoned_at` | `timestamptz` | `NULL` |

- **Composite Foreign Key:** `FOREIGN KEY (request_id, revision_id) REFERENCES public.request_revisions(request_id, id)`.
- **Index:** `attachment_upload_res_status_exp_idx` on `(status, expires_at)` for reconciliation of stale `UPLOADING` and `ABANDONED` reservations.

### 3.5 `attachment_cleanup_jobs`

| Column | Type | Constraints / Default |
| --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY` |
| `reservation_id` | `uuid` | `NULL REFERENCES public.attachment_upload_reservations(id)` |
| `attachment_id` | `uuid` | `NOT NULL` |
| `storage_key` | `text` | `NOT NULL` |
| `reason` | `text` | `NOT NULL CHECK (reason IN ('UPLOAD_ABORTED', 'COMMIT_CONFLICT', 'WORKING_DELETED', 'STALE_RESERVATION'))` |
| `status` | `text` | `NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED'))` |
| `attempt_count` | `integer` | `NOT NULL DEFAULT 0 CHECK (attempt_count >= 0)` |
| `max_attempts` | `integer` | `NOT NULL DEFAULT 10 CHECK (max_attempts > 0)` |
| `next_attempt_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `lease_expires_at` | `timestamptz` | `NULL` |
| `claim_token` | `uuid` | `NULL` |
| `last_error` | `text` | `NULL` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `completed_at` | `timestamptz` | `NULL` |

- **Indexes:**
  - `attachment_cleanup_jobs_due_idx` on `(status, next_attempt_at)`
  - `attachment_cleanup_jobs_lease_idx` on `(status, lease_expires_at)`
  - `attachment_cleanup_jobs_storage_key_pending_uq` partial unique index on `(storage_key)` WHERE `status IN ('PENDING', 'PROCESSING')` (prevents duplicate active cleanup rows for the same object key).

### 3.6 Deploy Script Updates (`deploy/runtime-grants.sql` & `deploy/migrator-ownership.sql`)

- **`deploy/runtime-grants.sql`** must grant `approval_runtime`:
  - `SELECT, INSERT ON TABLE public.request_comments`
  - `SELECT, INSERT, DELETE ON TABLE public.attachments`
  - `SELECT, INSERT ON TABLE public.attachment_upload_reservations` + `UPDATE (status, updated_at, finalized_at, abandoned_at) ON public.attachment_upload_reservations`
  - `SELECT, INSERT ON TABLE public.attachment_cleanup_jobs` + `UPDATE (status, attempt_count, next_attempt_at, lease_expires_at, claim_token, last_error, updated_at, completed_at) ON public.attachment_cleanup_jobs`
- **`deploy/migrator-ownership.sql`** must transfer ownership to `approval_migrator` for:
  - `public.request_comments`, `public.attachments`, `public.attachment_upload_reservations`, `public.attachment_cleanup_jobs`
  - `FUNCTION public.protect_submitted_attachment()`

---

## 4. API Contracts & Error Semantics

All routes require Bearer JWT authentication (`401 UNAUTHENTICATED` on missing/expired/invalid/revoked session), validate UUID path parameters (`422 VALIDATION_ERROR` on malformed UUIDs or `404 NOT_FOUND` per route convention — matching existing `RequestRoutes`), set `Cache-Control: no-store`, and set `X-Request-Id`. `CORS` exposes `X-Pagination`, `X-Request-Id`, and `Location` (and `Access-Control-Expose-Headers` includes `Content-Disposition` if cross-origin Blob downloads inspect filename).

### 4.1 Endpoints Summary

| Method | Path | Audience | Success | Key Headers |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/requests/:id/comments` | Current authorized participant | `200 CommentDTO[]` | `Cache-Control: no-store`, `X-Pagination` |
| `POST` | `/api/v1/requests/:id/comments` | Current authorized participant | `201 CommentDTO` | `Cache-Control: no-store`, `Location` |
| `GET` | `/api/v1/requests/:id/attachments` | Current authorized participant | `200 AttachmentDTO[]` | `Cache-Control: no-store`, `X-Pagination` |
| `POST` | `/api/v1/requests/:id/attachments` | Owner only when `DRAFT`/`RETURNED` | `201 AttachmentDTO` | `Cache-Control: no-store`, `Location` |
| `DELETE` | `/api/v1/requests/:id/attachments/:attachmentId` | Owner only on working revision (`DRAFT`/`RETURNED`) | `204 No Content` | `Cache-Control: no-store` |
| `GET` | `/api/v1/attachments/:id/download` | Current authorized participant | `200 <binary stream>` | `Cache-Control: no-store`, `Content-Disposition`, `X-Content-Type-Options: nosniff`, `Content-Type`, `Content-Length` |

### 4.2 Detailed Route Contracts

1. **`GET /api/v1/requests/:id/comments?pageNumber=1&pageSize=20`**
   - Query schema (`commentQuerySchema`): `pageNumber` (int `1..10000`, default `1`), `pageSize` (int `1..100`, default `20`). Invalid query -> `422 VALIDATION_ERROR`.
   - Ordering: chronological `created_at ASC, id ASC`.
   - Response: direct JSON array of `CommentDTO`:
     ```ts
     { id: PublicId, requestId: PublicId, author: { id: PublicId, displayName: string }, body: string, createdAt: UTCDateTime }
     ```
   - Header: `X-Pagination` JSON matching shared `paginationSchema` (`currentPage`, `pageSize`, `totalPages`, `totalCount`, `hasPrevious`, `hasNext`).

2. **`POST /api/v1/requests/:id/comments`**
   - Body schema (`createCommentSchema`, `z.strictObject`): `{ body: z.string().trim().min(1).max(4000) }`. Blank/oversize/unknown keys -> `422 VALIDATION_ERROR`.
   - **Rule (`BR-058`):** Appends a discussion comment only; **never** creates `approval_decisions`, never mutates `requests.status`, `requests.version`, or `approval_slots`.
   - Writes `COMMENT_ADDED` (or discussion audit entry if required by timeline without altering approval state) — wait: per `BR-058` & `api-specs.md` §6.7, comments live in `request_comments` and must never mutate request `version` or approval state.
   - Response: `201 Created`, `Location: /api/v1/requests/${id}/comments`, body `CommentDTO`.

3. **`GET /api/v1/requests/:id/attachments?pageNumber=1&pageSize=20&revisionId=<uuid>`**
   - Query schema (`attachmentQuerySchema`): `pageNumber` (`1..10000`, default `1`), `pageSize` (`1..100`, default `20`), optional `revisionId` (`z.uuid()`).
   - Visibility & Scope:
     - When `revisionId` is omitted: returns attachments across the request's permitted revisions visible to the current participant (working revision for owner + submitted revisions for current participant), ordered deterministically (`uploaded_at ASC, id ASC`), or scoped by `revisionId` when supplied (must belong to `:id`; unknown/foreign `revisionId` returns empty or `404` without leaking other requests).
     - Note: Working revision (`submitted_at IS NULL`) attachments are visible only to the owner (reviewers only participate when `PENDING` and `working_revision_id` is `NULL`).
   - Response: direct JSON array of `AttachmentDTO` (strictly omitting `storage_key` and `sha256` internal fields if not in frozen `AttachmentDTO`):
     ```ts
     { id: PublicId, requestId: PublicId, workingOrSubmittedRevisionId: PublicId, fileName: string, mediaType: string, sizeBytes: number, uploadedBy: PublicId, uploadedAt: UTCDateTime }
     ```
   - Header: `X-Pagination`.

4. **`POST /api/v1/requests/:id/attachments`**
   - Content-Type: `multipart/form-data` with field `file` and optional `workingRevisionId` (`uuid`).
   - Malformed multipart or missing `file` field -> `400 BAD_REQUEST` or `422 VALIDATION_ERROR` (per `api-specs.md` §2.4: malformed multipart syntax -> `400 BAD_REQUEST`; missing/invalid field values -> `422 VALIDATION_ERROR`).
   - Pre-storage checks (before uploading bytes to GCS):
     - Actor is active `REQUESTER` and request owner (`requests.requester_id === actor.id`); non-owner/unrelated/admin-only -> `404 NOT_FOUND` (no existence leak); owner without `REQUESTER` role -> `403 FORBIDDEN`.
     - Request status is `DRAFT` or `RETURNED` and `workingRevisionId` exists; otherwise `409 INVALID_REQUEST_TRANSITION`.
     - If optional `workingRevisionId` is provided, it must equal `requests.working_revision_id`; mismatch -> `409 REQUEST_STALE` / `409 INVALID_REQUEST_TRANSITION` (explicit conflict without mutating).
     - Per-revision attachment count cap: max **10** attachments per working revision (if exceeded -> `422 VALIDATION_ERROR`).
     - File size check: `sizeBytes > 0` (empty 0-byte rejected `422 VALIDATION_ERROR`) and `sizeBytes <= 10 * 1024 * 1024` (10 MiB). Exceeding limit -> **`413 FILE_TOO_LARGE`**.
     - Media type & magic-byte validation: allowlisted MIME + file signature only:
       - `application/pdf` (`%PDF-`)
       - `image/png` (`89 50 4E 47 0D 0A 1A 0A`)
       - `image/jpeg` (`FF D8 FF`)
       - `image/webp` (`RIFF....WEBP`)
       - `text/plain` (valid UTF-8 without NUL / binary control bytes)
       - Disallowed extension, mismatched magic bytes (e.g., executable/HTML/SVG disguised as PDF/PNG), or unsupported MIME (including `image/svg+xml`, `text/html`, `.exe`, `.zip`) -> **`415 UNSUPPORTED_MEDIA_TYPE`**.
     - Filename sanitization: strip path segments (`/` and `\`), control characters, leading dots, and clamp to 255 characters; reject empty sanitized name (`422 VALIDATION_ERROR`).
   - Response: `201 Created`, `Location: /api/v1/attachments/${attachment.id}/download`, body `AttachmentDTO`.

5. **`DELETE /api/v1/requests/:id/attachments/:attachmentId`**
   - Authorization: active `REQUESTER` + request owner only. Foreign user / non-participant -> `404 NOT_FOUND`. Current reviewer (who is not the owner) -> `404 NOT_FOUND` or `403 FORBIDDEN` (consistent with owner-only edit boundaries).
   - State check: request must be `DRAFT` or `RETURNED` and attachment's `revision_id` must equal `requests.working_revision_id` (and `request_revisions.submitted_at IS NULL`). Attempting to delete an attachment belonging to a submitted revision (or while `PENDING`/`APPROVED`/`REJECTED`/`WITHDRAWN`) -> **`409 INVALID_REQUEST_TRANSITION`** (and enforced at DB trigger level as backup).
   - Atomically deletes `attachments` row and inserts `attachment_cleanup_jobs` (`WORKING_DELETED`) inside the same transaction.
   - Response: `204 No Content`, `Cache-Control: no-store`.

6. **`GET /api/v1/attachments/:id/download`**
   - Authorization: authenticated user must pass `RequestAccessPolicy` current-participant check for the attachment's parent `request_id` (`owner` OR current `REVIEWER` on `PENDING` with active/waiting slot or active delegation).
   - Non-participant, unrelated user, former-only reviewer, or admin-only user -> **`404 NOT_FOUND`** (indistinguishable from nonexistent attachment ID, `BR-061`, `BR-072`).
   - Note on working-revision attachments: only the owner can reach them while `DRAFT`/`RETURNED` because reviewers only become current participants when `PENDING`.
   - Response headers:
     - `Cache-Control: no-store`
     - `X-Content-Type-Options: nosniff`
     - `Content-Type: <validated mediaType>` (e.g., `application/pdf`, `image/png`, `text/plain; charset=utf-8`)
     - `Content-Disposition: attachment; filename="<ascii-safe>"; filename*=UTF-8''<rfc5987-encoded>`
     - `Content-Length: <sizeBytes>`
   - Streams binary from `IPrivateObjectStorage.ReadObjectStream(storageKey)`. If storage object is missing or storage is temporarily unreachable, returns sanitized `404 NOT_FOUND` or `503 SERVICE_UNAVAILABLE` without leaking bucket paths or object keys (`BR-072`).

### 4.3 Error Codes Mapping

Extend `HttpErrorCode` / `RequestErrorCode` in `apps/api/src/Presentations/errors.ts`:
- `413` `FILE_TOO_LARGE`: `"Upload exceeds the maximum permitted file size"`
- `415` `UNSUPPORTED_MEDIA_TYPE`: `"File type is not supported"`
- Existing codes reused: `400 BAD_REQUEST`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 INVALID_REQUEST_TRANSITION`, `409 REQUEST_STALE`, `422 VALIDATION_ERROR`, `500 INTERNAL_ERROR`, `503 SERVICE_UNAVAILABLE`.

---

## 5. Shared `RequestAccessPolicy` Authorization Matrix

Extract/unify current-participant authorization into a shared Domain policy (`RequestAccessPolicy` in `apps/api/src/Domains/Requests/RequestAccessPolicy.ts`), used identically by `GET /requests/:id`, `GET/POST /requests/:id/comments`, `GET /requests/:id/attachments`, and `GET /attachments/:id/download`:

| Actor | Request State | Current `GET /requests/:id` | `GET/POST .../comments` | `GET .../attachments` | `POST/DELETE .../attachments` | `GET /attachments/:id/download` |
| --- | --- | --- | --- | --- | --- | --- |
| **Owner (`REQUESTER`)** | `DRAFT` / `RETURNED` | Allowed | Allowed | Allowed | Allowed (working revision only) | Allowed |
| **Owner (`REQUESTER`)** | `PENDING` / `APPROVED` / `REJECTED` / `WITHDRAWN` | Allowed | Allowed | Allowed | Denied (`409 INVALID_REQUEST_TRANSITION`) | Allowed |
| **Current Assigned `REVIEWER`** (`ACTIONABLE` or `WAITING` slot in active cycle; includes active non-expired delegation) | `PENDING` | Allowed | Allowed | Allowed (submitted revisions) | Denied (`403`/`404`, owner-only) | Allowed (submitted revisions) |
| **Historic-only Reviewer** (handled prior cycle/slot, no current `ACTIONABLE`/`WAITING` slot) | Any (incl. `RETURNED` / `PENDING` / terminal) | Denied (`404`) | Denied (`404`) | Denied (`404`) | Denied (`404`) | Denied (`404`) |
| **Foreign `REQUESTER` / Unrelated `REVIEWER`** | Any | Denied (`404`) | Denied (`404`) | Denied (`404`) | Denied (`404`) | Denied (`404`) |
| **Unrelated `ADMINISTRATOR`** (role alone, not owner or current reviewer) | Any | Denied (`404`) | Denied (`404`) | Denied (`404`) | Denied (`404`) | Denied (`404`) |
| **Owner with `REQUESTER` role removed / disabled account** | Any | Denied (`401`/`403`) | Denied (`401`/`403`) | Denied (`401`/`403`) | Denied (`401`/`403`) | Denied (`401`/`403`) |

Key invariants:
- `GET /requests/:id` and comment/attachment endpoints share `RequestAccessPolicy.CanReadCurrentRequest(...)` so there is zero drift between detail access and collaboration access.
- `Historical-only` reviewers continue to use `GET /requests/:id/revisions/:revisionId` (their handled revision snapshot only) and never gain access to `GET /requests/:id/comments`, `GET /requests/:id/attachments`, or `GET /attachments/:id/download` (`BR-054`, `BR-061`, `SEC-08`).

---

## 6. Concurrency, Lock Ordering & Revision Lifecycle

### 6.1 Transaction & Lock Order

To prevent deadlocks across `Submit`, `Resubmit`, `Withdraw`, `Patch`, `PostComment`, `UploadAttachment`, and `DeleteAttachment`, every database transaction follows the strict canonical lock hierarchy:

1. **Actor lock:** `CurrentActor(actor)` acquires `SELECT ... FROM users WHERE id = actorId FOR SHARE`.
2. **Request lock:** `SELECT ... FROM requests WHERE id = requestId FOR UPDATE`.
3. **Subordinate locks:** `attachment_upload_reservations` / `attachments` / `approval_cycles` / `approval_stages` / `approval_slots`.

### 6.2 Revision Lifecycle & Request Version Invariants

- **On `Submit()` / `Resubmit()` (`RequestRepository.Submit`):**
  - Preserves `working_revision_id` as `submitted_revision_id` and stamps `request_revisions.submitted_at = now()`, `submitted_by = actorId`.
  - All `attachments` attached to that `revision_id` automatically remain linked to the now-submitted revision and immediately become immutable at the database trigger (`protect_submitted_attachment`) and API (`409 INVALID_REQUEST_TRANSITION`) layers.
- **On `RETURN` Decision (`DecisionRepository`):**
  - Creates a **new** working `request_revisions` row (`revision_number + 1`) copied from the returned revision's form fields and line items, and sets `requests.working_revision_id` to the new revision ID.
  - **Attachments are NOT cloned into the new working revision:** the returned working revision starts with an **empty** working attachment collection (`revision_id = newWorkingRevisionId`), while prior submitted revision attachments remain intact and read-only on their historical `revision_id` (`BR-059`). The requester may upload new files to the new working revision without altering prior cycle evidence.
- **Request `version` Isolation:**
  - `POST /requests/:id/comments`, `POST /requests/:id/attachments`, and `DELETE /requests/:id/attachments/:attachmentId` **do not increment `requests.version`**. Concurrent draft edits (`expectedVersion`) and `Submit` (`expectedVersion`) remain unaffected by discussion comments or attachment management; however, because upload finalization and delete lock `requests FOR UPDATE`, an interleaved `Submit` serializes cleanly against attachment commit/delete (`CX-11`).

---

## 7. Upload Reservation State Machine & Durable Cleanup Worker

### 7.1 Upload Reservation State Machine

```text
  [Create UPLOADING reservation (tx 1)]
                  │
                  ▼
     [IPrivateObjectStorage.PutObject]
        ├── GCS error ──► [Mark ABANDONED + enqueue cleanup job (tx 2a)] ──► 503 SERVICE_UNAVAILABLE
        │
        ▼ (GCS PutObject succeeded)
  [Finalize tx (tx 2b): Lock actor -> Lock request FOR UPDATE -> Verify DRAFT/RETURNED & workingRevisionId & cap]
        ├── Validation / state race (e.g. concurrent Submit) ──► [Mark ABANDONED + enqueue COMMIT_CONFLICT cleanup job] ──► 409
        ├── DB insert succeeds ──► [Insert attachments + Mark reservation FINALIZED] ──► 201 AttachmentDTO
        └── DB commit outcome unknown / process crash ──► Reservation stays UPLOADING until expired -> reconciliation
```

- **Ambiguous Commit Reconciliation:** When `UPLOADING` passes `expires_at` (e.g., 5 minutes after creation):
  - Worker locks the reservation `FOR UPDATE`.
  - Checks whether an `attachments` row exists with `id = reservation.attachment_id`:
    - If **present**: heals the reservation to `FINALIZED` (`finalized_at = now()`) — **never** deletes the live GCS object.
    - If **absent**: transitions the reservation to `ABANDONED` (`abandoned_at = now()`) and inserts an `attachment_cleanup_jobs` row (`reason = 'STALE_RESERVATION'`) so any uploaded GCS object is deleted safely.

### 7.2 Durable Cleanup Worker (`npm run attachments:cleanup`)

- **Command:** `npm run attachments:cleanup` (workspace `@workflow/api` script `attachments:cleanup`: `node --import tsx scripts/cleanup-attachments.ts`).
- **Batch Claiming (`FOR UPDATE SKIP LOCKED`):**
  1. Reconcile expired `UPLOADING` reservations (`expires_at <= now()`).
  2. Reconcile any `ABANDONED` reservations lacking an active/completed cleanup job (tombstone reconciliation).
  3. Claim due jobs where `(status = 'PENDING' AND next_attempt_at <= now()) OR (status = 'PROCESSING' AND lease_expires_at <= now())` ordered by `next_attempt_at ASC, created_at ASC` using `LIMIT <batchSize> FOR UPDATE SKIP LOCKED`.
  4. Stamp `status = 'PROCESSING'`, `claim_token = randomUUID()`, `lease_expires_at = now() + 5 minutes`, `updated_at = now()`.
- **Execution & Exponential Backoff:**
  - Execute `IPrivateObjectStorage.DeleteObject(job.storageKey)` (idempotent: treating GCS 404/NotFound as already deleted).
  - Verify ownership with `WHERE id = job.id AND claim_token = claimToken` before recording outcome (prevents stale lease overwrite):
    - **Success:** `status = 'SUCCEEDED'`, `completed_at = now()`, `lease_expires_at = null`, `claim_token = null`.
    - **Failure:** increment `attempt_count = attempt_count + 1`, record sanitized `last_error` (no secrets).
      - If `attempt_count >= max_attempts` (`10`): transition to `status = 'FAILED'`, `lease_expires_at = null`, `claim_token = null`.
      - Otherwise: `status = 'PENDING'`, `lease_expires_at = null`, `claim_token = null`, `next_attempt_at = now() + backoffMinutes(attempt_count)`.
      - **Backoff Schedule (minutes):** `[1, 2, 4, 8, 16, 32, 60, 60, 60]` (attempts 1..9 before terminal `FAILED` on attempt 10).

---

## 8. Frontend (`apps/web`) State & Interaction Design

### 8.1 Shared Components & API/Service Layer

- **Contracts (`packages/contracts/src/requests.ts` or `collaboration.ts` re-exported from `index.ts`):**
  - `commentSchema` (`CommentDTO`), `createCommentSchema`, `commentQuerySchema`
  - `attachmentSchema` (`AttachmentDTO`), `attachmentQuerySchema`, `ALLOWED_ATTACHMENT_MEDIA_TYPES`, `MAX_ATTACHMENT_BYTES` (`10 * 1024 * 1024`), `MAX_ATTACHMENTS_PER_REVISION` (`10`)
- **API Client (`apps/web/app/api/requests.ts`):**
  - `listComments(id, query, signal)`, `createComment(id, body, signal)`
  - `listAttachments(id, query, signal)`, `uploadAttachment(id, file, workingRevisionId, onProgress, signal)` (using `XMLHttpRequest` to report upload progress and read response headers/JSON safely with `withCredentials: false` + Bearer token from `tokenStore`, matching existing auth rules), `deleteAttachment(id, attachmentId, signal)`
  - `downloadAttachment(attachmentId, signal)` — authenticated `fetch` returning `{ blob, fileName, mediaType }`; creates temporary `URL.createObjectURL(blob)`, triggers `<a download>` click, and immediately revokes the object URL (`URL.revokeObjectURL`) in `finally`.
- **No Raw URLs:** Never render `<a href="...storage...">` or `<img src="...gcs...">` or store blob/download tokens in `localStorage`/`sessionStorage`.

### 8.2 `RequestDetailTabs` — `Discussion / Files` Tab

- Replaces the placeholder shell in `RequestDetailTabs.tsx` (`tab=discussion`) with two distinct accessible sections inside the tab:
  1. **Discussion (Comments):**
     - Chronological list of persisted comments (`author.displayName`, timestamp in `Asia/Bangkok` or user locale, body text rendered safely as text — no `dangerouslySetInnerHTML`).
     - Explicitly labeled as business discussion only (not a formal approval decision, `BR-058`).
     - Compose form for authorized participants (`1..4000` trimmed chars), disabled while submitting, preserves draft comment text on failure (`UI-20`), clears on `201`, and refreshes/appends cleanly.
     - Paginated controls (`Previous` / `Next`) backed by `X-Pagination`.
  2. **Files (Attachments):**
     - Separates **Working Revision Files** (visible/editable when owner views `DRAFT`/`RETURNED`) and **Submitted Revision Evidence** (read-only across all submitted revisions, grouped/labeled by revision number).
     - Owner can upload/delete working attachments when `DRAFT`/`RETURNED` (with explicit delete confirmation or accessible button and live status feedback); reviewers see read-only download actions only.
     - Accessible loading, empty, validation, and retryable error states (mapping `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `409 INVALID_REQUEST_TRANSITION`, `404`/`403`, `503`).

### 8.3 `RequestWizard` Step 4 — `Items & Attachments`

- **Decoupled Step Visibility:** Currently `RequestWizard.tsx` renders Step 4 only when `type?.supportsLineItems` is true (`ui-specs.md` §8.2 Step 4 requires showing line-item editor only when enabled AND showing authorized working-revision uploads). Update Step 4 so **"Items & Attachments"** is available whenever `type` is selected (`supportsLineItems` renders `LineItemsEditor`, and the working-revision attachment uploader always renders on Step 4 without blank content when line items are disabled). Step 5 (`Review & Submit`) displays attachment names/counts alongside summary fields.
- **New-Draft Save-Before-Upload Flow:** For an unsaved new draft (`!savedId`), clicking/selecting a file (or explicit upload prompt) first saves the draft via `POST /api/v1/requests` to obtain `requestId` and `workingRevisionId`, transitions the wizard session to persisted draft state, and immediately uploads the file against that `workingRevisionId`. If draft save fails (e.g., validation/network), no upload is attempted and user inputs remain intact.
- **XHR Progress & `UNKNOWN` Reconciliation:**
  - Each pending upload row tracks client state: `Uploading (0–100%)` -> `Finalizing` (after XHR upload `loadend` while waiting for server `201`) -> `Uploaded` (server `AttachmentDTO` received) or `Error`.
  - If the XHR fails with a network drop/timeout *during* `Finalizing` (`status === 0` / ambiguous commit), mark the item `UNKNOWN — verifying with server` and query `GET /api/v1/requests/:id/attachments?revisionId=<workingRevisionId>` to reconcile whether the server committed the attachment before offering a retry (preventing duplicate uploads).
- **Session Generation & Account Isolation:**
  - Track `useSession().generation` and `AbortController` per request/component lifecycle; on logout, account switch, or route unmount, abort active XHRs/fetches, revoke any temporary `ObjectURL`s, and clear cached comments/attachments/upload queues (`UI-20`, `SEC-14`).
- **SSR Privacy:** Authenticated comment/attachment fetches execute strictly client-side after session hydration; public SSR HTML never serializes comments, attachment metadata, or file bytes.

---

## 9. Definition of Done Checklist

- [ ] `docs/adr/ADR-13-gcs-private-attachment-storage.md` and Phase 0 `docs/features/comments-private-attachments/*` documents committed/reviewed.
- [ ] `packages/contracts` exports strict Zod schemas and inferred types for comments and attachments with contract unit tests passing.
- [ ] Migration `0017_*` creates `request_comments`, `attachments`, `attachment_upload_reservations`, `attachment_cleanup_jobs`, composite FK `(request_id, revision_id) -> request_revisions(request_id, id)`, and `protect_submitted_attachment` trigger; `deploy/runtime-grants.sql` and `deploy/migrator-ownership.sql` updated.
- [ ] Shared `RequestAccessPolicy` enforces current-participant matrix across `GET /requests/:id`, comments, attachments, and downloads with zero drift.
- [ ] All 6 API endpoints implemented with exact headers, pagination, magic-byte/size validation (`413`/`415`), transaction lock ordering, and `IPrivateObjectStorage` (`GcsPrivateObjectStorage` + test adapter).
- [ ] `npm run attachments:cleanup` implements reservation reconciliation, tombstone recovery, `FOR UPDATE SKIP LOCKED` lease claiming, and exponential backoff (`1/2/4/8/16/32/60` min, max 10 -> `FAILED`).
- [ ] `RequestDetailTabs` (`Discussion / Files`) and `RequestWizard` (Step 4 `Items & Attachments` + Step 5 summary) implemented with XHR progress, `UNKNOWN` reconciliation, Blob download + revocation, session-generation abort/clear, and SSR privacy.
- [ ] All STS test suites (`CMT-CT`, `ATT-CT`, `ACC-UT`, `CMT-UT`, `ATT-UT`, `CMT-API`, `ATT-API`, `CMT-PG`, `ATT-PG`, `ATT-CX`, `ATT-REC`, `MIG-13`, `CMT-UI`, `ATT-UI`, `E2E-12`) executed and passing; `GCS-IT-01..08` verified when GCP ADC is configured or explicitly disclosed if `BLOCKED`.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, `npm run test:integration`, and Playwright E2E checks recorded in `verification.md`.
