# Numbered acceptance criteria — v1

1. AC-004.1: authenticated Requester creates an incomplete strict DRAFT; owner derives from identity, number remains null and creation is audited.
2. AC-004.2: full valid submission returns PENDING and persists immutable revision, original department/version, one cycle, complete eligible slots, unique number, audit and outbox atomically.
3. AC-015.1: same semantic body/key replays original result before stale checks; changed body conflicts. Concurrent distinct submissions get distinct numbers; failures leave no partial rows.
4. AC-014.1: only owner can edit working DRAFT; stale writes conflict; submitted/terminal content cannot mutate or append history. RETURNED behavior is reserved for its lifecycle owner.
5. AC-015.2: stale form, missing/inactive/self-only reviewers, hidden/invalid fields, amounts and policy limits fail with frozen codes and preserve durable state.
6. AC-004.3: wizard preserves Back/Next fields, supports incomplete draft saves, conditional fields and optional Items step, focuses failed field/step, confirms submission and renders authoritative result.
7. AC-016.1: immutable readable numbers exist only after accepted first submission; DB uniqueness survives concurrent allocation.
8. Verification evidence lists actual commands/environment/results; teammate review and staged PR promotion remain external requirements.
