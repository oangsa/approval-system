# R12–R14 search design — issue #12

Authority: frozen specifications FR-037–039, BR-068/069/072/073, API §2.3, UI §§6/8/10 and shared styling/filter guidelines. This completes the existing My Requests slice and adds Review Queue controls on feature/12-request-search-filter-pagination-v2. Primary owner @oangsa; independent reviewer @kittipichcha; PR target sprint-3-staging, reviewed promotion through dev then main. The owner authorized feature commits, push and a PR on 2026-11-27; no merge or deployment is authorized.

ADR-12: retain resource-specific Drizzle composition and shared collection transport/presentation. Do not add a generic unrestricted query builder. Domain/Application retain current owner/reviewer eligibility; Infrastructure translates validated criteria only. Rows/count use the same predicate and statement snapshot, including empty/out-of-range pages. Current actionable reviewer scope remains unchanged. No new permissions or routes.

Use bounded shared Zod criteria; add exact date EQUAL/NOTEQUAL and textual ENDWITH to compatible fields. Keep PostgreSQL microsecond precision by binding timestamp strings directly, rather than truncating through JavaScript Date. Case-insensitive literal text escapes percent, underscore and backslash. UUID ascending breaks all sort ties; nullable values sort last in both directions.

Indexes: retain requester/updatedAt/id and reviewer/status; add requester/status/createdAt/id for status/date narrowing and reviewer/status/dueAt/id for queue deadline ordering. Arbitrary title contains remains a bounded scoped scan; no unmeasured trigram dependency. Record actual verification separately.
