import { defineConfig, devices } from "@playwright/test";
import { webUrl, apiUrl } from "./e2e/helpers/environment";

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgresql://127.0.0.1:55432/workflow_test";

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    workers: process.env.CI ? 2 : undefined,
    retries: 0,
    outputDir: "artifacts/playwright/results",
    reporter: [
        [process.env.CI ? "github" : "list"],
        ["html", { outputFolder: "artifacts/playwright/report", open: "never" }],
    ],
    use: {
        baseURL: webUrl.origin,
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: [
        {
            command: "npm run start --workspace @workflow/web",
            url: webUrl.origin,
            reuseExistingServer: false,
            env: {
                NODE_ENV: "production",
                APP_ENV: "test",
                HOST: webUrl.hostname,
                PORT: webUrl.port || "80",
                // The browser calls the API origin directly; CORS allows exactly this origin.
                VITE_API_BASE_URL: `${apiUrl.origin}/api`,
            },
        },
        {
            command: "node apps/api/dist/index.js",
            url: `${apiUrl.origin}/health`,
            reuseExistingServer: false,
            env: {
                NODE_ENV: "test",
                HOST: apiUrl.hostname,
                PORT: apiUrl.port || "80",
                // Real disposable PostgreSQL: run db:test:up, db:test:migrate and db:test:seed first.
                DATABASE_URL: testDatabaseUrl,
                AUTH_JWT_SECRET: "e2e-only-secret-0123456789abcdef0123456789abcdef",
                AUTH_JWT_ISSUER: "workflow-approval-system-e2e",
                AUTH_JWT_AUDIENCE: "workflow-approval-system-api-e2e",
                AUTH_ALLOWED_ORIGINS: webUrl.origin,
                AUTH_COOKIE_SECURE: "false",
            },
        },
    ],
});
