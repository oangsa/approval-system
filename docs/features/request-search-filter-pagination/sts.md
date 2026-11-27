# Software test specification

AC1–4: FT-037–039, UT-12, API-04/05/06, SEC-02/11: strict contract matrices, AND/OR/literal search, date equality and microsecond comparisons, stable equal-value page boundaries, scoped counts, CORS/header and invalid private fields. Reuse requestReadSearch and requests PostgreSQL API fixtures; extend queue precision assertions. Existing workflow race suites protect eligibility/concurrency integration.

AC5–6: UI-16/20/23, E2E-13/15: pure URL decode validation, Bangkok inclusive range, page size/sort/chips/back-forward, no request on invalid URL, latest-response/account isolation, actual browser responsive controls. Reuse shared collection and queue component regressions plus request/review browser journeys.

AC7: npm run typecheck; npm run lint; npm test; npm run build; npm run test:integration; applicable Playwright suites. Record environment, base commit, commands and actual outcomes in verification.md; no passing evidence claimed in this plan.
