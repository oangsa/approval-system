# Lab 5 release-process correction — 2026-11-12

This record supersedes earlier draft/merge-status observations in the container
handoff. It records repository administration, not application release acceptance.
The administration changes preceded this documentation commit. No history rewrite,
cloud configuration or deployment was performed for this correction.

## Issue closure and ownership

[PR #32](https://github.com/oangsa/approval-system/pull/32) merged into
`sprint-1-staging` on 2026-11-11 at 16:38:01 UTC, producing
`3a5764c57c57909bf034b600bc0806260319d9c5`. Its closing reference caused
[#24](https://github.com/oangsa/approval-system/issues/24) to close before its
acceptance evidence was complete. On 2026-11-12, #24 was reopened and the PR body
changed to a non-closing reference with an explicit post-merge correction. A
merged PR cannot be returned to draft. Its existing implementation/history is
retained; integration does not establish acceptance.

- **#24:** remaining existing-project inventory (SQL/storage/secrets/trust),
  member-access evidence, outstanding billing/credit/budget observations,
  project-board tracking. Teammate review is recorded through the PR itself.
  Existing local/container and hosted CI results remain revision-specific; see
  [container verification](container-verification.md) and
  [readiness inventory](container-readiness.md).
- **#25:** required CI/merge gates, public-access evidence, board configuration
  and C-02's deliberately failing, unmerged demonstration PR.
- **#26:** same-origin SSR/API production packaging, runtime secrets/identity,
  production initialization, live HTTPS UI/API/database workflow and release
  execution. Deployment implementation is not added to #24 to clear its checklist.
- **#27:** final guide and evidence assembly, including both restart and redeploy
  persistence proof using the deployed workflow supplied by #26.

Teammate review evidence is
[@kittipichcha's review](https://github.com/oangsa/approval-system/pull/32#pullrequestreview-5859710679)
on PR #32. The owner accepts the PR review itself as evidence; no separate review
writeup is requested. The recorded approval is on `5b50bab` with an empty body;
it does not document review coverage of later revision `6310f75`.

## Public access audit and verification

The owner explicitly approved changing repository visibility after the audit.
GitHub now reports `visibility: public`, `private: false`.

Gitleaks **8.30.1**, downloaded from its official GitHub release, scanned an
isolated full mirror using `gitleaks git ... --log-opts=--all --redact=100`:
**92 commits**, approximately **2.65 MB**. Its one finding is a false positive:
`docs/specs/api-specs.md:850` at `18547ad8`, a sample UUID in an
`Idempotency-Key` header, alongside a placeholder bearer token. It is not an
authentication key. No history was rewritten or scanner finding hidden.

Additional redacted scans found no secrets in fetched open/closed issue and PR
bodies, repository issue comments, inline PR comments, or the extracted Lab 5
starter kit and PDF text. Published historical paths were inspected: environment
files are examples, SQL files are versioned migrations; no real `.env`, private
key or database dump path was identified. No raw cloud/billing screenshots were
found in these fetched discussion bodies. This is a bounded audit, not a guarantee
that arbitrary sensitive data or secrets cannot exist. Historical Actions logs,
artifacts, external links and unreachable GitHub objects were not exhaustively
audited. Scanner reports stay outside the repository and contain redacted data.

Without an Authorization header, these GitHub API resources all returned
**HTTP 200** on 2026-11-12:

| Surface | Resource |
| --- | --- |
| Repository | `GET /repos/oangsa/approval-system` |
| Code | `GET /repos/oangsa/approval-system/contents/README.md` |
| Issue | `GET /repos/oangsa/approval-system/issues/24` (open) |
| PR | `GET /repos/oangsa/approval-system/pulls/32` (merged/closed) |
| Actions | `GET /repos/oangsa/approval-system/actions/runs/43046956428` (success) |

GitHub secret scanning and secret-scanning push protection are enabled. The
secret-scanning alerts endpoint returned an empty list at inspection; this is a
point-in-time result. Keep the repository public through grading (R-12).

## Required merge gates

Three repository branch rulesets were created and read back as **active**:

| Target | Ruleset |
| --- | --- |
| `sprint-1-staging` | [protect-sprint-1-staging, 27084285](https://github.com/oangsa/approval-system/rules/27084285) |
| `dev` | [protect-dev, 27084322](https://github.com/oangsa/approval-system/rules/27084322) |
| `main` | [protect-main, 27084320](https://github.com/oangsa/approval-system/rules/27084320) |

Each targets its exact `refs/heads/...` name, with no bypass actors; the current
administrator's bypass state is `never`. Each requires a PR, one approval,
dismissal of stale approvals on new pushes, resolved review threads, and the
executed **`verify`** check from GitHub Actions (integration ID **15368**), with
strict up-to-date checking. Force pushes and deletion are blocked. The check name
was confirmed from successful runs on `6310f75`, rather than inferred from a
workflow title. GitHub reports existing `main` and `sprint-1-staging` branches as
`protected: true`, and their effective-rule endpoints return the configured rules.

`dev` did not exist at initial inspection. After explicit owner approval on
2026-11-12, it was created at the approved current `main` commit,
`902e4549d2171ee77938d0f2b1343d3a57566473`. Readback confirmed that exact SHA,
`protected: true`, and all four configured rule types on the effective-rule
endpoint. The ruleset is active, with no bypass actors and administrator bypass
`never`. This preserves reviewed `sprint-1-staging` → `dev` → `main` promotion.
No staging changes were promoted and no existing branch was reset. The separate
legacy `staging` branch is not used as a substitute for the required branches.

**C-02 remains Not Run.** Configuration/readback does not prove the deliberately
failed-check/blocked-merge scenario. #25 must retain a temporary failing-test PR
targeting `main`, its failed required-check evidence and blocked merge state,
then close it without merging. Docker-build gate work, specific teammate settings
review and source changes remain with #25; this administration correction does
not claim completion of that issue.

## Remaining access limitations

`gh project list --owner oangsa --format json` still fails because the credential
lacks `read:project`. No token scopes were changed, no replacement project was
created, and no board membership/status is asserted. A member with project access
must verify/add #24–#27, their assignees/statuses and contribution records.
`gcloud` is unavailable here; no independently verified GCP resource inventory,
teammate sign-in, billing or database check is fabricated.

Verification for this correction consists of authenticated administration
readback, effective-rule checks, redacted audits, anonymous HTTP checks and
`git diff --check`. No application behavior changed; runtime suites were not
rerun. Existing passing application/CI evidence is linked in PR #32 and remains
limited to its tested revisions.
