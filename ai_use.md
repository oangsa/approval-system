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
