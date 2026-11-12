import { createServer, request, type IncomingHttpHeaders } from "node:http";

function forwardedHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders
{
    const result = { ...headers };
    for (const name of (headers.connection ?? "").split(",")) delete result[name.trim().toLowerCase()];
    for (const name of ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]) delete result[name];
    return result;
}

export function createProxy(apiPort: number, webPort: number, releaseSha: string)
{
    if (!/^[a-f0-9]{40}$/.test(releaseSha)) throw new Error("Release SHA required");
    return createServer((incoming, outgoing) =>
    {
        const path = (incoming.url ?? "/").split("?")[0];
        const port = path === "/api" || path?.startsWith("/api/") || path === "/health" ? apiPort : webPort;
        const upstream = request({ hostname: "127.0.0.1", port, path: incoming.url, method: incoming.method, headers: forwardedHeaders(incoming.headers) }, (response) =>
        {
            outgoing.writeHead(response.statusCode ?? 502, { ...forwardedHeaders(response.headers), "x-release-sha": releaseSha });
            response.on("error", () => outgoing.destroy());
            response.pipe(outgoing);
        });
        upstream.setTimeout(60_000, () => upstream.destroy());
        upstream.on("error", () =>
        {
            if (outgoing.headersSent) outgoing.destroy();
            else outgoing.writeHead(502, { "cache-control": "no-store" }).end();
        });
        incoming.on("aborted", () => upstream.destroy());
        outgoing.on("close", () => upstream.destroy());
        incoming.pipe(upstream);
    });
}
