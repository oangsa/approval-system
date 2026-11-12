import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { createProxy } from "../proxy";

async function listen(server: Server): Promise<number>
{
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    return address.port;
}

test("same-origin proxy preserves prefix, body, auth, origin and multiple secure cookies", async () =>
{
    const api = createServer(async (request, response) =>
    {
        let body = "";
        for await (const chunk of request) body += chunk;
        response.setHeader("Set-Cookie", ["refresh=first; Secure; HttpOnly; SameSite=Strict; Path=/api/v1/auth", "second=value; Secure"]);
        response.end(JSON.stringify({ url: request.url, body, origin: request.headers.origin, cookie: request.headers.cookie, authorization: request.headers.authorization }));
    });
    const web = createServer((_request, response) => response.end("SSR page"));
    const proxy = createProxy(await listen(api), await listen(web), "a".repeat(40));
    const origin = `http://127.0.0.1:${await listen(proxy)}`;
    try
    {
        const response = await fetch(`${origin}/api/v1/auth/refresh?mode=test`, { method: "POST", headers: { Origin: "https://example.run.app", Cookie: "refresh=fixture", Authorization: "Bearer fixture" }, body: "request-body" });
        assert.deepEqual(await response.json(), { url: "/api/v1/auth/refresh?mode=test", body: "request-body", origin: "https://example.run.app", cookie: "refresh=fixture", authorization: "Bearer fixture" });
        assert.equal(response.headers.getSetCookie().length, 2);
        assert.match(response.headers.getSetCookie()[0]!, /Secure; HttpOnly; SameSite=Strict/);
        assert.equal(response.headers.get("x-release-sha"), "a".repeat(40));
        assert.equal(await (await fetch(`${origin}/requests`)).text(), "SSR page");
        assert.equal(await (await fetch(`${origin}/apiary`)).text(), "SSR page");
        assert.equal((await (await fetch(`${origin}/health`)).json()).url, "/health");
        api.close();
        api.closeAllConnections();
        assert.equal((await fetch(`${origin}/api/v1/auth/me`)).status, 502);
    }
    finally
    {
        for (const server of [proxy, api, web])
        {
            server.close();
            server.closeAllConnections();
        }
    }
});
