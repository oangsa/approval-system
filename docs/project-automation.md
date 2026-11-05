# GitHub Project automation

Adapted from `TokTickIT/.github/workflows/project-automation.yml`. This updates GitHub Project issue cards, not application approval records. The project destination is configured separately; TokTickIT's project number is intentionally not copied.

## When cards change

| GitHub event                                                                    | Required current status | Result                                        | Other requirements                                                                                                     |
| ------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Create a remote branch named `feature/123-description` or `fix/123-description` | `Specified`             | `Started`                                     | Issue #123 is open, already in the project, and assigned to the account creating the branch.                           |
| Open, reopen, or mark a PR ready for review                                     | `Started` or `Fixing`   | `PR Review`                                   | PR body contains `Closes #123`, `Fixes #123`, or `Resolves #123`; the open project issue is assigned to the PR author. |
| Submit a review with **Request changes**                                        | `PR Review`             | `Fixing`                                      | Same PR-body, open-issue, project membership, and PR-author assignment requirements.                                   |
| Push a new commit to an existing PR                                             | `Fixing`                | `PR Review`                                   | Same requirements; this does not wait for CI or a new approval.                                                        |
| Merge a PR into **any target branch**, including sprint staging                 | Any                     | Referenced issues are closed as completed     | Closing keywords in the PR body; this step does not check assignment or project membership.                            |
| Issue closes                                                                    | Any                     | `Done` (or your configured completion status) | Enable the project's built-in **Item closed** workflow. The YAML does not directly set this status.                    |

Transitions occur after the corresponding GitHub Actions job succeeds, not at local branch creation or checkout. Creating a local branch alone does nothing; its first push creates the remote branch. Subsequent ordinary branch pushes do not set `Started`. Approval alone, closing a PR without merging, or deleting a branch does not change a card.

Like TokTickIT, opening a draft PR can move an issue to `PR Review`. Closing on merge into staging marks issue implementation complete; it does not prove integration or authorize a release. The separate release PR to `main` still needs review. Use plain references such as `Includes #123` in release PRs if issues should not be closed by that PR.

## One-time manual setup

1. Have this workflow reviewed and merged into the repository's default branch (normally `main`). The `create` event requires the workflow there. Enable GitHub Actions and allow `actions/github-script@v7`.
2. Create or choose a **user-owned GitHub Project v2**. Under repository **Settings → Secrets and variables → Actions → Variables**, set:
   - `PROJECT_OWNER`: project owner's GitHub login.
   - `PROJECT_NUMBER`: number from `https://github.com/users/OWNER/projects/NUMBER` (not an issue number or a GraphQL ID).
3. Give the automation account access to the repository and write access to that project. Create a classic personal access token with `project` and `repo` scopes, then save it as the repository Actions **secret** `PROJECT_TOKEN`. Never put the token in code or documentation. The standard `GITHUB_TOKEN` cannot access Projects. Keep the token valid and renew the secret before expiry.
4. Create a single-select field named exactly `Status` with options exactly `Specified`, `Started`, `PR Review`, and `Fixing`, plus your completion status (for example `Done`). Group the board by `Status`.
5. In the project's **… → Workflows**, enable **Item closed** and set its status to `Done` or the desired completion option. Confirm this workflow is enabled rather than assuming the default is still active.
6. Add the repository's issues to this project, assign each issue to its implementer, and manually set specification-ready issues to `Specified`.

This workflow queries `user(login: ...)`; organization-owned projects require adapting the GraphQL queries. Fork and Dependabot PRs do not receive the project secret in normal PR workflows, so maintainers must handle those board transitions manually.

## Daily use and manual recovery

For issue #123, first add/assign/specify it, then create `feature/123-description` from the agreed sprint staging branch and push it. Open a teammate-reviewed PR back to sprint staging with `Closes #123` in its body. All matching local issue references in the body are processed, so include only issues that PR actually completes. Cross-repository references and PR-title-only references are not supported.

Keep specification review, implementation, teammate review, staging integration checks, and release review as separate required activities. Board movement does not enforce or replace them.

If a card does not move, inspect **Actions → Project Automation** and the job's skip message. Check exact status spelling, assignment, issue openness, project membership, variables, and secret access. The copied workflow searches only the first 100 project items and first 20 assignees; manually move an item outside those results or extend pagination before relying on automation for a larger board.

If a branch already existed before setup, manually move its ready issue from `Specified` to `Started`. Adding closing text to an already-open PR does not itself trigger a transition; correct the prerequisites and manually move the card, or rerun the original failed job when its original event body was already correct. Moving an issue to `Specified` after branch creation does not replay the branch event. Unsupported branch names such as `feature/login`, staging branches, and unassigned issues need manual handling.

Before relying on the workflow, use a disposable issue assigned to yourself to check remote branch creation, PR opening, Request changes from a teammate, a subsequent commit, and merge into staging. Confirm the issue closes and its card reaches the completion column. This live check requires the workflow to be published and the above GitHub settings configured.

References: [GitHub Actions project authentication](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions), [built-in project workflows](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations), and [workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
