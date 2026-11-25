# Issue #11 implementation plan

P0: version and review this design against frozen sources before product work. P1: shared dashboard/report contracts and meaningful contract tests. P2: backend ports, scope rules, service, repository, routes, wiring, CORS and API tests. P3: real PostgreSQL fixtures and security, count, history and concurrency tests. P4: web API/services/modules/routes/navigation and component tests. P5: timeline presentation and tests. P6: browser E2E and evidence. Each packet preserves existing behavior and follows the previous contract; no schema migration is expected.

Preimplementation clause ledger (current execution is recorded in verification.md): C01 strict role union; C02 seven combinations; C03 identity recheck; C04 requester metrics; C05 requester recent list; C06 reviewer pending scope; C07 overdue boundary; C08 own recent decisions; C09 admin aggregate-only; C10 configuration counts; C11 escalation counts; C12 list cap/order; C13 owner report scope; C14 current reviewer EXISTS/exclude self; C15 former handler exclusion; C16 admin organization aggregate; C17 deduplication; C18 terminal outcome definition; C19 dimensions/labels; C20 filter validation; C21 Bangkok date bounds; C22 group pagination/sort; C23 snapshot consistency; C24 immutable safe timeline; C25 accessible states and stale guards; C26 tests/evidence; C27 independent review/release. Criteria and test mapping: [acceptance](acceptance-criteria.md), [STS](sts.md), [verification](verification.md).

## Execution ownership and gates

| Packet | Scope | Dependency | Completion evidence |
| --- | --- | --- | --- |
| P0 | These feature contracts and global specification references | Frozen specifications and clean baseline | Saved before product implementation; no passing implementation claims |
| P1 | `packages/contracts/src/dashboard.ts`, `reporting.ts`, exports and contract tests | P0 | Seven role combinations; unauthorized sections, invalid filters and unknown keys rejected |
| P2 | Reporting domain/application/repository/routes, API composition and unit/API tests | P0, P1 | Direct validated DTO/array; guarded CORS and pagination; coherent authorized PostgreSQL queries |
| P3 | Reporting PostgreSQL fixtures/tests and missing history persistence assertions | P2 | Actual SQL counts, cross-user isolation, deduplication, lifecycle refresh and concurrent snapshots |
| P4 | Web dashboard/reports API, services, feature modules, routes, navigation and tests | P0, P1 | Role-safe rendering, validated URL query, date conversion, meaningful states and stale suppression |
| P5 | Existing AuditTimeline presentation and focused history tests | P0 | Readable chronological facts, request/context pagination reset, restricted historic navigation |
| P6 | Integrated Playwright journeys and final verification evidence | P2–P5 | Real browser/API/PostgreSQL outcomes, forbidden-fetch assertion, full regression and review record |

No migration is planned: this increment reads existing authoritative records. Existing immutable audit producers and mutation rollback/idempotency behavior remain unchanged. Read retries have no mutation or idempotency-key effects. Later delegation, notification and PDF producers remain with their owning features. Agent review supplements the required human teammate review.

## Forward and reverse traceability

| Clauses | Authority | Child AC | Implementation | Verification layer and required assertion |
| --- | --- | --- | --- | --- |
| C01–C02 | FR-029 / API §6.9 | 01–02 | P1, P2, P4 | Contract + API + UI: exact fields for every actual role combination |
| C03 | BR-068 / server authorization | 02, 11 | P2 | PostgreSQL: stale roles, revoked session and inactive account cannot retain authority |
| C04–C05 | UI §12.2 / AC-029 | 03 | P2, P4 | PostgreSQL + browser: own counts/recent lists only, deterministic cap and permitted links |
| C06–C08 | UI §12.2 / API-11 | 04, 09 | P2, P4 | PostgreSQL + browser: actionable current slots, overdue boundary, own decisions and historical task route |
| C09–C11 | BR-054 / UI §12.2 | 05 | P2, P4 | API + browser: aggregate/configuration/escalation facts without private payload or unrestricted links |
| C12 | API §6.9 / bounded lists | 03–05 | P1, P2 | Contract + PostgreSQL: at most five deterministic recent items per list |
| C13–C17 | FR-018 / BR-068 / AC-018 | 06, 09 | P2 | PostgreSQL: owner/current-reviewer union deduplicates; former handling gives no current report grant; admin receives aggregates |
| C18–C19 | API §6.9 / lifecycle BR-029 | 06 | P1, P2 | PostgreSQL: STATUS/TYPE/DEPARTMENT/OUTCOME match source request counts, including null department and terminal-only outcome |
| C20–C22 | API §2.3, §6.8 / filter guideline | 01, 07 | P1, P2, P4 | Contract + API + UI: invalid filters rejected, Bangkok exclusive end correct, truthful grouped pagination including empty pages |
| C23 | Authoritative persisted query requirement | 06–07, 11 | P2 | PostgreSQL concurrent-write test: dashboard fields share one snapshot; aggregate total and page agree |
| C24 | FR-030 / BR-033, BR-057 / AC-030 | 08–09 | Existing decision persistence, P5 | PostgreSQL + UI + browser: persisted actor/time/cycle/revision chronology, explicit safe metadata, former-handler restriction |
| C25 | BR-071, BR-073 / UI §§13–14 | 10 | P4, P5 | Component + browser: keyboard/text cues, loading/empty/error/retry, abort/session isolation and private SSR absence |
| C26 | Issue #11 verification / test specification | 11 | P1–P6 | Recorded actual unit/API/contract/PostgreSQL/browser/typecheck/lint/build commands and limitations |
| C27 | Root AGENTS branch/review workflow | 12 | Human teammate and owner | Pending independent @oangsa review; no unauthorized commit, push, merge or publication |

Required test IDs are mapped in STS. Tests are evidence only for their exercised layers; API tests do not prove browser behavior, and mocked tests do not prove PostgreSQL truth. Full downstream PDF, return/resubmit and delegation journeys are excluded while their shared reporting/history seams remain covered here.

## PR #89 causal timeline correction plan

Review baseline: `7c55bfca43ae360c82f3c1d4cfa8dd2fd23c021c`. P1-01 requires a tied decision to precede its resulting request outcome across page boundaries (FR-030 / AC-030, RDT-AC08–09, C24). Read-only PostgreSQL reproduction with equal timestamps and an outcome UUID smaller than its decision UUID returned the outcome first under the old comparator; advancing only the outcome timestamp restored decision-first order.

1. Clarify the feature design and test specification before implementation. Keep time ascending as the primary key; add exact event-type precedence (ordinary events, formal decisions, resulting outcomes), then ascending UUID as the final key.
2. Add deterministic adversarial PostgreSQL regressions for approval, rejection and persisted return history. Assert explicit causal order, one-item page boundaries, timestamp priority, same-rank UUID ties and unchanged stored audit facts. Record the expected failure before changing the query. RETURN remains a synthetic history fixture because its producer is outside this increment.
3. Change only `DecisionRepository.Timeline` ordering before SQL `LIMIT`/`OFFSET`. Preserve persistence, timestamps, scope predicates, count, locks, DTOs and frontend rendering. Update the old chronology test's obsolete timestamp/UUID-only expectation and retain historical access assertions. Verify real approval and rejection producers as well.
4. Run focused reporting/decision PostgreSQL suites, typecheck, lint, unit/API/contract/component tests and builds. Record actual outcomes and limitations, then obtain a fresh independent agent review. Agent review does not replace teammate approval.

The planner owns diagnosis, the implementation agent owns the bounded repository/test/design changes, and the orchestrator owns assistance records and verification/review evidence. The three explicitly non-blocking review observations remain unchanged. No schema migration, historical backfill or permission expansion is part of this correction. The initial correction request did not authorize commit or push; the user's subsequent publication request is recorded separately in [verification](verification.md), alongside actual results.
