# Request submission SDS — v1

Features M04, M15, M17, R06; FR-004/014/015/016; frozen product v1.0, API v1.0.1 §§2.6,3.3–3.4,6.3–6.4,6.6; UI v1.0 §8.2. This design precedes implementation. Branch: feature/2-request-submit-validation; planned reviewer @kittipichcha. No self-review or release authorization is implied.

## Boundaries and contracts

Presentation authenticates Bearer identity, rejects unknown static write keys with shared strict Zod schemas, and maps domain errors to the frozen envelope with field details. Application owns authorization, draft editing, definition validation and policy/eligibility resolution. Infrastructure implements transactional repositories; Domain imports no HTTP/SQL code. Shared metadata validators run in browser and server, with stored immutable metadata authoritative on the server.

POST /api/v1/requests requires a UUID Idempotency-Key and typeId/formDefinitionVersionId; optional title, justification, priority, fields, lineItems and monetaryAmount are draft content only. Returns 201 direct RequestDetail, Location, DRAFT and null number. PATCH /requests/:id/draft accepts expectedVersion and partial editable content; fields replaces its map. POST /requests/:id/submit accepts expectedVersion and UUID key; returns 200 direct PENDING RequestDetail. GET /requests/:id allows owners/current assigned reviewers only. Supporting POST /request-types/search is bounded and paginated; GET /request-types/:id exposes active published metadata. No admin configuration, lifecycle decision, upload or resume-list UI is added.

## Data and transactions

ADR: published field definitions and policy stage definitions use immutable JSONB versions, while requests, revisions, cycles, stages and slots have separate FK-linked rows. Working content is separate from submitted immutable rows. Request type/version identity is enforced by composite FK; submitted revisions and assigned request numbers are guarded against updates. Department is resolved from current active trusted primary membership at submission and retained as original department. Owner is never accepted from the client.

Draft creation and submission claim a durable actor/method/path/key record in the same transaction as their effects. Semantic JSON is canonicalized before SHA-256 hashing. PostgreSQL transaction advisory locks serialize claims; row locks serialize resource mutations. Completed replay returns the stored DTO before version checks. Rollback removes unaccepted claims and all partial effects. Sequence-backed human-readable numbers have DB uniqueness and immutable post-assignment values; gaps after rollback are allowed. First submit locks configuration used for resolution, validates all fields and exact monetary values, resolves highest priority policy with no tie, active nonself reviewer slots, then writes submitted revision, cycle, stage/slots, number, audit and unique outbox event atomically. Later lifecycle work owns decisions/resubmission while reusing these persistence boundaries.

## UI

Authenticated /requests/new fetches only after hydration. Reusable ManagedForm/FieldRenderer render metadata and map errors to step/field. Steps are Request Type, Basic Information, Request Details, optional Items, Review & Submit. Department is read-only. Incomplete Save Draft remains available after type selection; Back/Next preserve memory values. Submit requires confirmation, keeps unchanged retry keys, preserves safe inputs on failure, and shows only server-confirmed read-only outcome. Dynamic hidden values are excluded from outgoing data. Stale definitions require explicit review. Native dialog semantics/focus, responsive Tailwind and existing shadcn primitives are used.

Traceability: BR-019,023–030,033–034,045–047,053; AC-004,014–016. The seed supplies an active published type, department membership, policy version and one nonself reviewer slot. Later configuration and eligibility issues expand these seams.
