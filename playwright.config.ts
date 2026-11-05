import { defineConfig, devices } from "@playwright/test";
import { webUrl, apiUrl } from "./e2e/helpers/environment";

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
                // Health is liveness only: deliberately unreachable and never a development target.
                DATABASE_URL: "postgresql://127.0.0.1:1/workflow_test",
            },
        },
    ],
});
