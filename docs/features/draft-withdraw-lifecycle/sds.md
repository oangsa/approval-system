# Draft and withdrawal lifecycle SDS — v1

Issue #6; R01/R05; FR-019/023; BR-026/028/029/033/034/044; AC-019/023. Design recorded before implementation on 2026-11-24. Frozen product v1.0, API v1.0.1 §6.4, UI v1.0 §§8.2/9 take precedence. Required branch: feature/6-draft-withdraw-lifecycle; owner @oangsa; independent reviewer @kittipichcha.

## API and domain

Reuse RequestService, RequestRepository, strict shared contracts and existing actor/path/key replay. POST /api/v1/requests requires UUID key and published type/version; returns 201 RequestDetail for supplied-value-valid incomplete DRAFT. PATCH /api/v1/requests/:id/draft takes expectedVersion and changed working properties, preserves omissions and replaces the complete fields map when supplied; returns 200 RequestDetail. Hidden keys fail 422. No draft number, submitted snapshot, cycle or review task.

POST /api/v1/requests/:id/withdraw requires UUID key and strict {expectedVersion,reason?}; reason is optional text, including empty text, with no invented mandatory/minimum rule. Returns 200 direct WITHDRAWN RequestDetail. Revalidate current Requester identity, owner, PENDING and expectedVersion. Foreign records return safe 404; invalid state/stale version returns 409. Replay precedes state/version checks; changed semantic body conflicts.

## Data and concurrency

Reuse request/revision/cycle/stage/slot and idempotency tables. Add nullable audit note by versioned Drizzle migration to retain optional withdrawal reason without changing submitted evidence. Lock request row first, matching decision lock order; then close current cycle and unfinished stages/slots. Increment cancelled slot versions and request version. Preserve completed slots, votes, submitted revision, cycle snapshot and number. Append actor/time REQUEST_WITHDRAWN audit and unique outbox event in same transaction as replay completion. Failed writes roll everything back. Simultaneous withdrawal/decision waits on shared request row and rechecks authoritative state; no decision can follow accepted withdrawal.

## UI and service

Authenticated /requests/:id/edit loads owner DRAFT plus authorized pinned definition after hydration and initializes existing editing session. Reuse wizard, service and API layers. Save from each step permits incompleteness, retains errors/inputs and uses POST once then PATCH changed fields with version. Show saved resume link; allow completed-step navigation. Warn on unsaved navigation/type changes. Stale form recovery remains explicit.

Owner detail and list expose resume/withdraw according to authoritative state. Reuse composed dialog and shadcn buttons; optional reason, keyboard focus/escape, busy guard and stable unchanged retry key. Replace/refetch server DTO and list after success. Reload conflict safely, retaining optional reason. Review queue refetches on visibility/focus return; stale reviewer decisions remain server-denied. No sensitive SSR loader.

## Review repair design — v2, 2026-11-24

A single scrutinize pass follows the full draft/withdraw path and adds no new product endpoints. Preserve omitted line-item rows during partial PATCH instead of deleting/reinserting them. Normalize request UUID spelling before deriving durable replay scope. Draft conflict recovery offers an explicit confirmed reload (cancel retains inputs; only confirmation discards local edits); reinitialize the existing session with current version. Treat terminal permission errors as unavailable editor states and retain support Request ID on recoverable server errors. Explicit form-version review warns before excluding obsolete amount/item authority, then sends only applicable values. Withdrawal conflict reload reads request state without fetching unrelated form definitions; both Escape and Cancel propagate refreshed DTO, and permission loss during reload refreshes parent scope. Regression tests must fail before fixes and pass afterward. No second request engine, automatic overwriting of concurrent edits or broad refactor.

The same trace additionally requires safe decimal refinement before BigInt arithmetic at the shared trust boundary, and validation when navigating forward to previously completed steps before rendering totals. Restore the frozen API §6.4 boundary: save the rendered immutable published definition; check active version at first submission rather than adding a premature draft-create gate.
