# CPE334 Theme 5 — Sprint 1 Feature List

> **Planning draft — not frozen.** This is a proposed allocation of the user-selected **54 capabilities** (M01–M17, R01–R17, and 20 selected O-series). IDs are project planning labels, **not instructor-issued requirement IDs**. No feature is deleted or duplicated between sprints.
>
> **Status:** All listed features are **PLANNED**, none is claimed implemented or tested. Architecture choices are already finalized separately; this file does not change them.

> **D-01 — approved engineering amendment (2026-11-05):** [Owner decision, Issue #1](https://github.com/oangsa/approval-system/issues/1) replaces the earlier Bun runtime/toolchain with Node.js 24, npm Workspaces, one root `package-lock.json`, Elysia through `@elysia/node`, TypeScript, Vitest for unit/API/contract/real-PostgreSQL integration tests, and Playwright for browser E2E. React Router 7, shadcn/ui + Tailwind CSS, PostgreSQL + Drizzle ORM and shared Zod contracts remain. This amendment changes no feature scope, FR/BR/AC/test identifiers, product/API/UI behavior, ownership or effort estimates; baseline contract versions remain unchanged. It records engineering alignment only, not implementation or passing verification.

## Sprint 1: Working Vertical Slice

- **Checkpoint:** 8 November 2026 — Deliverable 1 (80 points)
- **Sprint goal:** A runnable, tested local release: requester submits -> assigned reviewer approves/rejects -> requester retrieves persisted status/history.
- **Required outcome:** Full-stack UI/API/PostgreSQL vertical slice, email/password authentication, server-side role/ownership control, meaningful rule rejection, recorded decision and audit history.
- **Features assigned:** 16 of 54

## Feature inventory (each ID belongs to one sprint only)

### Identity & Access (3)

| ID    | Feature                   | Target behavior / compact implementation                                                             |
| ----- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `M01` | **Login**                 | Authenticate using email + application password; reject invalid credentials.                         |
| `M02` | **Logout & Current User** | Expose current identity; revoke/rotate sessions according to the agreed JWT + refresh-cookie design. |
| `M03` | **Role-based Access**     | Enforce requester/reviewer permissions and record ownership in Elysia, not only in UI.               |

### Request Management (6)

| ID    | Feature                      | Target behavior / compact implementation                                                       |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `M04` | **Create & Submit Request**  | Create a valid request, submit it into the review workflow, persist the result.                |
| `M05` | **My Requests**              | List requests owned by the authenticated requester without leaking other users’ records.       |
| `M06` | **Request Detail & Status**  | Show persisted request details and current status subject to authorization.                    |
| `M15` | **Editing Policy**           | Define and enforce when a request may be edited; in Sprint 1 submitted requests are immutable. |
| `M17` | **Validation & Persistence** | Validate input, return safe errors, enforce database constraints, and survive restart.         |
| `R06` | **Request Number**           | Generate a unique human-readable request identifier with server-side collision protection.     |

### Assignment & Policy (2)

| ID    | Feature                      | Target behavior / compact implementation                                                                     |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `M07` | **Reviewer Assignment**      | Resolve a valid assigned reviewer for each submitted request (seeded configuration is acceptable initially). |
| `M13` | **Self-approval Prevention** | Never permit a requester to approve their own request, including via assignment changes.                     |

### Approval Workflow (4)

| ID    | Feature                    | Target behavior / compact implementation                                            |
| ----- | -------------------------- | ----------------------------------------------------------------------------------- |
| `M08` | **Review Queue**           | List only currently actionable requests assigned to the authenticated reviewer.     |
| `M09` | **Approve Request**        | Assigned reviewer approves a pending request, persisting a decision and transition. |
| `M10` | **Reject Request**         | Assigned reviewer rejects a pending request with a recorded reason.                 |
| `M12` | **State Transition Rules** | Reject invalid, duplicate, out-of-order, or unauthorized state transitions.         |

### Revision & Collaboration (1)

| ID    | Feature                       | Target behavior / compact implementation                                             |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `M14` | **Decision & Status History** | Persist ordered, auditable status/decision events without rewriting prior decisions. |

## Slice boundary and design constraints

1. **Minimal request context:** start with one request type (e.g., Purchase) and simple validated fields. Support additional type-specific forms and line items in Sprint 2; define extensible contracts now so existing data migrates safely.
2. **Assigned reviewer:** use seeded reviewer/department mappings, not an admin assignment UI yet. Ensure assigned reviewer differs from requester, including when the user has multiple roles.
3. **One-step approval only:** a one-step review is acceptable for the Sprint 1 slice. Do **not** silently approve multi-stage/parallel-required requests until that workflow exists; disable/reject unsupported routes with clear errors.
4. **Editing rule:** once submitted, content is read-only. Save-as-draft and returned-request editing are implemented later, but the rule must already be enforced at API/database boundaries.
5. **Session architecture:** email + hashed application password; access JWT, rotating refresh token in HttpOnly cookie, explicit logout/revocation. The security implementation must be real, not a UI-only role selector.
6. **History:** decision + status + actor + timestamp must be stored durably in the same transaction as the status change.

## Minimum review/demo journeys

1. Valid login -> submit request -> load its detail -> assigned reviewer login -> approve -> reload as requester -> see persisted approved status/history.
2. Assigned reviewer rejects another request with a reason; history records the rejection.
3. Unassigned reviewer, self-reviewer or requester attempts decision -> rejected by API; no state change.
4. Invalid or repeated transition -> rejected; no duplicate history/decision.
5. Requester A attempts to read requester B's protected detail -> forbidden/hidden by API.
6. Invalid password and unauthenticated request -> rejected; logout invalidates the refresh session.
7. Build/tests run on the exact submitted commit; at least one meaningful failing-then-passing test change is retained.

## Sprint 1 verification focus

- `AUTH`: valid/invalid login; current-user; revoked/rotated refresh; logout; protected API access.
- `OWNERSHIP`: requester records isolated; reviewer queue only assigned items; forbidden role access; self-approval.
- `STATE`: submit -> approve/reject; invalid/repeated transitions; decision reason; persistence and atomic history.
- `DATA`: valid/invalid request inputs; unique request numbers; restart/reload persistence; real database integration.
- `E2E`: critical requester-to-reviewer-to-requester journey in running web/API/database.

## Deliverable 1 evidence

One **self-contained PDF** with complete baseline SRS, feature inventory/traceability, system SDS, three-sprint plan, Sprint 1 contracts/STS/DoD and actual running/test/PR evidence (Parts A-F). GCP deployment is not required for this checkpoint.

## Delivery rules (course requirements)

- The team consists of two students; use the **same GitHub monorepo** throughout the course.
- Keep one root `AGENTS.md`, npm Workspaces, React Router 7 hybrid SSR/frontend, Elysia on Node.js 24 through `@elysia/node` backend, PostgreSQL + Drizzle, and one shared `packages/contracts` using Zod.
- **Elysia must enforce authentication, permissions, ownership and workflow rules**; a hidden frontend button never replaces authorization.
- Before implementing each feature, version its feature SDS, UI/API/data contract, numbered acceptance criteria (AC), test specifications (STS) and DoD. Maintain requirement -> feature -> sprint -> AC -> test traceability.
- Use GitHub Issues/project board, feature branches off sprint staging, teammate-reviewed PRs, integration/release PR to `main`, tag/commit, meaningful test evidence and a brief AI-use declaration.
- Use automated unit tests for policy rules, API+real DB integration tests for persistence/permissions, selected critical UI/E2E flows, and meaningful TDD red/green evidence.
- These are **proposed allocations**, not a frozen scope or evidence of implementation. Completion status for every listed feature is **PLANNED / NOT TESTED** until work and checks actually run.

## Coverage / review

**Assigned IDs (16):** `M01`, `M02`, `M03`, `M04`, `M05`, `M06`, `M07`, `M08`, `M09`, `M10`, `M12`, `M13`, `M14`, `M15`, `M17`, `R06`

**Feature status:** planned; no implementation or verification asserted.
