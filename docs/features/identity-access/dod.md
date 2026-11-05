# Identity & Access Definition of Done

**Feature IDs:** M01, M02, M03

**Document state:** Prepared for documentation versioning before implementation.

**Current implementation status:** NOT RUN.

Version these four feature documents before beginning behavior implementation. Teammate review of the implementation and evidence is required for the implementation pull request.

## Contract and scope

- Feature SDS, numbered acceptance criteria, STS, and this DoD are versioned before behavior implementation.
- All IA-AC-01 through IA-AC-12 map to FR-001–FR-003, AC-001–AC-003, applicable BR/NFR IDs, and named test cases.
- API methods, routes, DTO fields, role literals, error behavior, cookie scope, and ownership boundaries match frozen specifications.
- No registration, recovery, password-change, business-resource API, dashboard metric, or downstream request/approval behavior is added to M01–M03.
- D-01 through D-05 and Sprint 1 ownership/evidence rules remain satisfied.

## Persistence and session security

- Drizzle migrations create constrained identity, role, trusted department membership, session-family, and refresh-token history tables.
- Empty-database migration and deterministic identity seed pass. A repeated seed is idempotent and contains only synthetic identities.
- Normalized unique email, exact role vocabulary, unique role membership, at-most-one primary department, token-hash uniqueness, family ownership, expiry, and revocation constraints are verified against PostgreSQL.
- Password records use the selected versioned Argon2id parameters. Tests cover valid and invalid passwords without storing plaintext.
- Access JWTs use jose v6, HS256-only verification, at least 32-byte signing secret, explicit issuer/audience, and 15-minute expiry.
- Refresh families expire absolutely after seven days. Raw refresh tokens exist only in the HttpOnly cookie response; PostgreSQL stores only SHA-256 hashes.
- Rotation, replay revocation, logout, logout-all, account/version changes, rollback, simultaneous refresh, refresh/logout races, and restart behavior pass with real PostgreSQL and independent connections where required.
- Protected calls load current active account, session-family version, current roles, and resource scope; an unavailable identity store fails closed.

## API and authorization

- Shared Zod request/response contracts pass IA-CT-01, including strict extra-key rejection, UUIDs, nullability, role union values, error DTOs, and no secret fields.
- Actual OpenAPI route/method/schema comparison covers only this feature's five API routes and reports no mismatch.
- IA-API-01–IA-API-09 pass through the real Elysia pipeline with success, credential failure, replay, logout, current identity, role changes, privacy masking, origins, throttling, and infrastructure failure cases.
- Role composition uses the union of current grants. No role selector or administrator private-read bypass exists.
- Foreign and absent private test fixtures return the same safe 404. Generic fixture routes exist only in tests and are absent from production route registration.
- Errors use the correct HTTP status and safe envelope, matching UUID request ID header, no-store for private data/errors, configured CORS/Origin/CSRF defenses, and no SQL, stack, token, or account-existence leak.

## Web and browser

- Access tokens and identity state remain memory-only. Refresh cookies remain HttpOnly and inaccessible to browser JavaScript.
- One in-flight refresh promise and at most one retry per original request are verified.
- Logout, account switch, role/account change, and session failure clear identity-scoped data, abort or discard stale requests, and prevent stale refresh installation.
- Login fields, validation/error states, show/hide password, keyboard flow, visible focus, accessible labels, and loading behavior pass.
- Protected shell and mobile drawer provide current account/logout, manage focus, and link only to routes present in this feature.
- IA-E2E-01–IA-E2E-05 pass using actual web/API processes and disposable PostgreSQL. Public SSR and hydration contain no bearer token, refresh secret, or private user data.

## Verification and delivery evidence

- Relevant contract, API, database, web, typecheck, lint, build, and browser checks pass on the actual implementation revision. Required failing or blocked checks are recorded accurately; no mock-only test substitutes for real database race, rollback, or restart evidence.
- Meaningful TDD red/green evidence is retained for behavior changes. Record exact command, working directory, runtime, environment, fixtures, database/browser, tested SHA, dirty state, expected and actual result, and sanitized artifact.
- Record all results against IA criterion/test IDs and update traceability without marking unrelated global features complete.
- Include the required concise AI-use declaration and have the teammate review the implementation and evidence.
- The user has authorized scoped documentation and implementation/fix commits. Push, pull request creation, merge, promotion, and publication require separate authorization.

## Status rule

Every check remains PLANNED / NOT RUN until executed and evidenced. This documentation change does not implement identity behavior and does not pass any acceptance criterion.
