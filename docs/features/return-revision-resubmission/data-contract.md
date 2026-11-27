# Data and persistence contract

Status: Defined for issue #7; implementation and verification NOT RUN. Frozen product, API and UI specifications prevail. See [plan](plan.md) for source clauses and packet boundaries.

Submitted revisions and their items, decisions, cycle snapshots and audit records remain immutable, protected by existing database triggers. RETURN creates a separately identified mutable copy, including fresh item IDs and exact amounts; submitted content, actor, time and pinned definition never change. The decision joins slot → stage → cycle → submitted revision; one effective vote per slot.

The RETURN write set is decision, deciding slot, unfinished sibling slots/stages, closed cycle, new working revision/items, request status/pointers/version, lifecycle audit, outbox intent and idempotency completion. The resubmit write set is frozen working revision, new cycle/policy snapshot, stages/slots and due time, request status/pointers/version, audit, outbox and idempotency completion. Each set is atomic. Old values, votes, cycles, audit and outbox are preserved; rollback creates no orphan or partial replay key.

The intentional next migration permits RETURN in the decision type CHECK and requires nonblank reason for REJECT/RETURN. It must preserve old rows, grants and immutability triggers, including historical REJECT reasons shorter than the current 10-character new-write minimum. Request number and historical department snapshot remain byte-for-byte unchanged on resubmit; current department eligibility is checked separately. No attachment payload/storage migration is in scope because no attachment subsystem exists in the baseline.
