import { expect, test } from "vitest";
import { loginResponseSchema } from "@workflow/contracts";
import type { IRequestRepository } from "../../src/Domains/Requests/Ports";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import { createApplication } from "../../src/Presentations/createApplication";
import { identityHttpFixture } from "../helpers/identityHttp";

test("search authenticates and passes trusted owner to repository", async () =>
{
    const fixture = identityHttpFixture();
    const owners: string[] = [];
    const unavailable = async (): Promise<never> =>
    {
        throw new Error("unexpected repository call");
    };
    const repository: IRequestRepository = {
        CurrentActor: async (actor) => actor,
        Search: async (ownerId, query) =>
        {
            owners.push(ownerId);
            return { items: [], pagination: { currentPage: query.pageNumber, pageSize: query.pageSize, totalPages: 0, totalCount: 0, hasPrevious: false, hasNext: false } };
        },
        Replay: unavailable, Complete: unavailable, Read: unavailable, Configuration: unavailable, Create: unavailable, Patch: unavailable, Submit: unavailable, Types: unavailable, TypeVersion: unavailable, Type: unavailable,
    };
    const app = createApplication(undefined, fixture.dependencies, new RequestService({ Run: (operation) => operation(repository) }));
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    expect(login.status).toBe(200);
    const { accessToken } = loginResponseSchema.parse(await login.json());
    const send = (body: string, token = accessToken) => app.handle(new Request("http://localhost/api/v1/requests/search", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: "http://localhost:3000" }, body }));
    const response = await send("{}");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(JSON.parse(response.headers.get("x-pagination")!)).toEqual({ currentPage: 1, pageSize: 20, totalPages: 0, totalCount: 0, hasPrevious: false, hasNext: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-expose-headers")?.toLowerCase()).toContain("x-pagination");
    fixture.identities.get(fixture.account.id)!.roles.push("REVIEWER");
    expect((await send("{}" )).status).toBe(200);
    expect(owners).toEqual([fixture.account.id, fixture.account.id]);
    expect((await send(JSON.stringify({ search: [{ name: "requesterId", condition: "EQUAL", value: fixture.other.id }] }))).status).toBe(422);
    expect((await send("{" )).status).toBe(400);
    expect((await send("{}", "invalid")).status).toBe(401);
    fixture.identities.get(fixture.account.id)!.roles = ["REVIEWER"];
    expect((await send("{}" )).status).toBe(403);
    expect(owners).toEqual([fixture.account.id, fixture.account.id]);
});
