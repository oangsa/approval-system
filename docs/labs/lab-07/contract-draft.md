# Lab 7 rejection-reason maintenance contract — draft v0.1

Prepared 22 November 2026 (Asia/Bangkok), Issue [#78](https://github.com/oangsa/approval-system/issues/78).
**Current TA decision: APPROVED — TA P’Tik, 22 November 2026 at 10:47 ICT.**
See [TA Approval Evidence](approval-record.md#ta-approval-evidence) for the
approved scope, source attribution and original-image locator.

This file retains the historical v0.1 contract reviewed in PR #79; its original
proposal status is preserved in Git history. The later TA approval supersedes
that status for the specified rule. The proposed business rationale remains
unconfirmed. Required substantive pre-implementation teammate review evidence
is separately **UNVERIFIED / B-01 OPEN**; see [review disposition](blocking-findings.md).
Recording TA evidence does not retrospectively satisfy that separate gate.

## Authority and versions

The entire supplied `Lab_7_Sprint_1_Maintenance(1).pdf` was read. Sections 2 and
3.1 require instructor/TA approval and versioned teammate contract review before
implementation. The handout invokes existing academic-integrity policy but does
not supply its actual AI policy; compliance with that missing policy is unverified.

Accepted Lab 6 baseline and actual clean pre-change source are both
`39a32500e5d9a626055ab0a93da0aee906c85302`. PR #77's incoming sign-off by
WATHITx/SinghLemonH at 21 November 2026 13:36:32 ICT accepts Sprint 1 with
documented minor limitations. Its preceding comment explicitly identifies this
full release SHA. `902e4549d2171ee77938d0f2b1343d3a57566473` is an older
historical merge, not the accepted Lab 6 baseline.

At inspection, main=39a3250, dev=610cfdb, sprint-1-staging=5b8c4b3 (full SHAs
in evidence-index.md). Main and staging product trees have no diff. Their
different merge SHAs reflect promotion, not intervening Sprint 2/3 implementation.
Develop on the current sprint-1-staging workflow, not a new maintenance staging
branch. A Lab 7 submitted main release does not yet exist.

## Original contract and authentic excerpts

All excerpts below are from the accepted SHA, inspected 22 November 2026 ICT.

| File / section | Exact original excerpt |
| --- | --- |
| specs/specifications.md §4.1 | **FR-010 [M10]** A currently authorized reviewer shall reject an actionable slot with a required reason, terminating the active approval cycle. |
| specs/specifications.md §12.1 | **AC-010** (`M10`, `FR-010`): A permitted rejection requires a nonblank reason, records a decision, ends the active cycle, and disables remaining tasks. |
| specs/api-specs.md §3.5 | `REJECT`/`RETURN` require trimmed, nonblank `reason`; `APPROVE` may include a comment/reason. |
| specs/ui-specs.md §10.3 | **Reject:** mandatory nonblank reason, danger emphasis. |
| features/approval-decisions-audit/sds.md | POST /api/v1/approval-tasks/:id/decisions accepts APPROVE or REJECT, reason (required nonblank for rejection), expectedVersion and UUID Idempotency-Key. |

The last excerpt joins the original wrapped lines; no wording is changed.
System SDS §§6.3–6.4,7.1–7.2,9 govern persistence, state and decision orchestration;
API §§6.5,7.2 govern auth/version/idempotency/atomicity. Global FT-010 and feature
DEC-AC-03/07 remain stable; the following child criteria are additive drafts.

Actual schema: `reason: z.string().trim().max(4000).optional()` and a non-APPROVE
nonblank refinement. Actual domain: REJECT checks `!body.reason?.trim()`; RETURN
throws INVALID_REQUEST_TRANSITION. Thus a two-unit reason such as `No` is valid
old behavior, not an existing defect. See unit/decisionRules.test.ts.

## Proposed old-to-new contract

Proposed rationale, requiring team/TA confirmation: a minimum explanation may
help requesters understand correction needs and support later audit. No genuine
stakeholder motivation has yet been supplied; this rationale is not a quotation.

Proposed FR-010/AC-010 amendment: A currently authorized reviewer may create a
NEW rejection only with a reason containing 10–4000 UTF-16 code units after
ECMAScript String.trim(). Persist the trimmed value; atomically record one
immutable decision, terminate the cycle and disable remaining tasks. Existing
rejection history is readable without applying new-write validation.

Proposed API §§3.5/6.5 amendment: keep DTOs, endpoint, key and version unchanged.
Missing/blank/under-minimum/over-maximum NEW REJECT returns 422 VALIDATION_ERROR
with no durable mutation. APPROVE remains reason-optional. RETURN retains its
nonblank transport rule and Sprint 1 domain 409 unsupported transition.

Proposed UI §10.3 amendment: explain the 10–4000 trimmed UTF-16-unit rule,
associate an accessible length-specific error with Reason, retain the input,
prevent invalid mutation and show only server-confirmed success. Surrounding
whitespace must not consume the semantic 4000-unit budget: raw maxlength=4000
needs review for consistency with the existing trim-first server contract.

Proposed feature/System SDS amendment: validate NEW rejection before Save,
preserve CurrentActor, ownership and reviewer checks, locking and transaction
boundaries. Do not apply new-write validation to historical timeline DTOs.
Preserve accepted same-key/body replay, including short historical reasons.

### Count semantics and boundaries

No NFC/NFKC normalization. `trim()` removes ECMAScript whitespace/line terminators
at the ends; internal whitespace remains. JS `.length` counts UTF-16 code units,
not Unicode code points, bytes or visible grapheme clusters. PostgreSQL length()
counts code points and is unsuitable for a matching minimum constraint.

| Concrete input | Trimmed units | Proposed NEW REJECT |
| --- | --- | --- |
| omitted / empty / space-newline-space | 0 | invalid |
| `123456789` | 9 | invalid |
| `1234567890` | 10 | valid |
| `12345678901` | 11 | valid |
| ` 1234567890 ` | 10 | valid, store `1234567890` |
| `x`.repeat(4000) | 4000 | valid |
| `x`.repeat(4001) | 4001 | invalid |
| five U+1F600 emoji | 10 | valid |
| four U+1F600 emoji then `x` | 9 | invalid |
| five repetitions of `e` + U+0301 | 10 | valid, no normalization |

## Acceptance criteria (draft)

- AC-L7-01: reject missing/empty/whitespace/9-unit NEW reasons, with no writes.
- AC-L7-02: accept 10/11 units and trim consistently, persist one rejection.
- AC-L7-03: preserve 4000 maximum and exact Unicode semantics above.
- AC-L7-04: preserve APPROVE without reason and unsupported RETURN behavior.
- AC-L7-05: preserve reviewer/ownership/self/stale guards, transaction rollback,
  concurrent exactly-once vote, valid replay and conflicting-key behavior.
- AC-L7-06: short accepted historical reasons remain immutable and readable;
  accepted historical same-key/body replays retain stored results.
- AC-L7-07: accessible invalid feedback/retained input, exact-minimum integrated
  journey, requester history refresh and separate approval/access regressions.

## Impact and traceability

| Requirement → feature | Contract sections | AC → STS | Code / impact |
| --- | --- | --- | --- |
| FR-010 → M10 | SRS §§4.1,12.1; API §§3.5,6.5; feature SDS reason | L7-01/02/03 → STS-L7-01/02/03/10 | contracts/src/decisions.ts; Domain DecisionRules; direct API callers |
| FR-010 → M10 | UI §§10.3,15.1; DEC-AC-07 | L7-07 → STS-L7-09 | reviews/DecisionDialog, DecisionActions; services/decisionService; api/decisions |
| FR-003/007/008/012 → M03/M07/M08/M13 | System SDS §§7.2,9; DEC-AC-02 | L7-05 → STS-L7-05 | ApprovalTaskRules; DecisionRepository.Lock; authentication; role/self/foreign guards |
| FR-011/013/015 → M12/M14/M17 | System SDS §§6.3,7.1,9; API §7.2; DEC-AC-03–06 | L7-05/06 → STS-L7-06/07/08/11 | DecisionService; DecisionRepository Save/Replay/Complete; schema/triggers |
| FR-009/017 → M09/M11 | API §6.5; feature unsupported boundary | L7-04 → STS-L7-04/12 | APPROVE optional reason; RETURN remains fail-closed, no new feature |

All code paths are relative to existing apps/api/src, apps/web/app or packages.
Changes must reuse shared validation patterns and preserve API-safe 422 mapping.
No new permission, status, task identity, endpoint or response property is needed.

### Historical replay is an explicit review decision

DecisionRoutes currently parses the shared schema BEFORE DecisionService.Replay.
Simply tightening that schema to 10 units would turn previously accepted short
same-key retries into 422. Proposed compatibility requires transport shape and
existing cap validation before authenticated replay, then stricter semantic
validation for NEW work before Save. Preserve semantic body hashing and never
allow a short NEW decision. The exact API/domain/shared-schema interface must
be reviewed before implementation; this draft does not claim a solution tested.

### Persistence and not-applicable conclusions

No migration or backfill is proposed. Existing text storage and nonblank CHECK
already admit every new valid value; tightening historical rows would risk
invalidating accepted evidence. Keep immutable UPDATE/DELETE triggers and unique
slot constraint. New rejection still updates request/task versions, cycle/stages,
audit, outbox and completed key together; failures must roll back every effect.
Money/rounding N/A: reason text never enters monetary calculation/routing.
Cloud/IAM N/A: no resource/access change is needed; reuse existing release pipeline.
RETURN/multistage/new backlog implementation N/A: explicitly outside this change.

## Required review and chronological next steps

Proposed owner Suthang; independent reviewer Kittipich. Neither is credited with
completed work solely by assignment. Instructor/TA approves exact rule/motivation
in #78; teammate then reviews this contract and STS at their actual commit SHA,
records substantive findings/resolution/time before implementation.
After both gates: test-only commit; execute meaningful RED on unchanged product;
small implementation commit; execute SAME changed test/command GREEN; regression;
real frontend/API/disposable PostgreSQL manual and automated journeys; reviewed
development → sprint-1-staging → dev → main. Main merge triggers production and
requires missing release authorization at that time. No review impersonation.

If approved wording changes, version it and obtain review again. Never rewrite
history or retrospectively label replayed tests as original test-first evidence.
