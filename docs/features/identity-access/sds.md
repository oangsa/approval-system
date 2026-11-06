# Identity & Access Feature SDS

**Feature IDs:** M01 Login, M02 Logout & Current User, M03 Role-based Access

**Requirements:** FR-001–FR-003, AC-001–AC-003

**Document state:** Versioned design with uncommitted foundation drafts; feature implementation remains incomplete.

**Implementation and test status:** Implemented and executed on 2026-11-06; suite-level evidence is recorded in [sts.md](./sts.md) §7b and [testing-verification.md](../../testing-verification.md). Cases without recorded evidence remain PLANNED / NOT RUN.

## 1. Purpose and authority

This feature supplies email/password login, current identity, persistent session lifecycle, and reusable backend access guards. It is the identity foundation for Issues #2–#4 and other downstream features.

Frozen product behavior remains in [specifications.md](../../specs/specifications.md). Wire behavior remains in [api-specs.md](../../specs/api-specs.md), and interaction behavior remains in [ui-specs.md](../../specs/ui-specs.md). [system-sds.md](../../specs/system-sds.md) defines shared architecture and logical boundaries. This SDS selects concrete identity implementation details within those contracts. It does not change frozen IDs, endpoints, DTOs, global status, or downstream ownership.

The feature has three boundaries:

| Module                    | Responsibility                                                                                                | Requirement     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------- |
| M01 Login                 | Verify an active account, issue an access token, and create a persistent refresh-session family.              | FR-001 / AC-001 |
| M02 Logout & Current User | Rotate refresh credentials, revoke one or all session families, and return current identity.                  | FR-002 / AC-002 |
| M03 Role-based Access     | Authenticate each protected request and authorize with current server-side account, role, and resource state. | FR-003 / AC-003 |

### In scope

- Login, refresh, current-user, logout, and logout-all endpoints only.
- User, role, trusted department membership, session-family, and refresh-token persistence needed by M01–M03.
- Shared authentication, role, ownership, and privacy guards; test-only generic resource fixtures prove these guards.
- An accessible login page, protected shell, safe dashboard placeholder, read-only account summary, unauthorized page, and role-aware navigation for real routes present in this feature.
- Real PostgreSQL, API, shared-contract, web, and browser evidence specified in [sts.md](./sts.md).

### Out of scope

- Registration, password recovery, recovery codes, password change, user administration, or department administration.
- Request, approval, comment, attachment, notification, report, or dashboard business APIs and journeys.
- A public or production generic resource fixture route. Downstream features own their resources and their own authorization integration.
- A client-side role selector, impersonation, or any permission decision based only on hidden controls.

## 2. Layer and trust boundaries

Keep the existing Clean Architecture direction: Presentation validates HTTP and maps errors; Application coordinates use cases through ports; Domain owns identity/session rules; Infrastructure implements persistence, password hashing, token signing, and configuration. Domain and Application do not import Elysia, Drizzle, HTTP, or database-driver code.

The browser is not an authorization authority. It sends a bearer access token and, for refresh, the browser-managed HttpOnly cookie. It never chooses the actor, role, department, ownership, or permission. The API derives these from the verified token and current database state on every protected call.

Use the real authentication middleware and shared schemas in API tests. Generic owner/foreign-resource probes exist only in test registration and must be absent from the production route registry.

## 3. API wire contract

All routes use the frozen /api/v1 prefix. JSON uses camelCase, direct DTOs, UUID public identifiers, and application/json; charset=utf-8. Unknown write properties are rejected. The table below is the complete route surface owned by this feature.

| Method and route             | Request                                                            | Success response                                                | Session effect                                                                               |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| POST /api/v1/auth/login      | LoginRequest: email, password                                      | 200 LoginResponse: accessToken, user; sets refresh cookie       | Creates one session family and its first refresh credential only on success.                 |
| POST /api/v1/auth/refresh    | No JSON body; refresh cookie required                              | 200 RefreshResponse: accessToken; sets successor refresh cookie | Consumes the presented single-use credential and inserts its successor atomically.           |
| GET /api/v1/auth/me          | Bearer access token                                                | 200 UserSummary                                                 | Reads current active account, current role union, and current primary department.            |
| POST /api/v1/auth/logout     | Empty request; authenticated actor or valid refresh-session holder | 200 MessageResponse: message; clears refresh cookie             | Revokes the current family.                                                                  |
| POST /api/v1/auth/logout-all | Empty request; bearer access token                                 | 200 MessageResponse: message                                    | Revokes all session families for the current account and invalidates existing bearer tokens. |

These shapes match api-specs.md §§3.2, 5.1, and 6.1. UserSummary is exactly id, displayName, email, roles, isActive, and department. Department is null or exactly id, code, name, and isActive. UserRole is exactly REQUESTER, REVIEWER, or ADMINISTRATOR. LoginResponse contains accessToken and user; RefreshResponse contains accessToken; MessageResponse contains message. No response exposes password hashes, refresh-token secrets, session hashes, or privileged internal metadata.

No registration, recovery, password-change, user-management, or department-management endpoint is added here. The global API directory remains authoritative for other feature owners.

## 4. Password and access-token design

Use Node.js 24 native crypto.argon2 through promisify, with Argon2id, parallelism 1, memory 19,456 KiB, two passes, a 32-byte derived tag, and a cryptographically random 16-byte salt. Persist a versioned encoded record containing the algorithm, parameter values, salt, and derived bytes. Verify derived bytes with timingSafeEqual after checking equal lengths. Never store or log a plaintext password.

Use jose v6 to sign and verify HS256 access JWTs. Require a signing secret of at least 32 bytes, explicit issuer and audience, and an explicit HS256-only verification allowlist. Access lifetime is 15 minutes. Include subject, session-family identifier, account authentication version, and standard issuer, audience, issued-at, and expiry claims. Do not include roles as authority-bearing claims.

Every protected request must:

1. Verify signature, configured issuer and audience, allowed algorithm, and expiry.
2. Load the referenced account and session family.
3. Require an active account, non-revoked and unexpired family, and matching current account authentication version.
4. Load current roles and relevant resource state from authoritative storage.
5. Apply the operation's role and ownership policy before returning protected data.

Fail closed when required account, session, or authorization state cannot be read.

## 5. Relational identity and session model

Use PostgreSQL with Drizzle migrations. Exact physical table names below are the feature's selected identity model; other business entities remain owned by their features.

| Relation               | Required data and constraints                                                                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| users                  | UUID id, normalized unique email, display name, versioned Argon2id password record, active flag, nonnegative authentication version, timestamps.                                                                                                                                                   |
| roles                  | The three approved role codes only.                                                                                                                                                                                                                                                                |
| user_roles             | User and role foreign keys; unique user/role pair.                                                                                                                                                                                                                                                 |
| departments            | UUID id, stable code, name, and active flag.                                                                                                                                                                                                                                                       |
| department_memberships | Trusted user/department relation, active and primary flags; database constraint allows at most one primary membership per user.                                                                                                                                                                    |
| session_families       | UUID id, user foreign key, creation time, absolute expiry, captured authentication version, and revocation time. A family belongs to exactly one account and expires no later than seven days after issuance.                                                                                      |
| refresh_tokens         | UUID id, family foreign key, unique SHA-256 hash of a cryptographically random opaque secret, creation/expiry, and consumed time. Family revocation invalidates its token history. Store each rotation as a new history row; never store its raw secret. Token expiry cannot exceed family expiry. |

The seven-day refresh lifetime is an absolute family lifetime, not a sliding extension. Each refresh secret is single-use. Use foreign keys and indexes for normalized email, role membership, family ownership/revocation/expiry, and unique token hashes. Seed roles and synthetic identities idempotently. Do not seed real user data or secrets.

Every protected request checks the current active flag and roles. Role removal does not require an authentication version increment. Logout-all increments authentication version and revokes existing families in the same transaction. A remaining role continues to authorize its own permitted operations after an unrelated role is removed; removed permissions stop immediately.

## 6. Refresh, revocation, and race behavior

Refresh tokens are high-entropy opaque values generated with the platform cryptographic random generator. Compute SHA-256 over the presented raw value to locate its stored history row. Never return the raw refresh value in JSON, logs, browser-readable storage, telemetry, or error details.

Use one PostgreSQL transaction and the same lock order for refresh, logout, and logout-all: lock the user row first, then the session-family row. For a new rotation, validate user, family, account version, token expiry, family expiry, and unused token state; mark the presented row consumed; insert exactly one successor row; commit; then return the access JWT and Set-Cookie response.

If a previously consumed token is presented, revoke the entire family and commit that revocation before returning 401. In a simultaneous refresh race, one request may initially receive a response before the other detects reuse. The permitted and required final assertion is that the family is revoked and no successor remains usable; do not assert that both responses always fail.

If a transaction fails before commit, consumption and successor insertion both roll back. Logout and refresh serialize using the same user-then-family lock order. Once logout commits, no refresh credential in that family remains usable. Logout-all revokes all current families and advances the account authentication version atomically, so both refresh and existing access tokens fail the current-state check.

An expired, malformed, unknown, revoked, consumed, or wrong-version refresh credential is rejected safely. Never convert a database/session-state failure into successful authentication.

## 7. Authorization and privacy

Roles compose by union: a multi-role user receives permissions independently granted by each current role. There is no role picker and no implicit administrator bypass. Every operation checks current roles and record ownership or explicit assignment/delegation in the backend.

| Operation or data                           | REQUESTER                                 | REVIEWER                                                                | ADMINISTRATOR                                                             |
| ------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Login, current identity, logout, logout-all | Own authenticated account only            | Own authenticated account only                                          | Own authenticated account only                                            |
| Generic private-resource fixture            | Own fixture only                          | Only when independently granted by the fixture policy                   | No private read by administrator role alone                               |
| Request ownership in future features        | Own records only                          | Only if also an authorized owner for that operation                     | Only if also an authorized owner; administrator role alone grants no read |
| Review action in future features            | No reviewer authority from requester role | Current assigned/delegated scope and eligibility only; no self-approval | Only if independently eligible as reviewer; no self-approval              |
| Administrative operation in future features | No                                        | No                                                                      | Only explicit administrative operation and minimum required metadata      |

A direct read of an absent or foreign private fixture returns the same 404 response. A known operation denial may return 403 only when revealing the resource's existence is safe. Administrator status never grants private request content, comment, attachment, or full-current-record access. The generic fixture proves guard behavior only; it is not an API or production feature.

## 8. Browser identity and authenticated shell

Keep the access token in one client module's memory only. Never put access tokens, refresh tokens, or authenticated identity data in localStorage, sessionStorage, public HTML, analytics, or logs. The browser manages the refresh cookie; JavaScript cannot read it.

The shared web client uses one in-flight refresh promise for concurrent expired-token responses and retries each request at most once. Capture the identity generation before each refresh. Login, logout, account switch, role/account change, or session failure changes that generation, aborts old identity requests, clears user-scoped caches, and prevents stale responses or refreshes from installing state. A stale refresh response must not restore an old account's token.

Do not serialize authenticated user data from server loaders or public SSR. Protected pages bootstrap identity through the client API after hydration. On failed refresh, clear private state and route to login with a safe return path.

| Frontend route  | Feature behavior                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| /auth/login     | Accessible email/password sign-in; generic credential error; busy state; show/hide password.                                                  |
| /dashboard      | Safe placeholder only; no dashboard business API or metrics.                                                                                  |
| /settings       | Read-only current account summary from /auth/me plus logout controls.                                                                         |
| /unauthorized   | Accessible explanation for an authenticated actor denied a known operation.                                                                   |
| Protected shell | Current identity, account/logout menu, role-aware links only to shipped routes, desktop collapsible sidebar, and focus-managed mobile drawer. |

Do not add navigation links to nonexistent request, review, notification, report, or administration pages. Keep shell controls and visual behavior aligned with the frozen UI contract. Use Tailwind and shadcn/ui primitives, keyboard-operable controls, associated field errors, visible focus, responsive layout, and accessible drawer focus management.

## 9. Cookies, origins, and configuration

Set the opaque refresh value only as a cookie scoped to /api/v1/auth. Use HttpOnly, SameSite=Strict, host-only scope, and Secure in production. The cookie lifetime cannot exceed the seven-day absolute family expiry. Clear it on logout with the same path and security attributes. Do not expose it to browser code.

Require explicit configured issuer, audience, signing secret, allowed web origins, and environment mode. Do not ship hardcoded production secrets or permissive fallback configuration. Cookie-authenticated endpoints enforce the frozen Origin/CSRF defense. CORS allows only explicitly configured origins, never wildcard with credentials, and exposes only the required response headers such as X-Request-Id.

## 10. Errors, headers, and logging

Use the shared error envelope: actual statusCode, stable code, sanitized message, stable error category, UUID requestId, and optional safe details. X-Request-Id mirrors requestId. Private identity responses and errors use Cache-Control: no-store. Never expose SQL, stack traces, password/token material, hash records, or private existence details.

| Condition                                                                         | Required result                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Malformed JSON                                                                    | 400 BAD_REQUEST                                                                      |
| Well-formed request with invalid schema or extra write key                        | 422 VALIDATION_ERROR                                                                 |
| Unknown email, wrong password, disabled account, invalid/expired/replayed session | Indistinguishable safe 401 UNAUTHENTICATED response for credential/session failures. |
| Known role denial where existence disclosure is safe                              | 403 FORBIDDEN                                                                        |
| Missing versus foreign private fixture                                            | Indistinguishable 404 NOT_FOUND                                                      |
| Login throttling                                                                  | 429 RATE_LIMITED with generic safe messaging and no account enumeration.             |
| Required identity/session infrastructure unavailable                              | 503 SERVICE_UNAVAILABLE; fail closed.                                                |
| Unexpected failure                                                                | Sanitized 500 INTERNAL_ERROR.                                                        |

Apply rate limits to login. Keep security telemetry structured and redacted. Never record passwords, raw cookies, bearer tokens, refresh hashes, or private resource content.

## 11. Traceability and status

The numbered child acceptance criteria are in [acceptance-criteria.md](./acceptance-criteria.md), and the executable test design is in [sts.md](./sts.md). The implementation completion gate is in [dod.md](./dod.md). The narrow additions to shared traceability and specification documents must preserve all frozen IDs and global PLANNED / NOT RUN statements.

The implementation is committed on `feature/1-identity-auth-access`: shared contracts, domain and application use cases, persistence with a reviewed migration and deterministic seed, security primitives, auth routes and guards, the authenticated frontend transport, login and protected shell, and CI/browser verification. The STS records the executed evidence in section 7b. Downstream business-resource behavior, the delayed-response half of IA-E2E-03, and the browser throttle/network-interruption portion of IA-E2E-04 remain PLANNED / NOT RUN. The contracts in this SDS continue to describe the implemented feature behavior.
