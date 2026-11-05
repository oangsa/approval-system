interface IParsedTarget
{
    url: URL;
    identity: string;
}

function parseTarget(value: string, variableName: string): IParsedTarget
{
    try
    {
        const url = new URL(value);
        const database = decodeURIComponent(url.pathname.slice(1));
        if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !database || url.search || url.hash)
        {
            throw new Error();
        }
        const hostname = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase())
            ? "loopback"
            : url.hostname.toLowerCase();
        return { url, identity: `${hostname}:${url.port || "5432"}/${database}` };
    }
    catch
    {
        // Never include the supplied URL or the parser's error (which can contain credentials).
        throw new Error(`${variableName} must be an unambiguous PostgreSQL URL without query parameters or fragments`);
    }
}

export function assertTestDatabaseTarget(environment: NodeJS.ProcessEnv = process.env): string
{
    if (environment.NODE_ENV !== "test")
    {
        throw new Error("PostgreSQL integration requires NODE_ENV=test");
    }
    if (environment.PGPORT !== undefined)
    {
        throw new Error("Unset PGPORT and specify the test port in TEST_DATABASE_URL to keep target verification unambiguous");
    }
    const value = environment.TEST_DATABASE_URL?.trim();
    if (!value)
    {
        throw new Error("Set TEST_DATABASE_URL for the disposable workflow_test database; never use DATABASE_URL as a fallback");
    }
    const target = parseTarget(value, "TEST_DATABASE_URL");
    if (target.url.pathname !== "/workflow_test" || !["localhost", "127.0.0.1", "[::1]"].includes(target.url.hostname.toLowerCase()))
    {
        throw new Error("TEST_DATABASE_URL must target a loopback PostgreSQL host and the database workflow_test");
    }
    if (environment.DATABASE_URL !== undefined)
    {
        const development = parseTarget(environment.DATABASE_URL, "DATABASE_URL");
        if (target.identity === development.identity)
        {
            throw new Error("TEST_DATABASE_URL must differ from the configured development database");
        }
    }
    return value;
}
