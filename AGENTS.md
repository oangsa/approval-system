# AGENTS.md

## Tech Stack

- **Repository:** Monorepo using Bun Workspaces; one root `AGENTS.md` and one root `bun.lock`.
- **Language / runtime:** TypeScript throughout; npm for workspace management and backend runtime.
- **Frontend:** React Router 7 Framework Mode (`ssr: true`), React, TypeScript, shadcn/ui, Tailwind CSS.
- **Rendering:** SSR for public pages; client-side data loading and hydrated, SPA-style navigation for authenticated pages. Do not assume `ssr: true` disables SSR per route.
- **Frontend architecture:** Feature-based modular structure with thin route modules, reusable UI components, and dedicated API/service layers.
- **Backend:** Elysia on Bun, using OOP and Clean Architecture.
- **Persistence:** PostgreSQL with Drizzle ORM and versioned migrations.
- **Shared contracts:** One `packages/contracts` workspace package using Zod schemas and inferred TypeScript types.
- **Authentication:** Email + application password (no OAuth); access JWT and rotating refresh token stored in an HttpOnly cookie.
- **Delivery:** Docker, GitHub Actions CI/CD, and deployment to Google Cloud Platform.

## General Rules

- Follow this single root `AGENTS.md` for every workspace package. Do not create nested `AGENTS.md` files.
- All required specifications are in `docs/specs/`. Read the relevant requirements, design, API, UI, test, and traceability specifications there before implementation.
- Keep changes limited to the requested scope. Inspect related code, contracts, tests, and existing patterns before editing; reuse existing abstractions where appropriate.
- Use strict TypeScript; avoid `any`, duplicated types, dead code, speculative abstractions, and unrelated refactors.
- Use **PascalCase** for classes, interfaces (prefixed with `I`), React components, and class methods; **camelCase** for ordinary functions, variables, and properties.
- Use **Allman-style braces** in TypeScript: opening braces on a new line for functions, classes, methods, and control-flow statements. Follow TSX/JSX syntax where required.
- Keep each module focused and small. Do not introduce a new library, service, or architectural layer when the existing stack can meet the requirement.
- Prefer reusable, testable implementations over duplicated logic. Preserve existing behavior unless the requested change explicitly changes it.
- Use icons from Lucide or the existing icon dependencies rather than emojis in application UI.
- Never commit credentials, real tokens, `.env` files containing secrets, or production data. Document configuration through safe examples.

## Frontend Rules — `apps/web`

- Follow React Router 7 Framework Mode conventions; keep route wrappers thin and feature logic under `app/modules/` (or the established feature-module directory).
- Keep HTTP transport in the API layer and UI-facing request orchestration in the service layer; do not scatter raw `fetch()` calls across components.
- Use shadcn/ui as **base UI primitives**. Do not modify generated/raw shadcn components to add feature-specific behavior; compose or wrap them in shared/feature components instead.
- Style with Tailwind CSS; avoid introducing another styling system. Reuse shared components before creating new ones.
- Define TypeScript interfaces for component props. Keep feature-specific state, form behavior, and field mapping in the feature module.
- Use Zod schemas from `packages/contracts` for shared API data and form validation. Do not maintain a separate, conflicting copy of shared DTOs in the frontend.
- Keep authenticated pages client-data-driven as agreed; use appropriate loading/hydration fallbacks and prevent sensitive data from leaking into public SSR output.
- Provide meaningful loading, empty, validation, and error states. Show human-readable labels/codes instead of raw database IDs when practical.

## Backend Rules — `apps/api`

- Preserve Clean Architecture dependency direction: **Presentation → Application → Domain**, with **Infrastructure implementing inner-layer interfaces**.
- **Domain:** entities, value objects, business rules, domain errors, and repository contracts. Do not import Elysia, Drizzle, HTTP, or database-driver code into Domain.
- **Application:** use cases and orchestration through interfaces. Keep HTTP and SQL concerns outside application services.
- **Infrastructure:** Drizzle schema, migrations, database connections, and repository implementations. Do not put domain decisions in repositories.
- **Presentation:** Elysia routes/controllers, authentication middleware, Zod request/response validation, and exception-to-HTTP mapping. Keep controllers thin.
- Enforce authentication, role/record authorization, ownership restrictions, and all workflow transitions on the server; never trust UI visibility or client-supplied identities as authorization.
- Use database transactions for related state changes and audit records. Handle concurrent decisions, stale updates, and retries without duplicate or partial effects.
- Use descriptive names and aliases for joined query fields; avoid ambiguous abbreviations.
- Change Drizzle schema only through intentional, reviewed schema changes with migrations. Do not edit generated migration files casually or overwrite existing data.
- Hash application passwords securely. Rotate and revoke refresh tokens correctly; never expose refresh tokens to browser JavaScript or store them in localStorage.

## Shared Contract Rules — `packages/contracts`

- Define shared HTTP request/response and validation schemas in Zod once; infer TypeScript types from those schemas.
- Both `apps/web` and `apps/api` must consume the same published workspace contracts. Avoid circular dependencies and importing application code into this package.
- Keep `packages/contracts` free from React, Elysia, Drizzle, database operations, and environment-specific code.
- Shared validation checks transport data shape and constraints; domain-specific authorization and state rules belong in the backend Domain/Application layers.
- Treat breaking contract changes as coordinated updates to frontend, backend, and relevant tests in the same reviewed change.

## Testing and Git Rules

- Write or update meaningful automated tests for changed behavior, business rules, authorization, persistence, and relevant error cases. Do not remove, skip, or weaken tests to make a change appear successful.
- Run applicable typecheck, lint, build, and tests before reporting completion; report actual results and any failures or skipped checks accurately.
- Follow GitHub Issues and the branch workflow below, with teammate review for each pull request and release review before merging to `main`.
- Keep pull requests scoped and reviewable. Coordinate changes to shared contracts, migrations, workspace configuration, and lockfiles.
- Keep requirements, design, acceptance criteria, and test specifications versioned before implementation when required by the course; preserve traceability to implemented changes and actual verification.

## Branch Workflow

- **`main`:** The primary and production branch. It receives the final reviewed release from `dev` through a pull request.
- **`dev`:** The development integration branch and final test/buffer stage before `main`. Do not develop on it or push changes directly to it; changes arrive through reviewed pull requests from `sprint-x-staging`.
- **`sprint-x-staging`:** The sprint staging/integration branch, where `x` is the sprint number. It collects reviewed development work before promotion to `dev`.
- **`feature/<name>`, `chore/<name>`, `fix/<name>`:** The actual development branches. Choose the prefix matching the work: new behavior, maintenance, or defect correction.
- Promote changes in this order without skipping stages. Each transition requires a reviewed pull request and merge:

```text
feature/xyz (or chore/<name>, fix/<name>)
  -> PR -> sprint-x-staging
  -> PR -> dev
  -> PR -> main
```

## Scoped Atomic Commit Convention

Every manually authored source/history commit in this Workflow and Approval System repository MUST use a single-line subject in this format:

```text
<type>(<scope>): <short message>
```

Only the following types are approved:

| Approved type | Intended change | Example |
|---|---|---|
| `feat` | New application or API behavior | `feat(approvals): add approval decision validation` |
| `fix` | Defect correction, including regressions and hotfixes | `fix(workflow): prevent duplicate transitions` |
| `docs` | Documentation or contract wording | `docs(api): clarify health response contract` |
| `chore` | Dependencies and general non-feature maintenance | `chore(deps): update dependency lockfile` |
| `refactor` | Behavior-preserving internal restructuring | `refactor(api): extract error response mapping` |
| `test` | Tests without changing product behavior | `test(database): cover unsafe target rejection` |
| `perf` | Performance optimization without intended behavior change | `perf(requests): reduce list query overhead` |
| `ci` | CI/CD pipelines and automation configuration | `ci(pipeline): add contract validation gate` |
| `revert` | Revert a prior commit or bounded change | `revert(api): undo unsafe response caching` |

**Commit boundaries (mandatory):**

1. **No bulk commits:** split unrelated changes by purpose and scope. Do not commit a complete milestone as one large change merely to save review time. Each commit SHOULD be independently understandable and, where feasible, independently reversible.
2. **One coherent intent per commit:** a single feature or fix MAY span Domain, Application, Infrastructure, Presentation, UI, and its tests when those changes implement one cohesive behavior. Atomic does not mean one file or one layer. Avoid unrelated formatting, refactors, generated artifacts, or bug fixes in the same commit; include required generated files only with the change that produces them.
3. **Meaningful scope required:** use a stable lowercase, kebab-case domain/component name, such as `auth`, `workflow`, `requests`, `approvals`, `database`, `contracts`, `api`, `ui`, `deps`, `pipeline`, `release`, or `docs`. Choose the primary affected subsystem. Do not use catch-all scopes such as `all`, `misc`, or `core` for unrelated edits.
4. **Short message:** write an English, imperative, descriptive subject using verbs such as `add`, `prevent`, `extract`, `document`, or `configure`. Target at most 72 characters for the complete subject, with no trailing period. Do not use a broad subject to hide unrelated changes.
5. **Stage deliberately:** review unstaged and staged diffs; stage only files/hunks belonging to the intent, for example with `git add -p`, then inspect `git diff --cached` before committing. Never commit secrets, local environment configuration, private keys, recovery credentials, personal or customer information, or generated data dumps.
6. **Tests belong with their behavior:** include directly related tests/fixtures in implementation and fix commits when practical. Test-only changes SHOULD use `test(<scope>)`; behavior-changing bug fixes SHOULD use `fix(<scope>)` with a regression test when practical. Pipeline-only changes SHOULD use `ci(<scope>)`.
7. **Approved types are exhaustive:** use ONLY `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`, or `revert`. Types such as `style` and `build` are not approved; classify accurately under an approved type or request an owner decision if none fits. Reverts MUST identify reverted commits in the body when possible while retaining the scoped subject format.
8. **Merge and release operations:** Git-generated merge subjects, immutable release tag annotations, and automated version metadata are tooling records, not exceptions for manually authored work. Release authorization is separate from commit wording: no commit subject may by itself authorize or trigger production publication.
9. **Efficient review:** multiple scoped commits may belong to one feature pull request or milestone. This convention does not require a separate PR for every commit or a mandatory commit-message GitHub rule. Preserve the existing issue, teammate-review, staging/integration, release-review, and traceability requirements; commits remain smaller than milestones.
10. **Authority:** this convention governs how to write future commits; it does not authorize committing, amending/rebasing history, pushing, or publishing. Obtain separate explicit user authorization for those operations. Authorized source/configuration/documentation edits remain permitted without implying authorization to record or publish them.

Example: one foundation milestone split into scoped commits:

```text
chore(workspaces): configure npm workspace packages
chore(api): configure Elysia Node runtime
chore(ui): configure React Router SSR foundation
test(contracts): verify shared health response schema
test(database): guard isolated PostgreSQL targets
ci(pipeline): run workspace verification
docs(setup): document local development commands
```

These subject examples describe commit organization only; they do not authorize implementing future business features.
