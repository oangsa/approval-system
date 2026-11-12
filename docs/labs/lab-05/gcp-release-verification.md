# Issue #26 — readiness and local verification

Date: 2026-11-12 ICT. Branch: `feature/26-lab5-gcp-cd-release`.
Baseline HEAD: `5cd1a0675257afa9276aab31b67219141e24d0dd`, equal to locally
recorded `origin/sprint-1-staging`; working tree initially clean. Results apply
to that baseline **plus the source changes tested before publication**. No accepted
main release, hosted CD, cloud resource change, production initialization or
independent human review is asserted. Image label uses the baseline as a local
fixture identifier; it must not be presented as an image built solely from that
commit or as C-06 proof. Release images use the actual accepted main SHA.

Environment: Linux amd64, Node v24.18.1, npm 11.16.0; Node 24 bookworm-slim
image, PostgreSQL 17 Alpine, Chromium via Playwright 1.60.0. Only session-owned
disposable loopback `workflow_test` at port 55436 was used. Synthetic fixture
credentials were used, never Supabase or production credentials. Test URLs below
omit credentials; no secret-bearing command/log is evidence.

## Readiness verdict

**Source implementation prepared; production release remains gated.**
The [design](gcp-release-design.md) freezes the owner-reconfirmed single-service
Bangkok/Supabase topology. [Runbook](gcp-release-runbook.md) covers human setup,
WIF/environment configuration, backup, initialization, migration and recovery.
The two existing standalone images did not provide production `/api` routing;
the combined SSR/API image supplies it without changing product routes/cookies.
One digest/revision now identifies both processes.

Existing #24/#25 evidence establishes bounded Docker/CI work, not full Lab 5
acceptance. #26's connected issue read showed open, @oangsa assigned and `lab5`
labelled. Connected repository read showed public, repository ID 1446443279 and
owner ID 71574088. The existing branch's precreation project-card status/history
was not verified; manual reconciliation remains. Independent substantive review,
accepted promotion chain and hosted release evidence are still required.

## Executed checks

All commands run from repository root unless noted. Environment assignments below
are POSIX syntax. `TEST_DATABASE_URL=<disposable-loopback-workflow_test-url>` means
the private synthetic fixture URL, never DATABASE_URL fallback. Socket/network
operations initially denied by sandbox ran with approved local execution access;
no cloud CLI was installed or invoked against GCP.

| Check / exact command | Actual result | Coverage and limits |
| --- | --- | --- |
| Baseline `npm run check` before source edits | Passed: typecheck, lint, 350 tests/40 files, workspace builds | Existing source readiness only |
| Final `npm run check` | Passed: typecheck, lint, 354 tests/41 files, workspace builds | API/web/contracts including probe success/failure sanitization and initializer guards |
| `npm run test:release` (local equivalent `node --import tsx --test deploy/tests/*.test.ts`) | Passed: 8/8 | Stubbed cloud commands: non-main/malformed revision/invalid digest/wrong origin fail; migration failure prevents service update; candidate deploy/smoke failure prevents traffic switch; digest pinning; workflow gates; periodic probe opt-in; proxy request/cookie forwarding |
| `NODE_ENV=test TEST_DATABASE_URL=<fixture> npm run db:test:migrate` | Passed on fresh fixtures | Existing nine migrations; identifier-truncation NOTICE messages, no migration errors |
| Same environment, `npm run test:initialization` **before seed** | Passed: 1/1 | Fresh init, unchanged password/configuration/requests on repeat, Argon2 verification, actual repository/domain reviewer routing, atomic conflict rollback and no permission escalation; outer transaction rolls fixture back |
| Same environment, `npm run db:test:seed` | Passed | Synthetic existing fixtures only; development/test guards unchanged |
| `NODE_ENV=test TEST_DATABASE_URL=<fixture> RUN_BUILT_HTTP_SMOKE=1 npm run test:integration` | Passed: 71/71 across 8 files, no skips | Includes real DB probe then closed-connection 503, existing built-HTTP/restart/session/request/decision tests |
| `NODE_ENV=test TEST_DATABASE_URL=<fixture> npm run test:e2e` | Passed: 25/25, 26.3s, no skips | Existing Chromium journeys; loopback HTTP, separate web/API origins; not cloud Secure-cookie proof |
| `docker build -f deploy/Dockerfile --build-arg RELEASE_SHA=5cd1a0675257afa9276aab31b67219141e24d0dd -t approval-release:lab26 .` | Passed | Root-context combined SSR/API/migration artifact; fixture SHA caveat above |
| Local combined-image HTTP smoke through port 18086 | Passed | SSR marker, header SHA, same-origin login/current-user/refresh rotation with synthetic fixture credentials; latest health image verifies no-store/DB-backed 200 and sanitized 503 after stopping disposable PostgreSQL; no tokens printed |
| Container image inspection | Passed | Non-root `node`/uid 1000, no real app `.env`, root migration script and journal present |
| Local supervisor failure injection | Passed | Terminating only API child caused combined container exit 1; no partial healthy runtime |
| Python PyYAML BaseLoader parsing of three workflows; `bash -n` for every inline run block and `deploy/release.sh`; `git diff --check` | Passed | Syntax/static source checks; no actionlint installed or claim of actual hosted/GCP execution |

Final local image ID:
`sha256:154e6f5877c67f3ef7776640835ea8011794bceedf3c0c8e5512b13fbb056e5f`.
This is a local Docker image ID, **not an Artifact Registry manifest digest**.
No serving Cloud Run revision exists in this verification record.

Session-local diagnostic logs: `/tmp/approval-26-check-final.log`,
`/tmp/approval-26-initialization-final.log`, `/tmp/approval-26-integration-final.log`,
`/tmp/approval-26-e2e-final.log`, `/tmp/approval-26-docker-final.log`. These are not
durable hosted evidence or uploaded artifacts. Private fixtures are not committed.

## Failures and corrections retained

- Initial socket-bound proxy tests failed inside the restricted sandbox; unchanged
  tests passed with approved local network execution. Docker socket access also
  required approved local execution. No product workaround was introduced.
- Initial typecheck found missing explicit `Response` inference in the smoke
  script. It was annotated; subsequent typecheck passed.
- Changing the homepage release marker initially failed one component assertion
  (351 passed/1 failed) and two browser assertions (23 passed/2 failed) still
  expecting `Project foundation is ready.`. Expectations were updated to the
  requested visible release marker. Hydration, overflow, heading and other
  assertions were retained. Full browser rerun before the health amendment passed
  25/25; the final health-amended run is recorded below.
- Initial initializer Vitest config merged `include` arrays and unintentionally
  ran the ordinary PostgreSQL suites before test seeding: 65 failed, 4 passed,
  2 skipped. The isolated initializer itself passed. Replaced the merged config
  with an explicit dedicated include; recreated only the session's disposable
  fixture. Final initializer and separately seeded integration runs passed with
  no skips. No production or existing database was reset.
- Existing dependency advisories (#35) and React Router future-flag warnings
  remain. No dependency upgrade, lockfile/schema migration or frozen DTO change.

## Owner amendment: periodic database health

Owner subsequently explicitly accepted Supabase PostgreSQL + Google Cloud Run
instead of Cloud SQL + Cloud Run, with a US$20 total operating budget target over
two months. Recorded in design/runbook; this is architecture acceptance, not
verified spend, resource provisioning, max-instance reduction, spend-cap setup,
source publication authorization or completed deployment.

Owner explicitly approved a DB-backed health endpoint/activity on 2026-11-12.
Existing `/health` is reused with `SELECT 1`, no application table reads/writes,
no caching and sanitized 503. The public response schema is unchanged. Runtime
wires the real DB probe; test-only in-memory compositions can inject a probe.

`availability.yml` checks it every six hours on main only after repository
variables `AVAILABILITY_CHECK_ENABLED=true` and canonical `PUBLIC_ORIGIN` are set.
It has no GitHub permissions, production credentials, WIF or paid scheduler.
It has **not been enabled or executed against production**. Free-tier inactivity
and best-effort GitHub scheduling remain limitations; no 24/7 uptime guarantee.
Normal Cloud Run request/cold-start charges may apply. Migration-job sizing/cost
approval remains pending after the owner's pricing question; this health approval
does not authorize paid upgrades, provisioning or IAM/database changes.

## Outstanding acceptance and human execution

1. @oangsa completes resource/billing/provider-limit/availability inventory and
   migration-job sizing/cost decision; @kittipichcha independently verifies it.
   Review known dependency advisories and pool/throttle limitations.
2. Humans configure/reuse reviewed registry, identities, WIF, secret versions,
   production environment/main restrictions and DB grants/backup/restore; record
   sanitized links/readbacks. No duplicate project or Cloud SQL provisioning.
3. Source publication is now owner-authorized under AGENTS.md; retain
   coherent scoped commits and the `lab5`, `Closes #26` source PR to staging;
   substantive independent review and reviewed dev/main promotions. Record card
   recovery and actual contributions; closure on staging is not release proof.
4. Humans execute accepted-main migration and explicit safe initialization, then
   verify real public HTTPS Secure cookies, sign-in/submit/decision/rejection
   (C-04), persistence across restart/redeploy (C-05), and automatic release SHA/
   digest/revision/marker matching through the reviewed branch chain (C-06).
5. Enable the approved periodic probe after deployment; monitor failures/provider
   warnings. #27 assembles the actual evidence and grading availability handoff.

AI assistance covered source/readiness inspection, implementation, local tests
and documentation. Owner/reviewer human contributions are not inferred from it.

Final local recheck: 354 unit/API/contracts + 8 release/proxy + 1 initializer +
71 PostgreSQL + 25 browser tests passed (459 total across these commands).
Typecheck, lint, builds, YAML/shell syntax and `git diff --check` passed.
Session-created `approval-26-release` and `approval-26-test-db` containers were
removed after DB-outage verification; unrelated containers were left alone.
The local release image remains available. At that local verification checkpoint,
no files had been staged, committed or pushed, no PR had been opened, and no
production monitor was enabled. The owner subsequently authorized scoped commits,
feature-branch publication and the staging PR; external publication is recorded
separately from those earlier local results. The owner also reconfirmed the
application service at 0.5 vCPU / 512 MiB; migration-job sizing remains pending.

## Human configuration and runtime grants follow-up — 2026-11-12

Owner-supplied Console/screenshots during setup (not agent cloud execution):

- `approval-releases`: Docker/Standard, Bangkok, Google-managed encryption,
  scanning disabled. Edit view showed immutable image tags selected Enabled;
  independent effective-setting review remains required.
- `approval-runtime`, `approval-migrator`, `approval-deployer`: enabled, no keys.
  Repository permission entry showed deployer as Artifact Registry Writer.
- `github-actions` pool and `github-main` OIDC provider enabled. Reviewed mapping
  is `google.subject=assertion.sub` and
  `attribute.repository_id=assertion.repository_id`. Owner entered the six-part
  condition documented in the updated runbook, using the environment claim
  directly and event `push`. Connected-account readback showed
  `approval-deployer` restricted to `attribute.repository_id="1446443279"`.
  No actual production token exchange is claimed.
- GitHub `production` environment showed one branch (`main`), no tags and no
  required reviewers. Owner explicitly chose existing PR review rules without an
  extra environment reviewer requirement. This departs from the earlier manual
  environment approval proposal: reviewed release PRs must cover SQL/backup/
  configuration before merging, because main deployment has no second approval.
- Five environment variable names were visible: GCP project/region, artifact
  repository, WIF provider/account. Last two values were truncated in the screenshot;
  complete values remain independently unverified.
- Owner created `approval-jwt-secret` privately and reported saving runtime-only
  Secret Accessor after the reviewed per-secret grant form. No secret value was
  received. Full effective inherited-access review remains pending.
- Supabase role inventory initially showed only `postgres` plus protected roles.
  Owner created `approval_runtime`; details showed login enabled and all privileged
  flags disabled. Visible application tables and Drizzle history were owned by
  `postgres`, with RLS false. The bottom of the result list was outside the image;
  no full schema audit is claimed. Earlier Roles screenshot showed 11/60 active
  connections at that instant, not a verified sustained connection budget.

The repository now provides `deploy/runtime-grants.sql`: additive, transactionally
applied grants on named existing application objects. It creates no schema,
password or business records, grants no Drizzle access, and preserves ownership,
RLS and triggers. Column-level UPDATE grants needed by current row-locking queries
are explicitly documented; inherited/PUBLIC access still needs live readback.
Human review and execution against Supabase are pending.

Local follow-up source: prior published head
`221fb3f89df5668fc22eb5b7479516323746fcab` plus the grants/test/docs changes.
Node v24.18.1/npm 11.16.0, fresh session-owned `approval-26-grants-db` PostgreSQL
17 fixture at loopback 55436, guarded `workflow_test`, synthetic seed only:

- `npm run typecheck`, `npm run lint`, `npm run build`: passed, exit 0.
- Guarded `npm run db:test:migrate` then `npm run db:test:seed`: passed.
- `NODE_ENV=test TEST_DATABASE_URL=<disposable-fixture> RUN_BUILT_HTTP_SMOKE=1 npm run test:integration`:
  **72/72 tests across 9 files passed**, no skips, 23.01s. New test applies the exact
  grant statements (database name adapted only for the fixture), sets the runtime
  role, runs real submission/approval services and checks denial of schema creation,
  password-hash updates, audit rewrites, routing-content updates and migration
  history access. Role/grants/test records roll back together.
- No normal unit/browser logic changed; their previous results remain attributed
  to the earlier source snapshot, not represented as rerun here.

These results establish local permission compatibility, not successful Supabase
authentication, effective PUBLIC/inherited privilege isolation, production TLS,
Cloud Run deployment or grading acceptance. Production password setup and runtime/
migration connection secrets remained human steps at that checkpoint; the later
owner evidence below supersedes this setup status, not the scope of local tests.

## Owner setup and completion handoff — 2026-11-12

Subsequent owner-provided evidence, with no agent production execution:

- Owner executed the scoped runtime grants in Supabase SQL Editor. Nine effective
  privilege checks all matched: CONNECT, user SELECT, request INSERT and the
  request-type identity-column lock grant allowed; schema CREATE, password-hash
  UPDATE, role-value UPDATE, audit UPDATE and Drizzle-schema USAGE denied.
  This is a bounded check, not an exhaustive PUBLIC/inherited-grant audit.
- Owner set the runtime DB password privately and created the runtime connection
  secret. Screenshot showed the runtime identity on that secret's permissions page.
- Owner created `approval_migrator` with login enabled and privileged role flags
  disabled, then executed the named-object ownership transaction. Readback showed
  the Drizzle journal and visible application tables owned by approval_migrator;
  the image did not show every table, enum, sequence or function.
- pg_dump client 16.15 was replaced by 17.11 in Cloud Shell to match server 17.11.
  System-root verification failed before backup; using the downloaded
  `prod-ca-2021.crt` with verify-full succeeded. A private 93 KiB custom archive of
  public+drizzle has filename timestamp 20261112T095606Z; the owner's 09:59 UTC
  readback showed the completed file and pg_restore --list succeeded.
  No restore was performed: owner stated the database had no application data and
  explicitly waived this initial restore exercise. Do not treat this as populated
  database recovery proof or a blanket waiver for future releases.
- Screenshots confirm the migrator identity has Secret Accessor on
  `approval-migrator-database-url`, and both runtime/migrator identities have it on
  `approval-supabase-ca`. No secret values or database passwords were received.
- Owner explicitly approved the separate 1 vCPU / 512 MiB migration job after cost
  discussion, keeping the application at 0.5 vCPU / 512 MiB. Owner will monitor
  actual cost and reconsider the approach if it expands. The proposed job has one
  task, zero retries, 600-second timeout and no schedule. No Supabase paid upgrade,
  new spend cap or max-instance change is approved.

Hosted Verification run [43191440703](https://github.com/oangsa/approval-system/actions/runs/43191440703)
completed successfully for published head `f64dc56007d1c9bf0099c8ec522bde3171850e69`.
This supersedes the earlier pending-CI wording for that head. PR #38 is still open;
no specific teammate review or live deployment evidence was visible at recheck.

### Remaining repository work and local verification

The ownership SQL is now recorded in `deploy/migrator-ownership.sql`, with a real
PostgreSQL test that executes it, checks 24 table owners, all eight application
functions, enum and both sequences, runs schema DDL/journal insertion as the
unprivileged migrator, and confirms restricted runtime access survives transfer.
Roles, DDL, journal rows and grants are wrapped in a rolled-back fixture transaction.
Sequence nextval calls are not transactional; only disposable fixtures are used.

The first new test failed because its statement splitter treated a semicolon in a
SQL comment as a delimiter; strip line comments before splitting this reviewed
GRANT/ALTER-only file. The corrected test then exposed a real provisioning gap:
`CREATE SCHEMA IF NOT EXISTS drizzle` fails under the migrator without database
CREATE, even with existing schema USAGE/CREATE and table ownership. Added
`GRANT CREATE ON DATABASE postgres TO approval_migrator` to the versioned setup.
The targeted test passed with that grant. **The owner must apply this one additional
grant in Supabase before executing the migration job.** No database CREATEDB,
superuser, protected-object ownership or runtime schema grant is needed.

`gcp-first-deployment.md` now provides the ordered human commands for accepted-main
build, digest pinning, numeric secret versions, CA mounts, private initial service,
minimum initialization/repeat check, custom resource-scoped deployment IAM, public
invocation and automatic release. `deploy/release-role.yaml` is a proposed eight-
permission custom role; no IAM permissions, secret reads, job overrides, create or
delete privileges. It remains human-reviewed and unproven against live GCP IAM.
The synthetic initializer URL is constructed explicitly rather than embedded as
a credential-shaped literal; a human must classify historical GitGuardian incident
39983502 as a test fixture. No history rewrite or production rotation is indicated
by this fixture alert.

Final local handoff verification: Node v24.18.1, npm 11.16.0, source based on
`f64dc56007d1c9bf0099c8ec522bde3171850e69` plus this handoff follow-up. Fresh
`approval-26-handoff-db` PostgreSQL 17 fixture, loopback 55437, guarded workflow_test,
synthetic credentials/data only; removed after verification. Commands/results:

- `npm run typecheck`, `npm run lint`, `npm run build`: passed, exit 0.
- `npm test`: 354/354 across 41 files passed.
- `npm run test:release`: 8/8 passed, with stubbed cloud commands/local proxy.
- `NODE_ENV=test TEST_DATABASE_URL=<fixture> npm run db:test:migrate`: passed.
- Same guarded environment, `npm run test:initialization` before seed: 1/1 passed.
- Same guarded environment, `npm run db:test:seed`: passed.
- Same guarded environment, `RUN_BUILT_HTTP_SMOKE=1 npm run test:integration`:
  **73/73 across 10 files passed**, no skips, 23.55s, after the fixes above.
- `bash -n` on all GCP guide shell blocks, YAML parse of custom role, relative
  links in the new guide and `git diff --check`: passed. Commands were parsed,
  not executed against cloud resources. No gcloud installed/used for live checks.

Logs remain local under `/tmp/approval-26-handoff-*.log`; they are not hosted release
evidence. Browser journeys and Docker builds were not repeated locally for these
SQL/test/docs/IAM-definition changes; the prior results retain their own source
attribution. New published-head CI must pass before review/promotion.

### Acceptance checklist — keep #26 open

| Criterion | Evidence / outstanding execution |
| --- | --- |
| R-03 / C-04 public sign-in, submission, decision, rejection | Pending first HTTPS deployment and teammate verification |
| R-04 persistent data | Supabase selected/configured; live restart/redeploy persistence still pending |
| R-07 main-only repeatable pipeline | Implemented/offline tested; real OIDC CD run pending |
| R-08 / C-06 matching SHA/digest/revision/marker | Implemented; live evidence and reviewed promotion chain pending |
| Sprint 1 behavior and required CI | Prior current published head passed hosted Verification; later edits need their own checks |
| Safe repeatable initialization | Local real-PostgreSQL test passes; human initial/repeat execution still pending |
| Failed verification/migration leaves old traffic | Offline tests pass; cloud behavior remains unproven |
| Exact automated/manual verification evidence | Local and earlier CI evidence recorded; final release evidence pending |
| Board, labels and both members' contributions | Issue/PR lab5 labels confirmed; board status and teammate-specific review/verification pending |
| Existing resources reused/configured | Existing project/DB/registry/identities/secrets reused; one extra DB grant, service/job and deployer bindings pending |
| Main trust/environment and independent live verification | Configuration screenshots only; full effective readback, successful token exchange and teammate verification pending |

Owner participation so far: architecture/budget decisions and manual GCP, GitHub
Settings, Supabase grant/ownership/backup operations evidenced above. AI assistance:
source/procedures and disposable local verification. The requested teammate review
is not evidence of completed review or equal contribution. #27 assembles final
evidence after these actual executions, not in place of them.
