# Numbered acceptance criteria — v1

1. DW-AC-01 (AC-019): valid published type/version saves incomplete DRAFT, supplied values validated; no selection explains Save unavailable.
2. DW-AC-02: PATCH preserves omitted properties, replaces fields map, rejects hidden keys/stale/foreign writes without mutation.
3. DW-AC-03: saved draft survives fresh DB/service connection and browser reload, only owner can read, with no number/submitted revision/cycle/tasks.
4. DW-AC-04: edit route restores saved fields; every step can save; completed steps are reachable; errors focus correct field/step; unsaved changes warn; recoverable failures retain input.
5. DW-AC-05 (AC-023): own PENDING withdrawal with optional reason returns authoritative WITHDRAWN, atomically cancels unfinished work and preserves prior evidence.
6. DW-AC-06: foreign/terminal/stale withdrawals fail safely; unchanged key replays; changed body conflicts; no duplicate history.
7. DW-AC-07: real concurrent withdrawal versus approve/reject has one valid ordering, no late vote, rollback leaves no partial effects.
8. DW-AC-08: accessible owner confirmation, busy/error/conflict recovery and request/queue refresh; real PostgreSQL and browser evidence recorded.
9. DW-AC-09: applicable checks run; failures/skips disclosed; independent review and staged promotion remain external gates.

## PR #87 repair coverage

DW-AC-02 includes monetary authority changes across published form versions: omitted values remain retained and are validated against the target definition; incompatible retained values require explicit clearing/replacement and rejection preserves durable state. DW-AC-03–04 include replacing the edit URL when a type change creates a different draft, restoring that draft after reload, and authoritative unchanged-save status/version/permission checks without no-op writes or false success. The frozen acceptance baseline and external review/promotion gates remain unchanged.

B04 / DW-AC-02–04: confirmed form-version migration clears incompatible monetary/item state while preserving compatible content; cancellation retains all original content and pinned definition. Review summary matches the canonical save/submit payload, and discarded values stay absent through navigation, later version changes and draft save/reload.
