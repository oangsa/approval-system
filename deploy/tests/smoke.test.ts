import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function smoke(home: string, servingSha = "a".repeat(40), healthy = true)
{
    // Exercise the real CLI without network access or production requests.
    return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
        process.argv = [process.execPath, "deploy/smoke.ts", "https://approval.example.test", "a".repeat(40)];
        globalThis.fetch = async (url) => new Response(
            url.endsWith("/health") ? JSON.stringify({ status: ${JSON.stringify(healthy ? "ok" : "failed")} }) :
            url.endsWith("/auth/login") ? "<html>Sign in</html>" : ${JSON.stringify(home)},
            { headers: { "x-release-sha": ${JSON.stringify(servingSha)} } }
        );
        await import("./deploy/smoke.ts");
    `], { encoding: "utf8" });
}

test("smoke accepts product SSR content independently of the release slogan", () =>
{
    for (const content of ["Keep every request moving.", "Lab 5 release"])
    {
        const result = smoke(`<html><title>Workflow and Approval System</title><main>${content}</main></html>`);
        assert.equal(result.status, 0, result.stderr);
    }
});

test("smoke rejects missing public content, wrong release and unhealthy API", () =>
{
    const home = "<html><title>Workflow and Approval System</title><main>Landing</main></html>";
    for (const result of [smoke("<html>Error</html>"), smoke(home.replace("main", "div")), smoke(home, "b".repeat(40)), smoke(home, undefined, false)])
    {
        assert.notEqual(result.status, 0);
    }
});
