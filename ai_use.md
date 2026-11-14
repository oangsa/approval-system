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
