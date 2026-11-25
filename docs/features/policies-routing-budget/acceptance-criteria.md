# Numbered acceptance criteria — Issue #9

- PRB-AC-01: Admin creates/patches/branches/publishes policy drafts with expectedVersion; publication is immutable and idempotent; disable affects only future cycles.
- PRB-AC-02: Policies accept priority, type, optional department/inclusive amount bounds and 1–2 ordered ALL stages with nonempty stable keys and SLA default 480; reject third stage/ANY/quorum/malformed bounds.
- PRB-AC-03: Highest matching priority wins; equal top priority returns 409 AMBIGUOUS_APPROVAL_POLICY and no route returns 409 CONFIGURATION_INCOMPLETE atomically.
- PRB-AC-04: Admin creates/searches/updates versioned optional-department reviewer mappings; assignment `key` is immutable after creation (read-only in edit UI, rejected on PATCH); all reviewers active and Reviewer-eligible. All stage mappings revalidated on submit including non-self eligibility; actual slots snapshotted.
- PRB-AC-05: Eligible reviewer search is admin-only, paged and minimal; nonadmin cannot configure or obtain private request authority.
- PRB-AC-06: Budget create/search/update resolves one active most-specific ceiling. Exact below/equal passes; above returns 422 without cycle/audit/outbox mutation. No ledger.
- PRB-AC-07: Submit uses trusted department; historical department/form seam supports current routing for returned cycles. Mapping edits never rewrite accepted snapshots.
- PRB-AC-08: Admin screens support eligible lookup, draft/version/publish/disable, ALL labels, explicit priority/tie warnings, local explanation, ceiling explanation and actionable 409/422 states.
- PRB-AC-09: Concurrent/stale configuration and publication cannot partially commit or duplicate versions; audit append and idempotency response commit with behavior.
- PRB-AC-10: Unit/contracts/API/PostgreSQL/security/concurrency/browser checks provide actual evidence; teammate review and reviewed staging/dev/main promotions remain separate gates.
