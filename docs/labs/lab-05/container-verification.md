# Issue #24 — local verification, 2026-11-11

Source HEAD: `b01d3db4313c145075431e22cd9020117b30505a` on
`feature/24-lab5-cloud-docker`. Initial image verification included then-uncommitted
`.dockerignore` and environment-example changes described in
[readiness/handoff](container-readiness.md). This section describes the initial local snapshot; the publication recheck below
records later checks. No accepted release or teammate approval is claimed.

Environment: Linux amd64, Node v24.18.1, npm 11.16.0, Docker 29.6.0,
Node 24 bookworm-slim images, disposable PostgreSQL 17 Alpine on loopback 55432,
repository synthetic workflow_test fixtures, Vitest 4.1.10 and Chromium.

## Actual commands and results

| Command / location | Result |
| --- | --- |
| `git status --short` before edits | Clean |
| `git archive HEAD` extracted into `/tmp/approval-24-clean` | Tracked-source-only clean checkout; not a network clone |
| `npm ci --prefix /tmp/approval-24-clean` | Initial sandbox attempt interrupted; elevated retry passed, 539 installed packages; audit reports 10 moderate/1 high vulnerability, not remediated in this issue |
| `npm run check` in clean checkout | PASS: typecheck, lint, 350 tests/40 files, all three workspace builds |
| `npm run check` in working tree | PASS: same 350 tests/40 files and production builds |
| `docker build -f apps/api/Dockerfile -t approval-api:lab5 .` from repository root | PASS before and after exclusion changes; final image `004162eb30c4` |
| `docker build -f apps/web/Dockerfile -t approval-web:lab5 .` from repository root | PASS before and after exclusion changes; final image `7e1842e58b26` |
| `NODE_ENV=test TEST_DATABASE_URL=<disposable-loopback-workflow_test-url> npm run db:test:migrate` | PASS on fresh disposable PostgreSQL |
| Same environment, `npm run db:test:seed` | PASS, synthetic fixtures only |
| Same environment plus `RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` | PASS: 70 tests/7 files, no skips, including built listener/process-restart checks |
| `node /tmp/approval-24-smoke.mjs` with elevated local Docker/network access | PASS: API health, web SSR, login/current user, authenticated request search, persisted refresh continuity and identical request search response after API container restart |
| Image directory/UID checks with `docker run --rm --entrypoint node` | PASS: both run uid 1000, neither application's root contains a real `.env`/`.env.*`; placeholder examples allowed |
| `git diff --check` | PASS |

Full local command logs were written under `/tmp/approval-24-*.log`; these are
session-local diagnostics, not uploaded/manual cloud evidence. No real credentials
were used. PostgreSQL user/database were workflow_test with a synthetic local-only
password. Sanitized URL placeholders above deliberately omit credentials.

Container smoke used API `--network host`, HOST=0.0.0.0, PORT=18081 and a
loopback test DB; web mapped 127.0.0.1:18082 to container PORT=8080. API used
NODE_ENV=test, AUTH_COOKIE_SECURE=false, origin http://localhost:18082,
synthetic signing key and lab5-local issuer/audience. This is local HTTP fixture
verification, not evidence of production cookie behavior. Smoke authenticated
requester-a@example.test through the real login endpoint, retained tokens only in
process memory, checked `/auth/me` and `/requests/search`, restarted only
approval-24-api, rotated the refresh cookie and compared the authenticated request
response. No token/cookie/password payload was printed.

Sanitized observed smoke output:

```text
Web /api routing status: 404 (no production proxy configured)
PASS: API health, web SSR on overridden PORT, login/me, authenticated request search, refresh continuity and unchanged request response after API container restart. No tokens emitted.
PASS API image: no real .env files at application root; uid=1000
PASS web image: no real .env files at application root; uid=1000
```

The observed web `/api` 404 confirms the existing external-routing prerequisite;
standalone images do not yet form a production browser deployment. #26 must supply
the selected routing configuration. No source routing behavior was changed while
topology was still undecided at that initial smoke run. Container smoke did not perform submit/decision through
an HTTPS browser or replace the container; real-PG regression covers persistence
and business transitions separately. Restart alone is not cloud redeploy proof.

## Limits and remaining acceptance gates

- Docker socket was denied inside the sandbox; local builds/runs passed with
  approved elevated access. Initial sandbox npm installation was interrupted;
  elevated clean installation completed successfully.
- Clean archive verifies tracked checkout installation, not remote clone access.
  Image builds used repository root; actual release SHA must be recorded and
  reverified after committing/review, with no claim that image IDs are release SHAs.
- Existing npm audit findings and React Router future-flag/build warnings remain.
  No dependencies, lockfile, schema, frozen contract or product feature changed.
- Later owner decisions and supplied cloud/Supabase evidence are recorded in the
  readiness handoff. Independent teammate access, actual HTTPS Secure-cookie
  workflow and Cloud Run redeploy evidence remain pending.
- No linked human manual evidence, specific teammate review, board verification,
  PR or reviewed promotion through sprint-1-staging → dev → main. C-03/R-01 and
  R-04 are not declared fully accepted by these bounded local checks.

## Browser failure ledger

`NODE_ENV=test TEST_DATABASE_URL=<disposable-loopback-workflow_test-url> npm run test:e2e`
completed with **24 passed, 1 failed**. Failure:
`e2e/reviewer-queue.spec.ts:43`, assigned reviewer desktop/mobile journey,
`document.documentElement.scrollWidth <= innerWidth` returned false at 390px.
It reached the submitted request in the mobile list before failing the overflow
assertion. Local diagnostics are under
`artifacts/playwright/results/reviewer-queue-assigned-re-1f70a-quest-on-desktop-and-mobile-chromium/`
(screenshot, trace.zip and error-context.md); not uploaded or committed.
This is not a passing browser suite. UI source and browser tests are unchanged
from source HEAD, but the root cause and regression provenance are not established.
No layout fix or weakened assertion is included in container maintenance.

Reproduction command (same environment):
`npm run test:e2e -- e2e/reviewer-queue.spec.ts --repeat-each=2`.
Result: **3 passed, 1 failed**; first mobile overflow assertion failed at the
same line, second journey passed and both private-SSR checks passed. The failure
is intermittent, not a reliably reproduced root cause. No hypothesis is claimed
confirmed and no speculative UI patch was made. Both failed and passing outcomes
remain in this ledger; the repeat does not supersede the failed full suite.

Cleanup: `docker rm -f approval-24-api approval-24-web approval-24-test-db`
removed only session-created containers and the disposable tmpfs fixture. Built
images remain available locally. No agent cloud or existing application database change occurred during those
local checks. Later human-executed Supabase migration is recorded in the handoff. Final `git diff --check` passed.

## Publication recheck — 2026-11-11

Reviewed intent: preserve Sprint 1 behavior while excluding local data/credential
exports from builds and documenting environment/deployment prerequisites. Existing
Dockerfiles already build correctly; no rewrite, dependency or product/UI change
was needed. Traced manifests → root npm lockfile → workspace builds/start scripts,
HOST/PORT configuration, browser API base → external routing requirement, cookie
configuration and database-backed session/workflow repositories. This bounded
source review does not accept the pending production topology or cloud runtime.

Build-context commit: `ff60eac7d15d8cd35ae3a9b4c52e40c15105ef4c`.
All application source/contracts/lockfile remain identical to baseline `b01d3db`.
Final documentation includes the accumulated owner evidence and is recorded in a
subsequent docs commit. No complete credential-bearing URLs, personal emails,
raw Console screenshots or private environment files are included in publication.

Final pre-push commands, same Node/npm environment and fresh disposable local
PostgreSQL fixture (not Supabase):

| Command | Result |
| --- | --- |
| `npm run check` | PASS: typecheck, lint, 350 tests/40 files, API/web/contracts builds |
| Guarded `npm run db:test:migrate`, then `npm run db:test:seed` | PASS on new loopback workflow_test fixture |
| `NODE_ENV=test TEST_DATABASE_URL=<local-fixture-url> RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` | PASS: 70 tests/7 files, no skips |
| Both root-context `docker build` commands above | PASS: API 004162eb30c4, web 7e1842e58b26 |

Existing remote feature and sprint-1-staging refs were checked before publishing:
both were `b01d3db4313c145075431e22cd9020117b30505a`. Issue #24 is open,
assigned to @oangsa and labelled lab5. No prior feature PR was found. Board status
and independent teammate review remain unverified. Source publication targets a
reviewed PR into sprint-1-staging, not a direct integration-branch push. Release
promotion and issue acceptance remain incomplete.

Final browser recheck:
`NODE_ENV=test TEST_DATABASE_URL=<local-fixture-url> npm run test:e2e` passed
**25/25 Chromium tests** in 29.5 seconds. This included the mobile reviewer queue
case. Earlier 24/25 and 3/4 outcomes remain in the failure ledger; an intermittent
failure is not proven fixed by this passing rerun. No UI/test change was made.
`git diff --check` passed. A publication-file scan found no private-key/token
signatures; manual review kept all credentials in private files. This bounded
scan is not an exhaustive secret-history audit.
