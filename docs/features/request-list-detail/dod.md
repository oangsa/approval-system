# Definition of Done — Issue #3

- [ ] Version design, acceptance criteria and planned test specification before product implementation; resolve contract contradictions through owner change control.
- [ ] Implement owner-scoped search, exact shared DTO and bounded query; enforce authorization on rows and counts and protect current detail.
- [ ] Deliver responsive accessible collection and four-tab detail with safe future-feature shells, client identity isolation and no private SSR data.
- [ ] Agree collection renderer interface with Issue #4 and hand off after integration; serialize shared migrations.
- [x] Run meaningful contract, API, real PostgreSQL, UI and browser tests, including existing authentication and submission regressions. See [verification](verification.md) and the partial case coverage in [STS](sts.md).
- [x] Run applicable typecheck, lint, build and root checks. Record commands, environment, commit and actual results; label unavailable checks NOT RUN or environment failure.
- [x] Update scoped traceability and verification evidence without marking unrelated journeys complete.
- [ ] Obtain independent teammate review and follow reviewed PR promotion to sprint staging, dev and main; separate authorization governs commit, push, merge and release.
