# Issue #7 agent review

## Initial review — 2026-11-26

Reviewed base `7238b5e`, contract commit `0a736de` and the uncommitted implementation using the sequential Scrutinize, Review-agent, Standards/Spec, Thermo-nuclear and Review-pr passes. The reviewer remained read-only and did not run tests. Verdict: Changes Requested. This is agent review, not independent teammate approval.

| ID | Finding | Disposition |
| --- | --- | --- |
| RR-R1 | Returned Overview selects the last submitted revision instead of the edited working revision, mixing new basic information with old fields/items/amounts. | Corrected by status-aware revision selection; red/green Overview regression covers RETURNED, DRAFT and PENDING. |
| RR-C1 | Missing returned-state negative write-set, RETURN rollback/stage-two persistence, full historical access matrix and populated migration-upgrade assertions. | Dedicated acceptance suite passes 17 tests; final full PostgreSQL rerun pending. Migration scope is actual 0014 SQL on a populated temporary table with original checks, not a full journal upgrade. |
| RR-C2 | Missing returned-specific input recovery, History deferred selection/account response isolation, and Return keyboard/focus assertions. | Bounded fix planning in progress. |

The reviewer found no additional substantiated backend runtime or structural defect. Final broad checks, browser publication/replay evidence, screenshots and final documentation were pending at this review. Existing comments/files functionality, revision comparison and stage-two APPROVE progression remain outside this issue's scope.

The separately reproduced old-task/resubmit deadlock was corrected by changing workflow identity validation to a transaction-duration shared user lock while keeping identity mutations exclusive. Final independent-connection and identity-lock evidence must be recorded in verification before closing that finding.

## Findings discovered during repair and visual verification

- The controlled Return keyboard regression exposed focus restoration failure: React `autoFocus` ran before the dialog effect captured the previous element. The correction captures the trigger before explicitly focusing the reason input and closes the captured dialog on cleanup. Final keyboard/pending/returned-recovery tests are pending.
- Visual inspection found `REQUEST_RESUBMITTED` rendered as the generic history fallback. The event now displays “Request resubmitted”; its regression includes actor, revision/cycle metadata and preservation of the unknown-event fallback. Six focused history tests pass.
- The prior policy seam test deactivated original-department membership but still expected authorization for that department. Issue #7 requires continued authorization. Its updated fixture first proves denial with unchanged evidence, then reactivates only the original non-primary membership and retains all prior policy/form/amount/immutability assertions.

## Re-review — 2026-11-26

A fresh independent read-only agent re-reviewed the final uncommitted tree (base `7238b5e`, contract commit `0a736de`) against the three prior findings and six targeted correctness questions. Verdict: no blocking findings; all prior findings resolved. This is agent review, not independent teammate approval.

| Question | Verdict | Evidence |
| --- | --- | --- |
| RR-R1 returned Overview selects the edited working revision | RESOLVED | `apps/web/app/services/requestService.ts:105` and `apps/web/app/modules/requests/RequestResult.tsx:16` both select `workingRevision` when status is `RETURNED`; the definition is fetched for that revision's `formDefinitionVersionId`. |
| RR-C1 RETURN working copy, sibling cancellation and atomicity | RESOLVED | `DecisionRepository.ts:72-81` inserts a fresh revision (`randomUUID`, `revisionNumber + 1`, `submittedAt: null`, `submittedBy: null`) and copies items with fresh IDs; `:64-70` cancels the deciding stage, closes the cycle and cancels unfinished slots/stages; all inside one `db.transaction`. |
| RR-C2 History response isolation and no current-detail fetch | RESOLVED | `RevisionHistory.tsx:12-14` keys on `generation:user:request` so account/generation/request changes remount and discard state; `signedIn` gates both fetches; responses are accepted only when their scope matches; only `readRevisions`/`readRevision` are called. |
| Historical-handler authorization | RESOLVED | `RequestRepository.ts:77-84` requires an `approvalDecisions` row joined slot → stage → cycle with matching actor, request and revision; `approval_cycles.revision_id` is unique, so the grant is pinned to the exact request and revision. |
| Resubmit preserves number/department | RESOLVED | `RequestRepository.ts:203-207,225` allocates a new number only when not resubmitting and reuses `row.departmentId`/`row.departmentSnapshot`/`row.submittedAt`; also enforced by the `protect_request_identity` trigger. |
| Revision list excludes the working copy | RESOLVED | `RequestRepository.ts:69-76` filters `submittedAt is not null` and joins `approvalCycles` on the unique `revision_id`, so no working-copy leakage and no row duplication. |

Non-blocking observation (no change made): `revisionMetadataSchema.submittedBy` is `z.uuid()` while `request_revisions.submitted_by` is nullable, and `RequestRepository.ts:75` asserts `submittedBy!`. Every writer in this codebase sets `submittedAt` and `submittedBy` together, so this only affects externally inserted rows and is not a defect in this change. The verified tree was left unchanged to preserve the recorded verification evidence.

Human teammate review and staged promotions remain separate gates.
