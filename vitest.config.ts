import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            "apps/web/vitest.config.ts",
            "apps/api/vitest.config.ts",
            "packages/contracts/vitest.config.ts",
        ],
        coverage: {
            provider: "v8",
            reportsDirectory: "artifacts/coverage",
            reporter: ["text", "html", "lcov"],
            include: ["apps/web/app/**/*.{ts,tsx}", "apps/api/src/**/*.ts", "packages/contracts/src/**/*.ts"],
        },
    },
});
