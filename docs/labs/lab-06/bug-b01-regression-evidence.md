# BUG-B01 regression evidence

[Issue #71](https://github.com/oangsa/approval-system/issues/71) reports a Major login defect (B-UAT-NEW-002, UAT-01 / AC-001 / M01); [PR #73](https://github.com/oangsa/approval-system/pull/73) targets `sprint-1-staging`. The Lab 6 D2 report is in the [course document](https://docs.google.com/document/d/153VexiNdr7oeo6dMk11-8VGSfwvydtJERyIH7Bbo7AM/edit?tab=t.43f1pp5obo6l). The SSR form previously defaulted to GET before hydration. The fix declares POST and disables sign-in until hydration; the hydrated path continues to use the existing JSON API.

## Tested snapshots and focused replay

On 20 November 2026 (ICT), PowerShell ran in `C:/Users/kitti/approval-system/artifacts/issue-71-login`, with Node v24.22.1, npm 11.19.1, Vitest 4.1.10 and jsdom. Base was `803d78608ae709e97d4e524b143591c7be3b663d`. RED used its original `LoginForm` with the frozen final regression test; GREEN used the fixed form with the same assertions. The captured pre-replay dirty state listed `LoginForm.tsx`, `login.test.tsx`, and `e2e/auth.spec.ts` as modified. RED temporarily restored the original form; GREEN restored the fixed form. Both snapshots preceded the commit. The source and tests were unchanged when fixed commit `6493d4a159e09695e2f444a1c38e10d926b77be4` was created. The base SHA does not establish the deployed revision.

The initial meaningful method regression failed before product edits. The disabled assertion was then finalized using the native DOM property to avoid a cross-realm jest-dom fixture issue; that fixture assertion error is not counted as defect RED. The final unchanged test was replayed RED and GREEN. The [component test](../../../apps/web/tests/components/login.test.tsx), `server-rendered login form never sends credentials in a URL`, renders the form on the server and contains these assertions:

```ts
expect(form.method).toBe("post");
expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
```

Commands for both runs:

```powershell
New-Item -ItemType Directory -Force artifacts/test-temp | Out-Null
$env:TEMP = Join-Path (Get-Location) 'artifacts/test-temp'
$env:TMP = $env:TEMP
npm run test:web -- apps/web/tests/components/login.test.tsx
```

Retained text output normalizes terminal blank lines and line endings; test output, assertions and results are unchanged. The original raw artifacts remain locally.

- [RED output](evidence/bug-b01/red.txt): exit 1 at 18:52:34, one failed and 11 passed; expected `post`, received `get`.
- [GREEN output](evidence/bug-b01/green.txt): exit 0 at 18:52:56, 12 passed.

The fixed snapshot SHA-256 values recorded before commit were `091B9969E2B56157958C49EC600DD2C97C24D519A60BC9E5D9A89261C99267B8` (form), `55048D09291E4019D0572B9107FB48697F0DDA95AA4DF3606BF5CB6313704544` (component test), and `4F64ED2169CF4325CBC593312136E22060A2B46F79883F1E0641B5FD31E04170` (browser test).

## Browser and broader checks

The browser test `login cannot submit credentials before JavaScript is available` in `e2e/auth.spec.ts` used Chromium with JavaScript disabled and synthetic credentials. It checked the disabled submit control, Enter key behavior, unchanged login URL and retained password field. The [browser output](evidence/bug-b01/browser-green.txt) records one pass, exit 0. It used only the built web server, no API or database. With the TEMP/TMP setup above and after `npm run build`, the historical command was:

```powershell
$env:E2E_WEB_PORT = '18171'
node C:/Users/kitti/approval-system/node_modules/@playwright/test/cli.js test --config artifacts/issue-71-browser.config.ts
```

The temporary config was located at `artifacts/issue-71-browser.config.ts`; its exact content follows. Its absolute working directory and parent-installed CLI describe that historical machine and need adjustment for another checkout. It is not the normal clean-checkout browser command; see the [README browser instructions](../../../README.md#browser-tests) for the standard suite and its database prerequisites.

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "../e2e",
    testMatch: "auth.spec.ts",
    grep: /login cannot submit credentials before JavaScript is available/,
    workers: 1,
    retries: 0,
    reporter: "list",
    outputDir: "./issue-71-evidence/browser-results",
    use: { baseURL: "http://127.0.0.1:18171" },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        command: "npm run start --workspace @workflow/web",
        cwd: "C:/Users/kitti/approval-system/artifacts/issue-71-login",
        url: "http://127.0.0.1:18171",
        reuseExistingServer: false,
        env: { NODE_ENV: "production", HOST: "127.0.0.1", PORT: "18171" },
    },
});

```

The implementation session reported `npm run typecheck` and `npm run lint` passing, `npm test` passing 386 tests in 43 files, and `npm run build` passing after a filesystem-access rerun. Raw transcripts for typecheck, lint and the full ordinary test suite were not retained; the successful build output was retained locally. These are session reports, not newly rerun checks.

Early failures were not RED: Vitest initially ran zero tests due to a sandbox temporary-directory rename error; an old contracts junction caused unrelated missing-export type errors; the initial build hit EPERM writing `build/client`; and the first browser startup found port 14173 occupied. Workspace TEMP/TMP, a worktree-local contracts junction, filesystem access, and port 18171 respectively allowed the later runs.

## Limits

The full database-backed authentication browser suite was not run for this fix. No CI verification, deployment, teammate approval, independent partner retest, or password rotation is asserted by this record. Local agent review is not independent human review. The reported exposed test-account password still requires owner rotation; acceptance remains pending deployment and independent retest.
