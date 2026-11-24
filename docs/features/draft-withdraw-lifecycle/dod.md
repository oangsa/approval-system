# Definition of Done — v1

- [x] Version SDS, API/UI/data decisions, numbered AC and STS before code.
- [x] Implement and verify DW-AC-01–08 with automated evidence.
- [x] Record actual checks, environment, base commit and failures/skips in [verification](verification.md).
- [ ] Independent @kittipichcha review; feature PR targets sprint-2-staging.
- [ ] Reviewed staging promotion to dev, then release-reviewed main.

Implementation request authorizes source edits and checks. It does not authorize commits, pushes, merges or production publication.

- [x] One requested scrutinize pass completed; confirmed findings repaired and regression checks passed. See [review](review.md) and verification follow-up. This is not independent teammate approval.

## PR #87 requested-change follow-up

- [x] Reproduce B01/B02/B03 before repairing their execution paths.
- [x] Keep repairs within draft behavior and preserve withdrawal, initial-submit version enforcement, authorization and retry semantics.
- [x] Add monetary-migration, route/reload and authoritative unchanged-save regression coverage; update SDS, AC and STS.
- [ ] Independent @kittipichcha approval of the repaired revision, followed by the existing reviewed promotion workflow. Owner separately authorized committing and pushing repairs to PR #87; see the verification publication follow-up.
- [x] Final local checks pass: 434 unit/API/contract/component, 109 PostgreSQL, 39 browser and 13 release tests, typecheck/lint/build/diff. See verification record for initial failures and environment.
- [ ] Publish prepared Issue #6 evidence: blocked by automatic approval review due to connector PR/Issue destination mismatch; no external comment posted.
