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
