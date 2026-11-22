# Lab 7 implementation and verification record

Updated 22 November 2026, Asia/Bangkok (UTC+07:00). Issue #78;
contract PR #79; implementation draft PR #80, targeting sprint-1-staging.
Status: **IMPLEMENTED / LOCAL VERIFIED / NOT READY FOR RELEASE**.

## Approval and chronology

- Accepted Lab 6 baseline: `39a32500e5d9a626055ab0a93da0aee906c85302`.
- TA P’Tik approved the bounded rule on **22 November 2026 at 10:47 ICT**.
  Identity/date are user-attributed; the supplied LINE screenshot shows 10:47 AM.
  Authorized brief provenance is in Issue #78 comment 7078586595. Original image
  stays private and is embedded in the specified course report.
- Kittipich (`kittipichcha`) APPROVED PR #79 at 13:44:18 ICT, review 6010822681,
  exact reviewed SHA `5d2e8d8784a65e9d3fb7b856b5568e8c8c46a4b5`.
  Review body is empty. Issue comment 7075546240 at 13:49 ICT says:
  “OK, I have reviewed it. We can change this spec and work on it.”
  No detailed findings or inline comments were supplied; none are invented.
- Contract/STS: `332a2b3f00a4dacec50eeb7f25abd2d3457100b1`.
- Test-only RED: `d1856a836e01ce96df535200f6c25419b38f7f2f`.
- Canonical approved specification amendment, before code:
  `cb69c3c66f2d5aa04b858f590c8cf35943268b0f`.
- Implementation: `a581a88807fcc5a8501d6b7e37e0d5e3d2a10fa9`.
- Fixture-only correction: `7fd8302002b98713f9465f745c46474966211e68`.
  No history was rewritten. Earlier contract approval does not approve later code.

## Rule and implementation

NEW REJECT: 10–4000 UTF-16 code units after ECMAScript String.trim(), no
normalization. Shared schema, domain and accessible dialog enforce the rule.
The route retains compatible transport parsing; CurrentActor and actor/route/
key/body Replay precede strict NEW validation, then existing Lock/Save/Complete.
Accepted short historical same-key/body replay remains 201, conflicting old key
409, new short body 422. Historical notes stay readable; APPROVE optional reason,
RETURN unsupported domain behavior, permissions and atomicity are preserved.
No migration, backfill, endpoint, permission, cloud or dependency change.

## Genuine RED and GREEN

Exact command in both phases: `npm run test:contracts -- -t "Lab 7"`.
Windows, Node v24.22.0, npm 11.19.1, Vitest 4.1.10.

| Phase | Version / ICT time on 22 Nov | Actual result |
| --- | --- | --- |
| RED | d1856a8, 18:41:23–18:41:36 | Exit 1; 1 failed, 1 passed, 18 filtered skips. Nine-unit reason expected invalid but old schema accepted it; ten-unit case passed. Product unchanged. |
| GREEN | a581a88, 19:00:45–19:00:53 | Exit 0; 3 passed, 18 filtered skips. Original 9/10 assertions unchanged; extra boundary set added. |

Private originals: `artifacts/lab-07/red-contract-minimum.log`,
`red-contract-metadata.json`, `green-contract-minimum.log`,
`green-contract-metadata.json`. Filtered skips are not full-suite passes.

## Full local verification

| Command | Version | Passed / failed / skipped |
| --- | --- | --- |
| typecheck, lint, build | a581a88 | All exit 0, 19:00:58–19:01:42 ICT |
| test:contracts | a581a88 | 21 / 0 / 0 |
| test:api | a581a88 | 205 / 0 / 0 |
| test:web | 7fd8302 | 171 / 0 / 0, 19:07:06–19:07:25 ICT |
| test:integration | 7fd8302 | 78 / 0 / 0, 19:07:25–19:08:25 ICT |
| test:e2e | 7fd8302 | 30 / 0 / 0, 19:08:25–19:09:57 ICT |

505 cases across distinct suites; targeted subsets/capture reruns/baseline
runs excluded. Typecheck/lint/build and contracts/API precede only a two-string
test fixture correction. Release code unchanged; local test:release not run.
Hosted verification covers release/initialization/image checks separately.
Logs: final-runs.jsonl, final-verified-runs.jsonl and corresponding final-*.log.

Real loopback disposable workflow_test PostgreSQL, guarded against remote,
non-test and development-equal targets; migrations/seed only there. Actual built
frontend/API and Chromium, one worker, no browser mock. No production writes.

## Failures and legitimate existing-test changes

- Original full web run on a581a88: 170 passed / 1 failed, minimum Zod error
  before the mocked network call in the retry-identity test. Hosted Verification
  45020028478 failed on the same fixture. Retained, not represented as RED.
- AC-L7-02 changes NEW-write fixture “No” to “Missing information” in the domain
  ALL/future-stage test and two PG rejection/race cases, retaining assertions.
  Web retry fixture “No” / “Changed” becomes “Missing information” / “Changed
  information”; key reuse/change and invalid-input assertions are unchanged.
  Separate old short historical fixture remains for compatibility regression.
- First two new browser tests failed after immediate goto/reload interrupted
  auth bootstrap. Saved traces show refresh status -1 then 401. Single-context
  reproduction falsified a two-context-only explanation. Waiting for visible
  authenticated History before reload, as existing tests do, makes both pass
  without changing auth product code or removing post-reload assertions.
- Earlier setup/sandbox and Windows filename failures remain in the historical
  index. Docker was restored; baseline real PG 73 and browser 28 also passed.

## Browser evidence

Automated Playwright, synthetic roles, separate contexts. Source 7fd8302,
22 Nov 19:08:50.947 ICT. Request 9350488c-2a21-444d-aad1-79152e7c65a3.
Submitted request → retained nine-unit input/accessibility error/disabled confirm
→ direct API 422 VALIDATION_ERROR → self-approval 403 SELF_APPROVAL_FORBIDDEN
→ identical detail/task/timeline snapshots → corrected ten-unit rejection 201
→ requester History after refresh contains exact reason and DECISION REJECT.
Separate APPROVE without reason returns 201 and persists after refresh.

Private original full captures: artifacts/lab-07/browser-final/B-L7-01 through
05 PNG plus B-L7-browser-observations.json (no tokens). Readable report viewport
captures are separate capture-only executions, not additional test-suite totals.
Raw failure traces may contain session data and must not be distributed.

## Remaining human gates

1. Kittipich reviews implementation PR #80 at final head and CI; record actual
   findings/resolution. No code approval exists merely from contract approval.
2. Human-reviewed PR promotions feature → sprint-1-staging → dev → main.
   Obtain separate release authorization before main merge/automatic deployment.
3. Verify deployed SHA/digest/revision/traffic and changed/preserved journeys.
   Existing live release remains baseline 39a3250; local E2E is not deployment.
4. Both students confirm actual contributions, pair work/reflections and the
   course AI policy. AI implementation/testing/report assistance is disclosed;
   policy compliance remains unverified without supplied policy.
5. Refresh report/PDF after gates; students submit to LEB2 by 29 Nov 23:59 ICT.
   No production merge/deployment or LEB2 submission performed by Codex.

