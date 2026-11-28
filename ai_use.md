# AI-use declaration

**Project:** Workflow and Approval System (`oangsa/approval-system`)
**Last updated:** 2026-11-12

## Tooling used

- **GitHub Copilot** (agent/assistant mode) was used throughout Sprint 1 work on Issue #1 (Authentication & Role Access) to draft planning documents, implementation code, automated tests, and documentation.
- Conventional editor assistance (completion, refactoring suggestions) was used for routine edits.

## How it was used

- Requirements were read from the repository's frozen specifications (`docs/specs/`), `AGENTS.md`, and issue #1 before any generation.
- Generated changes were reviewed line by line, executed in this workspace, and verified by the project's own commands (typecheck, lint, Vitest unit/API/contract suites, real-PostgreSQL integration suite, Playwright browser suite). Actual results are recorded in [docs/testing-verification.md](docs/testing-verification.md).
- Security-critical behavior (refresh rotation, revocation, authorization guards) was implemented from the reviewed design in `docs/features/identity-access/sds.md` and is covered by real-database tests, not mock-only assertions.

## Boundaries

- No generated content was accepted without execution and test evidence.
- No frozen specification, acceptance criterion, or test identifier was altered to accommodate generated code.
- AI output did not authorize commits, pushes, pull requests, merges, or releases; those actions require explicit human authorization.

## Disclosure for submission

This project was developed with the assistance of GitHub Copilot. All submitted code, tests, and documents were reviewed, executed, and verified by the author.

## Issue #2 assistance

OpenAI Codex assisted with the request-submission design, shared contracts, API/domain/persistence implementation, wizard, PostgreSQL setup and automated verification. The agent's major-mismatch recheck is recorded in `docs/features/request-submission/verification.md`; it does not replace independent teammate review. The owner separately authorized scoped commits, feature-branch push and PR creation; independent teammate review remains pending.

## Issue #3 assistance

OpenAI Codex assisted with branch inspection, planning, verification and documentation for request list and detail. The scoped [verification record](docs/features/request-list-detail/verification.md) states the results and limits. Independent teammate review remains pending.

## Issue #25 assistance

OpenAI Codex, supervised by the issue implementer, added the two production-image build steps to the existing `verify` job and prepared the CI quality-gate procedures, evidence ledger, and targeted README correction. It inspected the repository workflow, Dockerfiles, test configuration, existing coverage and the Lab 5 course text and starter CI example. Actual local verification and environment limitations are recorded in [CI quality gates](docs/labs/lab-05/ci-quality-gates.md); prior feature verification does not establish this issue's acceptance.

After a local integration failure, a separate Codex agent diagnosed the restart test's readiness deadline, and a fix agent increased only its bounded polling allowance from 50 to 100 attempts. Application behavior and test assertions were preserved. The verification record retains the original failure and subsequent results; this diagnosis and implementation work is not independent human review.

Codex assisted with hosted C-01 inspection and the isolated C-02 failing-check demonstration; the revision-specific evidence and limits are recorded in the CI quality-gates ledger. Agent inspection does not constitute independent human review. Independent human review, all-branch settings verification, project-board recovery and final public-access verification remain pending. The user subsequently authorized scoped commits, feature-branch publication and an implementation PR; this authorization does not cover merges, settings changes or deployment. The general submission declaration above describes earlier submitted work and does not attest human verification or acceptance of this Issue #25 change.

## Issue #27 assistance

OpenAI Codex assisted with planning, course and repository inspection, drafting the deployment guide, and reconciling the configuration inventory and evidence. It inspected hosted workflow records and read-only HTTPS and anonymous-access results. The user supplied workflow screenshots and reported completing the restart and redeploy; the guide distinguishes those reports from independently observed release and history evidence and records their limits. AI inspection does not substitute for independent teammate review. No cloud configuration or production data was changed by the agent for this documentation work. This disclosure does not attest acceptance or authorize publication.

The issue #27 documentation received independent approval on [PR #59](https://github.com/oangsa/approval-system/pull/59). That approval does not establish review of historical promotion PRs #57 and #58; see the [deployment guide](docs/labs/lab-05/deployment.md#13-evidence-index-and-known-limitations).

## Issue #71 assistance

OpenAI Codex assisted with the BUG-B01 fix, tests, local review and [regression evidence](docs/labs/lab-06/bug-b01-regression-evidence.md). Agent review does not constitute independent human review; the evidence record distinguishes executed checks, reported results and outstanding verification.

## Issue #6 assistance

@oangsa
prompt: $karpathy-guidelines $caveman
reflection/output: Applied supplied Karpathy guidelines and concise communication preferences to Issue #6 implementation.

## Issue #6 assistance

@oangsa
prompt: Implement

## Issue #6

## Type
- Full-stack Feature

## Sprint
- Sprint 2
- Planned primary owner: @oangsa — accountable for both API/DB and UI.
- Planned PR reviewer: @kittipichcha — independent teammate review, never self-review.
- Ownership allocation (2026-11-24): Balanced by existing issue estimates within each remaining sprint: 20 points per person in Sprint 2 and 20 points per person in Sprint 3, totaling 40 points each. #6 remains assigned to @oangsa at the owner's explicit request. The other teammate provides independent PR review. Estimates and frozen product/API/UI contracts are unchanged.
- Rebalance unstarted work if actual effort diverges; estimates do not prove equal actual contributions.

## Features
- `R01` — Save as Draft
- `R05` — Withdraw Request

## Depends on
- #2
- #5

## Scope
- Implement complete backend Domain/Application/Infrastructure/Presentation behavior, Drizzle data changes, shared Zod contracts, and permission validation needed for these features.
- Implement complete React Router 7 frontend routes, shadcn/ui + Tailwind-only UI, states and integration for the same features. Keep public SSR and authenticated client-loaded data isolated; use the owner-approved D-01 stack from #1: Node.js 24, npm Workspaces, root `package-lock.json`, Elysia through `@elysia/node`, TypeScript, Vitest for unit/API/contract/real-PostgreSQL integration tests and Playwright for browser E2E, with OOP/Clean Architecture, PostgreSQL/Drizzle and shared Zod contracts in `packages/contracts`. This runtime/toolchain amendment overrides obsolete engineering runtime wording only; all 54 features, frozen business/API/UI behavior, ownership and effort estimates remain unchanged.
- Complete incomplete draft save/reopen/edit orchestration and eligible withdrawal through backend lifecycle services, shared contracts and request/revision/task persistence.
- Extend New/Edit wizard with Save Draft at each eligible step, resume routes and unsaved-change handling; add owner withdrawal confirmation in detail/list actions and authoritative queue refresh.
- Reuse existing creation/decision/idempotency infrastructure; this issue owns complete draft/withdraw feature acceptance, not a second request engine.
- Add/update applicable unit, API/contract, real-PostgreSQL integration, security, concurrency and Playwright/E2E tests. Version feature SDS, UI/API/data contract, numbered AC, STS and DoD before implementation; preserve feature traceability and record actual verification evidence in this issue.
- Dependencies are integration prerequisites, not a ban on parallel implementation against the frozen shared contracts. Coordinate shared contract/schema changes and reuse earlier components; keep supporting consumer integrations separate from primary Feature ID ownership.

## Acceptance criteria
- [ ] After valid published type/version selection, `POST /api/v1/requests` plus key saves incomplete but supplied-value-valid draft and returns `201 RequestDetail`; before selection Save Draft explains why unavailable.
- [ ] Subsequent `PATCH /api/v1/requests/:id/draft` sends expectedVersion and changed working fields, returns `200 RequestDetail`, preserves omitted properties and replaces fields map as specified. Hidden keys remain rejected.
- [ ] Save from any wizard step does not require submission completeness; draft persists across reload/restart and appears only to owner, with no official number, submitted revision/cycle or review task.
- [ ] `/requests/:id/edit` resumes saved values and step navigation; form errors focus correct step, unsaved route/type changes warn, safe recoverable errors retain inputs.
- [ ] `POST /api/v1/requests/:id/withdraw` takes `{expectedVersion,reason?}` plus Idempotency-Key, returns `200 RequestDetail` WITHDRAWN only for own PENDING request. Reason is optional per frozen API, not invented mandatory validation.
- [ ] Withdrawal atomically closes unfinished tasks, preserves prior submitted snapshots/votes, appends actor/time/event and makes later decisions non-actionable.
- [ ] Foreign and terminal withdrawals are denied with safe 404/state-conflict semantics and no mutation. Stale versions conflict; same-key replay produces no duplicate history; changed body conflicts.
- [ ] True simultaneous withdrawal versus approve/reject yields one serializable valid ordering, with no post-withdraw vote or orphan state.
- [ ] UI confirms withdrawal, displays server status and refreshes request/queue; accessible busy/validation/forbidden/stale/network states work. Execute PG persistence/rollback/race and draft/withdraw E2E with evidence.
- [ ] Teammate reviews bounded implementation; feature PR targets `sprint-2-staging`, followed by reviewed promotion to `dev` then release-reviewed `main`. Run applicable typecheck, lint, build and planned tests; record actual commit/environment/results and disclose failures/skips. This planning issue asserts no implementation or passing tests.

## Required branch
`feature/6-draft-withdraw-lifecycle`

## Traceability
- Features: `R01`, `R05`
- Functional requirements: `FR-019`, `FR-023`
- Business rules: `BR-026`, `BR-028`, `BR-029`, `BR-033`, `BR-034`, `BR-044`
- Acceptance criteria: `AC-019`, `AC-023`
- Planned tests: `FT-019`, `FT-023`; `EP-033`, `EP-035`, `EP-038`, `API-08`, `DB-02`, `DB-08`, `CX-04`, `CX-14`, `SEC-02`, `UI-05`, `UI-06`, `E2E-01`, `E2E-06`
- Contracts: `docs/specs/specifications.md` (frozen product v1.0), `docs/specs/api-specs.md` (frozen v1.0.1), `docs/specs/ui-specs.md` (frozen v1.0), `docs/specs/test.md` (planned verification).
- Supporting design/traceability: `docs/specs/srs.md`, `docs/specs/system-sds.md`, `docs/specs/traceability.md`, `docs/sprints/sprint-2.md`, root `AGENTS.md`.
- API paths use `/api/v1` unless explicitly stated otherwise; suffixes within a named endpoint family share its prefix. Preserve frozen contracts over older non-frozen sprint suggestions or scaffold defaults; no additional product behavior is implied.

## Estimated effort
- 4 points (planning estimate, not hours)
- Includes business rules, backend/API, frontend/UI, shared schemas, migrations/data integration, negative/race testing, documentation and integration review.
reflection/output: Versioned Issue #6 SDS, API/UI/data decisions, numbered acceptance criteria, STS and DoD before implementation. Reused request/decision transaction and idempotency infrastructure for optional-reason owner withdrawal, cancellation, preserved submitted evidence and audit note migration. Added owner draft resume and withdrawal UI, changed-fields PATCH orchestration, queue refresh and automated contract/component/PostgreSQL/browser coverage. Actual checks, initial failures, environment and remaining teammate-review/promotion gates are recorded in docs/features/draft-withdraw-lifecycle/verification.md. Existing user edits to AGENTS.md preserved; no commits, pushes or publication performed.

## Issue #6 assistance

@oangsa
prompt: use $scrutinize the implementation once to trace every single implementation mismatches, and fix if needed
reflection/output: Ran one scrutinize pass across frozen contracts, routes, schemas, application/domain authorization, transactional persistence, idempotency, decision races, services, wizard, owner actions and queue refresh. Reproduced and repaired invalid quantity exceptions, completed-step validation bypass, premature draft version gating, omitted line-item identity changes, UUID replay scope mismatch, missing stale-draft reload, forbidden editor retention, missing support Request IDs, obsolete monetary values after form review, and withdrawal reload/close/permission propagation. Added regression tests and recorded actual failed-before/passed-after checks in docs/features/draft-withdraw-lifecycle/review.md. Preserved existing user changes; no commits, pushes or external publication.

## Issue #6 assistance

@oangsa
prompt: $caveman commit, push and oprn pr to sprint-2-staging with issue 6 closing in body
reflection/output: Inspected and split existing authorized changes into scoped policy, design, shared-contract, backend, frontend and verification commits. Fresh npm run check passed typecheck, lint, 423 tests and builds; git diff --check passed. Source hashes match retained evidence for 107 PostgreSQL and 36 browser tests, which were not rerun in this publication turn. Prepared feature branch publication and PR targeting sprint-2-staging with Closes #6; independent teammate review remains required.


## Issue #6 assistance

@oangsa
prompt: fix
reflection/output: Inspected the clean Issue #6 feature branch and requested the missing failure details before changing code.

## Issue #6 assistance

@oangsa
prompt: ﻿2026-11-24T06:43:06.5250371Z ##[group]Run docker run --rm --init --network host --ipc host \
docker run --rm --init --network host --ipc host \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e CI=true -e NODE_ENV -e TEST_DATABASE_URL \
  -v "$GITHUB_WORKSPACE:/work" -w /work \
  approval-playwright:ci npm run test:e2e
shell: /usr/bin/bash -e {0}
env:
  NODE_ENV: test
  TEST_DATABASE_URL: ***127.0.0.1:5432/workflow_test

> test:e2e
> playwright test

[WebServer] 
[WebServer]   dist/index.js  155.3kb
[WebServer] 
[WebServer] ⚡ Done in 17ms

Running 36 tests using 1 worker
····················F::error file=e2e/draft-withdraw.spec.ts,title=[chromium] › e2e/draft-withdraw.spec.ts:32:1 › DW-AC-01–04 incomplete saves, reload/resume, navigation warning and input-preserving retry,line=83,col=44::  1) [chromium] › e2e/draft-withdraw.spec.ts:32:1 › DW-AC-01–04 incomplete saves, reload/resume, navigation warning and input-preserving retry %0A    Error: dialog.accept: Cannot accept dialog which is already handled!%0A%0A      81 |     await expect(page).toHaveURL(new RegExp(`/requests/${draft.id}/edit$`));%0A      82 |     await expect(page.getByLabel("Title (required)", { exact: true })).toHaveValue(`${title} unsaved`);%0A    > 83 |     page.once("dialog", (dialog) => dialog.accept());%0A         |                                            ^%0A      84 |     await page.getByRole("link", { name: "My Requests", exact: true }).click();%0A      85 |     await page.getByRole("textbox", { name: "Search", exact: true }).fill(title);%0A      86 |     const row = page.getByRole("row").filter({ hasText: title });%0A        at _Page.<anonymous> (/work/e2e/draft-withdraw.spec.ts:83:44)
  1) [chromium] › e2e/draft-withdraw.spec.ts:32:1 › DW-AC-01–04 incomplete saves, reload/resume, navigation warning and input-preserving retry 
    Error: locator.fill: Test ended.
    Call log:
      - waiting for getByRole('textbox', { name: 'Search', exact: true })


      83 |     page.once("dialog", (dialog) => dialog.accept());
      84 |     await page.getByRole("link", { name: "My Requests", exact: true }).click();
    > 85 |     await page.getByRole("textbox", { name: "Search", exact: true }).fill(title);
         |                                                                      ^
      86 |     const row = page.getByRole("row").filter({ hasText: title });
      87 |     await row.getByRole("link", { name: "Resume draft" }).click();
      88 |     await expect(page.getByLabel("Title (required)", { exact: true })).toHaveValue(title);
        at /work/e2e/draft-withdraw.spec.ts:85:70
···············

  1) [chromium] › e2e/draft-withdraw.spec.ts:32:1 › DW-AC-01–04 incomplete saves, reload/resume, navigation warning and input-preserving retry 

    Error: dialog.accept: Cannot accept dialog which is already handled!

      81 |     await expect(page).toHaveURL(new RegExp(`/requests/${draft.id}/edit$`));
      82 |     await expect(page.getByLabel("Title (required)", { exact: true })).toHaveValue(`${title} unsaved`);
    > 83 |     page.once("dialog", (dialog) => dialog.accept());
         |                                            ^
      84 |     await page.getByRole("link", { name: "My Requests", exact: true }).click();
      85 |     await page.getByRole("textbox", { name: "Search", exact: true }).fill(title);
      86 |     const row = page.getByRole("row").filter({ hasText: title });
        at _Page.<anonymous> (/work/e2e/draft-withdraw.spec.ts:83:44)

    Error: locator.fill: Test ended.
    Call log:
      - waiting for getByRole('textbox', { name: 'Search', exact: true })


      83 |     page.once("dialog", (dialog) => dialog.accept());
      84 |     await page.getByRole("link", { name: "My Requests", exact: true }).click();
    > 85 |     await page.getByRole("textbox", { name: "Search", exact: true }).fill(title);
         |                                                                      ^
      86 |     const row = page.getByRole("row").filter({ hasText: title });
      87 |     await row.getByRole("link", { name: "Resume draft" }).click();
      88 |     await expect(page.getByLabel("Title (required)", { exact: true })).toHaveValue(title);
        at /work/e2e/draft-withdraw.spec.ts:85:70

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    artifacts/playwright/results/draft-withdraw-DW-AC-01–04-3b26b--and-input-preserving-retry-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: artifacts/playwright/results/draft-withdraw-DW-AC-01–04-3b26b--and-input-preserving-retry-chromium/error-context.md

    attachment #3: trace (application/zip) ─────────────────────────────────────────────────────────
    artifacts/playwright/results/draft-withdraw-DW-AC-01–04-3b26b--and-input-preserving-retry-chromium/trace.zip
    Usage:

        npx playwright show-trace artifacts/playwright/results/draft-withdraw-DW-AC-01–04-3b26b--and-input-preserving-retry-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    [chromium] › e2e/draft-withdraw.spec.ts:32:1 › DW-AC-01–04 incomplete saves, reload/resume, navigation warning and input-preserving retry 
  35 passed (53.4s)
##[notice]  1 failed
    [chromium] › e2e/draft-withdraw.spec.ts:32:1 › DW-AC-01–04 incomplete saves, reload/resume, navigation warning and input-preserving retry 
  35 passed (53.4s)
Process completed with exit code 1.
reflection/output: Reproduced the exact double-handled dialog error using delayed Chromium confirmation. Traced the failure to unsynchronized one-shot handlers: unchanged URL/input assertions can finish before the first navigation dialog arrives. Updated all four native-confirmation checks in e2e/draft-withdraw.spec.ts to await both the triggering click and the dialog response, asserting confirmation type. Application behavior and acceptance assertions remain intact. Verification results are recorded in docs/features/draft-withdraw-lifecycle/verification.md. No commit or push performed.

## Issue #6 assistance

@oangsa
prompt: commit and push
reflection/output: Reviewed the focused dialog synchronization fix and verification records, then prepared a scoped fix commit for the current feature/6-draft-withdraw-lifecycle branch and publication to its origin branch. Prior verification passed 10/10 repeated affected browser checks, 423 tests, typecheck, lint and build. No merge or branch promotion requested.

## Issue #6 assistance

@oangsa
prompt: I am considering to remove commit sha from PR desc because its just redundunt
reflection/output: Recommended removing commit SHA references from the PR description because GitHub already tracks commits, while keeping behavior, rationale, validation and Closes #6.

## Issue #6 assistance

@oangsa
prompt: can you do it
reflection/output: Updated PR #87 through the GitHub connector, changing “Validation at ba97462:” to “Validation:”. Verified the returned description preserves all other content, including validation details and Closes #6. Assistance records appended locally; no source commit or push performed.

## Issue #6 assistance

@oangsa
prompt: PR #87 Review — Draft & Withdrawal Lifecycle

Review Verdict: REQUEST CHANGES

- PR: https://github.com/oangsa/approval-system/pull/87
- Reviewed commit: "fe7987b2a7e9b89d692d8eeea0e2060521d7104f"
- Issue: #6
- Features: R01 — Save as Draft, R05 — Withdraw Request
- Source branch: "feature/6-draft-withdraw-lifecycle"
- Target branch: "sprint-2-staging"
- Overall implementation quality: 8.8/10
- CI status: Passed
- Blocking findings: 3
- Merge recommendation: NO-GO

1. Review Policy

Only serious edge cases and implementation mismatches are considered blockers. Minor UI improvements, architectural preferences, hypothetical future requirements, and unrelated features are excluded.

The implementation is largely complete. The withdrawal lifecycle is particularly well implemented, with appropriate authorization, transactional persistence, idempotency, and concurrency protection. However, three draft lifecycle implementation mismatches must be resolved before merging.

The following findings are based on source-code execution paths and have not been independently reproduced in a local runtime.

2. Blocking Findings

B01 — Changing a form version can silently overwrite an omitted monetary value

Severity: P1 — Blocker
Feature: R01
Category: Backend / Data Integrity

Affected files:

- "apps/api/src/Applications/Requests/RequestService.ts:64–75"
- "apps/api/src/Domains/Requests/RequestRules.ts:79–85"

Problem:

The application reconstructs existing editable content using the newly selected form definition rather than the original definition under which the draft was saved.

const config = await repository.Configuration(
    detail.typeId,
    selectedVersionId,
    actor.account.id
);

let content = editableContent(detail, config.definition);

Inside "editableContent":

monetaryAmount: definition.supportsLineItems
    ? null
    : revision.amount

An omitted monetary property can consequently be cleared or reinterpreted when the form definition changes.

Reproduction scenario:

1. Create a draft using a direct monetary amount of THB 5,000.
2. Publish a newer definition that changes monetary authority to line items.
3. PATCH the draft using only "expectedVersion" and "formDefinitionVersionId".
4. The previous monetary amount is discarded during content reconstruction, despite not being explicitly cleared.

Contract violation:

- PATCH must preserve omitted properties.
- Supplied values must remain applicable and valid.
- Incompatible content must not be silently discarded.
- Failed validation must preserve prior durable state.

Required fix:

1. Load the original saved form definition.
2. Reconstruct existing editable content using that original definition.
3. Apply explicitly supplied PATCH changes.
4. Validate the resulting content against the target definition.
5. Reject incompatible retained values unless the caller explicitly clears or replaces them.
6. Preserve transactional rollback behavior.

Do not introduce a premature active-version requirement for draft creation or saving. Preserve the frozen API rule that the active published version is enforced at initial submission.

Required regression tests:

- Direct monetary amount to line-item definition migration.
- Line-item definition to direct monetary amount migration.
- Preservation of omitted monetary properties.
- Explicit clearing or replacement of incompatible values.
- Rejection without mutation when retained content is incompatible.
- Existing ordinary PATCH omission-preservation behavior.

---

B02 — Changing request type inside the edit route leaves the wizard associated with the wrong URL

Severity: P2 — Blocker
Feature: R01
Category: Frontend / Routing / Persistence

Affected files:

- "apps/web/app/modules/requests/RequestWizard.tsx:206–222"
- "apps/web/app/modules/requests/RequestWizard.tsx:160–179"

Problem:

Changing the request type correctly warns the user and creates a new editing session:

session.current = new RequestEditingSession();

However, after successfully saving the newly created draft, the current edit route remains associated with the original draft ID.

Reproduction scenario:

1. Open Draft A at "/requests/A/edit".
2. Navigate back to the Request Type step.
3. Select a different request type.
4. Confirm the type-change warning.
5. Save the new draft.
6. Draft B is successfully created in the database.
7. The browser remains at "/requests/A/edit".
8. Refresh the browser.
9. Draft A is restored instead of Draft B.

Although Draft B is persisted and accessible through the resume link, the current editor's resource identity does not match its URL.

Contract violation:

- Saved drafts must be resumable across browser reloads.
- The edit route must restore the correct saved request.
- Successful save confirmation must correspond to the request being edited.

Required fix:

1. Synchronize the edit route with the authoritative ID returned by the successful draft creation.
2. Use an appropriate route replacement strategy.
3. Preserve the current wizard content and navigation state where appropriate.
4. Prevent an unnecessary unsaved-change confirmation after successful persistence.
5. Preserve the original draft without mutation.
6. Do not create duplicate drafts during unchanged retries.

An equivalent implementation that explicitly transitions to the new-request route before creating a different draft is acceptable, provided resource identity and reload behavior remain coherent.

Required regression tests:

- Open Draft A and change its request type.
- Cancel the type-change confirmation and verify that Draft A remains unchanged.
- Confirm the type change and save Draft B.
- Verify that the active editor corresponds to Draft B.
- Refresh the browser and verify that Draft B is restored.
- Verify that Draft A remains unchanged.
- Verify that retries do not create duplicate drafts.

---

B03 — Unchanged Save Draft can incorrectly report success using stale cached state

Severity: P2 — Blocker
Feature: R01
Category: Concurrency / Server Authority

Affected file:

- "apps/web/app/services/requestService.ts:24–40"

Problem:

The editing service returns its cached response without contacting the server when the local content has not changed.

if (this.saved && this.savedContent === serialized)
    return this.saved;

This optimization bypasses authoritative request status, version, and permission revalidation.

Reproduction scenario:

1. Open the same draft in two browser tabs.
2. Submit the request from Tab A.
3. The server transitions the request to PENDING and creates its official number and approval tasks.
4. In Tab B, press Save Draft without changing its local content.
5. The service returns the cached DRAFT response.
6. The wizard incorrectly displays:

«Draft saved. No request number or approval task has been created.»

The displayed message contradicts the authoritative server state.

A similar mismatch can occur when another session edits the draft or the requester loses editing permission.

Contract violation:

- Request status must reflect authoritative server state.
- Stale versions must be handled safely.
- Terminal and otherwise ineligible requests must not report successful draft updates.
- The UI must not display false success.

Required fix:

1. Remove the unconditional cached-success return or replace it with authoritative revalidation.
2. Verify that the request remains an editable DRAFT.
3. Verify that the current server version matches the editing session.
4. Verify current editing authorization.
5. Route stale, invalid-transition, and permission errors through existing recovery states.
6. Preserve local inputs during recoverable errors.
7. Preserve stable idempotency behavior.

Avoid creating unnecessary audit events or incrementing request versions solely to validate an unchanged draft when an authoritative read can satisfy the requirement.

Required regression tests:

- Unchanged Save Draft while server state remains unchanged.
- Unchanged Save Draft after another session modifies the draft.
- Unchanged Save Draft after another session submits the request.
- Unchanged Save Draft after editing permission is revoked.
- No misleading success message after failed revalidation.
- Existing changed-content and lost-response retry behavior.

3. Acceptance Criteria Review

#| Acceptance criterion| Result
1| Initial incomplete draft creation and selection prerequisite| PASS
2| PATCH version checking, omission preservation, and hidden-field rejection| FAIL — B01
3| Draft persistence, owner isolation, and absence of approval artifacts| PASS
4| Edit route, resume, navigation, and error recovery| FAIL — B02, B03
5| Owner-only PENDING withdrawal with optional reason| PASS
6| Atomic cancellation and preservation of historical evidence| PASS
7| Foreign, terminal, stale, and idempotency protection| PASS
8| Simultaneous withdrawal versus approval/rejection| PASS
9| Withdrawal UI, authoritative refresh, and automated verification| PASS
10| Independent review, verification evidence, and promotion workflow| PENDING

Summary:

- Passed: 7/10
- Failed: 2/10
- Pending: 1/10

4. R05 — Withdrawal Lifecycle Assessment

Result: PASS — No implementation blockers identified.

The following requirements are correctly implemented:

- Optional withdrawal reason.
- Current identity and role validation.
- Owner authorization.
- PENDING-only withdrawal.
- Optimistic version checking.
- Idempotent replay before stale-version rejection.
- Changed-body idempotency conflict.
- Atomic cancellation of unfinished approval tasks.
- Cancelled task version increments.
- Preservation of submitted snapshots.
- Preservation of previously accepted votes.
- Audit actor, timestamp, and optional reason.
- Transactional outbox event.
- Atomic rollback.
- Shared locking with decision operations.
- Authoritative request refresh.
- Reviewer queue refresh.
- Accessible confirmation and recovery states.

Both withdrawal and approval/rejection acquire the same request-row lock before modifying cycle, stage, and slot state.

The PostgreSQL tests use independent connections and synchronization before lock acquisition, providing meaningful evidence of actual concurrent execution.

No withdrawal lifecycle redesign is required.

5. Verification Review

Latest GitHub Actions workflow:

https://github.com/oangsa/approval-system/actions/runs/45343939956

Verification| Latest CI result
npm clean installation| PASS
TypeScript typecheck| PASS
ESLint| PASS
Frontend tests| PASS
Backend tests| PASS
Shared contract tests| PASS
Workspace builds| PASS
Release tests| PASS
Production Docker builds| PASS
Database migrations| PASS
PostgreSQL integration tests| PASS
Playwright browser tests| PASS

Retained local verification evidence reports:

- Unit/API/contract tests: 423 passed.
- Real PostgreSQL integration tests: 107 passed.
- Playwright E2E tests: 36 passed.

These totals originate from the retained verification document. The latest CI job independently confirms successful integration and browser test steps, although its exact test totals were not independently counted during this review.

The earlier Playwright failure involving a double-handled confirmation dialog has been addressed. The latest successful CI run means that previous failure is not an outstanding blocker.

6. Architecture and Scope Compliance

Requirement| Result
Node.js 24| Compliant
npm Workspaces| Compliant
Elysia through Node.js runtime| Compliant
Shared Zod contracts| Compliant
OOP / Clean Architecture| Compliant
PostgreSQL / Drizzle| Compliant
React Router 7| Compliant
shadcn/ui and Tailwind| Compliant for reviewed changes
Authenticated client-loaded data| Compliant
Existing lifecycle infrastructure reused| Compliant
Feature SDS, AC, STS, and DoD| Present
Frozen product contracts| Except identified mismatches
Required feature branch| Compliant
Required staging target| Compliant
Independent teammate review| Pending
Verification evidence posted to Issue #6| Outstanding

7. Implementation Constraints for Repairs

- Keep changes bounded to the identified findings.
- Preserve all frozen business, API, and UI contracts.
- Do not introduce a second request lifecycle engine.
- Do not redesign the existing withdrawal implementation.
- Do not alter unrelated feature ownership.
- Do not introduce mandatory withdrawal reason validation.
- Do not require the active published form version prematurely during draft saving.
- Do not weaken existing tests or remove acceptance assertions to achieve passing CI.
- Do not introduce unnecessary dependencies or database migrations.
- Do not implement unrelated Sprint 2 or Sprint 3 features.
- Preserve existing authorization, idempotency, transaction, and concurrency guarantees.
- Follow root "AGENTS.md", including applicable AI assistance recording requirements.

Returned-request editing, resubmission, delegation, notifications, and other separately owned features are outside this review's repair scope.

8. Required Verification Before Merge

- [ ] Resolve B01 — Monetary value preservation across form-definition changes.
- [ ] Resolve B02 — Draft editor resource and URL synchronization.
- [ ] Resolve B03 — Authoritative validation of unchanged draft saves.
- [ ] Reproduce each confirmed finding before applying its fix where feasible.
- [ ] Add targeted regression tests for all confirmed findings.
- [ ] Run typecheck.
- [ ] Run lint.
- [ ] Run unit, API, and contract tests.
- [ ] Run real PostgreSQL integration tests.
- [ ] Run Playwright E2E tests.
- [ ] Run workspace builds.
- [ ] Run "git diff --check" and disclose any pre-existing or intentionally preserved exceptions.
- [ ] Record actual verification results, environment, and tested commit.
- [ ] Disclose failures, skipped tests, and unexecuted verification.
- [ ] Update applicable feature design, test, and verification documentation.
- [ ] Record verification evidence in Issue #6.
- [ ] Obtain independent teammate review from "@kittipichcha".
- [ ] Preserve the required staging-to-dev-to-main promotion workflow.

9. Final Assessment

Category| Score
Backend and lifecycle| 9/10
Frontend integration| 8/10
Security and authorization| 9.5/10
Concurrency and transactions| 9.5/10
Testing and verification| 9/10
Contract compliance| 8/10
Overall| 8.8/10

Final verdict: REQUEST CHANGES — NO-GO.

The core architecture is sound, the withdrawal lifecycle satisfies the important business and security requirements, and the latest CI verification is successful.

A narrowly scoped repair is recommended rather than a comprehensive rewrite.

Once the three identified implementation mismatches are resolved, their regression tests pass, verification evidence is recorded, and independent teammate approval is obtained, no currently identified architectural blocker should prevent PR #87 from merging into "sprint-2-staging".
 fix fic
reflection/output: Reproduced B01 in two real-PostgreSQL tests and B02/B03 in nine frontend tests before repairs. Draft PATCH now reconstructs with the original immutable definition before applying and validating target-version changes. Successful creation after a type change replaces the edit URL with the authoritative draft ID after dirty state clears, retaining wizard step. Unchanged Save revalidates server status, editing permission and version through GET, clears prior success, and uses existing recovery states. Submit keeps authoritative endpoint replay for lost responses. Added targeted session/component/PostgreSQL/browser regressions and updated feature design, test and verification records. Actual verification and remaining external gates are recorded in docs/features/draft-withdraw-lifecycle/verification.md. Existing ai_use.md edits preserved; no commit, push, merge or release performed.

Verification follow-up: All final local checks passed: 434 unit/API/contract/component tests, 109 PostgreSQL tests, 39 Playwright tests, 13 release tests, typecheck, lint, builds and diff check. GitHub Issue #6 evidence was prepared locally, but automatic approval review rejected posting because the connector exposed PR #6 instead of the authorized Issue #6. No external comment was posted and no workaround was attempted. Independent teammate approval and reviewed promotion remain pending.

## Issue #6 assistance

@oangsa
prompt: commit and push to pr87
reflection/output: Verified PR #87 is open from feature/6-draft-withdraw-lifecycle to sprint-2-staging and its remote head matches the reviewed base. Reviewed unstaged/staged diffs, split SDS/AC/STS, B01, B02, B03 and final evidence into scoped commits, preserving directly related tests and prior assistance records. All seven source/test hashes match the passing verification; diff check passes. Prepared the authorized normal push to the existing PR source branch, with no force push, merge, release or external issue comment. Prior verification remains 434 unit/API/contract/component, 109 PostgreSQL, 39 browser and 13 release tests plus typecheck/lint/build; runtime suites were not repeated for commit packaging.

## Issue #6 assistance

@oangsa
prompt: fix B04 — Review summary displays obsolete line items (P2)

Problem: When a draft migrates to a newer form definition that no longer supports line items, the wizard still displays old items in the review summary, even though the API payload excludes them.

Affected file: RequestWizard.tsx

Required fix:

* Clear incompatible monetary values and line items after the user confirms the form-version migration.
* Render the review summary using the canonical payload() instead of raw form state.
* Preserve compatible values and retain all original values if migration is cancelled.
* Add regression tests for form-version migration, review summary accuracy and draft persistence.
* Update the SDS, acceptance criteria, STS and verification evidence.

Expected result: The displayed review summary matches the actual submission payload, and obsolete values never reappear.

No backend or database migration changes are required.
reflection/output: Reproduced three B04 failures before repair: raw obsolete items in canonical review, migrated obsolete items in review, and an old direct amount reappearing when a later version restores direct monetary support. Confirmed migration now clears incompatible monetary/item state while retaining compatible content; cancellation leaves the original definition and values unchanged. Review summary values, items and totals now use payload(). Added component regressions for canonical rendering, cancellation, compatible retention and permanent clearing, plus a real browser migration/save/reload regression. Updated SDS, acceptance criteria, STS and verification evidence. Backend, shared contracts and migrations remain unchanged. Actual checks and publication status are recorded in docs/features/draft-withdraw-lifecycle/verification.md.

B04 verification follow-up: npm run check passed typecheck, lint, 439 tests across 46 files and all workspace builds. All 23 lifecycle component tests pass after three failing-before regressions. First full browser run passed B04 but exposed B02's pre-existing dependence on another suite's alternate type fixture (39 passed / 1 failed). Made that browser fixture explicit without weakening assertions, recreated the task-owned database, and reran: all 40 browser tests passed. Final typecheck/lint and diff check passed. Standalone PostgreSQL integration/release/Docker suites were not rerun for this frontend change. No commit, push or external comment performed for B04.

## Issue #6 assistance

@oangsa
prompt: commit and push
reflection/output: Verified PR #87 remains open from feature/6-draft-withdraw-lifecycle to sprint-2-staging and fetched its unchanged remote head. Reviewed unstaged and staged diffs, split B04 specifications, the independent browser-fixture correction, B04 behavior with its regressions, and final evidence into scoped commits. Confirmed all three source/test hashes still match the passing 439-test workspace and 40-test browser verification; diff check passes. Prepared the authorized normal push to PR #87's existing source branch. Runtime suites were not repeated for history-only packaging. No force push, merge, release or external issue comment performed.

## Issue #6 assistance

@oangsa
prompt: fix 

Run docker run --rm --init --network host --ipc host \

> test:e2e
> playwright test

[WebServer] 
[WebServer]   dist/index.js  155.6kb
[WebServer] 
[WebServer] ⚡ Done in 19ms

Running 40 tests using 1 worker
·····························F::error file=e2e/request-list-detail.spec.ts,title=[chromium] › e2e/request-list-detail.spec.ts:12:1 › REQ-E2E-01 and REQ-E2E-02: requester list and persisted detail,line=68,col=83::  1) [chromium] › e2e/request-list-detail.spec.ts:12:1 › REQ-E2E-01 and REQ-E2E-02: requester list and persisted detail %0A    Error: locator.click: Error: strict mode violation: getByRole('dialog', { name: 'Advanced filters' }).getByRole('button', { name: 'General request (GENERAL)' }) resolved to 2 elements:%0A        1) <button type="button" class="inline-flex shrink-0 items-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none text-muted-foreground hover:bg-accent hover:text-foreground min-h-11 py-2 w-full min-w-0 justify-start whitespace-normal px-3 text-left">…</button> aka getByRole('button', { name: 'General request (GENERAL)' }).first()%0A        2) <button type="button" class="inline-flex shrink-0 items-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none text-muted-foreground hover:bg-accent hover:text-foreground min-h-11 py-2 w-full min-w-0 justify-start whitespace-normal px-3 text-left">…</button> aka getByRole('button', { name: 'General request (GENERAL)' }).nth(1)%0A%0A    Call log:%0A      - waiting for getByRole('dialog', { name: 'Advanced filters' }).getByRole('button', { name: 'General request (GENERAL)' })%0A%0A%0A      66 |     await filterDialog.getByLabel("Created through", { exact: true }).fill("2099-12-31");%0A      67 |     await filterDialog.getByRole("button", { name: "Request type All request types" }).click();%0A    > 68 |     await filterDialog.getByRole("button", { name: "General request (GENERAL)" }).click();%0A         |                                                                                   ^%0A      69 |     const searchResponse = page.waitForResponse((response) => response.url().endsWith("/v1/requests/search") && response.request().method() === "POST");%0A      70 |     await filterDialog.getByRole("button", { name: "Apply filters" }).click();%0A      71 |     const filteredResponse = await searchResponse;%0A        at /work/e2e/request-list-detail.spec.ts:68:83
··········

  1) [chromium] › e2e/request-list-detail.spec.ts:12:1 › REQ-E2E-01 and REQ-E2E-02: requester list and persisted detail 

    Error: locator.click: Error: strict mode violation: getByRole('dialog', { name: 'Advanced filters' }).getByRole('button', { name: 'General request (GENERAL)' }) resolved to 2 elements:
        1) <button type="button" class="inline-flex shrink-0 items-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none text-muted-foreground hover:bg-accent hover:text-foreground min-h-11 py-2 w-full min-w-0 justify-start whitespace-normal px-3 text-left">…</button> aka getByRole('button', { name: 'General request (GENERAL)' }).first()
        2) <button type="button" class="inline-flex shrink-0 items-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none text-muted-foreground hover:bg-accent hover:text-foreground min-h-11 py-2 w-full min-w-0 justify-start whitespace-normal px-3 text-left">…</button> aka getByRole('button', { name: 'General request (GENERAL)' }).nth(1)

    Call log:
      - waiting for getByRole('dialog', { name: 'Advanced filters' }).getByRole('button', { name: 'General request (GENERAL)' })


      66 |     await filterDialog.getByLabel("Created through", { exact: true }).fill("2099-12-31");
      67 |     await filterDialog.getByRole("button", { name: "Request type All request types" }).click();
    > 68 |     await filterDialog.getByRole("button", { name: "General request (GENERAL)" }).click();
         |                                                                                   ^
      69 |     const searchResponse = page.waitForResponse((response) => response.url().endsWith("/v1/requests/search") && response.request().method() === "POST");
      70 |     await filterDialog.getByRole("button", { name: "Apply filters" }).click();
      71 |     const filteredResponse = await searchResponse;
        at /work/e2e/request-list-detail.spec.ts:68:83

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    artifacts/playwright/results/request-list-detail-REQ-E2-1ab2e-r-list-and-persisted-detail-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: artifacts/playwright/results/request-list-detail-REQ-E2-1ab2e-r-list-and-persisted-detail-chromium/error-context.md

    attachment #3: trace (application/zip) ─────────────────────────────────────────────────────────
    artifacts/playwright/results/request-list-detail-REQ-E2-1ab2e-r-list-and-persisted-detail-chromium/trace.zip
    Usage:

        npx playwright show-trace artifacts/playwright/results/request-list-detail-REQ-E2-1ab2e-r-list-and-persisted-detail-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    [chromium] › e2e/request-list-detail.spec.ts:12:1 › REQ-E2E-01 and REQ-E2E-02: requester list and persisted detail 
  39 passed (1.0m)
Notice:   1 failed
    [chromium] › e2e/request-list-detail.spec.ts:12:1 › REQ-E2E-01 and REQ-E2E-02: requester list and persisted detail 
  39 passed (1.0m)
reflection/output: Traced the duplicate picker buttons to the published-version PostgreSQL fixture copying the GENERAL seed code instead of preserving its own type identity. Reproduced the exact browser strict-mode violation by isolating the two conflicting definitions on a task-owned disposable database; added a failing-before metadata-search assertion. Updated the fixture to copy its currently published definition. Verification results are recorded in docs/features/draft-withdraw-lifecycle/verification.md. No product/UI/contract changes, commit, push or external comment.

## Issue #6 assistance

@oangsa
prompt: commit and push
reflection/output: Reviewed the fixture correction, regression assertion, verification evidence and assistance records. Fetched the existing feature branch and confirmed local HEAD matches its remote head. Prepared one scoped test(requests) commit for this cohesive fixture correction and its evidence, followed by the authorized normal push to feature/6-draft-withdraw-lifecycle. Prior verification remains 439 workspace tests, 109 PostgreSQL tests and 40 browser tests, plus typecheck/lint/build; no code changed during packaging and runtime suites were not repeated. The six whitespace flags in ai_use.md preserve the previous exact prompt. No force push, merge, release or external comment.

## Issue #6 assistance

@oangsa
prompt: So, we can do like this, right

oangsa #6 -> #8 -> #9 (ทำได้ยาว ๆ เลย)
kittipicha #7 (Wait for #6) -> #11 -> #10 (Have to wait for #9)
reflection/output: Checked the live dependency lists and scope for issues #6–#11. Confirmed the proposed order is valid, with #7 depending on #6 and #10 on #9 for integration. Recommended starting #11 while #6 is pending because #11 depends only on #3 and #5, then integrating #7 after #6 and #10 after #9. Clarified that the issues explicitly permit parallel implementation against frozen contracts before dependencies merge. No GitHub issue, product code, commit or push changes.

## Issue #6 assistance

@oangsa
prompt: fix 

PR #87 — Blocking findings
| ID | Finding | Requirement | What to change |
|---|---|---|---|
| B05 | Saving an unchanged draft can send a PATCH when the same fields arrive in a different key order. This increments the version and adds an audit entry. | DW-AC-02/04: PATCH sends only changed fields. Unchanged Save verifies server state without writing. | In requestService.ts, compare field maps independent of key order. Test that reordered keys trigger a GET with no PATCH or new audit entry. |
| B06 | The API returns lineItems.0.quantity, while the frozen contract requires lineItems[0].quantity. | API spec §7 and DW-AC-04: Use canonical error paths and focus the invalid field. | In RequestRoutes.ts, emit bracket-form paths. In RequestWizard.tsx, map them to the existing input IDs. Test that the API returns the exact path and the wizard focuses the affected input. |
| B07 | Closing the withdrawal dialog can lose keyboard focus when the Withdraw button disappears. | UI spec and DW-AC-08: Accessible confirmation with focus restored when the dialog closes. | In RequestOwnerActions.tsx and its parent views, return focus to the trigger when it survives. Otherwise, focus the updated detail status or the list search input. Verify both paths in Playwright. |
| B08 | Issue #6 is missing its required verification record. | Issue #6 and DW-AC-09: Record actual verification results on the issue. | After final CI, post the tested SHA, PR and CI links, results, and any failures or skips directly on Issue #6. |
reflection/output: Repaired PR #87 blocking findings B05–B07 and prepared B08 without committing, pushing, or posting to GitHub yet. Updated apps/web/app/services/requestService.ts to compare and serialize request content and idempotency bodies using recursive key-sorted canonical JSON so reordered dynamic field keys still trigger GET revalidation with zero PATCH writes or audit events. Updated apps/api/src/Presentations/Routes/RequestRoutes.ts and apps/api/src/Domains/Requests/RequestRules.ts to emit canonical bracket-form validation paths (such as lineItems[0].quantity and lineItems[0].description) and evaluate per-item total bounds before aggregate lineItems bounds, and updated apps/web/app/modules/requests/RequestWizard.tsx to map bracket paths to input IDs for step routing, aria-invalid, and focus. Updated apps/web/app/modules/requests/RequestOwnerActions.tsx, RequestResult.tsx, RequestDetailPage.tsx, RequestDetailTabs.tsx, and RequestListPage.tsx so closing the withdrawal dialog restores focus to the Withdraw trigger when it survives and moves focus to the RequestStatus badge on detail or the list search input on My Requests when Withdraw disappears. Added unit, component, PostgreSQL HTTP, and Playwright browser regressions; updated SDS, AC, STS, DoD, verification.md, and issue-comment.md. Verified npm run check (typecheck, lint, 448 tests across 46 files, builds), 109 PostgreSQL integration tests, and 43 Playwright browser tests all passed with zero skips.

## Issue #6 assistance

@oangsa
prompt: do it
reflection/output: Packaged the verified B05–B07 repairs, regressions, feature docs, and assistance records into scoped atomic commits on feature/6-draft-withdraw-lifecycle, pushed normally to PR #87, awaited the final GitHub Actions Verification CI run, and posted the final verification record (tested SHA, PR/CI links, actual results, and failures/skips disclosure) directly on Issue #6 for B08. No force push, merge, or release performed.

## Issue #6 assistance

@oangsa
prompt: do it
reflection/output: Packaged the verified B05–B07 repairs, regressions, feature docs, and assistance records into scoped atomic commits on feature/6-draft-withdraw-lifecycle, pushed normally to PR #87, awaited the final GitHub Actions Verification CI run, and prepared/posted the final verification record (tested SHA, PR/CI links, actual results, and failures/skips disclosure) directly on Issue #6 for B08. No force push, merge, or release performed.

## Issue #8 assistance

@oangsa
prompt: /karpathy-guidelines
reflection/output: Applied supplied Karpathy coding discipline guidelines to Issue #8 planning, surgical implementation, and verification.

## Issue #8 assistance

@oangsa
prompt: /caveman
reflection/output: Applied concise communication style preference for user-facing responses while keeping source code, specifications, and documentation in standard prose.

## Issue #8 assistance

@oangsa
prompt: implement

## Type
- Full-stack Feature

## Sprint
- Sprint 2
- Planned primary owner: @oangsa — accountable for both API/DB and UI.
- Planned PR reviewer: @kittipichcha — independent teammate review, never self-review.
- Ownership allocation (2026-11-24): Balanced by existing issue estimates within each remaining sprint: 20 points per person in Sprint 2 and 20 points per person in Sprint 3, totaling 40 points each. #6 remains assigned to @oangsa at the owner's explicit request. The other teammate provides independent PR review. Estimates and frozen product/API/UI contracts are unchanged.
- Rebalance unstarted work if actual effort diverges; estimates do not prove equal actual contributions.

## Features
- `R07` — Request Line Items
- `O16` — Multiple Request Types (admin-configurable)
- `O17` — Priority Levels

## Depends on
- #2

## Scope
- Implement complete backend Domain/Application/Infrastructure/Presentation behavior, Drizzle data changes, shared Zod contracts, and permission validation needed for these features.
- Implement complete React Router 7 frontend routes, shadcn/ui + Tailwind-only UI, states and integration for the same features. Keep public SSR and authenticated client-loaded data isolated; use the owner-approved D-01 stack from #1: Node.js 24, npm Workspaces, root `package-lock.json`, Elysia through `@elysia/node`, TypeScript, Vitest for unit/API/contract/real-PostgreSQL integration tests and Playwright for browser E2E, with OOP/Clean Architecture, PostgreSQL/Drizzle and shared Zod contracts in `packages/contracts`. This runtime/toolchain amendment overrides obsolete engineering runtime wording only; all 54 features, frozen business/API/UI behavior, ownership and effort estimates remain unchanged.
- Implement versioned administrator request-type draft/branch/publish/enable/disable services, shared PublishedRequestType/condition/field schemas, definition graph evaluator and immutable Drizzle version records.
- Deliver `/admin/request-types` and editor with structured field list, up/down ordering, bounded all/any rule builder and shared-evaluator preview; integrate same metadata-driven rendering into requester wizard.
- Add exact decimal line-item calculation/persistence, reusable LineItemsEditor and supported priority in wizard/list/details; retain original form pinning across all consumers.
- Add/update applicable unit, API/contract, real-PostgreSQL integration, security, concurrency and Playwright/E2E tests. Version feature SDS, UI/API/data contract, numbered AC, STS and DoD before implementation; preserve feature traceability and record actual verification evidence in this issue.
- Dependencies are integration prerequisites, not a ban on parallel implementation against the frozen shared contracts. Coordinate shared contract/schema changes and reuse earlier components; keep supporting consumer integrations separate from primary Feature ID ownership.

## Acceptance criteria
- [ ] Authenticated type lookup/search exposes active published metadata; authorized pinned-version GET works without draft leakage. Admin POST `/api/v1/admin/request-types` creates draft; PATCH `/:id/draft` requires expectedVersion; POST `/:id/draft` branches latest immutable publication.
- [ ] POST `/api/v1/admin/request-types/:id/publish` requires expectedVersion/key, returns `201 PublishedRequestType`; concurrent/stale publish cannot create duplicate version. Enable/disable take expectedVersion, preserve history and allow legitimate returned pinned edits/resubmission.
- [ ] Field vocabulary is TEXT/TEXTAREA/DECIMAL/DATE/SELECT/BOOLEAN with localized labels, typed options/bounds and unique keys. Reject unknown/duplicate references, incompatible operator/value, self-reference and cycles across visibility/requiredness before publish.
- [ ] Conditions support EQ/NE/GT/GTE/LT/LTE/IN/PRESENT and bounded all/any; if both groups exist combine their results with AND. Empty provided groups are invalid, missing group contributes true, boolean false is PRESENT.
- [ ] Evaluate dependency graph in order. Hidden field is unset for downstream evaluation and never required; visible field required when base required or requiredWhen true. Browser omits hidden keys; direct draft/submit hidden-key input returns `422 FORM_FIELD_NOT_APPLICABLE`.
- [ ] Server validates stored published definition at runtime in addition to static Zod. New first submission checks active version (`409 FORM_DEFINITION_CHANGED` if stale); submitted/returned versions never silently migrate.
- [ ] Admin field-list supports add/edit/remove/reorder, constrained rule editing, live preview and immutable publish confirmation; nonadmin mutation denied and 422/409 feedback preserves editable draft.
- [ ] Line-item-enabled types accept `{description,quantity,unitAmount}` only as editable authority; server generates IDs, requires positive quantities/nonnegative valid unit amounts, computes exact per-row/total decimal strings and rejects attempted client total override.
- [ ] Monetary types without items may use validated monetaryAmount; competing monetaryAmount and lineItems cannot supply two authorities. Nonmonetary types exclude monetary input; no float arithmetic or currency conversion.
- [ ] Priority LOW/MEDIUM/HIGH/URGENT round-trips across API and wizard/details; unsupported values yield 422. Priority does not grant authorization or arbitrarily override routing.
- [ ] Wizard renders dynamic conditions/labels with English fallback, item row errors and server-confirmed totals, is read-only after submit and supports busy/stale/configuration states. Execute evaluator/contract/real-PG publication and admin-to-requester E2E with recorded evidence.
- [ ] Teammate reviews bounded implementation; feature PR targets `sprint-2-staging`, followed by reviewed promotion to `dev` then release-reviewed `main`. Run applicable typecheck, lint, build and planned tests; record actual commit/environment/results and disclose failures/skips. This planning issue asserts no implementation or passing tests.

## Required branch
`feature/8-configurable-forms-items-priority`

## Traceability
- Features: `R07`, `O16`, `O17`
- Functional requirements: `FR-024`, `FR-033`, `FR-034`
- Business rules: `BR-013`, `BR-014`, `BR-015`, `BR-016`, `BR-017`, `BR-018`, `BR-019`, `BR-020`, `BR-021`, `BR-022`, `BR-031`, `BR-032`, `BR-070`
- Acceptance criteria: `AC-024`, `AC-033`, `AC-034`
- Planned tests: `FT-024`, `FT-033`, `FT-034`; `EP-023`, `EP-024`, `EP-025`, `EP-026`, `EP-027`, `EP-028`, `EP-029`, `EP-030`, `EP-031`, `EP-033`, `EP-035`, `UT-03`, `UT-04`, `UT-05`, `UT-06`, `CT-02`, `CT-03`, `DB-13`, `CX-12`, `SEC-03`, `UI-05`, `UI-07`, `UI-08`, `UI-12`, `E2E-03`, `E2E-08`
- Contracts: `docs/specs/specifications.md` (frozen product v1.0), `docs/specs/api-specs.md` (frozen v1.0.1), `docs/specs/ui-specs.md` (frozen v1.0), `docs/specs/test.md` (planned verification).
- Supporting design/traceability: `docs/specs/srs.md`, `docs/specs/system-sds.md`, `docs/specs/traceability.md`, `docs/sprints/sprint-2.md`, root `AGENTS.md`.
- API paths use `/api/v1` unless explicitly stated otherwise; suffixes within a named endpoint family share its prefix. Preserve frozen contracts over older non-frozen sprint suggestions or scaffold defaults; no additional product behavior is implied.

## Estimated effort
- 8 points (planning estimate, not hours)
- Includes business rules, backend/API, frontend/UI, shared schemas, migrations/data integration, negative/race testing, documentation and integration review. Planned review workload mirrors the other teammate’s owned effort.
reflection/output: Versioned Issue #8 SDS, numbered AC, STS, DoD, and traceability updates before implementation. Implemented shared Zod schemas, definition graph validator (3-color DFS cycle checks across visibility/requiredness), bounded condition/locale evaluator, and BigInt decimal line-item arithmetic in packages/contracts. Added Drizzle schema/migration 0010, migrator/runtime privilege SQL, Clean Architecture RequestType domain/application/repository/routes for draft/branch/publish/enable/disable, and preserved pinned RETURNED edits on disabled types and immutable TypeVersion snapshots. Delivered /admin/request-types list/editor UI with up/down field reordering, constrained rule builder, shared-evaluator live preview, LineItemsEditor/LineItemsSummary, PriorityBadge, wizard/detail integration, and /admin session bootstrap protection. Added unit, OpenAPI contract, real-PostgreSQL concurrency/security, component, and Playwright E2E tests. Recorded actual passing/skipped test counts and repaired failures in docs/features/configurable-forms-items-priority/verification.md; independent @kittipichcha review, PRs, commits, and pushes remain pending explicit authorization.

## Issue #8 assistance

@oangsa
prompt: /scrutinize audit changes with specs, only major edge cases are blocker, only implementation mismatches are blocker
reflection/output: Performed an end-to-end audit of Issue #8 implementation against frozen specifications, OpenAPI, schema constraints, and UI components, identifying blockers in ConditionBuilder IN input editing and GET /api/v1/request-types/:id polymorphic dual-role response handling plus major/nit findings across quantity bounds, cycle error reporting, list filtering, locale fallback, and dialog focus restoration.

## Issue #8 assistance

@oangsa
prompt: fix
reflection/output: Fixed all audit findings: tightened editableLineItemSchema integer bound to 17 digits for PostgreSQL numeric(24,6) roundtrip safety, tracked DFS stack for full 3+ node cycle reporting, removed the polymorphic admin fallback on default GET /api/v1/request-types/:id, aligned create/branch Location headers to ?view=admin, documented ?view=admin and union schemas in RequestRoutes OpenAPI, normalized UUID parameters in RequestService, fixed ConditionBuilder IN interactive editing and incompatible operator/option selectors, updated RequestTypesListPage Published-only filter and Reset filters recovery, preserved unsaved edits on editor Enable/Disable, restored dialog focus, added Thai description/help-text safeguards and shared preferredBrowserLocale helper, added unit/OpenAPI/PostgreSQL/component regression tests, updated SDS/verification docs, and re-verified full workspace checks.

## Issue #8 assistance

@oangsa
prompt: <html>
reflection/output: Received an incomplete split HTML wrapper prompt before PR #88 blocking findings arrived; read existing branch context and awaited the full blocking-findings message.

## Issue #8 assistance

@oangsa
prompt: <body>
<!--StartFragment--><div><div></div><div><div><h2><span><strong>PR #88 — Blocking Findings</strong></span></h2><div><div>
ID | Blocking finding | Requirement | Required fix
-- | -- | -- | --
B01 — P1 | Stored published definitions are not fully validated at runtime. | CF-AC-06, BR-016/017 | Apply Zod and semantic graph validation before using stored definitions in requester operations. Reject invalid configurations without mutation.
B02 — P1 | Explicit null, empty or whitespace values can bypass field-type validation. | CF-AC-03/05, BR-017, API §6.4 | Distinguish omitted fields from supplied invalid values. Return 422 for incompatible values while preserving incomplete draft support.
B03 — P1 | Inherited JavaScript properties such as constructor can incorrectly activate conditional fields. | CF-AC-04/05, BR-015/018 | Use own-property-safe access and prototype-free value storage. Ensure hidden dependencies are always treated as unset.
B04 — P2 | The IN condition builder incorrectly splits valid values containing commas and cannot preserve all supported literals. | CF-AC-04/07, UI §11.3 | Replace comma-separated input with typed membership controls for each field kind.
B05 — P2 | Monetary values lack the required localized currency formatting. | R07, UI §8.4 | Implement locale-aware currency formatting without converting canonical decimal strings to floating-point numbers.
B06 — P2 | E2E tests do not verify rejection of missing conditionally required fields. | CF-AC-11, AC-033, E2E-03, UI-07 | Extend existing E2E tests to verify validation errors, focus behavior, server rejection and absence of database mutation.

</div></div><p><span><span><strong>Merge decision:</strong></span></span><span> Changes requested — 3 P1 and 3 P2 blockers.</span></p><p><span><span><strong>Additional merge gate:</strong></span></span><span> Update STS, DoD, traceability, verification evidence and Issue #8 after remediation.</span></p><p><span><span><strong>Scope restriction:</strong></span></span><span> Do not implement the complete resubmission lifecycle in this PR; it belongs to Issue #7.</span></p><p><span><span><strong>Review limitation:</strong></span></span><span> These findings are based on the inspected source code and CI evidence. An exhaustive local review remains unverified.</span></p></div></div></div><div></div><!--EndFragment-->
</body>
</html>
reflection/output: Remediated PR #88 blocking findings B01–B06 without implementing Issue #7's full resubmission lifecycle or committing/pushing/posting externally: added assertPublishedDefinition runtime Zod + semantic graph validation across requester reads and mutations (409 CONFIGURATION_INCOMPLETE, zero mutation), distinguished omitted draft keys from explicit null/empty/whitespace field inputs (422 VALIDATION_ERROR / INVALID_VALUE), added own-property-safe helpers and prototype-free Object.create(null) field storage across contracts/backend/wizard/preview (with plain own-property conversion at Drizzle persistence boundaries), replaced comma-splitting IN inputs in ConditionBuilder with typed membership controls per field kind, added BigInt + Intl.NumberFormat.formatToParts locale-aware currency formatting in formatMoney across LineItemsEditor/LineItemsSummary/RequestWizard/RequestResult, and extended unit/contract/PostgreSQL/component/E2E regressions (including client focus, aria-invalid, server 422 rejection, and zero DB mutation on missing conditionally required fields). Updated feature SDS, STS, DoD, traceability, verification.md, and prepared issue-comment.md. Verified npm run check (51 files / 468 tests, typecheck, lint, builds), fresh test:initialization (1/1), seeded RUN_BUILT_HTTP_SMOKE=1 test:integration (11 files / 115 tests), test:e2e (44 Chromium tests), test:release (13/13), and git diff --check all passed with zero skips.

## Issue #8 assistance

@oangsa
prompt: commit and push
reflection/output: Fetched feature/8-configurable-forms-items-priority, verified HEAD matches origin, packaged the verified PR #88 B01–B06 fixes, regression tests, and merge-gate documentation into five scoped atomic commits, verified clean diff checks, and pushed normally to origin/feature/8-configurable-forms-items-priority without force-push, merge, or external issue posting.

## Issue #9 assistance

@oangsa
prompt: $karpathy-guidelines $caveman
reflection/output: Applied the requested minimal-change, explicit-assumption and verification guidelines with concise communication throughout Issue #9 implementation.

## Issue #9 assistance

@oangsa
prompt: ## Type
- Full-stack Feature

## Sprint
- Sprint 2
- Planned primary owner: @oangsa — accountable for both API/DB and UI.
- Planned PR reviewer: @kittipichcha — independent teammate review, never self-review.
- Ownership allocation (2026-11-24): Balanced by existing issue estimates within each remaining sprint: 20 points per person in Sprint 2 and 20 points per person in Sprint 3, totaling 40 points each. #6 remains assigned to @oangsa at the owner's explicit request. The other teammate provides independent PR review. Estimates and frozen product/API/UI contracts are unchanged.
- Rebalance unstarted work if actual effort diverges; estimates do not prove equal actual contributions.

## Features
- `R09` — Conditional Approval Rules
- `O10` — Reviewer Assignment Management
- `O18` — Budget Limit Validation
- `O19` — Department-based Routing

## Depends on
- #4
- #8

## Scope
- Implement complete backend Domain/Application/Infrastructure/Presentation behavior, Drizzle data changes, shared Zod contracts, and permission validation needed for these features.
- Implement complete React Router 7 frontend routes, shadcn/ui + Tailwind-only UI, states and integration for the same features. Keep public SSR and authenticated client-loaded data isolated; use the owner-approved D-01 stack from #1: Node.js 24, npm Workspaces, root `package-lock.json`, Elysia through `@elysia/node`, TypeScript, Vitest for unit/API/contract/real-PostgreSQL integration tests and Playwright for browser E2E, with OOP/Clean Architecture, PostgreSQL/Drizzle and shared Zod contracts in `packages/contracts`. This runtime/toolchain amendment overrides obsolete engineering runtime wording only; all 54 features, frozen business/API/UI behavior, ownership and effort estimates remain unchanged.
- Implement conditional published policy resolution by type/trusted department/exact amount, versioned reviewer assignment mappings and hard monetary ceiling services/contracts/migrations integrated with submit/resubmit transaction.
- Deliver admin approval-policy, reviewer-assignment and budget-policy pages with eligible lookups, draft/publish/version controls, explicit priority and routing explanation; reuse shared forms/collections.
- Use seeded users/departments before general account management arrives. Own configuration and selection; staged execution/approver display remains with two-stage issue and no balance ledger is added.
- Add/update applicable unit, API/contract, real-PostgreSQL integration, security, concurrency and Playwright/E2E tests. Version feature SDS, UI/API/data contract, numbered AC, STS and DoD before implementation; preserve feature traceability and record actual verification evidence in this issue.
- Dependencies are integration prerequisites, not a ban on parallel implementation against the frozen shared contracts. Coordinate shared contract/schema changes and reuse earlier components; keep supporting consumer integrations separate from primary Feature ID ownership.

## Acceptance criteria
- [ ] Admin POST `/api/v1/admin/approval-policies` creates draft; PATCH `/:id/draft` uses expectedVersion; POST `/:id/draft` branches published version; POST `/:id/publish` takes expectedVersion/key and returns `201` immutable ApprovalPolicyDTO; disable affects future cycles only.
- [ ] Policy defines code, numeric priority, typeId, optional departmentId/minAmount/maxAmount and 1–2 stages with reviewerAssignmentKeys and business-minute SLA default 480. Third stage or ANY/quorum policy is rejected.
- [ ] Resolver evaluates applicable published type/department/amount predicates and chooses highest numeric priority. Equal highest tie returns `409 AMBIGUOUS_APPROVAL_POLICY`; no route returns `409 CONFIGURATION_INCOMPLETE`; neither partially submits.
- [ ] POST/search/PATCH `/api/v1/admin/reviewer-assignments` expose AssignmentRuleDTO with stable key, optional department, reviewerUserIds, isActive/version; validate active eligible non-self reviewers at resolution and snapshot actual cycle slots.
- [ ] `POST /api/v1/reviewers/eligible/search` is admin-only lookup; admin config permission provides minimum identity/routing metadata and never grants confidential request read/vote authority.
- [ ] POST/search/PATCH `/api/v1/admin/budget-policies` manage BudgetPolicyDTO with exact maxAmount, type/department and active/version. Resolve one most-specific active limit: department-specific overrides type-wide.
- [ ] Amount below/at ceiling accepted when other rules pass; above ceiling returns `422 BUDGET_LIMIT_EXCEEDED`. Additional stages derive from approval thresholds, with no remaining balance, funds mutation or payment accounting.
- [ ] Initial submit uses trusted admin-assigned department; returned resubmit keeps historical department/form and resolves current policy for new amount. Mapping/policy updates do not retroactively rewrite in-flight snapshots.
- [ ] Missing/inactive/self-only reviewer in any required slot returns `409 CONFIGURATION_INCOMPLETE`, leaving DRAFT/RETURNED and no orphan cycle/audit/notification; first stage cannot hide an invalid later-stage mapping.
- [ ] Admin UI provides eligible lookup, stage/ALL labels, priority/tie warning, clear ceiling explanation and 422/409 feedback; previews are local explanation without inventing a backend simulation endpoint.
- [ ] Verify nonadmin denial, stale/concurrent publication and resolver/amount boundaries with shared/API/real-PostgreSQL tests and full admin configure-to-submit E2E; retain audit/traceability/evidence in issue.
- [ ] Teammate reviews bounded implementation; feature PR targets `sprint-2-staging`, followed by reviewed promotion to `dev` then release-reviewed `main`. Run applicable typecheck, lint, build and planned tests; record actual commit/environment/results and disclose failures/skips. This planning issue asserts no implementation or passing tests.

## Required branch
`feature/9-policies-routing-budget`

## Traceability
- Features: `R09`, `O10`, `O18`, `O19`
- Functional requirements: `FR-026`, `FR-031`, `FR-035`, `FR-036`
- Business rules: `BR-018`, `BR-021`, `BR-023`, `BR-024`, `BR-025`, `BR-031`, `BR-035`, `BR-036`, `BR-045`, `BR-048`, `BR-054`
- Acceptance criteria: `AC-026`, `AC-031`, `AC-035`, `AC-036`
- Planned tests: `FT-026`, `FT-031`, `FT-035`, `FT-036`; `EP-022`, `EP-049`, `EP-050`, `EP-051`, `EP-052`, `EP-053`, `EP-054`, `EP-055`, `EP-056`, `EP-057`, `EP-058`, `EP-059`, `EP-060`, `UT-06`, `UT-07`, `API-08`, `DB-03`, `DB-04`, `DB-07`, `DB-13`, `CX-12`, `SEC-04`, `UI-13`, `E2E-08`
- Contracts: `docs/specs/specifications.md` (frozen product v1.0), `docs/specs/api-specs.md` (frozen v1.0.1), `docs/specs/ui-specs.md` (frozen v1.0), `docs/specs/test.md` (planned verification).
- Supporting design/traceability: `docs/specs/srs.md`, `docs/specs/system-sds.md`, `docs/specs/traceability.md`, `docs/sprints/sprint-2.md`, root `AGENTS.md`.
- API paths use `/api/v1` unless explicitly stated otherwise; suffixes within a named endpoint family share its prefix. Preserve frozen contracts over older non-frozen sprint suggestions or scaffold defaults; no additional product behavior is implied.

## Estimated effort
- 8 points (planning estimate, not hours)
- Includes business rules, backend/API, frontend/UI, shared schemas, migrations/data integration, negative/race testing, documentation and integration review. Planned review workload mirrors the other teammate’s owned effort.
reflection/output: Versioned Issue #9 feature SDS/API/UI/data design, numbered PRB acceptance criteria, STS and DoD before implementation. Implemented strict shared Zod schemas; Clean Architecture admin configuration endpoints; policy draft/branch/publish/disable with expectedVersion, durable idempotency and immutable published content; versioned reviewer groups and hard ceilings with transactional audit; Drizzle migrations 0011–0013 and runtime/migrator grants; all-stage non-self reviewer validation and exact conditional/ceiling resolution integrated with initial submission. Added React Router admin policy/mapping/ceiling pages with paged eligible lookups, filters, local routing explanation, ALL labels, 409/422 feedback and mobile layouts. Preserved per-stage accepted snapshots and added the owner-selected Issue #7 historical department/form integration seam without implementing its lifecycle. Verified 479 unit/API/contract/component tests, 124 real-PostgreSQL tests including HTTP smoke, fresh migrations/initialization (1 test), all 45 Chromium E2E tests and 13 release tests, plus typecheck/lint/build; repaired development failures and documented actual evidence. Changes remain uncommitted; independent teammate review and authorized commits/PRs/promotions are pending.

## Issue #9 assistance

@oangsa
prompt: what you asked again?
reflection/output: Restated the scope choice between a bounded Issue #9 integration seam and implementing the missing Issue #7 return/resubmit lifecycle; recommended preserving Issue #9 ownership.

## Issue #9 assistance

@oangsa
prompt: 1
reflection/output: Honored option 1: kept Issue #9 scoped and implemented/tested current-policy resolution using the persisted historical department and pinned form. Full return/resubmit lifecycle remains Issue #7. Continued UI, testing and evidence work for Issue #9.

## Issue #9 assistance

@oangsa
prompt: 1
reflection/output: Finalized the selected bounded Issue #9 scope. Final npm run check passed with 479 tests and all typecheck/lint/build checks; fresh CI-order PostgreSQL tests passed 124/124 and full Chromium passed 45/45; initialization passed 1/1 and release tests 13/13. Final targeted Chromium follow-up passed actual dark-token and reduced-motion checks. Recorded actual evidence in Issue #9 at https://github.com/oangsa/approval-system/issues/9#issuecomment-7153135001 as requested in the implementation scope. No commit, push, PR, merge, release or teammate self-review was performed.

## Issue #9 assistance

@oangsa
prompt: $caveman commit push and open pr to sprint-2-staging with issue 9 closing in the pr body.
reflection/output: Reviewed the pending Issue #9 changes, ran workspace verification, and organized scoped commits for specifications, shared contracts, backend configuration and routing, frontend administration, and verification records. User authorized commits, push, and a PR targeting sprint-2-staging with Closes #9; independent teammate review and later promotions remain required.

## Issue #9 assistance

@oangsa
prompt: /caveman
reflection/output: Applied concise communication style preference for user-facing responses while keeping source code, specifications, and documentation in standard prose.

## Issue #9 assistance

@oangsa
prompt: /karpathy-guidelines
fix

## Review — PR #90

**Verdict: REQUEST CHANGES**

Reviewed commit: `f53e955d947b70f6efabb3e47a0553388962f998`

The implementation is largely compliant with Issue #9 and the frozen product/API/UI contracts. Only implementation mismatches and major edge cases are considered blocking.

### [P1] Reviewer assignment keys are mutable despite the stable-key contract

**Affected features:** O10, R09, O19

**Locations:**
- `packages/contracts/src/policies.ts:35–37`
- `apps/api/src/Applications/Policies/ConfigurationService.ts:113–128`
- `apps/api/src/Infrastructures/Database/Repositories/ConfigurationRepository.ts:67–70`
- `apps/web/app/modules/admin/policies/ConfigurationListPage.tsx:156–159`

The PATCH schema allows changing an existing assignment key. The application service, repository and UI all permit this operation.

Published policies reference stable `reviewerAssignmentKeys`. Renaming an existing mapping can therefore invalidate published routing references or unexpectedly cause resolution to fall back to a global mapping with different reviewers.

**Required changes:**
- Preserve assignment keys after creation.
- Reject key changes at the backend.
- Make the key read-only when editing an existing assignment.
- Preserve optimistic concurrency and audit behavior.
- Add regression tests verifying that rejected renames do not alter mapping identity, published references or future routing.

### Non-blocking observations

- Full return/resubmit lifecycle remains with Issue #7 according to the owner-approved scope separation. The historical routing integration seam is implemented and tested.
- No additional blockers were identified in the inspected policy resolution, budget validation, reviewer eligibility, transactional submission, authorization or concurrency behavior.
- Remote GitHub Verification workflow passed.
- Independent teammate review remains required.

### Conclusion

Resolve the single P1 finding and rerun the applicable regression tests. No architectural redesign, feature expansion or unrelated refactoring is required.
reflection/output: Remediated the PR #90 P1 finding by making reviewer assignment keys immutable after creation: separated `patchAssignmentRuleSchema` from `key` in `packages/contracts/src/policies.ts`, validated update inputs against `patchAssignmentRuleSchema` while preserving `before.key`, optimistic `expectedVersion` checks, and `ASSIGNMENT_UPDATED` audit logging in `ConfigurationService.Assignment`, guarded `onConflictDoUpdate` against `assignment_key` changes in `ConfigurationRepository.SaveAssignment`, removed `assignment_key` from `GRANT UPDATE` in `deploy/runtime-grants.sql`, added `saveAssignment` TypeScript overloads in `apps/web/app/services/configurationService.ts`, and made the edit dialog key input `readOnly` while omitting `key` from update payloads in `ConfigurationListPage.tsx`. Added contract, OpenAPI, component, real-PostgreSQL (rename rejection, preserved identity/references/routing, concurrency, audit, and runtime privileges), and Playwright E2E regression tests; updated Issue #9 SDS, AC, STS, and verification records. Verified `npm run check` (typecheck, lint, 54 files / 480 tests, builds), `NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` (12 files / 125 tests), targeted `e2e/policies-routing-budget.spec.ts` (1/1), `npm run test:release` (13/13), and `git diff --check` all passed; full 45-test E2E and standalone `test:initialization` were not rerun. No commits, pushes, or external comments were performed.

## Issue #9 assistance

@oangsa
prompt: /karpathy-guidelines
reflection/output: Activated Karpathy coding guidelines (explicit assumptions, minimal surgical changes, and verifiable execution criteria) for the session and deferred recording until confirming the active issue and branch workflow.

## Issue #9 assistance

@oangsa
prompt: <html>
<body>
<!--StartFragment--><div><div></div><div><div><h2><span><strong>PR #90 — Blocking Findings</strong></span></h2><div><div>
ID | Blocking finding | Violated requirement | Where to fix | Required fix | Acceptance condition
-- | -- | -- | -- | -- | --
B01 | Missing concurrent policy publication versus request submission test. Existing tests cover concurrent publication and mapping updates, but not publication versus submission directly. | Issue #9 AC-11, PRB-AC-09, CX-12, BR-024, BR-045 | apps/api/tests/postgres/configuration.test.ts, sts.md | Add a real PostgreSQL integration test that publishes policy v2 while a requester submits a request using independent transactions. | The accepted cycle contains either a complete v1 or v2 snapshot, with no mixed stages, reviewers, or duplicate side effects.
B02 | Verification evidence is inconsistent and not explicitly tied to the current implementation revision. PR reports 479/124 tests, while the latest verification records report 480/125 tests. | Issue #9 AC-12, PRB-AC-10, AGENTS.md testing rules | verification.md, dod.md, PR #90 description, Issue #9 | Run applicable verification against the final implementation revision or provide equivalent CI evidence. Synchronize all verification records with the actual results. | Consistent test counts, tested commit SHA, environment, commands, results, and disclosed skips or failures across all records.

</div></div></div><div></div><!--EndFragment-->
</body>
</html>
reflection/output: Resolved PR #90 B01 and B02 with explicit user authorization for scoped commits, branch push, and PR #90 / Issue #9 synchronization. Added the `CX-12/PRB-AC-09` real multi-connection PostgreSQL integration test in `apps/api/tests/postgres/configuration.test.ts` racing policy v2 publication (`observer.connection`) against request submission (`database.connection`) across unscripted concurrent runs and lock-held interleavings, verifying both complete `v1` and complete `v2` cycle/stage/slot/approver snapshots occur with zero mixed stages/reviewers or duplicate versions, cycles, audits, or outbox events, and updated `docs/features/policies-routing-budget/sts.md`. Committed the implementation/test revision at `2e5f19d575b93ec9b2f8f792e3a264e85ecd7e87` and executed the full CI-order verification suite against it (`npm run check`: 54 files / 480 tests passed; `npm run test:release`: 13/13 passed; fresh `db:test:migrate`, `test:initialization`: 1/1 passed, `db:test:seed`, `RUN_BUILT_HTTP_SMOKE=1 npm run test:integration`: 12 files / 126 tests passed, `npm run test:e2e`: 45/45 passed; `git diff --check` passed; zero failures or skips). Synchronized `verification.md`, `dod.md`, `issue-comment.md`, PR #90 description, and Issue #9 comment `#issuecomment-7153135001` with the tested commit SHA, counts, environment, commands, and disclosures, then pushed `feature/9-policies-routing-budget` for independent `@kittipichcha` review.

## Issue #9 assistance

@oangsa
prompt: commit and push
reflection/output: Verified `feature/9-policies-routing-budget` already contained scoped commits `2e5f19d` (`test(policies): cover concurrent policy publish and request submit`) and `a8c232c` (`docs(policies): synchronize verification records for PR #90`) synced with `origin` with passing GitHub Actions `Verification` checks on PR #90; recorded this prompt in `ai_use.md`, committed, and pushed so the branch remains clean and synchronized with `origin`.

## Issue #11 assistance

@kittipichcha
prompt: Could you plan for this [https://github.com/oangsa/approval-system/tree/feature%2F11-sprint-2-full-stack-reporting-dashboards-timeline](https://github.com/oangsa/approval-system/tree/feature%2F11-sprint-2-full-stack-reporting-dashboards-timeline) [https://github.com/oangsa/approval-system/issues/11](https://github.com/oangsa/approval-system/issues/11) and then implement, test and review it. You are an orchestrator agent please spawn and mange your sub agent
reflection/output: Planned Issue #11 against frozen requirements and coordinated bounded planning, implementation and independent review agents. Implemented shared role-safe dashboard/report contracts, authorized PostgreSQL projections, dashboard/report screens and accessible persisted audit history. Recorded actual checks and resolved date validation and test defects; final pre-publication verification passed 418 unit/API/contract/component tests, 106 PostgreSQL tests and 35 browser tests. Human teammate review remained separate.

## Issue #11 assistance

@kittipichcha
prompt: I open docker for u now
reflection/output: Used the repository Docker test database with guarded loopback workflow_test, versioned migrations and synthetic fixtures for PostgreSQL and browser verification; no production data was used.

## Issue #11 assistance

@kittipichcha
prompt: continue
reflection/output: Resumed implementation verification after an account limit interruption, completed the recorded code/database/browser checks and fresh agent review, and left the changes uncommitted pending separate publication authorization.

## Issue #11 assistance

@kittipichcha
prompt: commit and push then pr for me
reflection/output: Prepared seven scoped feature commits and portable sanitized verification logs. Refreshed sprint-2-staging, preserved its new draft/withdrawal work through an ordinary synchronization merge, and retained both documentation additions when resolving conflicts. Publication verification and PR creation are recorded separately; no force push or release is authorized.

## Issue #11 assistance

@kittipichcha
prompt: continue
reflection/output: Resumed authorized publication after automatic approval review was unavailable. Retried through the approval mechanism, completed the scoped commits and staging synchronization, and reran verification before normal push and a feature PR targeting sprint-2-staging.

## Issue #11 assistance

@kittipichcha
prompt: continue
reflection/output: Completed the authorized normal push and PR #89, integrated concurrent staging PR #88 through a normal merge, and requested @oangsa review. Recorded the independent integration review, passing Linux CI steps and unresolved Windows component-test timeouts without weakening checks. No merge or release was performed.

## Issue #11 assistance

@kittipichcha
prompt: Could you plan and implement fix for this pr [https://github.com/oangsa/approval-system/pull/89](https://github.com/oangsa/approval-system/pull/89)
reflection/output: Inspected PR #89 and its changes-requested review against local HEAD 7c55bfca43ae360c82f3c1d4cfa8dd2fd23c021c. Coordinated a bounded plan and implementation for P1-01, causal ordering of equal-timestamp timeline events before pagination, with regression checks and independent review. Actual outcomes are recorded in the feature verification document. The three explicitly non-blocking observations remain outside this fix. No commit, push, PR comment, merge or release is authorized by this request.

## Issue #11 assistance

@kittipichcha
prompt: "you are orchestrator agent so please spawn and coordinate it "
reflection/output: Delegated read-only fix planning to the planning agent and coordinated separate implementation and review responsibilities, preserving repository instructions and the reviewed PR baseline. Agent verification does not substitute for teammate approval.

## Issue #11 assistance

@kittipichcha
prompt: review all blocker that could occur -> fix it then commit and push
reflection/output: Started a fresh full-PR review against sprint-2-staging, including the local causal timeline correction, using sequential requirements, defect, standards, security-boundary, test and evidence passes. This prompt separately authorizes scoped commits and a normal push of verified fixes to the existing PR branch. Confirmed findings, corrections, verification outcomes and publication status are recorded in the feature review and verification documents; teammate approval and merge/release remain separate gates.


## Issue #9 assistance

@oangsa
prompt: I want you to pull from sprint-2-staging
reflection/output: Fetched `origin` and initiated `git pull --no-rebase origin sprint-2-staging` (`e3816c0af4a80c302cf0fc6e30bb4e3cdd1fa006`, PR #89 reporting/dashboard/timeline merge) into `feature/9-policies-routing-budget`. Resolved merge conflicts while preserving both features across `packages/contracts/src/index.ts`, `apps/api/src/Presentations/Application.ts`, `apps/api/src/Presentations/createApplication.ts` (including both `reporting` and `configuration` preflight guards and route registrations), `apps/api/src/index.ts`, `apps/web/tests/components/shell.test.tsx`, and `ai_use.md`, and updated the two positional `createApplication(...)` calls in `apps/api/tests/postgres/configuration.test.ts` to match the 9-parameter signature. Verified the merged tree with `npm run check` (60 files / 501 tests passed), `npm run test:release` (13/13 passed), fresh PostgreSQL `db:test:migrate` + `test:initialization` (1/1 passed) + `db:test:seed` + `RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` (13 files / 143 tests passed) + `npm run test:e2e` (49/49 passed), with zero failures or skips, and completed the local merge commit without pushing.

## Issue #9 assistance

@oangsa
prompt: make sure you pull form origin/sprint-2-staging not the local one
reflection/output: Confirmed the pull merged remote-tracking `origin/sprint-2-staging` (`e3816c0af4a80c302cf0fc6e30bb4e3cdd1fa006`) rather than the older local `sprint-2-staging` branch (`bdab39b`).

## Issue #9 assistance

@oangsa
prompt: push
reflection/output: Synchronized `verification.md`, `dod.md`, `issue-comment.md`, `ai_use.md`, PR #90 description, and Issue #9 comment `#issuecomment-7153135001` with the tested merged revision `7238a20ae1451f87ea5b89d14058966d09337908` (`60` files / `501` Vitest, `13` release, `1` initialization, `13` files / `143` PostgreSQL, `49` Playwright Chromium E2E, `0` failed, `0` skipped), committed `docs(policies): synchronize post-merge verification records`, and pushed `feature/9-policies-routing-budget` to `origin`.

## Issue #7 assistance

@kittipichcha
prompt: plan and implement this issue [https://github.com/oangsa/approval-system/issues/7](https://github.com/oangsa/approval-system/issues/7) for this branch feature/7-sprint-2-full-stack-return-revision-resubmission. U are an orchestrator agent so please spawn an agent to plan, implement, fix and review and fix then commit push and make pr 
reflection/output: Coordinating delegated planning, implementation, fixes and independent agent review for M11/R02/R03/R04/R11 on the requested feature branch, starting from origin/sprint-2-staging at 7238b5e. Scoped commits, push and a feature PR are explicitly authorized. Actual verification and publication outcomes will be recorded in docs/features/return-revision-resubmission/verification.md; independent teammate review and subsequent promotions remain separate gates.

## Issue #7 assistance

@kittipichcha
prompt: checck the current progess and continue from what you left off
reflection/output: Resumed the authorized issue #7 work, inspected preserved implementation and interrupted verification, and delegated browser-failure diagnosis and an independent full-scope review. Continuing final checks, bounded fixes, scoped commits, push and a PR to sprint-2-staging; actual outcomes are recorded in the feature verification document.

## Issue #7 assistance

@kittipichcha
prompt: Read the current plan and progress then continue from it then commit and push
reflection/output: Resumed issue #7 from the preserved plan and verification records, re-verified the final uncommitted tree end to end (typecheck, lint, 526 Vitest, 180 real-PostgreSQL integration, build, 51 Playwright browser journeys, all passing), inspected desktop/mobile screenshots, restored an unrelated trailing-whitespace change, and recorded the final verified results in docs/features/return-revision-resubmission/verification.md. Then created scoped commits and pushed the feature branch; independent teammate review and staged promotions remain separate gates.

## Issue #10 assistance

@kittipichcha
prompt: Implement this for me [https://github.com/oangsa/approval-system/issues/10](https://github.com/oangsa/approval-system/issues/10) for this branch feature/10-sprint-2-full-stack-two-stage-parallel-approvals, u are an orchestrator agent please spawn and handle subagent 
reflection/output: Coordinated delegated planning, implementation, test-fixture repairs and independent review for R08/R10/O13 on the requested branch from e011d1a. Documented feature contracts before source edits; implemented ordered/parallel ALL approvals, participant-only approver summaries, activation timestamp/outbox seam and progress UI. Verified typecheck, lint, build, 534 ordinary tests (documented local 20-second allowance), 191 real-PostgreSQL tests, 52 Playwright browser tests and 13 release-tool tests. Recorded initial failures, corrections, model/reasoning escalations, isolated environment, source hashes and review in docs/features/two-stage-parallel-approvals/. No commit, push, PR publication, deployment or teammate approval was performed.

## Issue #10 delivery assistance

@kittipichcha
prompt: Could you read the current plan and implement and commit and push and pr for me
reflection/output: Read docs/features/two-stage-parallel-approvals/plan.md and the surrounding contracts, verification and review records, confirmed the working tree still matched the reviewed source manifest with zero hash mismatches, and re-ran every planned gate locally (typecheck, lint, 534 ordinary tests in 63 files, 191 real-PostgreSQL integration tests, build, 13 release-tool tests, the focused two-stage browser journey and the full 52-test Playwright regression) with no failures or skips. Then split the uncommitted tree into scoped commits, correcting two commits that had picked up a UTF-8 byte-order mark in the subject before pushing, and opened the pull request against sprint-2-staging. Teammate review and promotion to dev and main remain separate gates.

## Issue #10 delivery assistance

@kittipichcha
prompt: continue then commit and push and pr 
reflection/output: Inspected the current clean branch and existing seven scoped commits, verified GitHub PR #92 is already open against sprint-2-staging with remote head matching local 4e2ca4334fc502b94c7292c45d3ca0cb05140470, and rechecked all 27 reviewed source/test/configuration hashes with zero mismatches. Prepared a documentation-only delivery follow-up and reused the existing PR. Prior test results remain historical verification of unchanged source; application tests were not repeated for this documentation-only continuation. Human teammate review, merge and release promotion remain separate gates.

## Issue #10 blocker assistance

@kittipichcha
prompt: Have you resolve the blocking? if not fix it
reflection/output: Retrieved PR #92 submitted reviews and confirmed the missed P1: original reviewer tuple matching rejected supported reassignment, including a WAITING future slot. Delegated bounded diagnosis, test-first implementation and fresh independent review. Changed validation to preserve required per-stage/key counts while authorizing the effective persisted reviewer; retained identity, eligibility, self/version, locking, audit and immutable snapshot guarantees. Real PostgreSQL RED reproduced three failures; all seven new regressions then passed. Final verification passed 534 ordinary tests with one worker and the documented timeout allowance, 198 PostgreSQL tests, 52 browser tests, 13 release-tool tests, typecheck, lint and build. Disclosed the initial known frontend flake and incorrect-CWD listener failure. Fresh local review approved with no findings; prepared the tested repair for PR #92. No reassignment endpoint or schema was added. The submitted human CHANGES_REQUESTED review remains pending teammate re-review.

## Issue #12 assistance

@oangsa
prompt: what about sprint 3 flow
reflection/output: Checked live Sprint 3 issue ownership and dependencies for #12–#17. Recommended oangsa #12 then #14 then #16, and kittipichcha #13 then #15 then #17, assuming required earlier-sprint integrations are available. Identified #17's integration dependency on #12 and #11, #14's dependencies on #9 and #10, #15's dependency on #10, and the shared admin routing search coordination between #14 and #15 without imposing a dependency cycle. Existing assignments remain 20 estimated points per person. Created a local chore branch to append this required assistance record instead of developing on sprint-3-staging; no commit, push or GitHub mutations.

## Issue #12 assistance

@oangsa
prompt: I want you to moved this change in to branch feature/12-request-search-filter-pagination then make it up-to-date with branch sprint-3-staging
reflection/output: Fetched origin, preserved the uncommitted Sprint 3 assistance record in a temporary stash and a backup patch, switched to feature/12-request-search-filter-pagination, and fast-forwarded it from 23c30f9 to the fetched origin/sprint-3-staging at 3ad347c. Restored the assistance record without conflicts and appended this prompt. Verified the feature branch matches the fetched staging commit and the only working-tree change is the appended ai_use.md records. No new commit or push; application tests were not rerun because this was a clean fast-forward to existing staging code plus documentation only.

## Issue #12 assistance

@oangsa
prompt: move current change to git fetch origin
git checkout feature/12-request-search-filter-pagination-v2

Idk how we got feature/12-request-search-filter-pagination from sprint 1
reflection/output: Fetched origin and switched to the new local feature/12-request-search-filter-pagination-v2 branch tracking its origin counterpart at 3ad347c, preserving all uncommitted ai_use.md additions. The prior assistance record explains that the older feature branch had been reused and fast-forwarded locally from 23c30f9 to sprint-3-staging; its remote tracking branch remained behind. Verified the v2 branch has no committed divergence from origin and only ai_use.md is modified. No commit or push; application checks were not rerun for this branch switch and documentation-only change.

## Issue #12 assistance

@oangsa
prompt: Implement

## Type
- Full-stack Feature

## Sprint
- Sprint 3
- Planned primary owner: @oangsa — accountable for both API/DB and UI.
- Planned PR reviewer: @kittipichcha — independent teammate review, never self-review.
- Ownership allocation (2026-11-24): Balanced by existing issue estimates within each remaining sprint: 20 points per person in Sprint 2 and 20 points per person in Sprint 3, totaling 40 points each. #6 remains assigned to @oangsa at the owner's explicit request. The other teammate provides independent PR review. Estimates and frozen product/API/UI contracts are unchanged.
- Rebalance unstarted work if actual effort diverges; estimates do not prove equal actual contributions.

## Features
- `R12` — Search Requests
- `R13` — Status & Date Filters
- `R14` — Sorting & Pagination

## Depends on
- #3
- #4

## Scope
- Implement complete backend Domain/Application/Infrastructure/Presentation behavior, Drizzle data changes, shared Zod contracts, and permission validation needed for these features.
- Implement complete React Router 7 frontend routes, shadcn/ui + Tailwind-only UI, states and integration for the same features. Keep public SSR and authenticated client-loaded data isolated; use the owner-approved D-01 stack from #1: Node.js 24, npm Workspaces, root `package-lock.json`, Elysia through `@elysia/node`, TypeScript, Vitest for unit/API/contract/real-PostgreSQL integration tests and Playwright for browser E2E, with OOP/Clean Architecture, PostgreSQL/Drizzle and shared Zod contracts in `packages/contracts`. This runtime/toolchain amendment overrides obsolete engineering runtime wording only; all 54 features, frozen business/API/UI behavior, ownership and effort estimates remain unchanged.
- Extend authorized requests/reviewer task queries with shared bounded search/filter/sort/page contracts, exact X-Pagination transport and intentional PostgreSQL indexes.
- Complete reusable DataTable collection controls, URL query state, debounced search, status/date filter chips and page/sort controls; render same authorized data/actions as desktop table or mobile cards.
- Maintain owner/reviewer scope before filtering/counting and reuse existing collection/transport primitives; do not add alternative GET query endpoints.
- Add/update applicable unit, API/contract, real-PostgreSQL integration, security, concurrency and Playwright/E2E tests. Version feature SDS, UI/API/data contract, numbered AC, STS and DoD before implementation; preserve feature traceability and record actual verification evidence in this issue.
- Dependencies are integration prerequisites, not a ban on parallel implementation against the frozen shared contracts. Coordinate shared contract/schema changes and reuse earlier components; keep supporting consumer integrations separate from primary Feature ID ownership.

## Acceptance criteria
- [ ] POST `/api/v1/requests/search` and `/api/v1/approval-tasks/search` use pageNumber/pageSize/search/searchTerm/orderBy, return direct arrays and truthful X-Pagination exposed by approved CORS.
- [ ] Request text search allowlists requestNumber/title; search conditions combine AND, comma-separated allowlisted searchTerm fields combine OR, both groups combine AND. Queue fields remain its own narrower allowed task attributes.
- [ ] Status and UTC date filters honor requested EQUAL/GREATEROREQUAL/LESSEROREQUAL etc. boundary operators; UI Bangkok date presentation does not alter wire instants/calendar-only values.
- [ ] One allowlisted sort field plus asc/desc uses stable UUID tiebreaker, giving deterministic equal-value/page-boundary results. Pages are 1-based; adopt documented default size 20/max100 unless recorded compatible default adjustment.
- [ ] Bad fields/operators, hidden joins/raw SQL paths, malformed dates/page sizes/sort or unbounded query return `422 VALIDATION_ERROR` without query injection or private schema disclosure.
- [ ] Authorization applies before result filtering, totalCount and pagination. Client requesterId/departmentId cannot widen visibility; foreign owner/task data and counts never leak.
- [ ] Debounced search, status/date controls, removable chips, Reset filters and page-size/sort changes preserve query state in URL/back navigation and correctly request server pages.
- [ ] Desktop table and compact mobile cards share result/query/action definitions; cards preserve identity/status/priority/due/actions without whole-page overflow or client-only filtering of paged data.
- [ ] Distinguish empty dataset/no matches; accessible skeleton/retry/error states, canceled/ignored outdated fetches and logout/account-switch cache isolation prevent stale private display.
- [ ] Run real query/API/header/allowlist/privacy integration and responsive URL-state/browser checks; record actual results and index/query documentation within issue.
- [ ] Teammate reviews bounded implementation; feature PR targets `sprint-3-staging`, followed by reviewed promotion to `dev` then release-reviewed `main`. Run applicable typecheck, lint, build and planned tests; record actual commit/environment/results and disclose failures/skips. This planning issue asserts no implementation or passing tests.

## Required branch
`feature/12-request-search-filter-pagination`

## Traceability
- Features: `R12`, `R13`, `R14`
- Functional requirements: `FR-037`, `FR-038`, `FR-039`
- Business rules: `BR-068`, `BR-069`, `BR-072`, `BR-073`
- Acceptance criteria: `AC-037`, `AC-038`, `AC-039`
- Planned tests: `FT-037`, `FT-038`, `FT-039`; `EP-032`, `EP-043`, `UT-12`, `API-04`, `API-05`, `API-06`, `SEC-02`, `SEC-11`, `UI-16`, `UI-20`, `UI-23`, `E2E-13`, `E2E-15`
- Contracts: `docs/specs/specifications.md` (frozen product v1.0), `docs/specs/api-specs.md` (frozen v1.0.1), `docs/specs/ui-specs.md` (frozen v1.0), `docs/specs/test.md` (planned verification).
- Supporting design/traceability: `docs/specs/srs.md`, `docs/specs/system-sds.md`, `docs/specs/traceability.md`, `docs/sprints/sprint-3.md`, root `AGENTS.md`.
- API paths use `/api/v1` unless explicitly stated otherwise; suffixes within a named endpoint family share its prefix. Preserve frozen contracts over older non-frozen sprint suggestions or scaffold defaults; no additional product behavior is implied.

## Estimated effort
- 4 points (planning estimate, not hours)
- Includes business rules, backend/API, frontend/UI, shared schemas, migrations/data integration, negative/race testing, documentation and integration review. Planned review workload mirrors the other teammate’s owned effort.


The required branch got created from sprint-1-staging idk how. So, I created this v2 instead. And if you got any question please feel free to ask me kindly.

Advance Search and Filter please see these

## maintenance-tracking-system
- My own code, can be copy
- https://github.com/oangsa/maintenance-tracking-system
- https://github.com/oangsa/maintenance-tracking-system-api

[Reference-only section omitted at the requesting owner's explicit direction.]
reflection/output: Wrote feature SDS/API/UI/data contracts, numbered acceptance criteria, STS and DoD before implementation. Extended existing resource-scoped queries and shared collections on the v2 branch; retained Domain/Application authorization, direct arrays and exposed X-Pagination. Added compatible date equality/suffix operators, precise UTC queue comparison, statement-consistent request counts, intentional generated indexes, review URL validation/date/chip/page-size/sort controls, and regression coverage. Verification results are recorded in docs/features/request-search-filter-pagination/verification.md. No commit, push, issue comment, pull request, merge or deployment was authorized or performed.

## Issue #12 assistance

@oangsa
prompt: [Owner exclusion instruction omitted verbatim because it names material the owner explicitly requested be excluded from this record.]
reflection/output: Honored the owner's exclusion of the reference-only source name and code from this assistance record. Existing content was preserved.

## Issue #12 assistance

@oangsa
prompt: [Continuation of the implementation request recorded above.]
reflection/output: Final verification passed 559 ordinary tests, all 198 PostgreSQL tests with optional built-listener checks enabled and zero skips, four focused Chromium browser tests, typecheck, lint and build. Corrected a measured mobile chip overflow and preserved existing records. Prepared issue-comment.md and attempted to record the requested evidence on issue #12; automatic approval review rejected the connector's PR-oriented destination parameter as ambiguous. No comment was posted and no alternate write path was attempted. Source remains uncommitted on the v2 branch; teammate review and staged promotion remain pending.

## Issue #12 assistance

@oangsa
prompt: commit  push and open pr to sprint-3-staging
reflection/output: Inspected the complete diff and preserved prior assistance records and exclusions. Fetched origin and confirmed the feature starting commit matches sprint-3-staging. Split specifications, backend/contracts with tests, generated database indexes, UI with tests, and verification/assistance documentation into scoped atomic commits. Recorded the tested source commits and prepared the authorized v2 branch push and feature PR to sprint-3-staging with independent teammate review requested from @kittipichcha. Retained the actual 559 ordinary/198 PostgreSQL/four focused browser results and typecheck/lint/build evidence from the implementation session; source behavior was unchanged during publication preparation. No merge or deployment is authorized.

## Issue #12 assistance

@oangsa
prompt: fix failed ci
reflection/output: Inspected PR #94 Verification run 45937634578 and identified its sole failed browser test: the legacy /^Due/ label selector matched the overdue select and both new date inputs. Reproduced the unchanged focused failure, traced the strict-mode and pending-response teardown paths, and narrowed only the test selector to the combobox role without weakening assertions or changing application behavior/timeouts. Typecheck and lint passed. A full local run exposed accumulated fixture pagination failures (44 passed/nine failed); preserved that database and reran against a separate freshly migrated/seeded disposable PostgreSQL database, where all 53 browser tests passed. Recorded evidence and prepared the scoped test repair for the already-authorized feature branch push and PR CI rerun. No merge or deployment.

## Issue #12 assistance

@oangsa
prompt: commit and push
reflection/output: Confirmed the CI repair was already committed and pushed as df4d836 on feature/12-request-search-filter-pagination-v2, with a clean working tree and no divergence from its tracking branch. Added this required assistance record for the repeat commit/push request; no source behavior changed. The complete GitHub Verification run 45939473365 for df4d836 passed. PR #94 continues to target sprint-3-staging; no merge or deployment.

## Issue #13 assistance

@kittipichcha
prompt: You are an orchestrator agent. Continue implementing GitHub Issue #13 (Comments & Private Attachments — O01 & O02) from Phase 1 through Phase 8 in this worktree, spawning and managing subagents cleanly. (Full packet plan P1 -> P2/P3 -> P4 -> P5 -> P6 -> P7 -> P8 with GCS ADC storage, migration 0017, deploy wiring and test updates; stop before push/PR.)
reflection/output: Orchestrated scoped subagents for contracts, migration 0017 with the protect_submitted_attachment trigger and grants, RequestAccessPolicy and GCS/in-memory storage, comment/attachment services, routes, cleanup worker and deploy wiring, the Discussion / Files UI and wizard Step 4, and PostgreSQL/E2E suites; committed each packet as scoped atomic commits. Full verification passed (typecheck, lint, build, contracts 64, API 268, web 297/299 with the two pre-existing timeouts, PostgreSQL 235, E2E 54, release 14). Verification caught and fixed a CMT-PG-05 test input and a B03 owner-read regression in RequestAccessPolicy. Live GCS tests are blocked (no ADC/test bucket) and the independent review subagent hit quota, both disclosed in verification.md.

## Issue #13 assistance

@kittipichcha
prompt: Please continue until you can create a pr
reflection/output: Completed the Phase 8 documentation updates (STS statuses, verification, test.md, traceability.md, README.md), ran targeted self-review checks in place of the quota-blocked review subagent, and prepared the feature branch push and PR into sprint-3-staging per the explicit instruction. No merge or deployment.

## Issue #13 assistance

@kittipichcha
prompt: You continue until we can finish this issue
reflection/output: Fixed PR #97 blocking finding B01 by enforcing a bounded request-body reader (apps/api/src/Presentations/Guards/boundedBody.ts) in AttachmentRoutes.ts before multipart parsing and adding concurrent streamed and Content-Length regression tests (ATT-API-05b, ATT-API-05c). Resolved B02 by executing npm run test:storage against the isolated test bucket approval-system-attachments-test in cpe334-514311 via ADC (9/9 passed: production-bucket guard + GCS-IT-01..08). Addressed N01 by locking and checking the reservation status (UPLOADING) inside AttachmentRepository.FinalizeUpload so expired reservations reclaimed by cleanup cannot finalize dangling metadata (verified with ATT-REC-11; 11/11 in attachmentCleanup.test.ts passed). Wired optional CLEANUP_JOB_NAME deployment updates into deploy/release.sh, .github/workflows/deploy.yml, and deploy/tests/release.test.ts (14/14 passed), and documented Cloud Run Job + Cloud Scheduler provisioning and recovery in docs/features/comments-private-attachments/cleanup-runbook.md. Verified typecheck, lint, test:contracts (64/64), and test:api (270/270). Remaining external gates: GCP Cloud Run Job/Scheduler provisioning (B03) and teammate review + GitHub CI Verification (B04).
