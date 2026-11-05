import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) =>
{
    const environment = loadEnv(mode, process.cwd(), "");
    return {
        plugins: [tailwindcss(), reactRouter()],
        resolve: { alias: {
            "~": fileURLToPath(new URL("./app", import.meta.url)),
            "@": fileURLToPath(new URL("./app", import.meta.url)),
        } },
        server: {
            port: 5173,
            strictPort: true,
            proxy: { "/api": {
                target: environment.API_PROXY_TARGET || "http://127.0.0.1:3001",
                rewrite: (path) => path.replace(/^\/api/, ""),
            } },
        },
    };
});
