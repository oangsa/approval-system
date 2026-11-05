import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Deliberately separate from React Router's build plugin and environment loading.
export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    esbuild: { jsx: "automatic" },
    resolve: { alias: {
        "~": fileURLToPath(new URL("./app", import.meta.url)),
        "@": fileURLToPath(new URL("./app", import.meta.url)),
    } },
    test: {
        name: "web",
        environment: "jsdom",
        environmentOptions: { jsdom: { url: "http://localhost/" } },
        setupFiles: ["./tests/setup.ts"],
        include: ["tests/{unit,components}/**/*.test.{ts,tsx}"],
        mockReset: true,
        restoreMocks: true,
        unstubEnvs: true,
        unstubGlobals: true,
    },
});
