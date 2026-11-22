# Lab 7 evidence and resume index
> Historical preparation snapshot. The [22 November implementation record](verification-record.md)
> supersedes the approval, implementation and local-test statuses below; historical
> timestamps and original failures remain preserved.

Prepared 22 November 2026, Asia/Bangkok. Issue #78; draft PR #79.
Status: **BLOCKED / NOT READY**. Product behavior and existing tests are unchanged.

## Versions and review
| Record | Verified value |
| --- | --- |
| Accepted baseline / initial pre-change main | 39a32500e5d9a626055ab0a93da0aee906c85302 |
| Accepted sign-off | PR #77 comment 7058717526, 21 Nov 13:36:32 ICT; WATHITx/SinghLemonH, accepted with minor limitations |
| Actual local test checkout | 5b8c4b3a45b8818285bb6f01fa3538dc54c2aebf, staging; tracked product tree identical to accepted main |
| dev promotion | 610cfdb02bd046886a1169c55dffce0b8c764600 |
| Contract/STS draft | 332a2b3f00a4dacec50eeb7f25abd2d3457100b1 |
| Development branch | chore/78-lab7-contract, from current sprint-1-staging |
| TA decision / business motivation | NOT RECORDED / not confirmed |
| Independent contract review | Requested from kittipichcha on draft #79; no review text/time yet |
| New-rule test-only / implementation / main | None; do not invent chronology |
| Current live headers | 39a3250 full SHA above, read-only smoke 22 Nov 01:46:01–02 ICT; browser 01:47:26 ICT |
| Historical deployed revision | approval-system-00017-cib; digest sha256:5319cb7c9f8777bd7981ce72948eb4877a2f41ecd3563dc30a6b8e055299f69f |

Baseline source/accepted SHA, actual checkout, PR synthetic merge and deployed
revision are different kinds of version records. Product trees match; this does
not make a source checkout deployment proof. The old template's 902e4549 candidate
is superseded by actual Lab 6 sign-off, not deleted from historical records.

## Durable evidence inventory
Original logs/capture are private local artifacts in `artifacts/lab-07`; no secrets
or production credentials were intentionally collected. Native report:
https://docs.google.com/document/d/1cUr9NhikPIRTuKVch4s4yChUcI6whEAj33YaXRE28GE/edit

| ID | Action / environment | Expected → actual | ICT time / version | File and trace |
| --- | --- | --- | --- | --- |
| A-01 | Read incoming acceptance / GitHub | Resolve full accepted SHA → 39a3250, accepted with minor limitations | signed 21 Nov 13:36:32 | accepted-signoff.json; PR #77 |
| A-02/03/04 | Inspect source and draft contract/STS | Map actual paths, boundaries, effects → draft only | 22 Nov; contract 332a2b3 | contract-draft.md; sts-draft.md; AC-L7-01–07 |
| A-05 | Independent review | Substantive teammate review → PENDING | NOT RECORDED | draft PR #79 |
| B-01 | Old shared-schema probe / Windows Node 24.22 | Old 9 accepted, 10 accepted, max4000 → observed exactly | 22 Nov 01:43:59; checkout 5b8c4b3 | old-behavior-probe.log; not RED |
| B-02/03/04 | New-rule RED/GREEN | Missing/new behavior fail/pass → NOT RUN | gates pending | no test/implementation commit |
| B-05 | Full ordinary baseline suites | contracts/API/web pass → 18/204/168, zero fail/skip | 22 Nov 01:43:49–01:44:19; checkout 5b8c4b3 | test-contracts.log, test-api.log, test-web.log; baseline-tests.jsonl |
| B-05a | Typecheck/lint/build baseline | All pass → final exit0; initial EPERM failures retained | 22 Nov 01:43–01:45; checkout 5b8c4b3 | typecheck(-retry).log, lint.log, build(-retry).log |
| B-06/07/08 | Draft PR hosted CI | Full verify → success; no failed steps | 22 Nov 01:46–01:51; PR checkout 1128eb7 | run 44937360165, job 136946809028, draft-pr-ci-job.log |
| B-09 | Live read-only health/SSR/login smoke | 200/markers/exact release headers → PASS exit0 | 22 Nov 01:46:01–02; live39a3250 | live-smoke-dated.log; live-smoke-metadata.json |
| B-10 | Playwright headless installed Edge public sign-in | Real page / HTTP200 / release header → observed | 22 Nov 01:47:26; live39a3250 | live-login.png; browser-public-retry.log; public page only |
| C-01/02/04/05 | Paginated repo metric snapshot | Complete scoped collection → 2 issues, 5 PRs, 2 resolved UAT bugs, 4 CI runs (2 success/2 skip) | snapshot22 Nov01:41; baseline39a3250 | github-metrics.json; source lists embedded in report |
| C-03 | Accepted release PG integration | Passed suite on exact release → 73/0/0 | 20 Nov21:05; SHA39a3250 | accepted-ci-job.log; run44749609137/job136333749488 |
| D-01–05 | Readiness, debt/defects, contribution/policy check | No unsupported ready/review/participation claim → NOT READY | 22 Nov checkpoint | native report; human contribution/policy confirmation pending |

## Actual verification and limitations
- Local: contracts18, API204, web168 pass (390 ordinary tests); lint/typecheck/build
  final pass. No filtered subset counted again. Ordinary tests use no PostgreSQL.
- Initial npm ci and generated-directory typecheck/build failed under sandbox EPERM;
  normal-access retries passed. Original logs are retained, not counted as RED.
- First attempted log filenames included Windows-invalid colon. The first three
  local-runs.jsonl entries have null exit and mean NOT RUN; actual tests are in
  baseline-tests.jsonl. Some metadata labels source=39a3250: correction is actual
  checkout5b8c4b3, identical tracked product tree, documentation-only changes.
- Docker Desktop daemon unavailable. Local real-PG integration/E2E NOT RUN.
- Hosted draft PR verify ran web168/API204/contracts18/release13/initialization1/
  integration73/browser28, all passed. Actual synthetic merge checkout1128eb7
  merges contract head332a2b3 into staging5b8c4b3; this tests unchanged behavior,
  not Lab7 new-rule implementation.
- npm ci reported11 advisories (10moderate,1high). Reachability/version disposition
  was not assessed; no blanket update or unrelated dependency change was made.
- Browser extension timed out; first Playwright import unavailable. Successful
  @playwright/test fallback captured real public sign-in only. No authenticated
  Lab7 journey, no-write oracle, new minimum or access-denial mutation is claimed.
- Historical release logs prove then-observed revision/digest/100% traffic; fresh
  header smoke proves SHA, not a fresh cloud traffic inventory.
- Handout7pages read; exact broader course AI policy unavailable. Human
  participation, pair work and retrospective confirmation remain pending.

## Five metrics
Repo activity window:20 Nov00:00 through22 Nov00:00 ICT; snapshot22 Nov01:41.
Completed issues#71(20Nov19:51:58),#72(20Nov20:46:59), both completed.
Merged PRs#73(staging19:51:48),#74(staging20:46:50),#75(main20:08:51),
#76(dev20:55:57),#77(main21:02:06), all20NovICT.
Metric3 is accepted-baseline PG integration only73passed/0failed/0skipped,
not an aggregate of historical and new runs.
UAT register#71Major/#72Minor both independent PASS21Nov; other reported
limitations stay distinct.
Main exact39a3250 runs:44749609137Production release(success),
44749609169Verification(success),44812398749/44880225794availability(skipped).
Issue/PR collections second pages empty; workflow total_count4, second page empty.
Issue count excludes PR objects and non-completed dispositions. PR promotions
count as merges, not independent features. CI runs latest attempt once.

## Precise resume handoff
1. Suthang/team confirms genuine motivation in #78; instructor/TA records exact
   approved old-to-new rule, approver/date/source. Keep UTF-16/trim/cap and
   accepted-short-replay policy explicit; revise draft if decision differs.
2. Kittipich performs substantive contract/STS review on exact SHA, including
   replay validation sequencing, raw maxlength vs trim-first cap, no-write oracle
   and preserved RETURN/APPROVE behavior. Record findings/resolution/time.
3. Only after both gates: test-only commit + meaningful9/10 RED on unchanged
   product, then minimal implementation + SAME command GREEN. Keep history.
4. Restore disposable loopback workflow_test; migrations/seed only there. Run
   relevant full checks and real browser journey with separate contexts; capture
   DB no-write and persisted history plus preserved approval/access checks.
5. Human-reviewed branch→sprint-1-staging→dev→main. Obtain release authorization
   before main merge (automatic deployment); no current production-affecting
   merge/migration/cloud action is authorized by this checkpoint.
6. Verify eventual live SHA/digest/revision/traffic and changed/preserved journeys;
   refresh report metrics, actual contributions, reflections and course AI policy.
7. Re-export/inspect every PDF page, fix contents ranges, students submit LEB2
   by29Nov2026 23:59ICT. No submission performed by Codex.

AI assistance: Codex source/evidence research, unchanged checks, proposal/draft,
public-browser capture and report preparation; no subagents and no substitute
for either student's real independent participation/review.

