import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { loadTestEnvironment } from "./tests/helpers/testEnvironment";
import { assertTestDatabaseTarget } from "./src/Infrastructures/Database/testDatabaseTargetGuard";

loadTestEnvironment();
assertTestDatabaseTarget();

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    test: {
        name: "postgres",
        environment: "node",
        include: ["tests/postgres/**/*.test.ts"],
        fileParallelism: false,
        testTimeout: 15000,
        hookTimeout: 15000,
    },
});
