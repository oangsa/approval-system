import assert from "node:assert/strict";

const [origin, sha] = process.argv.slice(2);
assert(origin && new URL(origin).protocol === "https:" && new URL(origin).origin === origin, "Exact HTTPS origin required");
assert(sha && /^[a-f0-9]{40}$/.test(sha), "Full SHA required");
for (const path of ["/health", "/", "/auth/login"])
{
    const response: Response = await fetch(`${origin}${path}`, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    assert(response.ok, `Smoke failed: ${path}`);
    assert.equal(response.headers.get("x-release-sha"), sha, "Unexpected serving release");
    if (path === "/health") assert.deepEqual(await response.json(), { status: "ok" });
    else
    {
        const html = await response.text();
        assert.match(html, /<html/i);
        if (path === "/")
        {
            assert.match(html, /<title>Workflow and Approval System<\/title>/);
            assert.match(html, /<main[\s>]/);
        }
    }
}
console.info("Read-only health, public SSR marker and sign-in page smoke passed.");
