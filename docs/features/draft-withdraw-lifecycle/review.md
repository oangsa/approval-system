# Issue #6 — single scrutinize pass, 2026-11-24

Goal: owners can persist/resume supplied-value-valid incomplete drafts and withdraw their own PENDING requests without losing accepted evidence or allowing late decisions.

Simpler-alternative pass: reuse the existing request service, unit of work, strict schemas, request-row lock and idempotency tables. No second lifecycle engine or new endpoint is needed. Conflict reload needs only request state; fetching a form definition there adds an unrelated failure dependency. Repairs retain these boundaries.

This is one end-to-end review and repair pass, with regression verification, not repeated review rounds. It does not replace independent teammate review. Findings below describe the reviewed implementation before repair; references identify repaired locations and regression evidence.

## Major — malformed quantities escaped validation as BigInt exceptions

**Finding:** Quantity refinement ran arithmetic after decimal syntax validation had already failed (`packages/contracts/src/requests.ts:24`).

**Why:** API safeParse could throw and map invalid user input to HTTP 500; wizard Save/Next could lose field-level feedback. Source trace reached compareDecimals/scaled and BigInt with `invalid`, `NaN`, `1e2` or `1.2.3`.

**Change:** Guard decimal syntax before numeric refinement at the shared boundary, preserving valid quantity constraints. Five contract cases reproduce this path; real HTTP regression asserts 422 at lineItems.0.quantity, no persisted request, and a valid control returning 201.

## Major — forbidden draft mutation left protected editor visible

**Finding:** Wizard mutation catch only displayed the server message after 403/404 (`apps/web/app/modules/requests/RequestWizard.tsx:182`, `:280`).

**Why:** A requester losing permission retained rendered private fields and working mutation controls, contrary to frozen UI §13.

**Change:** Use existing safe failure mapping, replace editor with unavailable state and safe navigation, and clear dirty-navigation interception on terminal permission failure. Parameterized 403/404 regressions fail before repair and pass after.

## Major — omitted line items were deleted and regenerated

**Finding:** Title-only PATCH reconstructed omitted lineItems, then RequestRepository.Patch deleted/reinserted their rows (`apps/api/src/Applications/Requests/RequestService.ts:75`, `apps/api/src/Infrastructures/Database/Repositories/RequestRepository.ts:147`).

**Why:** Omitting lineItems still changed server-generated item IDs and could reorder items, violating frozen PATCH omission preservation and DW-AC-02.

**Change:** Pass explicit replacement intent through existing port; mutate item rows only when lineItems is supplied. Real PostgreSQL regression compares complete line-item DTOs before/after title-only PATCH and verifies explicit [] still clears items.

## Major — equivalent resource UUIDs did not share replay scope

**Finding:** Resource path scope used raw UUID spelling while PostgreSQL treated uppercase/lowercase UUIDs as the same record (`apps/api/src/Applications/Requests/RequestService.ts:31`).

**Why:** Accepted withdrawal under uppercase UUID followed by same-key lowercase retry missed replay and returned INVALID_REQUEST_TRANSITION instead of the original outcome. Frozen API §2.6 requires canonical resource scope.

**Change:** Normalize request UUID before scope and resource operations. Real PostgreSQL regression reproduced the conflict before repair; afterward both spellings return identical DTO with one withdrawal event.

## Major — stale draft had no usable recovery path

**Finding:** REQUEST_STALE left RequestEditingSession's old saved version unchanged, with only Save retry available (`apps/web/app/modules/requests/RequestWizard.tsx:248`, `apps/web/app/services/requestService.ts:52`).

**Why:** Every retry reused stale expectedVersion; browser refresh was the only escape and discarded unsaved edits without a dedicated recovery flow.

**Change:** Add explicit Reload saved draft through existing reads and session hydration. Cancel preserves local input; confirmation explicitly consents to discarding unsaved edits, loads current content/version, and resets session. Old actions stay disabled until reload. Terminal state can be opened read-only. Component and real browser regressions verify cancel, confirmed reload, current-version save and reload persistence. No automatic overwrite/merge of concurrent edits is introduced.

## Major — updated form could leave obsolete monetary data impossible to clear

**Finding:** Review updated form changed definition/version, but outgoing payload kept former scalar amount or line items after corresponding controls disappeared (`apps/web/app/modules/requests/RequestWizard.tsx:124`, `:230`).

**Why:** Repeated saves remained rejected for inapplicable monetary authority without any visible control to remove it.

**Change:** Explicit review warns before excluding obsolete items/amounts; outgoing payload includes only current applicable amount/item authority. Dynamic hidden-key filtering remains intact and direct API hidden-key rejection is unchanged. Regression changes monetary definition to nonmonetary, retains safe input and verifies PATCH explicitly clears obsolete amount with null.

## Major — completed-step shortcut bypassed validation before computing totals

**Finding:** Step button moved directly to previously visited Review after editing an item to invalid quantity (`apps/web/app/modules/requests/RequestWizard.tsx:294`).

**Why:** Rendering monetary review invoked itemTotal with malformed numeric input and crashed. The initial navigation reproduction reached BigInt in rendering; after guarding navigation, a second trace exposed the shared refinement issue listed above.

**Change:** Validate intervening steps before forward jumps, map errors to owning step/field and focus first invalid input. Back navigation remains unrestricted. Regression returns from Review, enters invalid quantity, uses completed Review shortcut and remains focused in Items instead of rendering invalid totals.

## Major — active-version check happened prematurely on draft creation

**Finding:** Issue #6 added a create-time active-version equality guard (`apps/api/src/Applications/Requests/RequestService.ts:44`).

**Why:** A valid published definition rendered before publication changed could no longer be saved as an incomplete draft. Frozen API §6.4 places current-active-version enforcement at first submit; the original engine already enforced that boundary.

**Change:** Remove premature create guard, retain immutable existing type/version validation and enabled-type check, and keep active-version check at submit (`:73`). Replacement PostgreSQL regression saves rendered older published version after active publication changes, proves submission conflicts without mutation, then explicitly reviews/pins current version and submits successfully. The earlier implementation's stricter create-time test was replaced because it asserted the mismatch itself, not a frozen requirement.

## Major — withdrawal conflict recovery depended on form reads and inconsistently refreshed parent

**Finding:** Conflict reload called readRequestResult (including unrelated definition fetch); Escape closed without publishing reloaded DTO; 403/404 during reload did not notify parent (`apps/web/app/modules/requests/RequestOwnerActions.tsx:44`, `:80`, `:89`, `:99`).

**Why:** Definition outage could block known request-state recovery, Escape left stale header/actions, and revoked access could retain protected parent content.

**Change:** Use request-only read service; share close handler for Escape/Cancel and propagate latest DTO; propagate terminal reload permission failure to parent refresh. Component regression deliberately fails definition endpoint to prove it is unused, checks Escape refresh and permission loss; real browser uses a competing accepted withdrawal, reloads terminal state and verifies Escape clears stale actions.

## Moderate — recoverable server errors discarded support Request ID

**Finding:** Wizard used raw message and withdrawal UI selected only presentFailure.message (`apps/web/app/modules/requests/RequestWizard.tsx:186`, `apps/web/app/modules/requests/RequestOwnerActions.tsx:65`, `:88`).

**Why:** UI §13 requires copyable Request ID for server failures, while safe inputs must remain available.

**Change:** Reuse presentFailure mapping and retain its Request ID in selectable error text. Component regression proves 503 retains input and exposes support identifier.

## Paths traced with no remaining confirmed mismatch

- Authenticated route wrappers and protected shell keep saved request data out of public SSR; edit loads via resumeDraft and authorized pinned-definition reads. Browser checks inspect SSR and resume after reload.
- POST/PATCH/withdraw presentation authenticates, applies strict shared shapes, checks UUID/key/version requirements and returns direct DTO/status/no-store behavior. Application revalidates active identity/role/ownership; foreign requester records remain safe 404.
- Draft create/assertContent(false)/working revision persistence creates no official number, submitted snapshot, cycle or reviewer task. PATCH merges omitted scalar/dynamic content correctly and replaces supplied fields map; hidden API keys stay rejected. Frontend Save remains independent of submission completeness.
- Frontend session preserves unchanged retry keys; changed-fields PATCH includes current expectedVersion. Unsaved route/type changes warn; recoverable failures retain input. Submit still delegates to existing full validation, configuration/eligibility and immutable snapshot engine.
- Withdrawal Owner(lock=true) acquires same request row as DecisionRepository.Lock before cycle/stage/slot writes. Only unfinished slots/stages cancel, versions advance, cycle deactivates, submitted revisions and past decisions stay unchanged. Audit actor/time/note, outbox and replay completion share transaction.
- Concurrent decisions serialize under request lock; stale slots/versions reject, late votes cannot commit after withdrawal, duplicate keys replay and changed body conflicts. Existing actual races/rollback/restart tests are rerun with repairs.
- Timeline keeps owner/current-participant versus own-handled-decision scope. Withdrawal note is added through nullable audit-note migration; immutable submitted/audit/outbox triggers remain unchanged. Migration SQL, Drizzle schema, snapshot and journal agree.
- Detail/list replace or refetch server state; queue refetches on focus/visibility and navigation. Owner action visibility respects supplied availableActions; API remains authoritative. Native dialog busy, focus and optional reason rules remain intact.

## Verification and limits

Failed-before logs and final command evidence are retained locally under ignored artifacts/issue6-review/. Initial UI regression run: 7 failures / 182 passes. Initial omitted-item/canonical-scope PostgreSQL run: 2 failures / 30 passes. Additional reproductions exposed completed-step crash/shared refinement and premature create version gate. A regression test used unsupported fireEvent.cancel; corrected to dispatch native cancel event before final verification. Initial contract test fixture referenced an undefined identifier; corrected before capturing actual decimal-refinement failure. No failing assertion or existing product test was weakened; the overstrict create-version test was replaced with frozen-contract coverage as explained above.

Final results are recorded in the review follow-up section of verification.md. Work remains uncommitted on feature/6-draft-withdraw-lifecycle. No external posting was attempted in this pass; the earlier issue-comment approval block remains separate.

Verdict: **fix-then-ship; confirmed repairs applied**. Biggest reason was shared malformed-quantity handling crossing the API/UI validation boundary as an exception. Independent teammate review and staged promotion remain required before integration/release.
