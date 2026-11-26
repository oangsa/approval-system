import { expect, test } from "vitest";
import { approverSummarySchema, loginResponseSchema, requestDetailSchema, type RequestDetail } from "@workflow/contracts";
import type { IRequestRepository } from "../../src/Domains/Requests/Ports";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import { createApplication } from "../../src/Presentations/createApplication";
import { identityHttpFixture } from "../helpers/identityHttp";

test("approvers grants only current participants and returns private minimal summaries under lock", async () =>
{
    const fixture = identityHttpFixture();
    const requestId = "10000000-0000-4000-8000-000000000001";
    const slotId = "20000000-0000-4000-8000-000000000001";
    const summary = { slotId, stageNumber: 2 as const, reviewer: { id: fixture.account.id, displayName: fixture.account.displayName }, status: "WAITING" as const };
    const detail = { requester: { id: fixture.other.id }, status: "PENDING", currentApprovers: [summary] } as RequestDetail;
    const locks: boolean[] = [];
    const repository = {
        CurrentActor: async (actor: import("../../src/Domains/Identity/Identity").IActor) => actor,
        Read: async (_id: string, lock = false) =>
        {
            locks.push(lock);
            return detail;
        },
    } as IRequestRepository;
    const app = createApplication(undefined, fixture.dependencies, new RequestService({ Run: (operation) => operation(repository) }));
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    const { accessToken } = loginResponseSchema.parse(await login.json());
    const send = () => app.handle(new Request(`http://localhost/api/v1/requests/${requestId}/approvers`, { headers: { authorization: `Bearer ${accessToken}` } }));
    fixture.identities.get(fixture.account.id)!.roles = ["REVIEWER"];
    const response = await send();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("x-pagination")).toBe(false);
    expect(await response.json()).toEqual([summary]);
    expect(locks).toEqual([true]);
    detail.currentApprovers[0]!.status = "APPROVED";
    expect((await send()).status).toBe(404);
    fixture.identities.get(fixture.account.id)!.roles = ["ADMINISTRATOR"];
    expect((await send()).status).toBe(404);
    detail.requester.id = fixture.account.id;
    expect((await send()).status).toBe(200);
    expect(approverSummarySchema.safeParse({ ...summary, email: "private@example.test" }).success).toBe(false);
    expect(requestDetailSchema.shape.currentApprovers.element).toBe(approverSummarySchema);
});
