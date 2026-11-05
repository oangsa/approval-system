function localServerUrl(value: string): URL
{
    const url = new URL(value);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/" || url.username || url.password || url.search || url.hash)
    {
        throw new Error("E2E URLs must be plain loopback HTTP origins managed by Playwright");
    }
    return url;
}

export const webUrl = localServerUrl(process.env.E2E_WEB_URL || `http://127.0.0.1:${process.env.E2E_WEB_PORT || "14173"}`);
export const apiUrl = localServerUrl(process.env.E2E_API_URL || `http://127.0.0.1:${process.env.E2E_API_PORT || "14174"}`);

if (webUrl.port === apiUrl.port)
{
    throw new Error("E2E web and API servers require distinct ports");
}
