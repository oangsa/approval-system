PR #87 review follow-up: B01–B03 repaired and verified locally on feature/6-draft-withdraw-lifecycle. Repairs are recorded in scoped commits 7349dc1 (B01), 9ddd70f (B02), and efe1f15 (B03), prepared for the owner-authorized push to PR #87.

- B01: preserve original monetary authority before applying and validating form-version changes; reject incompatible retained values without mutation, allowing explicit clearing/replacement.
- B02: replace the edit URL with the newly saved draft ID after a type change; retain wizard step, reload the correct draft, preserve the original, and avoid duplicate creation.
- B03: revalidate unchanged saves through authoritative reads for status/version/permission, clear false success, retain recovery inputs and preserve lost-response replay keys.

Final local verification: typecheck, lint, all workspace builds and git diff --check passed; 434 unit/API/contract/component tests, 109 real-PostgreSQL integration tests, 39 Playwright browser tests and 13 release tests passed with no skips. Node.js 24.18.1, npm 11.16.0, PostgreSQL 17.10 in a task-owned disposable database. Each finding was reproduced before repair. Initial environment/test-fixture failures and corrections are documented in the updated local docs/features/draft-withdraw-lifecycle/verification.md, alongside SDS/AC/STS/DoD and the AI assistance record. No clean install or production Docker build rerun is claimed.

Independent approval by @kittipichcha remains required after the repaired revision is published. Promotion remains reviewed PRs through sprint-2-staging, dev and main. No merge or release performed.
