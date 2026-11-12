# Issue #25 - pull-request CI and required quality gates

## 1. Purpose and source baseline

This is the implementation and evidence handoff for [Issue #25](https://github.com/oangsa/approval-system/issues/25), dated 2026-11-12 (Asia/Bangkok). Source branch: `feature/25-lab5-ci-quality-gates`; target: `sprint-1-staging`; inspected baseline: `26fd0bdb6b5c50189ccdd74041a13ff2206bc697`. Local results below apply to that baseline plus the source changes described here, tested before publication. Hosted results are recorded separately against their exact revisions. The user subsequently authorized scoped commits, branch publication and the implementation PR. Issue acceptance remains pending.

Authority: root [AGENTS.md](../../../AGENTS.md), [.github/workflows/ci.yml](../../../.github/workflows/ci.yml), [test specification](../../specs/test.md), [traceability](../../specs/traceability.md), [container readiness](container-readiness.md), [container verification](container-verification.md), and [release-process history](release-process-verification.md). The tracked [Lab 5 handout](../../../examples/Lab-5/01_SE_Lab_5_updated.pdf) sections 4, 8, 9, 11 and 12, Student Guide Episodes 4 and 6.5-6.6, and starter-kit `ci-docker.yml` were inspected as course source text. PDF extraction reported malformed-object/startxref warnings; no diagram/layout audit is claimed. Extracted references stay in ignored local artifacts.

The handout requires meaningful builds/tests on relevant PRs (R-05/C-01), a required passing check and an unmergeable temporary failing PR (R-06/C-02). R-09 requires issues, board tracking, teammate-reviewed staging PRs, release PRs, and specific review content; R-10 requires Lab 5 labels, preserved commits/contracts/runs and mandatory CI after Lab 5; R-11 requires both members' participation across requirements, testing, supervision, implementation, review and deployment; R-12 requires public code/issues/PRs/runs through grading. These are distinct acceptance conditions. An empty approval or a green local test does not establish them.

The reference kit's `test-and-docker`, Prisma commands and branch filters are examples. This repository retains Node 24/npm workspaces, Drizzle, React Router SSR, Elysia, the established `verify` identity and unrestricted triggers. Accepted work follows feature -> `sprint-1-staging` -> `dev` -> `main`, with reviewed PRs at every transition. No deployment or cloud permission is added here.

## 2. CI contract

The workflow title is **Verification**; its sole required job/context is **`verify`**. Both `push` and `pull_request` remain enabled without branch/path filters. It runs on `ubuntu-24.04`, with `timeout-minutes: 30` and only `permissions: contents: read`.

Steps run in this order; failure prevents a successful `verify` conclusion:

1. Checkout; Node.js 24 setup with root `package-lock.json` npm cache; `npm ci` (npm 11 toolchain).
2. `npm run typecheck`, `npm run lint`, and separate web, API and contracts Vitest projects with JUnit diagnostics.
3. `npm run build` for SSR/client, API and contracts.
4. `docker build -f apps/api/Dockerfile -t approval-api:ci .`.
5. `docker build -f apps/web/Dockerfile -t approval-web:ci .`.
6. Guarded disposable PostgreSQL migration, synthetic seed and real integration suite, including `RUN_BUILT_HTTP_SMOKE=1`.
7. Build `.github/ci/playwright.Dockerfile`; run Playwright in the prepared browser image with host networking, the runner user's identity and the guarded loopback database.
8. Upload `artifacts/` diagnostics with `if: always()`, including failures.

Both production images use the root build context and lockfile, Node 24 multi-stage Dockerfiles and non-root runtime user `node`; web retains SSR. Their build steps are mandatory, with no optional conditions or `continue-on-error`. They do not push images, authenticate to GCP, read production secrets or deploy. The browser image pins Playwright 1.60.0 with preinstalled browsers/OS dependencies and copies Node 24 into it; CI does not install Chromium on the runner host.

PostgreSQL 17 service data is disposable `workflow_test`. `ci_test_only` is a synthetic CI fixture password, not a production credential. The guard requires explicit test mode and a loopback `workflow_test` URL distinct from development, and rejects overrides/remote targets. Never bypass it or use a production URL. Existing authorization, request persistence, decision replay/concurrency/rollback and browser journey suites remain the behavior checks; no duplicate product tests are added.

To reproduce locally from a clean checkout with Node 24/npm 11 and Docker:

```sh
npm ci
npm run typecheck
npm run lint
npm run test:web
npm run test:api
npm run test:contracts
npm run build
docker build -f apps/api/Dockerfile -t approval-api:ci .
docker build -f apps/web/Dockerfile -t approval-web:ci .
git diff --check
```

For DB/browser checks, fill only local placeholders in ignored `apps/api/.env.test` from its example, choosing a separate test password. Unset `PGPORT`; use an unused loopback port in both the Compose settings and `TEST_DATABASE_URL`. Follow the [README](../../../README.md#disposable-postgresql-tests):

```sh
npm run db:test:up
npm run db:test:migrate
npm run db:test:seed
# After npm run build; enable real listener/restart integration coverage.
NODE_ENV=test RUN_BUILT_HTTP_SMOKE=1 npm run test:integration
# For host execution only if Chromium/dependencies are not installed:
npm run test:e2e:install
npm run test:e2e
npm run db:test:down
```

The inline environment assignment above is POSIX shell syntax. In PowerShell set `$env:NODE_ENV = 'test'` and `$env:RUN_BUILT_HTTP_SMOKE = '1'` before the integration command, then restore prior values. The test environment loader reads the private test file. For Linux container browser execution, use the exact CI container command and a Linux dependency installation; do not share Windows `node_modules` with a Linux test runtime. Record local adaptations separately from hosted evidence.

## 3. Branch-protection register

These IDs/settings come from the recorded 2026-11-12 [administrative readback](release-process-verification.md#required-merge-gates). They are historical evidence, not a new effective-settings inspection by this implementation.

| Exact branch target | Existing ruleset | Required context | Integration | Current independent verification |
| --- | --- | --- | --- | --- |
| `refs/heads/sprint-1-staging` | [27084285](https://github.com/oangsa/approval-system/rules/27084285) | `verify` | GitHub Actions 15368 | Pending owner + teammate |
| `refs/heads/dev` | [27084322](https://github.com/oangsa/approval-system/rules/27084322) | `verify` | GitHub Actions 15368 | Pending owner + teammate |
| `refs/heads/main` | [27084320](https://github.com/oangsa/approval-system/rules/27084320) | `verify` | GitHub Actions 15368 | Pending owner + teammate |

For each, retain actual effective-rule readback showing Active, exact branch target, PR required, at least one independent approval, stale approval dismissal, resolved review threads, strict up-to-date required `verify`, integration 15368, no bypass actors/admin bypass, and blocked force pushes/deletions. Record timestamp, verifier, inspected source and proof URL. No settings change is necessary if these remain correct. Do not infer the check name from the workflow title or count missing approval as proof of required-check failure.

Board tracking remains pending owner recovery: [automation run](https://github.com/oangsa/approval-system/actions/runs/43150681004/job/130958837430) logged at 2026-11-12 03:49:01 UTC: `Skipping issue #25: cannot move Backlog to PR Review.` The supplied PR #34 review also reports that branch creation expected `Specified` but found `Backlog`; that separate event was not independently inspected here. No recovery evidence was supplied. Existing documentation reports missing `read:project`. Issue #24 is closed; its owner must reconcile closure with outstanding acceptance evidence.

## 4. C-01 procedure

After explicit Git publication authorization, publish the feature branch and open its PR into `sprint-1-staging`, labelled `lab5`, referencing #25. Retain coherent commits: `ci(pipeline): require production image builds` for YAML, `test(api): allow bounded process startup in restart check` for the diagnosed test-harness correction, and `docs(ci): document quality gates and verification` for documentation. Inspect staged contents before committing.

Inspect that PR's actual `Verification / verify` run after the new steps exist. Save PR URL, base/head branches, full source head SHA, Actions checkout/merge SHA (when different), run/job links, execution timestamp, all test counts, both production-image step conclusions, integration/browser results, warnings/retries and reviewer identity. Require a successful job and actual execution of both production builds. Previous passing runs such as [PR #32's run](https://github.com/oangsa/approval-system/actions/runs/43046956428) predate the new gate and cannot establish this C-01 acceptance.

Ask the teammate to record a specific check, question, finding or approval reason on the final revision. The author cannot supply independent approval. New pushes may invalidate earlier approvals. `Closes #25` is the requested implementation-PR reference, but project automation may close the issue on staging merge: assemble #25 acceptance evidence before merge and reconcile/reopen any premature closure. Promotion PRs use non-closing references. Do not promote directly to protected branches or skip `dev`.

## 5. C-02 procedure

This is a separate acceptance demonstration; its completed technical evidence is recorded in section 6. For a future repetition, reverify protected `main` and required `verify` first. After authorization, use a separate clean worktree/branch based on current `origin/main`, named `test/25-required-gate-failure`. Never place the probe on this implementation branch or accepted release path.

Create only `packages/contracts/tests/ciRequiredGateProbe.test.ts` on that temporary branch:

```ts
import { expect, test } from "vitest";

test("intentionally fails to demonstrate required CI protection", () =>
{
    expect("required-check-failed").toBe("required-check-passed");
});
```

`packages/contracts/vitest.config.ts` discovers `tests/**/*.test.ts`. Run `npm ci`, then `npm run test:contracts -- --reporter=verbose`. Confirm the nonzero exit comes from precisely the unequal-string assertion, with no unrelated failures. Obtain separate commit/push/PR authorization; commit only this fixture as `test(contracts): demonstrate required CI failure`.

Open `[Lab 5] Deliberate required-check failure - DO NOT MERGE` targeting **main**, label `lab5`, with **Related to #25** and no closing keywords. Inspect the actual failed `verify` job and assertion log. Inspect GitHub mergeability: required `verify` must be unsuccessful and prevent merge. Capture the failed required check and blocked merge together; a missing review or a ruleset screenshot alone is insufficient. Never attempt a merge or use an administrative bypass.

Retain full head/tested SHAs, run/job URLs, timestamp, assertion excerpt, required-check readback, and readable redacted merge-block screenshot or equivalent GitHub evidence. Close the PR **without merging**, retaining its branch commit and run history. Do not delete/rewrite this evidence. The released application remains unchanged.

## 6. Evidence ledger

Statuses: **Planned**, **Passed**, **Failed**, **Blocked**, **Environment Failure**, **Not Run**. A procedure is not a result. Only inspected executed evidence may be Passed; environment failures are distinct from product defects. Hosted evidence below was inspected by an agent; independent human verification remains pending. Historical owner-reported evidence stays attributed to its source.

| Test ID / requirement | Type; setup, action and expected assertion | Actual result / status | Evidence and limitation |
| --- | --- | --- | --- |
| CI-25-01 / CI-01, CI-04, R-05/R-06 | Static; inspect modified workflow against baseline; retain triggers, `verify`, permissions, all previous checks and mandatory ordered image builds | Passed locally | Exact preservation assertion and `git diff --check`, exit 0; not effective branch rules |
| CI-25-02 / CI-02, C-01 | Docker; root-context API build in section 2; exit 0 and image exists | Passed locally and hosted | Local image identity below; hosted C-01 API image step 12 passed. Human verification pending |
| CI-25-03 / CI-02, C-01 | Docker; root-context web build in section 2; exit 0 and SSR image exists | Passed locally and hosted | Local image identity below; hosted C-01 web image step 13 passed. Human verification pending |
| CI-25-04 / CI-03, R-05 | Local; clean install, typecheck, lint, three Vitest suites and workspace builds; all exit 0 | Passed locally after environment retry | 350 tests passed; Node 24.22.1/npm 11.19.1 on Windows; results below |
| CI-25-05 / CI-03, R-05 | Integration; disposable loopback `workflow_test`, migrate, seed, built-listener suite; no production DB | Passed locally after bounded harness correction | Initial 69/70 failure retained below; final full suite 70/70 passed, no skips |
| CI-25-06 / CI-01, R-05 | Browser; isolated DB and real SSR/API; Playwright journeys pass with no required skips | Passed locally and hosted | Local 25/25 Chromium; hosted C-01 25/25 in prepared browser image. Human verification pending |
| CI-25-07 / C-01, R-05 | Hosted PR to staging; section 4; green `verify` including both production images and all automated suites | Passed on recorded source | C-01 hosted evidence below; later revisions and human review are not covered |
| CI-25-08 / GATE-01, R-06 | Governance; owner + teammate read effective settings for all three branches; section 3 | Blocked on independent verification | Main rule readback in C-02 below; owner and teammate verification of all three branches pending |
| CI-25-09 / C-02, R-06 | Governance; section 5 temporary failing PR to main; failed required check blocks merge, then close unmerged | Passed technical demonstration | C-02 evidence below; independent human review remains pending |
| CI-25-10 / GOV-01/02, R-09-R-12 | Manual; board, labels, specific final-revision review, both members' participation and anonymous repository/code/issues/PRs/runs access through grading | Blocked on owner evidence | Board recovery, specific human review, contribution links and final public-access verification remain outstanding |

### Hosted execution and follow-ups

- **C-01:** [PR #34](https://github.com/oangsa/approval-system/pull/34), [run 43150681028 #83, job 130958837553](https://github.com/oangsa/approval-system/actions/runs/43150681028/job/130958837553), pull_request, succeeded 2026-11-12 03:48:55–03:53:32 UTC. Source head `b18f09afb8f1873c55f8f38dacc3b73084118a46`, base `26fd0bdb6b5c50189ccdd74041a13ff2206bc697`, checkout `528af9d420b8d114e23df596e48af9ef5a058d44`. Typecheck, lint, build and migration passed; API Docker step 12 and web Docker step 13 passed. Web 134, API 199, contracts 17, integration 70 and browser 25 passed (445 total). [test-diagnostics artifact 13913009821](https://github.com/oangsa/approval-system/actions/runs/43150681028/artifacts/13913009821) expires 2027-02-10 03:48:55 UTC; it is not permanent evidence. This result does not establish checks on later revisions.
- **C-02:** [PR #37](https://github.com/oangsa/approval-system/pull/37) targeted main base `902e4549d2171ee77938d0f2b1343d3a57566473` from isolated `test/25-required-gate-failure` source `45b2069dc9927ba9defc43ed78c3f7b9ad53d6f8`; checkout `43498736f6c763d98b068212e5ad96a3db457416`. Its only fixture was `packages/contracts/tests/ciRequiredGateProbe.test.ts`. Local `npm ci` exited 0; contracts exited 1 with 17 passing and one intentional failure. [PR run 43153171069 #85, job 130966914463](https://github.com/oangsa/approval-system/actions/runs/43153171069/job/130966914463) failed 2026-11-12 04:11:42–04:13:25 UTC: at 04:13:22 the assertion expected `required-check-passed`, received `required-check-failed`. Web 134, API 199 and 17 contracts passed; one contract failed and later build, database and browser steps were skipped. `gh pr checks 37 --required` showed failed `verify`, including this PR job and [push run 43153142145 job 130966822471](https://github.com/oangsa/approval-system/actions/runs/43153142145/job/130966822471). Merge state was `BLOCKED`, mergeable `MERGEABLE`, review decision `REVIEW_REQUIRED`. Active main rule 27084320 required strict `verify` from integration 15368, with current-user bypass `never`: the failed check was independently unsatisfied, and review was also missing. No bypass or merge was attempted. The PR body retains proof; it closed unmerged at 2026-11-12 04:14:12 UTC (merged false, merged_at null), with branch and history retained. Agent inspection is not human review.
- [Issue #35](https://github.com/oangsa/approval-system/issues/35) tracks the 11 npm audit entries (10 moderate, one high), including runtime Zod GHSA-mrhx-c7xc-m3w5 (affected <4.6.6; oversized constrained collections can consume memory), Vitest/mocker/coverage GHSA-82fw-gwwq-j7x9 and GHSA-qxg6-89mg-rqv8, and minimatch through typescript-eslint GHSA-g3hv-75wg-m249. Actual exploit reachability was not established; dev dependencies in an image do not alone establish exposure. Investigate and remediate before production; no unreviewed dependency update was made.
- [Issue #36](https://github.com/oangsa/approval-system/issues/36) tracks Node 20 warnings for checkout@v4 and upload-artifact@v4 forced to Node 24, and five React Router v8 future flags. Its follow-up must preserve gates, artifacts, SSR and tests.
- [Issue #24](https://github.com/oangsa/approval-system/issues/24) is closed as completed since 2026-11-12 02:42:54 UTC, despite outstanding body criteria and the [historical reopening record](release-process-verification.md#issue-closure-and-ownership). Owner reconciliation remains pending.

### Local execution record

Environment: Windows PowerShell, Node `v24.22.1`, npm `11.19.1`; Docker Desktop 4.88.0/Linux engine 29.7.2. Date: 2026-11-12 ICT. Tested source: baseline SHA above plus the CI/documentation changes and the bounded restart-test harness correction described below, before publication. No hosted run or human verification is implied.

- Initial `npm ci`: exit 1, Windows `EPERM` creating nested `node_modules` under sandbox; retried unchanged with execution escalation. This is an environment failure, not a code defect.
- Initial `docker version`: engine absent, then sandbox named-pipe permission denial after Docker became available; escalated engine check exited 0. No CI permission or application setting was changed.
- Escalated `npm ci`: exit 0; 540 packages installed, 550 audited. Audit reports 11 advisories (10 moderate, 1 high); no dependency upgrade or audit remediation was attempted. npm also reports four package install-script approval warnings; no approval configuration was changed.
- `npm run typecheck`, `npm run lint`, `npm run build`: each exit 0. Web build retains client and server output; existing React Router future-flag warnings were emitted.
- `npm run test:web`: exit 0, 134/134 tests, 16/16 files, 38.73s, started 2026-11-12 10:27:15+07:00.
- `npm run test:api`: exit 0, 199/199 tests, 18/18 files, 17.65s, started 2026-11-12 10:27:16+07:00.
- `npm run test:contracts`: exit 0, 17/17 tests, 6/6 files, 7.21s, started 2026-11-12 10:27:15+07:00. No deliberate C-02 probe was created here.
- Both production Docker commands in section 2: exit 0. Inspected 2026-11-12 10:33:04+07:00: `approval-api:ci` local image ID `sha256:f8ac7b4e08d3169e83c1b08323ef6359368c92113e8f10782db341a455e59817`; `approval-web:ci` local image ID `sha256:ea3c7674482cf34aceb0d769814dea54b76de7ffb14a8b27a2514a0ce7107380`. Both runtime users are `node`. These are local build identities, not published registry digests or releases.
- `npm run db:test:up`, `npm run db:test:migrate`, `npm run db:test:seed`: each exit 0. Isolated Compose project `approval-issue25-verification`, `workflow_test` at loopback port 55435 with synthetic local fixture credentials in ignored configuration. Migrations emitted existing identifier-truncation NOTICEs, not failures.
- `$env:NODE_ENV = 'test'; $env:RUN_BUILT_HTTP_SMOKE = '1'; npm run test:integration`: exit 1, 69 passed/1 failed of 70 tests; 6 files passed/1 failed of 7, 95.33s, started 2026-11-12 10:30:39+07:00. Failure: `apps/api/tests/postgres/decisions.test.ts:290`, `API process restart preserves accepted replay and timeline`, expected `false` to be `true`. The affected execution packet stopped for separate bounded diagnosis; no assertion, skip or source behavior was changed to conceal it.
- Playwright Chromium provisioning and independent launch succeeded with escalation (browser 148.0.7778.96, inspected 2026-11-12 10:33:04+07:00). Sandbox-only filesystem inspection had reported the browser absent; host browser availability alone is not an E2E pass. The DB was kept idle during restart-test diagnosis and released before browser execution.
- Separate diagnosis reproduced the restart failure and observed three healthy unchanged API starts reaching HTTP 200 at 3913/3876/3917ms (attempts 60/61/62), after the original 50-attempt deadline. The bounded fix changes only that readiness loop to 100 attempts, retaining its interval, assertions, process cleanup and 15-second test timeout. Application code is unchanged. Subsequent integration verification is recorded separately from the initial failure.
- Fix verification: the targeted `API process restart preserves accepted replay and timeline` test passed (exit 0, 1 passed/10 filtered, start 2026-11-12 10:39:22+07:00). Its initial sandbox attempt failed before test execution with temporary-file rename `EPERM`; the escalated run passed. The filtered tests were not substitutes for the full run.
- Final `$env:NODE_ENV = 'test'; $env:RUN_BUILT_HTTP_SMOKE = '1'; npm run test:integration`: exit 0, **70/70 tests passed**, 7/7 files, no skips, 103.20s, start 2026-11-12 10:40:13+07:00. Used only the isolated private test environment. Typecheck, lint and workspace build also passed again after the harness correction; build retained the existing React Router warnings. API build briefly overlapped the beginning of this integration run; the entire suite passed.
- `npm run test:e2e`: exit 0, **25/25 tests passed**, no skips, 1.9m; executed 2026-11-12 approximately 10:36-10:38+07:00. Host Chromium with one worker, managed real SSR/API and isolated `workflow_test`; approve/reject, immutable history, stale/retry, auth, privacy, requester and reviewer journeys passed. Local report: ignored `artifacts/playwright/report/`. This local result alone does not establish hosted execution; the separate C-01 record above does.
- Exact workflow preservation assertion: after removing the two specified added steps and normalizing CRLF, modified YAML equals `git show HEAD:.github/workflows/ci.yml`; insertion order is app build -> API image -> web image -> migration. Assertion and `git diff --check` exited 0.
- Cleanup: `COMPOSE_PROJECT_NAME=approval-issue25-verification npm run db:test:down` (PowerShell environment assignment used locally) exited 0 after verification, removing only this disposable test container and its project network. The test service uses tmpfs and no named database volume; no development/production resource was touched. Ignored reports, local fixture configuration and locally built images remain available.

For every hosted/manual row, append the execution environment, timezone-qualified timestamp, full source/tested SHA, command/action, expected versus actual result, exit/check conclusion, counts, run/job/PR/screenshot link, named human verifier and remaining limitation. Preserve prior failures rather than overwriting them with a later pass. Hand #27 these exact immutable links; its final deployment guide/PDF evidence index owns release assembly.

## 7. Failure recovery and ownership

For a failure, retain logs, exact command and revision. Classify code, test, environment, data, or requirement mismatch before planning a bounded fix. Reproduce the affected check, trace its failure path, test the proposed cause and rerun after repair. No speculative repair is authorized by an environment failure.

| Failure / boundary | Recovery and responsible owner |
| --- | --- |
| Production image build fails | #25 inspects context/path/npm/build log with #24's Docker owner; repair real cause and rerun both affected checks; never remove/soften the gate |
| npm/Docker/browser unavailable or permission denied | Local operator restores supported tools/access; preserve Environment Failure until actual rerun; do not claim passed |
| Migration/integration failure | Inspect guard, isolated service, migration and fixture logs; use only disposable test DB; repair owning defect without weakening guards or altering production |
| Browser failure | Inspect prepared image, startup logs, report, screenshots/traces; reproduce affected journey; no hidden skips or unconditional retries |
| Missing check, timeout or stale PR | #25 compares trigger/check identity and actual timings; owner reads effective rules; retain `verify`/30 minutes unless measured evidence supports a scoped change |
| Approval stale / settings discrepancy | Human teammate supplies specific new final-revision review; administrator corrects actual settings after authorization; never bypass |
| C-02 blocked only by review | Obtain evidence that failed required `verify` itself blocks; retain Not Run/Blocked until proven |
| Missing board/public evidence or premature issue closure | Authorized project owner reconciles membership/status/labels and issue state; both members document actual participation, final anonymous access and review |
| Staging/dev/main divergence | Prepare separately reviewed synchronization if necessary; no direct protected push, force push, skipped stage or history rewrite |
| Cloud/release/persistence work | #26 owns GCP trust, secrets, migration/deployment and main-only accepted release; #27 owns final evidence assembly. Green CI alone authorizes none of these actions |

No product schema, migration, API, UI or dependency change is part of #25. No new `tests.md` duplicates the frozen test contract. Keep CI mandatory and repository public through grading; retain all labelled issue/PR/commit/run history for later labs. Independent review is intentionally left to the user's reviewers.
