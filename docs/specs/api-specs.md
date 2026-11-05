# CPE334 Theme 5 — Workflow and Approval System

**Document:** `api-specs.md` — REST API Engineering Specification  
**Version:** **1.0.1 — FROZEN (additive, UI-approved administrator escalation discovery)**  
**Status:** Normative wire-level/API baseline; no implementation or test execution is claimed  
**Product authority:** [`specifications.md`](./specifications.md), frozen product v1.0  
**Reference style:** [`maintenance-tracking-system-api`](https://github.com/oangsa/maintenance-tracking-system-api) and its [frontend](https://github.com/oangsa/maintenance-tracking-system)  
**Scope:** All 54 approved features, Sprints 1–3; excludes unrelated coursework  
**Amendment:** API-UI-ADD-01, approved with `ui-specs.md` v1.0; adds only the minimal administrator-only approval-task search

> **Authority and separation.** The product specification defines _what_ is required, this document defines the HTTP/data/security contract, and `ui-specs.md` will define user-facing routes and interactions. If any API interpretation conflicts with a frozen product requirement, the product requirement wins and this document requires an explicit revision. `shall`/`must` indicate binding API behavior. A value marked **[IMPLEMENTATION DEFAULT — NOT FROZEN]** may be changed through a recorded technical decision if the agreed behavior remains satisfied. The backend is Elysia on Node.js 24 through `@elysia/node` using OOP/Clean Architecture, PostgreSQL + Drizzle, and shared Zod contracts in `packages/contracts`.

> **D-01 — approved engineering amendment (2026-11-05):** [Owner decision, Issue #1](https://github.com/oangsa/approval-system/issues/1) replaces the earlier Bun runtime/toolchain with Node.js 24, npm Workspaces, one root `package-lock.json`, Elysia through `@elysia/node`, TypeScript, Vitest for unit/API/contract/real-PostgreSQL integration tests, and Playwright for browser E2E. React Router 7, shadcn/ui + Tailwind CSS, PostgreSQL + Drizzle ORM and shared Zod contracts remain. This amendment changes no feature scope, FR/BR/AC/test identifiers, product/API/UI behavior, ownership or effort estimates; baseline contract versions remain unchanged. It records engineering alignment only, not implementation or passing verification.

## 1. Frozen decision register

### 1.1 Product decisions inherited unchanged

| ID     | Binding product behavior                                                 |
| ------ | ------------------------------------------------------------------------ |
| DEC-01 | Admin-configurable, published and versioned request types                |
| DEC-02 | Sequential approval with parallel **ALL** voting                         |
| DEC-03 | Monetary policy limits/thresholds only; no balance ledger                |
| DEC-04 | One organization, multiple departments and user roles                    |
| DEC-05 | Public Requester signup, recovery codes, no OAuth                        |
| DEC-06 | Business-day SLA, reminders, administrator escalation                    |
| DEC-07 | Resubmission starts a fresh approval cycle                               |
| DEC-08 | Time-bounded eligible reviewer delegation                                |
| DEC-09 | Conditional field visibility and requiredness                            |
| DEC-10 | Maximum **two** sequential approval stages                               |
| DEC-11 | Trusted department assignment by Administrator                           |
| DEC-12 | SLA calendar: Mon–Fri 09:00–17:00, `Asia/Bangkok`, no holiday calendar   |
| DEC-13 | Returned revisions retain the original published form-definition version |
| DEC-14 | Audited admin-assisted account reset when all recovery codes are lost    |
| DEC-15 | Submission blocked if any required reviewer cannot be resolved           |

### 1.2 Final API decisions confirmed for v1.0

| ID     | Binding API decision                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| API-01 | Auth namespace **`/api/v1/auth`**, not `/authentication`                                                      |
| API-02 | Public resource identifiers are **UUIDs**; numeric database keys may remain internal                          |
| API-03 | Successful JSON responses are direct DTOs/arrays; paged arrays use **`X-Pagination`**                         |
| API-04 | Collection filtering uses **`POST /search`** with `search`, `searchTerm`, `orderBy`, `pageNumber`, `pageSize` |
| API-05 | Maintenance-style `{statusCode,message,error}` errors extended with `code`, `details`, and `requestId`        |
| API-06 | Bounded AND/OR conditional-field groups and simple comparison operators                                       |
| API-07 | Reject submitted hidden/nonapplicable form values; never silently discard them                                |
| API-08 | `Idempotency-Key` plus `expectedVersion` on critical applicable mutations                                     |
| API-09 | Approval policy precedence by explicit priority; ambiguous highest-priority tie rejects resolution            |
| API-10 | Original reviewer **or** currently eligible delegate may decide; the first valid decision claims the one slot |
| API-11 | A former reviewer may read only their own previously handled revision/decision context                        |
| API-12 | Only Requester may upload to their own `DRAFT`/`RETURNED` working revision; reviewers read only               |
| API-13 | SLA durations configurable per policy/stage, default 8 business hours                                         |
| API-14 | Audited admin-assisted reset uses a short-lived, one-time out-of-band grant/code                              |
| API-15 | Persistent in-app notification inbox with **periodic polling**, no push subscription requirement              |
| API-16 | Stable error codes, English fallback messages; Thai/English presentation belongs in frontend                  |
| API-17 | `multipart/form-data` uploads pass **through Elysia** into private object storage                             |

## 2. General HTTP and data conventions

### 2.1 URLs, identifiers, timestamps and data types

- API prefix: **`/api/v1`**. All endpoints in §6 use this prefix unless explicitly specified.
- Public version discovery: `GET /api/versions` returns `{ "supportedVersions": ["v1"] }`.
- JSON property casing: `camelCase`; database columns may be `snake_case` through Drizzle mapping.
- JSON responses use `application/json; charset=utf-8`; multipart only for the upload route; a PDF download uses `application/pdf`.
- Public identifiers (`id`, `requestId`, `taskId`, `revisionId`, `cycleId`, `versionId`, user/department IDs) are UUID strings. Internal numeric IDs are never part of public resource identity. Human `requestNumber` is a separate label.
- Dates/times on the wire are ISO-8601 UTC strings ending in `Z`; business-calendar calculations always use `Asia/Bangkok`, then return UTC instants.
- Calendar-only request-form `DATE` values use `YYYY-MM-DD` and are **not** converted into a timezone-dependent instant.
- Monetary totals, amounts, and decimal quantities are **canonical decimal strings**, never floating-point JSON numbers used as authoritative monetary values. Example: `"amount":"1200.50"`.
- Enums are uppercase stable machine values. Localized UI messages and form labels are distinct from machine identifiers.
- Unknown write fields are rejected by the corresponding Zod contract unless explicitly documented as metadata-driven `fields` keys. Read DTOs never expose password/token/code hashes or privileged internal metadata.

### 2.2 Success response convention

- A single-resource GET/POST/PATCH returns a direct DTO, not `{ "data": ... }`.
- Ordinary paged `POST /search` endpoints return a **direct JSON array** and **`X-Pagination`** response header:

```json
{
  "currentPage": 1,
  "pageSize": 20,
  "totalPages": 3,
  "totalCount": 51,
  "hasPrevious": false,
  "hasNext": true
}
```

- `X-Pagination` is a UTF-8 JSON string in a response header, exposed to browser code using `Access-Control-Expose-Headers`. Empty results return `[]` and a truthful zero count.
- Create operations return `201 Created`, a direct resource DTO, and a same-prefix `Location` header where there is a readable created resource. Other successful writes return `200` with a DTO/result or `204 No Content` where explicitly specified.
- PDF or binary streaming responses have appropriate `Content-Type`, `Content-Disposition`, `Cache-Control: no-store` and safe filenames; they do not use a JSON success envelope.
- Authenticated/private JSON and downloads use `Cache-Control: no-store`.

### 2.3 Search, filtering, ordering and pagination

A collection query has this shape:

```json
{
  "pageNumber": 1,
  "pageSize": 20,
  "search": [
    { "name": "status", "condition": "EQUAL", "value": "PENDING" },
    {
      "name": "createdAt",
      "condition": "GREATEROREQUAL",
      "value": "2026-11-01T00:00:00.000Z"
    }
  ],
  "searchTerm": { "name": "requestNumber,title", "value": "equipment" },
  "orderBy": "createdAt desc"
}
```

- `search` combines conditions with **AND**. `searchTerm.name` is a comma-separated, server-allowlisted list of textual search fields combined with **OR**. If both are set, the groups are combined with AND.
- Supported bounded operators: `EQUAL`, `NOTEQUAL`, `CONTAINS`, `STARTWITH`, `ENDWITH`, `GREATER`, `LESSER`, `GREATEROREQUAL`, `LESSEROREQUAL`, `ISNULL`, `ISNOTNULL`. A resource's field type determines which are legal.
- `orderBy` has one allowlisted field and `asc`/`desc`, with a stable server-side unique-ID tiebreaker.
- A resource controls its own public field allowlist; nested database paths, unapproved joins, raw SQL, unbounded conditions and broad wildcards are prohibited. A user-supplied `requesterId`/`departmentId` **never** widens a user's authorized scope.
- Validation rejects unsupported field names/conditions, malformed values, invalid page sizes, overly broad queries, and unsupported sort combinations with `422 VALIDATION_ERROR`.
- **[IMPLEMENTATION DEFAULT — NOT FROZEN]** `pageNumber=1`, `pageSize=20`, maximum `pageSize=100`, maximum 20 `search` conditions, maximum 5 `searchTerm` fields. `GET` endpoints exposing bounded historical lists may use typed cursor or `pageNumber` parameters; they must never silently return unlimited datasets.
- `/requests/search`: allow request number/title text search and status, request type, priority and allowed date fields; `/approval-tasks/search`: assigned/actionable/overdue and permitted task attributes; `/admin/approval-tasks/search`: administrator-only, minimal active-cycle task routing metadata under a separate allowlist; `/users/search`, `/notifications/search` and administrative searches use their own narrower field sets.

### 2.4 Centralized errors

All JSON errors have the same shape:

```json
{
  "statusCode": 409,
  "code": "APPROVAL_TASK_STALE",
  "message": "This approval task has changed. Refresh and try again.",
  "error": "Conflict",
  "requestId": "7bb91ef4-5982-405f-8bd5-61b5c3cf410b",
  "details": [
    {
      "field": "expectedVersion",
      "code": "STALE_VERSION",
      "message": "Version does not match."
    }
  ]
}
```

- `statusCode` is the actual HTTP status; `code` is a stable machine key; `message` is sanitized English fallback; `error` is a stable English HTTP category; `requestId` is mandatory for correlating failures. `details` is optional (field errors are not exposed when doing so would reveal unauthorized records).
- The `X-Request-Id` header mirrors `requestId`; user-supplied correlation IDs are validated/normalized, never blindly trusted.
- Do not return SQL, stack traces, provider secrets, refresh credentials, recovery codes, or inaccessible resource existence.
- API messages are not translated using `Accept-Language`. UI maps `code` and valid `details[].code` to English/Thai translations; backend English messages remain fallback only.

| HTTP | Default `code`                      | Meaning                                                                          |
| ---- | ----------------------------------- | -------------------------------------------------------------------------------- |
| 400  | `BAD_REQUEST`                       | Malformed JSON, malformed multipart, invalid protocol syntax                     |
| 401  | `UNAUTHENTICATED`                   | Missing/expired/invalid authentication                                           |
| 403  | `FORBIDDEN`                         | Authenticated actor lacks operation permission where disclosure is safe          |
| 404  | `NOT_FOUND`                         | Missing or inaccessible private object; indistinguishable by owner existence     |
| 409  | `CONFLICT` or a specific code below | Stale version, invalid state, idempotency/key collision, configuration ambiguity |
| 413  | `FILE_TOO_LARGE`                    | Upload exceeds permitted limits                                                  |
| 415  | `UNSUPPORTED_MEDIA_TYPE`            | Invalid upload media type                                                        |
| 422  | `VALIDATION_ERROR`                  | Well-formed input violates static or dynamic field constraints                   |
| 429  | `RATE_LIMITED`                      | Login/recovery/other protected rate limit exceeded                               |
| 500  | `INTERNAL_ERROR`                    | Sanitized unexpected server failure                                              |
| 503  | `SERVICE_UNAVAILABLE`               | Temporary required backend infrastructure unavailable                            |

Required specific codes include `BUDGET_LIMIT_EXCEEDED`, `INVALID_REQUEST_TRANSITION`, `APPROVAL_TASK_STALE`, `FORM_DEFINITION_CHANGED`, `FORM_FIELD_NOT_APPLICABLE`, `CONFIGURATION_INCOMPLETE`, `AMBIGUOUS_APPROVAL_POLICY`, `SELF_APPROVAL_FORBIDDEN`, `IDEMPOTENCY_CONFLICT`, `RECOVERY_CREDENTIAL_INVALID`, and `ASSIGNMENT_NOT_ELIGIBLE`. Their operation-specific status mapping is in §8.

### 2.5 Authentication, cookies and client origins

- Access credential: `Authorization: Bearer <accessToken>`; the access token remains in browser **memory**, not localStorage or sessionStorage.
- Refresh credential: opaque single-use token in an `HttpOnly` refresh cookie; the raw token **never** appears in JSON. Refresh-token hashes, session/family identifiers and revocation state are kept server-side.
- Login/registration/recovery are public but subject to validation, rate limiting and relevant origin restrictions; cookie-using refresh/logout endpoints enforce origin/CSRF defenses.
- Production cookie flags: `Secure`, `HttpOnly`, an origin-appropriate `SameSite` value and minimal cookie `Path`. **[IMPLEMENTATION DEFAULT — NOT FROZEN]** If frontend/backend are same-site use `SameSite=Strict`, otherwise deploy behind a same-origin reverse proxy or document an equally safe authenticated cross-origin policy.
- The backend never trusts roles, department, requester identity or monetary totals supplied by the client. Re-check active user, token/session revocation, current roles and resource permissions, including after admin changes.
- Private data must not be serialized into public SSR HTML; server-side authenticated requests must bind the actual viewer's session and must not share caches across users.
- CORS permits only explicitly configured origins and exposes `X-Pagination`, `X-Request-Id`, and `Location` to approved browser clients. Never use `*` with credentialed requests.
- Logout-all and password-reset flows revoke every existing refresh session and invalidate existing bearer authorization per the server-side session/version guard.

### 2.6 Critical mutations and retries

- The following require `Idempotency-Key: <UUID>`: initial draft creation, first submit, resubmit, withdraw, single decision, bulk decisions, reassignment, publish of request type/policy, and admin recovery grant creation. Mutations not listed may add keys when needed; all must remain safe under retries where they affect money, permissions, or business history.
- Critical mutable-resource operations also require `expectedVersion` as a nonnegative integer in their JSON body or documented multipart metadata; use the current request/task/config version. **First creation** has no pre-existing version and therefore requires only the key, not `expectedVersion`.
- Idempotency identity is `(authenticated actor or verified public registration/recovery context, HTTP method, canonical path/resource, Idempotency-Key)` and includes a canonical hash of the validated semantic request body. Reuse with the same identity/body returns the same stored logical outcome without executing a second mutation; same key/scope with changed body returns `409 IDEMPOTENCY_CONFLICT`. **Secret-display exception:** accepted recovery-grant creation is idempotent as a _grant creation_, but its raw `oneTimeCode` is returned only on the first successful issuance response; later same-key replays return the grant ID/expiry with `oneTimeCode:null` and must never recreate, decrypt or redisplay the original secret. If the first response is lost, the administrator must revoke/reissue a new grant following the verified process.
- Idempotency records use durable database claims and unique constraints. A request abandoned before commit must be reclaimable without inventing or duplicating an accepted result. The resource mutation, decision/audit and successful claim completion commit consistently.
- `expectedVersion` mismatches return `409` with a domain-specific conflict code and no business state mutation. A successful replay is evaluated **before** a stale-version rejection when its original accepted result can be proven, so client retries remain safe.
- A concurrent approval/rejection/return/withdrawal must produce one serializable coherent state. Version checks, row locks and unique `slotId` decision constraints prevent lost updates and second votes.
- Outbox/notification/job effects are deduplicated through durable unique logical event identities, never only through browser disabled states.

## 3. Static DTOs and shared Zod contract surface

All static transport DTOs live in `packages/contracts`, are imported by both apps, and are represented in generated OpenAPI. Dynamic request-field values require **additional runtime validation** against the stored published definition; the static schema is not a substitute.

### 3.1 Basic types and identifiers

```ts
type PublicId = string; // UUID validated by Zod
// Strings below are validation-level pseudotypes, represented by Zod schemas.
type UTCDateTime = string; // ISO-8601 UTC instant
type LocalDate = string; // YYYY-MM-DD
type DecimalString = string; // canonical finite fixed-point representation
type UserRole = "REQUESTER" | "REVIEWER" | "ADMINISTRATOR";
type RequestStatus =
  "DRAFT" | "PENDING" | "RETURNED" | "APPROVED" | "REJECTED" | "WITHDRAWN";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type DecisionType = "APPROVE" | "REJECT" | "RETURN";
type FieldKind =
  "TEXT" | "TEXTAREA" | "DECIMAL" | "DATE" | "SELECT" | "BOOLEAN";
type LocalizedText = { en: string; th?: string };
```

**[IMPLEMENTATION DEFAULT — NOT FROZEN]** UUID v4 generated server-side for publicly addressable resources; strict canonical decimal-string normalization; English label required, Thai label falls back to English. **API v1 wire contract:** The supported priority literals are `LOW`, `MEDIUM`, `HIGH`, `URGENT`. Expanding/changing the public enum requires a compatible contract revision, even though the original product baseline required only a bounded priority vocabulary.

### 3.2 User and session DTOs

```ts
type DepartmentSummary = {
  id: PublicId;
  code: string;
  name: string;
  isActive: boolean;
};
type UserSummary = {
  id: PublicId;
  displayName: string;
  email: string;
  roles: UserRole[];
  isActive: boolean;
  department: DepartmentSummary | null;
};
type LoginRequest = { email: string; password: string };
type LoginResponse = { accessToken: string; user: UserSummary };
type RefreshResponse = { accessToken: string };
type RegisterRequest = { email: string; password: string; displayName: string };
type RegisterResponse = { user: UserSummary; recoveryCodes: string[] }; // codes shown only once
type RecoveryResetRequest = {
  email: string;
  recoveryCode: string;
  newPassword: string;
};
type AdminRecoveryGrant = {
  grantId: PublicId;
  expiresAt: UTCDateTime;
  oneTimeCode: string | null;
};
```

- No public session/user DTO contains password hash, raw refresh token, recovery-code hash, or secret admin verification details.
- Public register returns Requester role and `department:null`, with no privilege-selection parameters.
- Admin reset grant `oneTimeCode` is returned only at issuance to the authenticated issuing administrator for secure **out-of-band** handoff; its hash is stored server-side, never retrievable again.

### 3.3 Conditional request-type definitions

```ts
type ConditionAtom = {
  fieldKey: string;
  operator: "EQ" | "NE" | "GT" | "GTE" | "LT" | "LTE" | "IN" | "PRESENT";
  value?:
    | string
    | boolean
    | DecimalString
    | LocalDate
    | Array<string | boolean | DecimalString | LocalDate>;
};
type ConditionExpr = { all?: ConditionAtom[]; any?: ConditionAtom[] };
type RequestField = {
  key: string;
  kind: FieldKind;
  label: LocalizedText;
  description?: LocalizedText;
  required: boolean;
  defaultValue?: unknown;
  constraints?: {
    min?: DecimalString | LocalDate;
    max?: DecimalString | LocalDate;
    minLength?: number;
    maxLength?: number;
    options?: Array<{ value: string; label: LocalizedText }>;
  };
  visibleWhen?: ConditionExpr;
  requiredWhen?: ConditionExpr;
};
type PublishedRequestType = {
  id: PublicId;
  code: string;
  name: LocalizedText;
  description?: LocalizedText;
  versionId: PublicId;
  versionNumber: number;
  isEnabled: boolean;
  supportsLineItems: boolean;
  monetary: boolean;
  fields: RequestField[];
  publishedAt: UTCDateTime;
};
```

**Binding expression semantics:**

1. `all` evaluates to true only when **every** atom is true; `any` is true when **at least one** atom is true. If both exist, expression result is `allResult && anyResult`. At least one group must be present and nonempty; a missing group contributes `true` to the conjunction.
2. `EQ`/`NE` use typed equality against the referenced field's canonical value; `GT`/`GTE`/`LT`/`LTE` support decimal and calendar-date comparisons only; `IN` uses typed membership in a nonempty array of same-type literals; `PRESENT` checks non-null/nonempty presence. Boolean `false` is a valid **present** value.
3. Conditions reference existing field keys in the **same** version; compatible operators and typed literals are mandatory. Administrators cannot supply arbitrary JavaScript, SQL, regular expressions, or recursive expressions.
4. Validate/publish rejects unknown/duplicate keys, invalid options, cycles across either visibility or requiredness dependencies, self-reference and incompatible conditions. Evaluate the acyclic graph in dependency order.
5. If a field is hidden, its value is treated as **unset** when evaluating downstream conditions, and the field is **not required** regardless of base/conditional required flags. When visible, it is required if `required=true` **or** its `requiredWhen` expression evaluates true.
6. Submission or working-draft updates carrying a field value that is not applicable under the evaluated visible fields return `422 FORM_FIELD_NOT_APPLICABLE` with the offending field key. The API **never** silently strips the supplied value. An absent hidden key is valid.
7. A visible field's values must match its field kind, options and bounds. Server calculation/routing uses only validated **applicable** values. Published versions are immutable; modifying a type creates a new version.

**[IMPLEMENTATION DEFAULT — NOT FROZEN]** At most 50 defined fields, 16 condition atoms per expression, 2 group types, max 20 select options per field, field-key regex `[a-z][a-zA-Z0-9_]{0,63}`; no nested group expressions.

### 3.4 Request/revision DTOs

```ts
type RequestLineItem = {
  id: PublicId;
  description: string;
  quantity: DecimalString;
  unitAmount: DecimalString;
  totalAmount: DecimalString;
};
type RequestRevision = {
  id: PublicId;
  revisionNumber: number;
  formDefinitionVersionId: PublicId;
  fields: Record<string, unknown>;
  lineItems: RequestLineItem[];
  amount: DecimalString | null;
  currency: string | null;
  submittedAt: UTCDateTime | null;
  submittedBy: PublicId | null;
};
type RequestSummary = {
  id: PublicId;
  requestNumber: string | null;
  typeId: PublicId;
  typeCode: string;
  title: string;
  priority: Priority;
  status: RequestStatus;
  requester: UserSummary;
  department: DepartmentSummary | null;
  revisionNumber: number | null;
  currentCycleId: PublicId | null;
  createdAt: UTCDateTime;
  updatedAt: UTCDateTime;
  submittedAt: UTCDateTime | null;
  version: number;
};
type ApproverSummary = {
  slotId: PublicId;
  stageNumber: 1 | 2;
  reviewer: Pick<UserSummary, "id" | "displayName">;
  status:
    | "WAITING"
    | "ACTIONABLE"
    | "APPROVED"
    | "REJECTED"
    | "RETURNED"
    | "CANCELLED";
};
type RequestDetail = RequestSummary & {
  justification: string;
  workingRevision: RequestRevision | null;
  submittedRevision: RequestRevision | null;
  currentStageNumber: 1 | 2 | null;
  currentApprovers: ApproverSummary[];
  availableActions: string[];
};
```

- `requestNumber` is `null` before the first accepted submission; it is immutable afterward. The server generates the official number and authoritative monetary totals.
- `workingRevision` exists only in `DRAFT` or `RETURNED`; submitted history is immutable. `submittedRevision` points to the latest submitted immutable revision, if any.
- A `RETURNED` request keeps its original form version on working edits; a new request before first submission uses the current published version, with explicit conflict behavior when the type changes during editing.
- `availableActions` is a UI convenience, **not** proof that a future mutation is permitted.
- Read projections are **role/resource scoped**: a prior reviewer receives only their own previously handled submitted revision/decision context, not newer revisions, comments or private files.

### 3.5 Approval and other DTOs

```ts
type ApprovalTask = {
  id: PublicId;
  slotId: PublicId;
  requestId: PublicId;
  cycleId: PublicId;
  revisionId: PublicId;
  stageNumber: 1 | 2;
  assignedReviewer: Pick<UserSummary, "id" | "displayName">;
  status:
    | "WAITING"
    | "ACTIONABLE"
    | "APPROVED"
    | "REJECTED"
    | "RETURNED"
    | "CANCELLED";
  dueAt: UTCDateTime | null;
  canCurrentUserDecide: boolean;
  version: number;
};
type DecisionRequest = {
  decision: DecisionType;
  reason?: string;
  expectedVersion: number;
};
type DecisionResult = {
  taskId: PublicId;
  slotId: PublicId;
  decisionId: PublicId;
  decision: DecisionType;
  decidedBy: PublicId;
  decidedAt: UTCDateTime;
  requestStatus: RequestStatus;
  currentStageNumber: 1 | 2 | null;
  requestVersion: number;
  taskVersion: number;
};
type Notification = {
  id: PublicId;
  kind: string;
  title: string;
  message: string;
  requestId?: PublicId;
  taskId?: PublicId;
  createdAt: UTCDateTime;
  readAt: UTCDateTime | null;
};
```

**API-UI-ADD-01 (additive v1.0.1): Administrator task routing summary.** This is deliberately _not_ the regular `ApprovalTask` or private `RequestDetail` DTO.

```ts
type AdminApprovalTaskSummary = {
  id: PublicId; // approval task UUID (also used by existing reassign endpoint)
  requestId: PublicId; // opaque request UUID, not permission for request detail
  requestNumber: string; // minimal human routing label, no title/description
  stageNumber: 1 | 2;
  status: "WAITING" | "ACTIONABLE";
  assignedReviewer: { id: PublicId; displayName: string };
  dueAt: UTCDateTime | null;
  overdue: boolean; // computed from server time, true only if ACTIONABLE and past due
  version: number; // required by existing reassignment expectedVersion
  createdAt: UTCDateTime;
  updatedAt: UTCDateTime;
};
```

The response MUST NOT include request title, form answers, item amounts/quantities, requester PII, comments, attachments, delegated secrets, or authorization to call the current request-detail endpoint. Administrators must not be given the normal reviewer `ApprovalTask` DTO through this read solely because they are administrators.

`REJECT`/`RETURN` require trimmed, nonblank `reason`; `APPROVE` may include a comment/reason. `decidedBy` is always authenticated actor (including delegate), never a client-supplied identity. Approval tasks must reference one explicit cycle and immutable submitted revision.

## 4. Authorization and confidentiality matrix

| API operation                                   | Requester                                       | Reviewer                                                             | Administrator                                                                          |
| ----------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Public register/login/recover                   | Public endpoints with appropriate rate limits   | Same                                                                 | Same                                                                                   |
| Own `GET /auth/me`, password, codes             | Own session                                     | Own session                                                          | Own session                                                                            |
| Own request draft/submit/return edit/withdraw   | Own eligible request                            | Only if also acting as owner Requester                               | Only own request in Requester capacity                                                 |
| Request content/history/comments/files          | Own records                                     | Current assigned/delegated context; handled historical snapshot only | **Not** automatically by admin role                                                    |
| Review/approve/reject/return                    | Never own request                               | Eligible current actionable slot; not own request                    | Only if independently eligible Reviewer; not own request                               |
| Reviewer queue                                  | Own actionable slots, if eligible Reviewer role | Own current/delegated slots                                          | Only if also independently eligible Reviewer                                           |
| Reassign outstanding slot                       | No                                              | No                                                                   | Admin, with minimum required request metadata                                          |
| Search escalation/reassignment routing metadata | No                                              | No                                                                   | Admin only; limited `AdminApprovalTaskSummary`, never request detail                   |
| Configure request types/policies/assignments    | No                                              | No                                                                   | Admin only                                                                             |
| User/department operations                      | Own basic identity read only                    | Own basic identity read only                                         | Admin; no blanket access to requests                                                   |
| Delegation create/revoke                        | Only if also eligible Reviewer                  | Own eligible reviewer scope                                          | Own Reviewer scope, not universal act-as                                               |
| Notifications                                   | Own inbox only                                  | Own inbox only                                                       | Own inbox only                                                                         |
| Dashboard/reports/PDF                           | Own authorized records                          | Own permitted tasks/records                                          | Policy-safe organizational counts and minimal metadata, no private payloads by default |

- For direct resource access, a request from someone who may not learn that a private object exists returns the **same `404 NOT_FOUND`** as an absent object. A known-own-resource action with a wrong role may return `403 FORBIDDEN`.
- A **former reviewer** may read only a revision/decision that they actually handled during a completed assignment. They cannot see later revisions, reopen task decisions, access files/comments by historical status alone, or enumerate general requests. Historical access requires a decision/handling record, not simply knowledge of a prior assignment ID. It is exposed through historical revision and task-context reads, **not** the current `/requests/:id` full detail or current-revision listing.
- Administrators conducting reassignment/escalation may receive minimum routing/status metadata, not confidential form values. Admin accounts cannot impersonate other users through any public endpoint.
- `GET /requests/:id/approvers` reveals only appropriately permitted reviewer summaries; it must not expose private reviewer email/contact details beyond necessary display labels.

## 5. Endpoint directory

Every path below is **relative to `/api/v1`**. Unless labeled Public or Internal, Bearer access authentication is required. `:id`, `:taskId`, `:versionId`, etc. represent public UUIDs.

### 5.1 Authentication and account recovery

| Method | Route                                | Audience                                                          | Result                                                     |
| ------ | ------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| POST   | `/auth/register`                     | Public                                                            | `201 RegisterResponse`, one-time recovery codes            |
| POST   | `/auth/login`                        | Public                                                            | `200 LoginResponse`, refresh cookie                        |
| POST   | `/auth/refresh`                      | Cookie holder, origin/CSRF checks                                 | `200 RefreshResponse`, rotated refresh cookie              |
| POST   | `/auth/logout`                       | Authenticated or valid refresh-session holder, origin/CSRF checks | `200 MessageResponse`, revoke current session/clear cookie |
| POST   | `/auth/logout-all`                   | Authenticated                                                     | `200 MessageResponse`, revoke all sessions                 |
| GET    | `/auth/me`                           | Authenticated                                                     | `200 UserSummary`                                          |
| POST   | `/auth/password/change`              | Authenticated                                                     | `200 MessageResponse`, revoke existing sessions            |
| POST   | `/auth/recovery/password`            | Public, rate-limited                                              | `200 MessageResponse` on verified code reset               |
| POST   | `/auth/recovery/codes/regenerate`    | Authenticated and reauthenticated                                 | `200 {recoveryCodes:string[]}` once                        |
| POST   | `/auth/recovery/admin-grants/redeem` | Public, rate-limited                                              | `200 MessageResponse` on valid grant                       |
| POST   | `/admin/users/:id/recovery-grants`   | Administrator                                                     | `201 AdminRecoveryGrant` once                              |

### 5.2 Users, departments and reviewer eligibility

| Method | Route                        | Audience                                                    | Result                                      |
| ------ | ---------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| POST   | `/users/search`              | Administrator                                               | `200 UserSummary[]` + `X-Pagination`        |
| POST   | `/users`                     | Administrator                                               | `201 UserSummary`                           |
| GET    | `/users/:id`                 | Administrator                                               | `200 UserSummary`                           |
| PATCH  | `/users/:id`                 | Administrator                                               | `200 UserSummary`                           |
| PUT    | `/users/:id/roles`           | Administrator                                               | `200 UserSummary`                           |
| PUT    | `/users/:id/department`      | Administrator                                               | `200 UserSummary`                           |
| POST   | `/departments/search`        | Administrator                                               | `200 DepartmentSummary[]` + `X-Pagination`  |
| GET    | `/departments/:id`           | Authorized admin or current department member (limited DTO) | `200 DepartmentSummary`                     |
| POST   | `/departments`               | Administrator                                               | `201 DepartmentSummary`                     |
| PATCH  | `/departments/:id`           | Administrator                                               | `200 DepartmentSummary`                     |
| POST   | `/reviewers/eligible/search` | Administrator configuring roles/rules                       | `200 reviewer summaries[]` + `X-Pagination` |

### 5.3 Request-type definitions

| Method | Route                                    | Audience                                                                    | Result                                                                   |
| ------ | ---------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| POST   | `/request-types/search`                  | Authenticated, public active-type metadata only; admin may request disabled | `200 type summaries[]` + `X-Pagination`                                  |
| GET    | `/request-types/:id`                     | Authorized user                                                             | `200 PublishedRequestType` or admin draft metadata                       |
| GET    | `/request-types/:id/versions/:versionId` | Admin, or request participant with legitimate pinned-version context        | `200 PublishedRequestType`                                               |
| POST   | `/admin/request-types`                   | Administrator                                                               | `201 type draft DTO`                                                     |
| PATCH  | `/admin/request-types/:id/draft`         | Administrator                                                               | `200 type draft DTO`                                                     |
| POST   | `/admin/request-types/:id/draft`         | Administrator                                                               | `201 type draft DTO` — branch latest published definition to a new draft |
| POST   | `/admin/request-types/:id/publish`       | Administrator                                                               | `201 PublishedRequestType`                                               |
| POST   | `/admin/request-types/:id/enable`        | Administrator                                                               | `200 type summary`                                                       |
| POST   | `/admin/request-types/:id/disable`       | Administrator                                                               | `200 type summary`                                                       |

### 5.4 Requests, revisions and status

| Method | Route                                 | Audience                                                                  | Result                                  |
| ------ | ------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------- |
| POST   | `/requests/search`                    | Authenticated; visibility scope                                           | `200 RequestSummary[]` + `X-Pagination` |
| POST   | `/requests`                           | Requester with active account                                             | `201 RequestDetail` (DRAFT)             |
| GET    | `/requests/:id`                       | Owner or current authorized reviewer only; no historic-only detail access | `200 RequestDetail`                     |
| PATCH  | `/requests/:id/draft`                 | Owner with `DRAFT`/`RETURNED` working revision                            | `200 RequestDetail`                     |
| POST   | `/requests/:id/submit`                | Owner DRAFT, assigned department                                          | `200 RequestDetail`                     |
| POST   | `/requests/:id/resubmit`              | Owner RETURNED, assigned department                                       | `200 RequestDetail`                     |
| POST   | `/requests/:id/withdraw`              | Owner PENDING                                                             | `200 RequestDetail`                     |
| GET    | `/requests/:id/revisions`             | Owner/current reviewer only                                               | `200 revision metadata[]`               |
| GET    | `/requests/:id/revisions/:revisionId` | Owner/current reviewer or qualifying historic handler                     | `200 RequestRevision`                   |
| GET    | `/requests/:id/timeline`              | Authorized request participant                                            | `200 audit timeline item[]`             |
| GET    | `/requests/:id/approvers`             | Authorized request participant; minimal reviewer summaries                | `200 ApproverSummary[]`                 |

### 5.5 Approval tasks and decisions

| Method | Route                            | Audience                                                                      | Result                                            |
| ------ | -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| POST   | `/approval-tasks/search`         | Reviewer own current/delegated tasks only                                     | `200 ApprovalTask[]` + `X-Pagination`             |
| POST   | `/admin/approval-tasks/search`   | Administrator only; routing metadata for undecided active PENDING-cycle slots | `200 AdminApprovalTaskSummary[]` + `X-Pagination` |
| GET    | `/approval-tasks/:id`            | Current eligible reviewer; approved historical projection to handler          | `200 ApprovalTask`                                |
| POST   | `/approval-tasks/:id/decisions`  | Eligible reviewer/delegate                                                    | `201 DecisionResult`                              |
| POST   | `/approval-tasks/bulk-decisions` | Eligible reviewer/delegate                                                    | `200 BulkDecisionResult`                          |
| POST   | `/approval-tasks/:id/reassign`   | Administrator, any undecided slot in active PENDING cycle                     | `200 ApprovalTask`                                |

### 5.6 Approval policies, reviewer mapping and delegation

| Method | Route                                  | Audience                                | Result                                                |
| ------ | -------------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| POST   | `/admin/approval-policies/search`      | Administrator                           | `200 policy summaries[]` + `X-Pagination`             |
| POST   | `/admin/approval-policies`             | Administrator                           | `201 policy draft DTO`                                |
| PATCH  | `/admin/approval-policies/:id/draft`   | Administrator                           | `200 policy draft DTO`                                |
| POST   | `/admin/approval-policies/:id/draft`   | Administrator                           | `201 policy draft DTO` — create next editable version |
| POST   | `/admin/approval-policies/:id/publish` | Administrator                           | `201 published policy DTO`                            |
| POST   | `/admin/approval-policies/:id/disable` | Administrator                           | `200 policy summary`; future cycles only              |
| POST   | `/admin/reviewer-assignments/search`   | Administrator                           | `200 assignment summaries[]` + `X-Pagination`         |
| POST   | `/admin/reviewer-assignments`          | Administrator                           | `201 assignment DTO`                                  |
| PATCH  | `/admin/reviewer-assignments/:id`      | Administrator                           | `200 assignment DTO`                                  |
| POST   | `/admin/budget-policies/search`        | Administrator                           | `200 budget policy summaries[]` + `X-Pagination`      |
| POST   | `/admin/budget-policies`               | Administrator                           | `201 budget policy DTO`                               |
| PATCH  | `/admin/budget-policies/:id`           | Administrator                           | `200 budget policy DTO`                               |
| POST   | `/delegations/search`                  | Eligible Reviewer, own delegation scope | `200 delegation DTO[]` + `X-Pagination`               |
| POST   | `/delegations`                         | Eligible Reviewer                       | `201 delegation DTO`                                  |
| POST   | `/delegations/:id/revoke`              | Delegation owner or authorized Admin    | `200 delegation DTO`                                  |

### 5.7 Comments and attachments

| Method | Route                                     | Audience                                         | Result                                                 |
| ------ | ----------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| GET    | `/requests/:id/comments`                  | Authorized current request participant           | `200 comment DTO[]` (bounded pagination)               |
| POST   | `/requests/:id/comments`                  | Authorized current request participant           | `201 comment DTO`                                      |
| GET    | `/requests/:id/attachments`               | Authorized current request participant           | `200 attachment metadata[]`                            |
| POST   | `/requests/:id/attachments`               | Owner only when DRAFT/RETURNED                   | `201 attachment metadata`, Elysia multipart            |
| DELETE | `/requests/:id/attachments/:attachmentId` | Owner only on working revision                   | `204 No Content`; submitted evidence cannot be deleted |
| GET    | `/attachments/:id/download`               | Authorized currently entitled requester/reviewer | Binary stream, safe download headers                   |

### 5.8 In-app notifications, SLA jobs and reports

| Method | Route                          | Audience                              | Result                                                        |
| ------ | ------------------------------ | ------------------------------------- | ------------------------------------------------------------- |
| POST   | `/notifications/search`        | Own authenticated inbox               | `200 Notification[]` + `X-Pagination`                         |
| PATCH  | `/notifications/:id/read`      | Own notification                      | `200 Notification`                                            |
| POST   | `/notifications/mark-all-read` | Own notification inbox                | `200 {updatedCount:number}`                                   |
| GET    | `/dashboard`                   | Authenticated                         | `200 role-appropriate dashboard DTO`                          |
| POST   | `/reports/requests/search`     | Authenticated authorized report scope | `200 report aggregate DTO[]` + `X-Pagination` when collection |
| POST   | `/reports/requests/pdf`        | Authenticated authorized report scope | `200 application/pdf` stream                                  |

**Internal-only:** `POST /internal/jobs/sla-process` is deliberately **outside `/api/v1`** and accepts a trusted machine/service identity, not user Bearer tokens or a public caller flag. `GET /healthz` may be unauthenticated liveness only; `GET /api/versions` is public. Swagger/OpenAPI is generated from the route/static Zod contracts and can be hidden or secured depending on deployment.

## 6. Endpoint-specific request/response contracts

### 6.1 Authentication and recovery

| Operation                                 | Request JSON                                             | Important output / rule                                                                                                          |
| ----------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`                     | `{email,password,displayName}`                           | `201 {user,recoveryCodes}`; Requester only, no department; codes shown once                                                      |
| `POST /auth/login`                        | `{email,password}`                                       | `200 {accessToken,user}` + refresh cookie; no partial session on failure                                                         |
| `POST /auth/refresh`                      | No JSON body; HttpOnly cookie                            | `200 {accessToken}` + new one-time refresh cookie; reuse revokes family                                                          |
| `POST /auth/logout`                       | Empty                                                    | `200 {message}`; revoke current refresh session, clear cookie; origin defense for cookie use                                     |
| `POST /auth/logout-all`                   | Empty                                                    | `200 {message}`; revoke all current-user sessions                                                                                |
| `GET /auth/me`                            | None                                                     | `200 UserSummary` read from current authoritative account/role status                                                            |
| `POST /auth/password/change`              | `{currentPassword,newPassword}`                          | `200 {message}`; invalidate old sessions                                                                                         |
| `POST /auth/recovery/password`            | `{email,recoveryCode,newPassword}`                       | Single-use code, password hash replacement, session revocation, audit; failures do not reveal account membership                 |
| `POST /auth/recovery/codes/regenerate`    | `{currentPassword}`                                      | `200 {recoveryCodes}` once; old codes invalidated                                                                                |
| `POST /admin/users/:id/recovery-grants`   | `{verificationAttestation,reason,expectedVersion}` + key | `201 {grantId,expiresAt,oneTimeCode}` once (replay `oneTimeCode:null`), audited; admin must have independently verified identity |
| `POST /auth/recovery/admin-grants/redeem` | `{email,oneTimeCode,newPassword}`                        | `200 {message}` after one-time grant consumption, password update and session revocation                                         |

- Register/login and recovery operations are rate-limited; password-recovery failures return indistinguishable safe responses/codes for unknown accounts vs invalid credentials, except that a successful reset is observable to the holder of valid proof.
- A request to issue a grant does **not** programmatically verify a claimant's identity; administrative off-system verification is required and attested. The grant must be handed over through a secure, separately authenticated channel. Do not log or email it automatically.
- Public registration never establishes trusted department assignment. `GET /auth/me` reflects administrator-assigned primary department only.
- Existing authentication records and active access-token checks must respond to disabled users, revoked sessions and changed roles. The public API has no feature allowing arbitrary impersonation or role selection at login.

### 6.2 User and department mutations

| Endpoint                    | Request JSON                                               | Constraints                                                                                                                |
| --------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `POST /users`               | `{email,displayName,initialPassword,roles?,departmentId?}` | Admin only; effective role creation restricted to approved values; no plaintext password on read; safe first-login process |
| `PATCH /users/:id`          | `{displayName?,isActive?,expectedVersion}`                 | Last active Admin cannot be disabled; role/session eligibility rechecked                                                   |
| `PUT /users/:id/roles`      | `{roles:UserRole[],expectedVersion}`                       | At least one role, only Admin may change; protect last active Admin; session invalidation on change                        |
| `PUT /users/:id/department` | `{departmentId:PublicId                                    | null,expectedVersion}`                                                                                                     | Department must be active; trusted membership audit; affects future submissions, not historical department snapshots |
| `POST /departments`         | `{code,name}`                                              | Unique stable code; creates active department                                                                              |
| `PATCH /departments/:id`    | `{name?,isActive?,expectedVersion}`                        | Do not silently rewrite in-flight requests or reviewer slots                                                               |

Admin account changes must not authorize administrative reading of unrelated confidential forms. All write actors and changed fields appear in the administrative audit stream.

### 6.3 Request-type configuration and dynamic values

Create admin draft:

```json
{
  "code": "PURCHASE",
  "name": { "en": "Purchase request", "th": "คำขอจัดซื้อ" },
  "description": { "en": "Request equipment or supplies" },
  "monetary": true,
  "supportsLineItems": true,
  "fields": [
    {
      "key": "category",
      "kind": "SELECT",
      "label": { "en": "Category" },
      "required": true,
      "constraints": {
        "options": [
          { "value": "IT", "label": { "en": "IT" } },
          { "value": "OTHER", "label": { "en": "Other" } }
        ]
      }
    },
    {
      "key": "reason",
      "kind": "TEXTAREA",
      "label": { "en": "Reason" },
      "required": false,
      "visibleWhen": {
        "all": [{ "fieldKey": "category", "operator": "EQ", "value": "OTHER" }]
      }
    }
  ]
}
```

- `POST /admin/request-types` creates an editable definition. `PATCH /admin/request-types/:id/draft` sends `{expectedVersion, ...permitted editable fields}`; immutable versions are never patched. After publishing, `POST /admin/request-types/:id/draft` creates a **new** editable version copied from the last published one, and publication increments the version number. Enable/disable endpoints take `{expectedVersion}` and do not erase historical versions.
- `POST /admin/request-types/:id/publish` sends `{expectedVersion}` + `Idempotency-Key`, validates the complete field/condition graph and returns the published immutable version. Concurrent or stale publication returns `409` with no new version.
- `POST /admin/request-types/:id/disable` sends `{expectedVersion}`; no new requests of that type are permitted, but existing returned requests may still edit/resubmit their pinned version as long as other current policies remain valid.
- `GET /request-types/:id` for an ordinary requester exposes only necessary active published metadata; admin endpoints can inspect unpublished drafts. Returned owners can retrieve their pinned historical definition through an authorized read context.
- A request draft includes `typeId` and the form version the user rendered. Before _first_ submission, the server requires the currently active published form version. A stale `formDefinitionVersionId` returns `409 FORM_DEFINITION_CHANGED`; the user must review/revalidate their saved draft against the latest version. It must **not** silently transform a submitted revision.

### 6.4 Request draft and submission

Create a DRAFT:

```json
{
  "typeId": "e9371b6c-9f4b-4b71-9216-6b40312ff18e",
  "formDefinitionVersionId": "bc12a61c-59bd-422e-9220-4ed3dba20db8",
  "title": "New laptops",
  "justification": "New equipment for onboarding",
  "priority": "MEDIUM",
  "fields": { "category": "IT" },
  "lineItems": [
    { "description": "Laptop", "quantity": "2", "unitAmount": "19000.00" }
  ]
}
```

**Priority:** the request must use an allowed priority literal (this example uses `MEDIUM`).

- `POST /requests` accepts draft fields, type version, title, justification, priority, user-editable line items `{description,quantity,unitAmount}` (the server generates item IDs and computes totals), and optional validated `monetaryAmount` **only** when a monetary request type does not use line items. `monetaryAmount` and `lineItems` cannot compete as monetary authorities. For nonmonetary types, both are omitted/empty as validated by configuration. Request owner and department are **derived** from identity/administrator membership; caller cannot set them.
- Incomplete drafts may be stored, but supplied values must be type-correct and applicable. Conditional hidden keys still cause `422` rather than being silently discarded.
- `PATCH /requests/:id/draft` takes `{expectedVersion, title?, justification?, priority?, fields?, lineItems?, monetaryAmount?, formDefinitionVersionId?}`; unspecified fields are preserved; `fields` replaces the whole dynamic field map when supplied so hiding/clearing works deterministically.
- **For DRAFT before first submission:** `formDefinitionVersionId` must be checked against the active published type at **submit**. **For RETURNED:** only the originally pinned version is accepted, independent of the type's later published versions.
- `POST /requests/:id/submit` body `{expectedVersion}` + `Idempotency-Key`; only DRAFT, mandatory trusted active department, full dynamic validation, authoritative amount/limit, current policy/slot eligibility. On success first assign number and create immutable revision/cycle/stages/slots/audit and `PENDING`.
- `POST /requests/:id/resubmit` body `{expectedVersion}` + `Idempotency-Key`; only RETURNED, pinned form definition, current policy and new approval cycle. Earlier votes never transfer.
- `POST /requests/:id/withdraw` body `{expectedVersion,reason?}` + `Idempotency-Key`; only owner of PENDING request; closes unfinished tasks, preserves past history.
- `GET /requests/:id/revisions` lists revisions only for the owner or currently authorized participant; `GET /requests/:id/revisions/:revisionId` allows an explicitly entitled former handler to read _only_ their handled revision. `GET .../timeline` returns typed, timestamped audit items with actor and scope-safe details. History reads must use bounded paging for potentially long collections.

### 6.5 Reviewer decisions, reassignment and bulk

Single decision request:

```json
{
  "decision": "REJECT",
  "reason": "Please provide a breakdown of expenses.",
  "expectedVersion": 3
}
```

`POST /approval-tasks/:id/decisions` requires `Idempotency-Key`, validates active actor/slot/stage/cycle/revision, and creates **one effective decision**. For `REJECT`/`RETURN`, `reason` is required. `APPROVE` may include an optional reason. It returns a direct `DecisionResult` with request/task versions and current request status.

- Each slot has at most one accepted vote. A delegate and original reviewer racing to vote acquire the same slot's transactional decision gate; **first valid committed vote wins**. The loser returns `409 APPROVAL_TASK_STALE` and creates no duplicate decision.
- All currently required stage slots must approve before advancing; one reject immediately rejects the cycle, one return closes it as returned; outstanding slots become non-actionable. In an unactivated second stage, `WAITING` tasks are not votable, but an authorized administrator may correct their future reviewer assignments before activation.
- `POST /approval-tasks/:id/reassign` body `{reviewerId,expectedVersion,reason}` + `Idempotency-Key`; admin only, slot must be undecided in a PENDING cycle (WAITING future stage or ACTIONABLE current stage), eligible candidate must not be requester, old reviewer loses authority immediately, due date and slot ID are preserved, audit appended. This is the authorized corrective assignment path if an originally eligible future-stage reviewer later becomes ineligible.
- `POST /approval-tasks/bulk-decisions` body `{items:[{taskId,decision,reason?,expectedVersion}]}` + `Idempotency-Key`; all items must be distinct. **Each** task is independently authorized and transacted; response contains ordered per-item `{taskId,ok,result? ,error?}`. `200` indicates the batch was processed, not that every task succeeded.
- **[IMPLEMENTATION DEFAULT — NOT FROZEN]** Maximum 25 distinct tasks per bulk call; reject duplicate task IDs in same request as `422 VALIDATION_ERROR`. A batch idempotency replay returns the original results without executing items again.

### 6.5.1 Admin-only task escalation discovery — API-UI-ADD-01 (v1.0.1)

`POST /api/v1/admin/approval-tasks/search` is an additive **Administrator-only** read. It enables the approved UI escalation queue and administrative correction of stale/future-stage assignments. It does **not** permit Admin to read request form contents, make decisions, or become a Reviewer.

**Request body:** Uses the standard §2.3 `POST /search` body with `pageNumber`, `pageSize`, `search`, `searchTerm`, and `orderBy`. Only the following searchable/sortable public fields are allowed:

| Public field         | Conditions                                                                    | Notes                                                                 |
| -------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `status`             | `EQUAL`, `NOTEQUAL`                                                           | Only `WAITING` or `ACTIONABLE`; no terminal tasks                     |
| `overdue`            | `EQUAL`                                                                       | Boolean; derived by server, not stored client assertion               |
| `stageNumber`        | `EQUAL`                                                                       | 1 or 2                                                                |
| `assignedReviewerId` | `EQUAL`                                                                       | Reviewer UUID; candidate reviewer scope still checked on reassignment |
| `dueAt`              | `GREATER`, `LESSER`, `GREATEROREQUAL`, `LESSEROREQUAL`, `ISNULL`, `ISNOTNULL` | UTC timestamp, server compares to current clock for overdue           |
| `requestNumber`      | `EQUAL`, `CONTAINS`, `STARTWITH`                                              | Safe routing label only, not title/body search                        |

Allowlisted `orderBy` values are `dueAt asc|desc`, `updatedAt asc|desc`, `createdAt asc|desc`, and `requestNumber asc|desc` with stable UUID tiebreaker. `searchTerm` may target only `requestNumber`. Unknown fields, unsupported sorting, hidden relations, and unbounded queries return `422 VALIDATION_ERROR`. Normal pagination maximums and CORS `X-Pagination` exposure apply.

**Default query behavior:** When no explicit filter is supplied, return `ACTIONABLE` approval slots with `overdue=true` in active `PENDING` cycles, sorted earliest `dueAt` first. To review future-stage correction work, Admin may explicitly filter for `WAITING`; such tasks usually have `dueAt=null` and **are not overdue**. Requests/cycles outside active `PENDING` are never returned. For active `ACTIONABLE`, `overdue = dueAt != null && now >= dueAt`; `WAITING` is always `false` regardless of malformed legacy deadlines.

**Success:** HTTP `200` returns a direct `AdminApprovalTaskSummary[]` and `X-Pagination`. Each row includes `id`, `requestId`, `requestNumber`, `stageNumber`, `status`, minimum `assignedReviewer`, `dueAt`, `overdue`, `version`, `createdAt`, and `updatedAt`. No success `data` wrapper.

**Security:** `401 UNAUTHENTICATED` for invalid/missing authentication, `403 FORBIDDEN` for non-Admin, and `422 VALIDATION_ERROR` for invalid filters. Access is audited as appropriate for security monitoring, but the endpoint must not append request-decision history or mutate records. The endpoint must never accept a caller-supplied permission/department override. Standard access token, active-account and server-verified role guards apply. The Admin list never grants access to `GET /requests/:id`, files/comments, nor `POST /approval-tasks/:id/decisions`.

**Mutation handoff:** The selected list item `id` and `version` are passed to the **existing** `POST /api/v1/approval-tasks/:id/reassign` with required `reason`, new eligible `reviewerId`, `expectedVersion` and `Idempotency-Key`; after success the client reruns the same admin search. The read endpoint does not introduce any new mutation or change the reassign authorization rules.

**Verification:** API tests must prove (i) non-Admin 403, (ii) Admin receives no private body/title/items/attachment metadata or direct detail authority, (iii) overdue calculation/boundary and WAITING default exclusion, (iv) pagination/search allowlists and no SQL injection, (v) concurrent/stale reassignment returns an appropriate conflict without partial changes.

### 6.6 Policy configuration, reviewer mappings and delegation

An approval-policy draft defines `code`, `priority`, `typeId`, optional `departmentId`, optional monetary amount bounds, and one or two stage definitions. Each stage has one or more required assignment slots and an `slaBusinessMinutes` override (or defaults to 480).

Example:

```json
{
  "code": "PURCHASE_STANDARD",
  "priority": 100,
  "typeId": "e9371b6c-9f4b-4b71-9216-6b40312ff18e",
  "departmentId": null,
  "minAmount": "0.00",
  "maxAmount": "10000.00",
  "stages": [
    {
      "stageNumber": 1,
      "slaBusinessMinutes": 480,
      "reviewerAssignmentKeys": ["DEPT_APPROVER"]
    },
    {
      "stageNumber": 2,
      "slaBusinessMinutes": 480,
      "reviewerAssignmentKeys": ["FINANCE_REVIEWER_A", "FINANCE_REVIEWER_B"]
    }
  ]
}
```

- Every stage has one or more reviewer slots. A stage with two slots means **parallel ALL** and cannot be configured as ANY/quorum.
- Budget ceiling policy (`POST /admin/budget-policies`, `PATCH /admin/budget-policies/:id`) contains `{typeId,departmentId?,maxAmount,isActive,expectedVersion?}`. Only one most-specific active hard-limit policy may resolve for a given type/department (department-specific overrides type-wide); an amount above the limit returns `422 BUDGET_LIMIT_EXCEEDED` before any approval cycle is created. Budget rules have no remaining-balance ledger. Threshold-based additional stages are expressed by conditional approval-policy amount bounds.
- Policy selection evaluates applicable published policies using `typeId`, current trusted department and authoritative amount. **Highest numeric `priority` wins**. If two or more applicable policies tie at the top, return `409 AMBIGUOUS_APPROVAL_POLICY` and **do not** create a pending cycle. No fallback to arbitrary creation order.
- If no published policy applies, a required reviewer is inactive, a slot cannot resolve, or a slot would self-approve, return `409 CONFIGURATION_INCOMPLETE`. Do not partially submit.
- Published policy versions and historical cycle assignments are immutable; admin edits affect future cycles and resubmissions only.
- Reviewer assignment mappings are administrator-managed, versioned/audited configuration. A policy stage references stable assignment keys; resolving a cycle snapshots actual eligible reviewer IDs/slots.
- `POST /admin/approval-policies` takes the policy draft; patch draft takes `{expectedVersion,...changes}`; `POST /admin/approval-policies/:id/draft` branches the latest published policy into a new editable version; publish takes `{expectedVersion}` + `Idempotency-Key`. Disable uses `{expectedVersion}` and affects only future policy resolution. Assignment create/update validates permitted departments and active eligible reviewers.
- `POST /delegations` takes `{delegateUserId,startsAt,endsAt,scope:{taskIds?:PublicId[]}}`; `POST /delegations/:id/revoke` requires `{expectedVersion}`. A reviewer delegates only their own eligible reviewer scope; the delegate must have Reviewer role, be active, not be the requester on any affected slot and be otherwise eligible.
- Delegation is effective only in the specified UTC time interval; the original reviewer **retains** decision authority during delegation. A delegate and original reviewer share exactly one slot vote; no duplicate reviewer task is created. Revocation or expiry stops the delegate's authority immediately.
- Timezone does not alter delegation UTC bounds. For task/slot changes, recheck expiry and permission at the moment the transaction claims the slot.

### 6.7 Private attachments, comments and notification inbox

- `POST /requests/:id/comments` body `{body:string}`; only current authorized participants may append. `GET .../comments` uses bounded pagination and returns direct comment DTOs. Comments never act as decisions.
- `POST /requests/:id/attachments` is `multipart/form-data` with **`file`** and optionally `workingRevisionId`. The backend verifies current Requester ownership, `DRAFT`/`RETURNED` state and matching working revision **before accepting/storage commit**, validates MIME and safe signature/type, then uploads through Elysia into private object storage. Metadata commit associates file with that working revision.
- Reviewers have **read-only** access to permitted request attachments; neither Reviewer nor Administrator role alone grants upload permission. After a revision is submitted, its files remain historically attributable and may not be overwritten or deleted through public APIs.
- Working-revision file removal, when exposed, must be owner-only and safe against concurrent submit; it is an auxiliary operation supporting attachment management, not permission to delete historical evidence.
- `GET /attachments/:id/download` applies current parent resource and attachment visibility checks, then streams binary from the private store. No permanent public link or direct unrestricted storage URL. Attachment storage keys do not appear in DTOs.
- `POST /notifications/search` uses the shared search grammar but returns **only the authenticated recipient's** inbox. `PATCH /notifications/:id/read` marks own message read; `POST /notifications/mark-all-read` marks own messages read. The client polls the persistent inbox (**[IMPLEMENTATION DEFAULT — NOT FROZEN]** every 45 seconds while visible).

### 6.8 SLA scheduler, dashboard, report and PDF

- A policy/stage specifies its duration in **business minutes** (`slaBusinessMinutes`). If omitted, default is **480 minutes (8 business hours)**. The business calendar is Mon–Fri 09:00–17:00 Asia/Bangkok, excluding weekends, with no holiday table.
- A slot's SLA clock starts when its stage becomes actionable. Reassignment/delegation **does not** reset or extend dueAt. Terminal tasks receive no pending reminders.
- `POST /internal/jobs/sla-process` authenticates a dedicated trusted service identity, processes due scheduled logical events, writes durable deduplicated notification/outbox records and returns internal counts. Administrator escalation **notifies** operators; it does not auto-reassign or auto-decide.
- `GET /dashboard` returns role-appropriate permitted counts/recent items derived from current database truth. No client-selected roles or unauthorized request IDs can broaden scope.
- `POST /reports/requests/search` accepts bounded status/type/department/date/report-dimension inputs and returns only authorized aggregate rows; when paged, it exposes `X-Pagination`. Admin reporting is limited to policy-safe aggregate metadata and does not expose private request bodies.
- `POST /reports/requests/pdf` uses **the same authorized filter schema and visibility restrictions** as corresponding reports, returning a streamed PDF file. No export of hidden or disallowed private detail rows; safe PDF filename and `Cache-Control: no-store`.

### 6.9 Additional public DTO and write-schema contracts

The following are **binding field groups**, expressed in TypeScript-like notation; all runtime schemas are Zod. Optional keys must be omitted or typed as documented rather than silently accepted as unrelated writable state.

```ts
type AuditTimelineItem = {
  id: PublicId;
  requestId: PublicId;
  cycleId: PublicId | null;
  revisionId: PublicId | null;
  eventType: string;
  actor: { id: PublicId; displayName: string } | null;
  occurredAt: UTCDateTime;
  note: string | null;
  metadata: Record<string, string | number | boolean | null>;
};
type CommentDTO = {
  id: PublicId;
  requestId: PublicId;
  author: { id: PublicId; displayName: string };
  body: string;
  createdAt: UTCDateTime;
};
type AttachmentDTO = {
  id: PublicId;
  requestId: PublicId;
  workingOrSubmittedRevisionId: PublicId;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  uploadedBy: PublicId;
  uploadedAt: UTCDateTime;
};
type DelegationDTO = {
  id: PublicId;
  originalReviewerId: PublicId;
  delegateUserId: PublicId;
  startsAt: UTCDateTime;
  endsAt: UTCDateTime;
  scope: { taskIds: PublicId[] };
  status: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "REVOKED";
  version: number;
};
type BudgetPolicyDTO = {
  id: PublicId;
  typeId: PublicId;
  departmentId: PublicId | null;
  maxAmount: DecimalString;
  isActive: boolean;
  version: number;
};
type AssignmentRuleDTO = {
  id: PublicId;
  key: string;
  departmentId: PublicId | null;
  reviewerUserIds: PublicId[];
  isActive: boolean;
  version: number;
};
type ApprovalPolicyDTO = {
  id: PublicId;
  code: string;
  versionId: PublicId | null;
  versionNumber: number | null;
  isPublished: boolean;
  isEnabled: boolean;
  priority: number;
  typeId: PublicId;
  departmentId: PublicId | null;
  minAmount: DecimalString | null;
  maxAmount: DecimalString | null;
  stages: Array<{
    stageNumber: 1 | 2;
    reviewerAssignmentKeys: string[];
    slaBusinessMinutes: number;
  }>;
  version: number;
};
type BulkDecisionItem = {
  taskId: PublicId;
  decision: DecisionType;
  reason?: string;
  expectedVersion: number;
};
type BulkDecisionResult = {
  results: Array<
    | { taskId: PublicId; ok: true; result: DecisionResult }
    | {
        taskId: PublicId;
        ok: false;
        error: { statusCode: number; code: string; message: string };
      }
  >;
  succeeded: number;
  failed: number;
};
type ReportAggregateRow = {
  dimension: "STATUS" | "TYPE" | "DEPARTMENT" | "OUTCOME";
  key: string;
  label: string;
  count: number;
};
type DashboardDTO = {
  roleContext: UserRole[];
  summary: {
    ownRequests: number;
    pendingReviews: number;
    returnedRequests: number;
    overdueTasks: number;
  };
  recentRequests: RequestSummary[];
  pendingTasks: ApprovalTask[];
  unreadNotifications: number;
  generatedAt: UTCDateTime;
};
```

A response may **omit fields not authorized for that viewer** (particularly dashboard/report projections and historical contexts); the shared DTO schemas should model explicit role-specific variants rather than returning unauthorized properties with placeholder values. `AuditTimelineItem.metadata` must be explicitly projected by event type and filtered for confidentiality, not blindly serialized from internal arbitrary JSON. Exact length limits for comments, names and files are implementation defaults.

### 6.10 Endpoint write-body matrix and required errors

| Endpoint or family                                 | Required request fields                                      | Required gate and conflict/error                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `POST /auth/register`                              | `email,password,displayName`                                 | Registration Requester-only, normalized unique email (`409` duplicate)                             |
| `POST /auth/login`                                 | `email,password`                                             | Unknown/invalid password indistinguishable (`401`)                                                 |
| `POST /auth/refresh`                               | Cookie only                                                  | Valid unspent refresh session, valid origin (`401` on invalid/reuse)                               |
| `POST /auth/password/change`                       | `currentPassword,newPassword`                                | Current authenticated password, revoke sessions                                                    |
| `POST /auth/recovery/password`                     | `email,recoveryCode,newPassword`                             | One-time verified code, rate limit, no account enumeration                                         |
| `POST /auth/recovery/codes/regenerate`             | `currentPassword`                                            | Auth + reauthentication; invalidate prior codes                                                    |
| `POST /admin/users/:id/recovery-grants`            | `verificationAttestation,reason,expectedVersion` + key       | Admin only, short-lived one-time grant, audit; never trust attestation as automatic identity proof |
| `POST /auth/recovery/admin-grants/redeem`          | `email,oneTimeCode,newPassword`                              | Valid unspent grant, revoke old sessions; generic public errors                                    |
| `PATCH /users/:id`                                 | `expectedVersion` and allowed profile/active fields          | Admin, last-active-admin guard, session revocation on disable                                      |
| `PUT /users/:id/roles`                             | `roles,expectedVersion`                                      | Admin, no self privilege escalation, no loss of final Admin                                        |
| `PUT /users/:id/department`                        | `departmentId,expectedVersion`                               | Admin, active department, no historical rewrite                                                    |
| `PATCH /departments/:id`                           | `expectedVersion` + allowed fields                           | Admin, no retroactive policy edits                                                                 |
| `POST /admin/request-types/:id/draft`              | `expectedVersion`                                            | Branch immutable published version into editable draft                                             |
| `PATCH /admin/request-types/:id/draft`             | `expectedVersion` + editable type fields                     | Admin, valid conditions; no mutation of published version                                          |
| `POST /admin/request-types/:id/publish`            | `expectedVersion` + key                                      | Admin, dependency graph valid; stale -> `409`                                                      |
| `POST /admin/request-types/:id/enable` / `disable` | `expectedVersion`                                            | Admin, past submitted revisions remain valid                                                       |
| `PATCH /requests/:id/draft`                        | `expectedVersion` + changed working fields                   | Owner, editable state, no stale update, hidden values rejected                                     |
| `POST /requests/:id/submit` / `resubmit`           | `expectedVersion` + key                                      | Owner, complete eligible policy; no ambiguity or self-approval                                     |
| `POST /requests/:id/withdraw`                      | `expectedVersion,reason?` + key                              | Owner, PENDING only, cancels unfinished tasks                                                      |
| `POST /approval-tasks/:id/decisions`               | `decision,reason?,expectedVersion` + key                     | Current slot, role/assignment/delegation, one vote, no self-approval                               |
| `POST /approval-tasks/:id/reassign`                | `reviewerId,reason,expectedVersion` + key                    | Admin, eligible undecided pending-cycle slot                                                       |
| `POST /approval-tasks/bulk-decisions`              | `items[{taskId,decision,reason?,expectedVersion}]` + key     | Item-wise independent commit; deterministic ordered results                                        |
| `POST /admin/approval-policies/:id/draft`          | `expectedVersion`                                            | Branch latest published immutable policy                                                           |
| `PATCH /admin/approval-policies/:id/draft`         | `expectedVersion` + editable fields                          | Admin, max 2 stages, ALL                                                                           |
| `POST /admin/approval-policies/:id/publish`        | `expectedVersion` + key                                      | Admin, immutable new version                                                                       |
| `POST /admin/approval-policies/:id/disable`        | `expectedVersion`                                            | Admin, only future cycles affected                                                                 |
| `POST /admin/reviewer-assignments`                 | `key,departmentId?,reviewerUserIds,isActive`                 | Admin; candidates active, reviewer-eligible                                                        |
| `PATCH /admin/reviewer-assignments/:id`            | `expectedVersion` + changed fields                           | Admin, affects future resolutions only                                                             |
| `POST /admin/budget-policies`                      | `typeId,departmentId?,maxAmount,isActive`                    | Admin, one effective hard limit per type/department scope                                          |
| `PATCH /admin/budget-policies/:id`                 | `expectedVersion` + changed fields                           | Admin, positive amount; preserve past accepted decisions                                           |
| `POST /delegations`                                | `delegateUserId,startsAt,endsAt,scope`                       | Eligible original reviewer, no self-delegation or request self-approval                            |
| `POST /delegations/:id/revoke`                     | `expectedVersion`                                            | Owner or authorized Admin; idempotently close delegation                                           |
| `POST /requests/:id/comments`                      | `body`                                                       | Auth current participant; no status change                                                         |
| `POST /requests/:id/attachments`                   | Multipart `file`, optional `workingRevisionId`               | Owner, DRAFT/RETURNED only, private storage                                                        |
| `PATCH /notifications/:id/read`                    | Empty body                                                   | Recipient only; repeated calls harmless                                                            |
| `POST /notifications/mark-all-read`                | Empty body                                                   | Recipient only; return `updatedCount`                                                              |
| `POST /reports/requests/search` / `pdf`            | Authorized report filter + dimension; no private body fields | Scope isolation; PDF and JSON use same visibility rules                                            |
| `POST /internal/jobs/sla-process`                  | Internal invocation identity, optional bounded batch size    | Machine authentication; event deduplication; forbidden on public credentials                       |

| `POST /admin/approval-tasks/search` | Standard bounded `POST /search` object; omitted filters default overdue actionable | Admin only; minimum routing metadata, no private request payload; `422` for invalid filter |

**Search endpoints:** All `POST /.../search` operations accept the §2.3 search object, but each declares its resource's field/condition allowlist in its Zod contract. A requester may not use an Administrator field merely because the key is syntactically valid. Admin-only searches remain admin-only even when used as lookups.

**Field error details:** For static properties, `details[].field` uses canonical `camelCase` paths (`lineItems[0].quantity`). For dynamic fields, use `fields.<fieldKey>`; for conditional nonapplicability, code `FORM_FIELD_NOT_APPLICABLE`. Do not expose another user's field names or values to a forbidden actor.

## 7. Transactions, lifecycle and race behavior

### 7.1 First submission/resubmission atomic boundary

1. Authenticate the requester and confirm trusted department, ownership, state and `expectedVersion`.
2. Resolve request type/version (first submit: current active published form; resubmit: original pinned form), and validate dynamic conditional values. Hidden/nonapplicable values cause **422**, not stripping.
3. Recompute line-item totals and the authoritative monetary amount; enforce policy-based hard limits.
4. Resolve the current published approval policy by explicit priority; reject an ambiguous top tie; require every slot across one or two stages to have an eligible, non-self reviewer.
5. Under appropriate locking/transaction boundaries, allocate request number on first submit; append immutable submitted revision, approval cycle, stages, slots and audit/outbox events; set request `PENDING` and update version.
6. Commit as one unit; only afterward deliver external notifications from a durable outbox/scheduler. On any error, preserve prior DRAFT/RETURNED state and do not leave a partial current cycle.

The first accepted submission **pins** its form-definition version and the department associated with that request. Resubmission preserves the request’s original trusted department and pinned form but resolves the **current** published policy for that request type, original department and newly calculated amount. The requester must still hold valid authority to act for that department; an unrelated current department membership must not silently retarget the historical request. Existing published definitions are never mutated.

### 7.2 Formal decision atomic boundary

1. Resolve the authenticated active actor and current role; load the selected task, slot, cycle, submitted revision and request with lock/version conditions.
2. Confirm the slot is actionable in the current stage and cycle; actor is original assigned reviewer or currently eligible unexpired delegate; forbid self-approval regardless of other roles.
3. Check `expectedVersion`, idempotency identity and reason validation. The same accepted key/body may replay; a conflicting/stale attempt returns 409.
4. Insert one effective immutable decision (database uniqueness on `slotId`) with actual `decidedBy`, acting-for reviewer and revision/cycle context; append audit.
5. On APPROVE, advance only after **ALL** current-stage slots approve. Activate stage 2 when applicable, starting its SLA. On final-stage completion, set request APPROVED. On REJECT/RETURN, terminate the cycle, set REJECTED/RETURNED and cancel outstanding tasks.
6. Commit the decision, status changes, audit/outbox and idempotency completion atomically. No duplicate vote/audit effect may result from a retry.

### 7.3 Assignment, delegation and bulk races

- Reassignment updates the undecided pending-cycle slot's eligible original reviewer and increments its version. Former reviewer loses current decision authority immediately; history retains old assignments. It preserves slot ID and `dueAt`.
- Existing delegated authority must be revalidated against the slot's **current** original reviewer on every action. Reassignment therefore invalidates delegations issued by the superseded reviewer for that slot, without granting any accidental authority to a new actor.
- A delegate and original reviewer race for the same slot and **first valid committed vote wins**. Database uniqueness and locking enforce one decision. Old tabs/expired grants fail even if the frontend still shows an Approve button.
- Bulk processing runs one transaction per task. It collects ordered outcomes and never turns an unauthorized task into an accepted vote. Retries of a completed batch return the same recorded results; independent task transitions remain safe.

### 7.4 Working attachments and historical integrity

- A working attachment is associated with the current DRAFT or RETURNED working revision only. An accepted submit/resubmit freezes associations as part of the immutable submitted revision snapshot.
- Upload and submit operations must be coordinated so no attachment can be attached to the wrong revision after a concurrent submit. Interrupted uploads have retry-safe cleanup without leaking private bytes.
- A previously submitted evidence file remains attributable to its submitted revision, even after a RETURNED revision is edited or resubmitted. Public deletion of historical submitted evidence is prohibited.

## 8. Error mapping and protocol examples

| Situation                                               |    HTTP | Machine `code`                              | Invariant                            |
| ------------------------------------------------------- | ------: | ------------------------------------------- | ------------------------------------ |
| Invalid credentials or missing bearer                   |     401 | `UNAUTHENTICATED`                           | No session/data leak                 |
| Wrong role on known permitted resource                  |     403 | `FORBIDDEN`                                 | No forbidden business effect         |
| Private request/task belongs to another user            |     404 | `NOT_FOUND`                                 | No cross-user existence leak         |
| Static or dynamic schema failure                        |     422 | `VALIDATION_ERROR`                          | No accepted mutation                 |
| Monetary hard ceiling exceeded                          |     422 | `BUDGET_LIMIT_EXCEEDED`                     | No pending cycle or ledger mutation  |
| Hidden/nonapplicable dynamic key submitted              |     422 | `FORM_FIELD_NOT_APPLICABLE`                 | Key not persisted as effective value |
| Current draft form version changed before first submit  |     409 | `FORM_DEFINITION_CHANGED`                   | No silent migration                  |
| No applicable policy or reviewer eligibility failure    |     409 | `CONFIGURATION_INCOMPLETE`                  | No pending cycle                     |
| Two highest-priority applicable policies tie            |     409 | `AMBIGUOUS_APPROVAL_POLICY`                 | No arbitrary policy choice           |
| Attempted self-approval                                 |     403 | `SELF_APPROVAL_FORBIDDEN`                   | Actor cannot bypass rule             |
| Task decision already taken or stale version/assignment |     409 | `APPROVAL_TASK_STALE`                       | One effective slot vote              |
| Illegal request state transition                        |     409 | `INVALID_REQUEST_TRANSITION`                | Prior state preserved                |
| Assignment/delegate candidate invalid                   |     422 | `ASSIGNMENT_NOT_ELIGIBLE`                   | No unauthorized reviewer             |
| Reusing key with different canonical payload            |     409 | `IDEMPOTENCY_CONFLICT`                      | No duplicate effect                  |
| Public recovery proof invalid/used/expired              |     400 | `RECOVERY_CREDENTIAL_INVALID`               | No account-existence disclosure      |
| Auth/recovery rate limit exceeded                       |     429 | `RATE_LIMITED`                              | Retry safe; optional Retry-After     |
| File size/type invalid                                  | 413/415 | `FILE_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | No unsafe file stored                |
| Unexpected failure                                      |     500 | `INTERNAL_ERROR`                            | No secret/SQL/stack exposure         |

### 8.1 Single decision example

```http
POST /api/v1/approval-tasks/0d61a685-c71a-4acb-95ca-c0f749fe4bc2/decisions
Authorization: Bearer <access-token>
Content-Type: application/json
Idempotency-Key: c5b3872f-8c8a-4edc-9436-049bac61a016

{"decision":"REJECT","reason":"Please attach the quotation.","expectedVersion":3}
```

```json
{
  "taskId": "0d61a685-c71a-4acb-95ca-c0f749fe4bc2",
  "slotId": "2b2578a7-bf82-4e26-aa7c-2d2aab305a4f",
  "decisionId": "0e1e860f-6a32-436d-aa71-9aa2f77ce56f",
  "decision": "REJECT",
  "decidedBy": "a5101337-285e-461a-9ea3-4e884390afc7",
  "decidedAt": "2026-11-05T05:40:00.000Z",
  "requestStatus": "REJECTED",
  "currentStageNumber": null,
  "requestVersion": 5,
  "taskVersion": 4
}
```

### 8.2 Configuration-error example

```json
{
  "statusCode": 409,
  "code": "CONFIGURATION_INCOMPLETE",
  "message": "The approval configuration has no eligible reviewer for a required stage.",
  "error": "Conflict",
  "requestId": "7bb91ef4-5982-405f-8bd5-61b5c3cf410b"
}
```

A failed submit does not create a `PENDING` request, approval cycle, decision, or orphaned notification.

## 9. API contract verification and acceptance

- **Authentication:** Session rotation/replay, logout/logout-all, account deactivation, trusted department assignment, public signup, recovery-code one-time use, admin grant issuance/redeem and rate limits.
- **Identity confidentiality:** Cross-user request access, role changes, historical reviewer limited views, admin minimum routing metadata, no enumeration via search/reports/download.
- **Type definitions:** Publish conditional AND/OR graphs; reject cycles/unknown fields/incompatible values; pin submitted versions; reject hidden keys; stale draft rebase; returned revisions remain on their original version.
- **Request lifecycle:** Draft, submit, return, edit, resubmit, withdraw, immutable snapshots, exact decimal line-item totals, unique numbers, invalid transitions and no orphan cycles.
- **Approval:** One/two stages; parallel ALL completion; actor/delegate race; concurrent approve/reject; reassignment cancels old authority; current policy re-resolution on resubmit; priority-tie refusal; no self-approval in all paths.
- **Bulk:** Mixed valid/forbidden/stale tasks with per-item outcomes; batch replay returns original outcome; no duplicates.
- **Notifications/SLA:** Business-minute math across Bangkok weekends, stage activation due date, reminder/escalation deduplication, admin notification only, client polling without relying on browser timers for the job.
- **Attachments:** Elysia multipart, requester-only editable state, MIME/size/signature checks, private storage/download auth, submitted-evidence retention, interrupted-upload cleanup.
- **Reports:** Owner/reviewer/admin projection constraints and identical visibility for summaries versus PDF exports.
- **Wire:** Shared Zod schemas, generated OpenAPI, header/CORS/Content-Disposition/error contract checks, race and failure-injection PostgreSQL tests.

Use the stable FR/BR/AC IDs in `specifications.md` to connect endpoint contract tests to product acceptance; no tests are reported as executed merely because this document exists.

**API-UI-ADD-01 acceptance:** `POST /admin/approval-tasks/search` is tested against Administrator vs Reviewer/Requester, active vs terminal cycles, dueAt boundary, actionable vs waiting status, scope-safe DTO field whitelist, pagination/sort/filter validation, and safe handoff into the unchanged reassignment endpoint. Its introduction changes no selected feature IDs or existing route behavior.

## 10. Implementation defaults — NOT FROZEN

| Area                   | Proposed default; can change via documented technical decision                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Access token           | JWT, 15-minute TTL, browser-memory storage                                                                                                   |
| Refresh token          | Opaque rotated token, 7-day TTL, hashed at rest, HttpOnly Secure cookie                                                                      |
| Password hashing       | Argon2id                                                                                                                                     |
| UUID form              | UUID v4 server-side                                                                                                                          |
| Pagination             | Page 1, size 20, max 100; 20 filters and 5 searchTerm fields                                                                                 |
| Conditional forms      | Max 50 fields, max 16 condition atoms, one AND/OR grouping layer                                                                             |
| Priority enum          | LOW / MEDIUM / HIGH / URGENT (v1 wire vocabulary; changing the set requires compatibility review)                                            |
| Currency               | THB, exact decimal strings; no conversion                                                                                                    |
| Request number         | `REQ-YYYY-NNNNNN`, unique transactional allocation                                                                                           |
| Bulk decisions         | 25 distinct tasks maximum                                                                                                                    |
| Attachments            | 10 MiB each; PDF/PNG/JPEG; 10 per editable revision                                                                                          |
| Recovery codes         | 10 random codes, hashed and shown once                                                                                                       |
| Admin recovery grant   | Single-use, 15-minute expiry; issuer's attestation audited                                                                                   |
| Default SLA            | 480 business minutes (8 hours), overrideable per stage/policy — **accepted API-13 behavior; not a freely changeable implementation default** |
| Notifications          | Poll inbox every ~45 seconds while visible                                                                                                   |
| Swagger/OpenAPI        | Generate from shared static Zod contracts and route bindings                                                                                 |
| Database operations    | Drizzle transactions, constraints and locks for races                                                                                        |
| Scheduled service auth | Private scheduler-to-API identity; no public job access                                                                                      |

A change to a default must not weaken authorization, version pinning, one-vote-per-slot, atomicity, privacy, or the other frozen requirements.

## 11. Freeze and compatibility statement

**This document is FROZEN as `api-specs.md` v1.0.1 (additive amendment to v1.0).** The binding route namespace, selected wire conventions, request/response semantics, error handling, security invariants and all 17 user decisions above form the API baseline. Remaining implementation defaults do **not** require new product approvals and may be documented in technical decision records.

- The `specifications.md` product baseline remains normative and is not overwritten by this API document.
- The frozen `ui-specs.md` v1.0 defines screens and feedback, but cannot redefine API authorization or status transitions.
- The sole v1.0 → v1.0.1 additive change is the approved admin-only routing search in §6.5.1. Previously accepted API contracts otherwise change only through an explicit versioned contract revision, compatibility impact review and updated tests.
- The reference Maintenance System provides structural inspiration only; its resource names and older auth path are not copied into this product's live wire surface.
- This document is a specification, not evidence of completed implementation, testing or deployment.

## 12. Complete feature-to-API traceability (54 selected features)

Feature-level FR/AC mapping is authoritative in `specifications.md`. This crosswalk shows where the selected capability is satisfied or, for UI-only features, why no special endpoint is required.

| Feature | API contract coverage                                               |
| ------- | ------------------------------------------------------------------- |
| `M01`   | Auth login                                                          |
| `M02`   | Logout/current user                                                 |
| `M03`   | Authorization matrix and guards                                     |
| `M04`   | Create and submit request                                           |
| `M05`   | Owner-scoped request search                                         |
| `M06`   | Request detail/status                                               |
| `M07`   | Approval plan resolution                                            |
| `M08`   | Approval task search                                                |
| `M09`   | Formal APPROVE decision                                             |
| `M10`   | Formal REJECT decision                                              |
| `M11`   | Formal RETURN decision                                              |
| `M12`   | State-transition guards                                             |
| `M13`   | Self-approval guard                                                 |
| `M14`   | Immutable decision/audit timeline                                   |
| `M15`   | Editable-state/version guards                                       |
| `M16`   | Reporting summaries                                                 |
| `M17`   | Zod/domain validation + atomic persistence                          |
| `R01`   | Persist draft                                                       |
| `R02`   | Edit RETURNED working revision                                      |
| `R03`   | Resubmit, new cycle                                                 |
| `R04`   | Immutable revision history                                          |
| `R05`   | Withdraw request                                                    |
| `R06`   | Server-generated request number                                     |
| `R07`   | Line-item amount schema/total                                       |
| `R08`   | Up to 2 stages                                                      |
| `R09`   | Conditional policy resolution                                       |
| `R10`   | Current approvers endpoint                                          |
| `R11`   | Cycle/revision/slot-aware decisions                                 |
| `R12`   | Request search                                                      |
| `R13`   | Status/date filters                                                 |
| `R14`   | Bounded sort/pagination                                             |
| `R15`   | Role-aware dashboard                                                |
| `R16`   | Timeline DTO                                                        |
| `R17`   | Stable API feedback/error states; UI owns visual layout             |
| `O01`   | Comments                                                            |
| `O02`   | Private multipart attachments                                       |
| `O03`   | Persistent notifications                                            |
| `O07`   | Reassignment                                                        |
| `O08`   | Time-limited delegation                                             |
| `O09`   | User administration                                                 |
| `O10`   | Reviewer assignment configuration                                   |
| `O11`   | Stage SLA deadlines                                                 |
| `O12`   | Scheduler reminders/admin escalation                                |
| `O13`   | Parallel ALL voting                                                 |
| `O15`   | Bulk decisions                                                      |
| `O16`   | Admin-configurable versioned request types                          |
| `O17`   | Priority validation                                                 |
| `O18`   | Amount ceilings/thresholds                                          |
| `O19`   | Department-based reviewer routing                                   |
| `O21`   | PDF report stream                                                   |
| `O24`   | UI-only theme; no API needed                                        |
| `O25`   | Localized definition labels and stable error codes; UI translations |
| `O26`   | Public registration                                                 |
| `O27`   | Recovery codes/admin-assisted grants                                |

**Amendment mapping:** The administrator escalation search is a narrow read surface supporting the existing escalation/reassignment capabilities; no new feature ID or change to the 54-feature scope.

**Coverage check:** M01–M17 (17), R01–R17 (17), and the 20 expressly selected O-series features appear once each.

## 13. Identity & Access feature records (additive)

The feature implementation details and supporting evidence plan for M01–M03 are maintained in [identity-access/sds.md](../features/identity-access/sds.md), [acceptance-criteria.md](../features/identity-access/acceptance-criteria.md), [sts.md](../features/identity-access/sts.md), and [dod.md](../features/identity-access/dod.md). Those records implement only the existing login, refresh, logout, logout-all, and current-user routes with the DTOs already defined in §§3.2, 5.1, and 6.1. They add no route, change no frozen method or DTO, and do not revise this document's version or status. All feature checks remain PLANNED / NOT RUN.
