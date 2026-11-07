# Reviewer routing and queue definition of done

Boxes reflect the integrated branch after Issue #3 merged into `sprint-1-staging`. Open boxes record gates that are still outstanding; see [verification evidence](verification.md) for the executed results.

- [x] REV-AC-01 through REV-AC-05 implemented and verified against frozen product, API and UI contracts; current actor and record authorization enforced server-side.
- [x] Shared contracts, focused unit, API, real PostgreSQL and browser tests in `sts.md` run with actual results recorded. Existing identity, submission and Issue #3 regressions remain intact.
- [ ] Real database evidence covers atomic rollback, current scope and count, concurrent role/assignment changes, and fresh plus populated upgrade migrations. Generate the reviewer index only after Issue #3's integrated journal. **Partial:** atomic rollback, current scope/count and fresh plus populated upgrade migrations are verified; the REV-PG-05 concurrent role/assignment change case remains unrun.
- [x] Accessible queue and detail work at desktop and mobile sizes, with safe errors and account-switch clearing. Issue #3's shared collection is reused after integration.
- [x] Typecheck, lint, contracts, API, web, build, integration, E2E and root checks run in the appropriate isolated environment; failures and unavailable checks are recorded accurately in verification evidence.
- [x] Feature documentation, central test and traceability references and actual verification evidence agree. No planned test is reported as passing without execution.
- [ ] Independent teammate review and required staged PR workflow complete before promotion; no publication is implied by this document.
- [ ] Issue #5 receives the guard and slot identity contract. Full AC-012 direct vote and full decision journey remain blocked until #5 integrates and verifies them; future delegation evidence remains separately outstanding. **Partial:** the reusable guard and slot identity contract are delivered and documented in the [SDS](sds.md#decision-guard-handoff); #5 integration and verification are pending.
