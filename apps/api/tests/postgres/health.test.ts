import { expect, test, vi } from "vitest";
import { createApplication } from "../../src/Presentations/createApplication";
import { createTestDatabase } from "../helpers/testDatabase";

test("health probes real PostgreSQL and fails after the connection closes", async () =>
{
    const database = createTestDatabase();
    const app = createApplication(undefined, undefined, undefined, undefined, undefined, () => database.Check());
    try
    {
        const healthy = await app.handle(new Request("http://localhost/health"));
        expect(healthy.status).toBe(200);
        expect(await healthy.json()).toEqual({ status: "ok" });
        await database.Close();
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        try
        {
            const unavailable = await app.handle(new Request("http://localhost/health"));
            expect(unavailable.status).toBe(503);
            expect(await unavailable.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
        }
        finally
        {
            log.mockRestore();
        }
    }
    finally
    {
        await database.Close();
    }
});
