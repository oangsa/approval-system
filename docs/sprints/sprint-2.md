# CPE334 Theme 5 — Sprint 2 Feature List

> **Planning draft — not frozen.** This is a proposed allocation of the user-selected **54 capabilities** (M01–M17, R01–R17, and 20 selected O-series). IDs are project planning labels, **not instructor-issued requirement IDs**. No feature is deleted or duplicated between sprints.
>
> **Status:** All listed features are **PLANNED**, none is claimed implemented or tested. Architecture choices are already finalized separately; this file does not change them.

> **D-01 — approved engineering amendment (2026-11-05):** [Owner decision, Issue #1](https://github.com/oangsa/approval-system/issues/1) replaces the earlier Bun runtime/toolchain with Node.js 24, npm Workspaces, one root `package-lock.json`, Elysia through `@elysia/node`, TypeScript, Vitest for unit/API/contract/real-PostgreSQL integration tests, and Playwright for browser E2E. React Router 7, shadcn/ui + Tailwind CSS, PostgreSQL + Drizzle ORM and shared Zod contracts remain. This amendment changes no feature scope, FR/BR/AC/test identifiers, product/API/UI behavior, ownership or effort estimates; baseline contract versions remain unchanged. It records engineering alignment only, not implementation or passing verification.

## Sprint 2: Core Workflow Expansion

- **Checkpoint:** 29 November 2026 — Deliverable 2 (70 points)
- **Sprint goal:** Working, reviewed expansion: draft/return/edit/resubmit; revision-safe conditional/sequential/parallel approvals; multiple typed requests, routing, budget ceiling and basic reporting.
- **Required outcome:** All Sprint 2 items complete and verified, original Sprint 1 journey still passing, GCP deployment via the established delivery pipeline.
- **Features assigned:** 20 of 54

## Feature inventory (each ID belongs to one sprint only)

### Request Management (5)

| ID    | Feature                    | Target behavior / compact implementation                                                          |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `R01` | **Save as Draft**          | Save an unfinished request without creating an approval task.                                     |
| `R05` | **Withdraw Request**       | Allow an owner to withdraw an eligible pending request; preserve audit history.                   |
| `R07` | **Request Line Items**     | Support multiple line items, positive quantities, validated values, and server-calculated totals. |
| `O16` | **Multiple Request Types** | Support multiple request types sharing one lifecycle with type-specific Zod schemas.              |
| `O17` | **Priority Levels**        | Capture and display request priority with validation; document whether priority changes routing.  |

### Assignment & Policy (5)

| ID    | Feature                            | Target behavior / compact implementation                                                       |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `R09` | **Conditional Approval Rules**     | Select workflow route/stages based on typed request attributes and policy.                     |
| `R10` | **Current Approver Display**       | Show current review stage and assignee(s) from authorized workflow data.                       |
| `O10` | **Reviewer Assignment Management** | Authorized staff configure department/stage reviewer mappings.                                 |
| `O18` | **Budget Limit Validation**        | Enforce a documented budget ceiling/policy on eligible requests; no accounting ledger assumed. |
| `O19` | **Department-based Routing**       | Resolve initial reviewer(s) by department and selected workflow policy.                        |

### Approval Workflow (4)

| ID    | Feature                      | Target behavior / compact implementation                                                              |
| ----- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `M11` | **Return Request**           | Assigned reviewer returns a request for changes with a required reason.                               |
| `R08` | **Two-stage Approval**       | Support a sequential two-stage approval route where required by policy.                               |
| `R11` | **Revision-aware Decisions** | Bind approvals to request revision + approval cycle, making stale decisions invalid.                  |
| `O13` | **Parallel Approval**        | Support multiple reviewers within a stage using a defined completion policy (initial candidate: ALL). |

### Revision & Collaboration (4)

| ID    | Feature                    | Target behavior / compact implementation                                |
| ----- | -------------------------- | ----------------------------------------------------------------------- |
| `R02` | **Edit Returned Request**  | Let the requester modify only their returned request.                   |
| `R03` | **Resubmit Request**       | Submit an edited returned request into a fresh authorized review cycle. |
| `R04` | **Revision History**       | Retain immutable submitted revisions and their linked decisions.        |
| `R16` | **Visual Status Timeline** | Render status/decision/revision events in an accessible chronology.     |

### Search & Experience (1)

| ID    | Feature                  | Target behavior / compact implementation                                     |
| ----- | ------------------------ | ---------------------------------------------------------------------------- |
| `R15` | **Role-based Dashboard** | Expose requester and reviewer summaries/actions based on role and ownership. |

### Reporting (1)

| ID    | Feature             | Target behavior / compact implementation                            |
| ----- | ------------------- | ------------------------------------------------------------------- |
| `M16` | **Basic Reporting** | Summarize authorized request counts by status and decision outcome. |

## Dependency bundles (implement as cohesive vertical slices)

| Bundle                       | Related IDs                                     | Required predecessor / implementation intent                                                                                                |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft + correction lifecycle | `R01`, `M11`, `R02`, `R03`, `R04`, `R05`, `R11` | Sprint 1 requests/decisions/history; immutable snapshots and revision-aware approval cycles.                                                |
| Typed request forms          | `R07`, `O16`, `O17`                             | Shared Zod discriminated validation per request type, server-calculated totals for applicable line items.                                   |
| Workflow policies & stages   | `R08`, `R09`, `O13`, `R10`                      | Single approval engine with sequential stages and parallel reviewer decisions; define per-stage ALL/ANY policy before coding.               |
| Reviewer configuration       | `O10`, `O19`                                    | Seeded departments/users; restricted administrative assignment configuration and deterministic routing.                                     |
| Budget rule                  | `O18`                                           | Request type/amount + documented policy. **Proposal:** enforce ceiling/policy only; a live budget ledger is a separate complexity decision. |
| Presentation + summary       | `R15`, `R16`, `M16`                             | Reuse role-scoped list/summary/history data and a common timeline component.                                                                |

## Integration / acceptance journeys

1. Save draft -> edit draft -> submit -> assigned reviewer returns with reason -> owner edits -> resubmits -> new immutable revision -> prior decisions remain visible.
2. Owner withdraws an eligible request; past events persist; later attempts to approve withdrawn request are blocked.
3. High-value/conditional request passes stage 1 but **does not become final** until required stage 2 decisions finish.
4. Parallel stage remains pending until its configured condition is met; duplicate/concurrent decisions cannot bypass it.
5. Changing amount/type on resubmission recomputes the applicable workflow and invalidates decisions from the earlier approval cycle.
6. Department mapping changes apply according to a documented active-request policy; self-approval remains blocked.
7. Requester/reviewer dashboard and basic status summary reflect actual persisted data; no unauthorized records are counted/displayed.
8. Existing Sprint 1 login, submit, assigned reviewer, rejection, audit, and ownership tests stay green.

## Critical specification decisions (not frozen)

- **Multi-type scope:** suggested example types are Purchase, Travel, Reimbursement. The team must choose the actual types and their required fields; `O16` is not silently narrowed to a type dropdown alone.
- **Parallel policy:** initial recommendation `ALL` decisions required within a stage; decide whether any rejection terminates the stage immediately. Record decisions explicitly.
- **Review assignment:** `O10` requires a privileged management operation; seeded admins may exist before the `O09` general user-management UI is delivered in Sprint 3.
- **Budget:** `O18` must have a testable threshold/policy; if actual remaining-balance accounting is expected, revise the estimate/plan.
- **Audit:** return/resubmission/reassignment policies must preserve decision evidence with actor, reason, revision, stage and timestamp.

## Deliverable 2 evidence (due 29 Nov)

- **Sprint 2 must be completed, reviewed, integrated and tested**; report feature-by-feature AC/test/result/release.
- All Sprint 3 feature contracts and planned AC/STS must be present by the deadline; a meaningful Sprint 3 rule/workflow must already be implemented and tested (suggested: `O07` reviewer reassignment with authorization + audit).
- An integrated release candidate on `main` must be deployed through the CI/CD pipeline to GCP; retain regression and post-deployment persistence evidence.

## Delivery rules (course requirements)

- The team consists of two students; use the **same GitHub monorepo** throughout the course.
- Keep one root `AGENTS.md`, npm Workspaces, React Router 7 hybrid SSR/frontend, Elysia on Node.js 24 through `@elysia/node` backend, PostgreSQL + Drizzle, and one shared `packages/contracts` using Zod.
- **Elysia must enforce authentication, permissions, ownership and workflow rules**; a hidden frontend button never replaces authorization.
- Before implementing each feature, version its feature SDS, UI/API/data contract, numbered acceptance criteria (AC), test specifications (STS) and DoD. Maintain requirement -> feature -> sprint -> AC -> test traceability.
- Use GitHub Issues/project board, feature branches off sprint staging, teammate-reviewed PRs, integration/release PR to `main`, tag/commit, meaningful test evidence and a brief AI-use declaration.
- Use automated unit tests for policy rules, API+real DB integration tests for persistence/permissions, selected critical UI/E2E flows, and meaningful TDD red/green evidence.
- These are **proposed allocations**, not a frozen scope or evidence of implementation. Completion status for every listed feature is **PLANNED / NOT TESTED** until work and checks actually run.

## Coverage / review

**Assigned IDs (20):** `M11`, `M16`, `R01`, `R02`, `R03`, `R04`, `R05`, `R07`, `R08`, `R09`, `R10`, `R11`, `R15`, `R16`, `O10`, `O13`, `O16`, `O17`, `O18`, `O19`

**Feature status:** planned; no implementation or verification asserted.
