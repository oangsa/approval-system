# Acceptance criteria — Issue #3

All criteria are planned; none asserts completed verification.

- REQ-AC-01 (FR-005, AC-005, BR-068): authenticated requester search returns only their own rows and count, including for multi-role users. Foreign identifiers and unapproved filters cannot widen scope.
- REQ-AC-02 (API §§2.2–2.3, 3.4): search returns exact summary fields in a direct array, truthful exposed pagination and no-store. Bounded allowlisted filters, text and deterministic pagination work; invalid inputs return 422.
- REQ-AC-03 (FR-006, AC-006, BR-054/072): owner and current authorized reviewer receive current persisted detail; former, foreign and admin-only actors cannot read it. Missing and inaccessible records return the same safe unavailable response.
- REQ-AC-04 (UI §8, UI-AC-17): requester sees accessible server-consistent desktop table and mobile cards, search/filter/sort/page, safe navigation, and distinct loading, empty, no-match and recoverable error states.
- REQ-AC-05 (UI §9, UI-AC-14): persistent header and four accessible tabs show only authorized current data. Future History and Discussion / Files shells make no unimplemented calls or fabricated claims.
- REQ-AC-06 (BR-073, SEC-14): errors are safe and recoverable; logout, account or route changes clear prior private data, stale responses cannot restore it, and public SSR contains no private record.
- REQ-AC-07: generic collection interface supports renderer-based desktop rows and mobile cards; Issue #4 consumes it after handoff. Its own API and task DTO remain separate.
- REQ-AC-08: meaningful contract, API, real PostgreSQL, UI and browser evidence is recorded honestly, with independent teammate review and staged promotion still required.
