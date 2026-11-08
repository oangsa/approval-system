# Reviewer routing and queue definition of done

Boxes reflect the integrated branch after Issue #3 merged into `sprint-1-staging`. Open boxes record gates that are still outstanding; see [verification evidence](verification.md) for the executed results.

- [ ] REV-AC-01 through REV-AC-05 implemented; verification remains partial against frozen contracts, including contract and keyboard gaps in the STS. Current actor and record authorization are enforced server-side.
- [ ] Shared contracts, focused unit, API, PostgreSQL and browser evidence is recorded in `sts.md`; the complete STS remains partial.
- [x] Real database evidence covers atomic rollback, current scope and count, committed role/assignment changes, and fresh plus populated upgrade migrations. Reviewer index follows Issue #3's integrated journal.
- [ ] Queue and detail have desktop and mobile coverage, safe errors and account-switch clearing. Explicit keyboard coverage remains missing. Issue #3's shared collection is reused.
- [x] Current snapshot typecheck, lint, contracts, API, web, build, PostgreSQL integration, E2E and root checks ran; results and limitations are recorded in verification evidence.
- [x] Feature documentation, central test and traceability references distinguish executed evidence from missing cases.
- [ ] Independent teammate review and required staged PR workflow complete before promotion; no publication is implied by this document.
- [ ] Issue #5 receives the guard and slot identity contract. Full AC-012 direct vote and full decision journey remain blocked until #5 integrates and verifies them; future delegation evidence remains separately outstanding. **Partial:** the reusable guard and slot identity contract are delivered and documented in the [SDS](sds.md#decision-guard-handoff); #5 integration and verification are pending.
