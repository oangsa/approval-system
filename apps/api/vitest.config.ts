import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    test: {
        name: "api",
        environment: "node",
        include: ["tests/{unit,integration}/**/*.test.ts"],
        setupFiles: ["./tests/setup.ts"],
        mockReset: true,
        restoreMocks: true,
        unstubEnvs: true,
        env: { NODE_ENV: "test" },
    },
});
