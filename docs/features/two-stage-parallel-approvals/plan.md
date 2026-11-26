# Issue #10 implementation plan

Version 1 — 2026-11-26. Contracts were written before source implementation. Implementation and test status are recorded in [verification](verification.md). Frozen product, API and UI specifications prevail. Scope: R08/R10/O13, FR-025/027/032, AC-025/027/032, FT-025/027/032. See [acceptance criteria](acceptance-criteria.md), [design](sds.md), contracts and [STS](sts.md).

Baseline `e011d1a`; Node 24.22.1, npm 11.19.1; task-owned PostgreSQL port 55435 using `.env.issue10` (no secrets in evidence). The requested branch `feature/10-sprint-2-full-stack-two-stage-parallel-approvals` overrides the older issue branch label; target `sprint-2-staging`.

Ordered packets: (1) API and contracts: extract the existing summary schema, implement private read, transactional activation, migration and grant. (2) Frontend: reuse policy editor and decision dialogs; show authorized progress and ALL counts. (3) PostgreSQL and E2E: independent connection races, rollback, privacy, activation seam and browser journeys. (4) Review: bounded review, resolve findings and record actual evidence; teammate review and staged promotion remain separate gates.

Reuse existing locks, unique votes, audit, idempotency and returned working-copy behavior. No new SLA calculation, policy editor, admin bypass or broader historical access.
