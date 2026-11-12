import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { createProxy } from "./proxy";

const proxy = createProxy(3001, 3002, process.env.RELEASE_SHA ?? "");
const children = [
    spawn(process.execPath, ["dist/index.js"], { cwd: "/app/apps/api", env: { ...process.env, HOST: "127.0.0.1", PORT: "3001" }, stdio: "inherit" }),
    spawn(process.execPath, ["/app/node_modules/@react-router/serve/bin.js", "./build/server/index.js"], { cwd: "/app/apps/web", env: { ...process.env, HOST: "127.0.0.1", PORT: "3002" }, stdio: "inherit" }),
];
let stopping = false;
function stop(code: number): void
{
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    proxy.close();
    proxy.closeAllConnections();
    for (const child of children) child.kill("SIGTERM");
    globalThis.setTimeout(() => process.exit(code), 8000).unref();
}
for (const child of children)
{
    child.once("error", () => stop(1));
    child.once("exit", () => stop(stopping ? 0 : 1));
}
process.once("SIGTERM", () => stop(0));
process.once("SIGINT", () => stop(0));

async function start(): Promise<void>
{
    for (let attempt = 0; attempt < 100 && !stopping; attempt++)
    {
        const ready = await Promise.all([3001, 3002].map(async (port) =>
        {
            try
            {
                const response = await fetch(`http://127.0.0.1:${port}${port === 3001 ? "/health" : "/"}`, { signal: AbortSignal.timeout(500) });
                await response.arrayBuffer();
                return response.ok;
            }
            catch
            {
                return false;
            }
        }));
        if (ready.every(Boolean))
        {
            proxy.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? "0.0.0.0");
            return;
        }
        await setTimeout(200);
    }
    stop(1);
}
proxy.on("error", () => stop(1));
start().catch(() => stop(1));
