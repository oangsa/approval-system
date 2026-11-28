import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { apiUrl } from "./helpers/environment";
import { createTestDatabase } from "../apps/api/tests/helpers/testDatabase";
import { approvalCycles, requestRevisions, requests } from "../apps/api/src/Infrastructures/Database/schema";

async function login(page: Page, email: string)
{
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Test-password-42!");
    const response = page.waitForResponse((item) => item.url().endsWith("/auth/login") && item.request().method() === "POST");
    await page.getByRole("button", { name: "Sign in" }).click();
    const { accessToken } = await (await response).json() as { accessToken: string };
    await expect(page).toHaveURL(/\/dashboard$/);
    return accessToken;
}

test("RR-AC-09/10 return, revise, resubmit and inspect immutable history", async ({ browser }, testInfo) =>
{
    test.setTimeout(120_000);
    const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const reviewerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try
    {
        const owner = await ownerContext.newPage(), reviewer = await reviewerContext.newPage();
        const title = `Revision journey ${Date.now()}`;
        await login(owner, "requester-a@example.test");
        await owner.goto("/requests/new");
        await owner.getByLabel("Request type (required)").selectOption({ label: "General request" });
        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await owner.getByLabel("Title", { exact: false }).fill(title);
        await owner.getByLabel("Justification", { exact: false }).fill("Initial explanation");
        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await owner.getByLabel("Category", { exact: false }).selectOption("OPERATIONS");
        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await expect(owner.getByRole("heading", { name: "Items & Attachments" })).toBeVisible();
        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await owner.getByRole("button", { name: "Submit request" }).click();
        const submitted = owner.waitForResponse((response) => response.url().endsWith("/submit") && response.request().method() === "POST");
        await owner.getByRole("button", { name: "Confirm submission" }).click();
        const initial = await (await submitted).json() as { id: string; requestNumber: string };
        await login(reviewer, "reviewer@example.test");
        await reviewer.goto("/reviews");
        await reviewer.getByLabel("Search requests").fill(title);
        await reviewer.getByRole("button", { name: "Search", exact: true }).click();
        const card = reviewer.getByRole("listitem").filter({ hasText: title });
        await expect(card).toBeVisible();
        await card.getByRole("link").click();
        await reviewer.getByRole("button", { name: "Return", exact: true }).click();
        const dialog = reviewer.getByRole("dialog");
        await expect(dialog.getByRole("button", { name: "Confirm return" })).toBeDisabled();
        await dialog.getByLabel(/Reason/).fill("Please correct the details");
        await reviewer.screenshot({ path: testInfo.outputPath("return-dialog-mobile.png"), fullPage: true });
        const decision = reviewer.waitForResponse((response) => response.url().endsWith("/decisions") && response.request().method() === "POST");
        await dialog.getByRole("button", { name: "Confirm return" }).click();
        expect((await decision).status()).toBe(201);
        await owner.goto(`/requests/${initial.id}`);
        await owner.getByRole("link", { name: "Edit returned request" }).click();
        await owner.getByLabel("Justification", { exact: false }).fill("Corrected explanation");
        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await owner.getByLabel("Category", { exact: false }).selectOption("OTHER");
        await owner.getByLabel("Additional details", { exact: false }).fill("Corrected details");
        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await expect(owner.getByRole("heading", { name: "Items & Attachments" })).toBeVisible();
        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await owner.getByRole("button", { name: "Resubmit request" }).click();
        await expect(owner.getByRole("dialog")).toContainText("review restarts");
        const resubmitted = owner.waitForResponse((response) => response.url().endsWith("/resubmit") && response.request().method() === "POST");
        await owner.getByRole("button", { name: "Confirm resubmission" }).click();
        const next = await (await resubmitted).json() as { requestNumber: string; status: string };
        expect(next).toMatchObject({ requestNumber: initial.requestNumber, status: "PENDING" });
        await owner.goto(`/requests/${initial.id}?tab=history`);
        await owner.getByLabel("Select revision").selectOption({ label: "Revision 1" });
        const snapshot = owner.getByRole("region", { name: "Revision snapshot" });
        await expect(snapshot).toContainText("Operations");
        await expect(snapshot).not.toContainText("Corrected details");
        await expect(snapshot).toContainText("Form version: 1");
        const oldCycle = await snapshot.locator("p").filter({ hasText: "Cycle:" }).textContent();
        await owner.getByLabel("Select revision").selectOption({ label: "Revision 2 (current)" });
        await expect(snapshot).toContainText("Other");
        await expect(snapshot).toContainText("Corrected details");
        await expect(snapshot).toContainText("Form version: 1");
        const newCycle = await snapshot.locator("p").filter({ hasText: "Cycle:" }).textContent();
        expect(newCycle).not.toEqual(oldCycle);
        await owner.screenshot({ path: testInfo.outputPath("revision-history-desktop.png"), fullPage: true });
        await owner.setViewportSize({ width: 390, height: 844 });
        await owner.screenshot({ path: testInfo.outputPath("revision-history-mobile.png"), fullPage: true });
        const reads: string[] = [];
        reviewer.on("request", (request) =>
{
 if (request.method() === "GET") reads.push(new URL(request.url()).pathname);
});

await reviewer.reload();
        await expect(reviewer.getByRole("region", { name: "Revision snapshot" })).toBeVisible();
        expect(reads).not.toContain(`/api/v1/requests/${initial.id}`);
        expect(reads).not.toContain(`/api/v1/requests/${initial.id}/revisions`);
        expect(reads.some((path) => path.includes("/request-types/") && path.includes("/versions/"))).toBe(false);
    }
    finally
    {
        await ownerContext.close();
        await reviewerContext.close();
    }
});

test("returned wizard retains its form while resubmission uses current policy and replays a lost response", async ({ browser }) =>
{
    test.setTimeout(120_000);
    const ownerContext = await browser.newContext();
    const reviewerContext = await browser.newContext();
    const adminContext = await browser.newContext();
    const database = createTestDatabase();
    try
    {
        const owner = await ownerContext.newPage(), reviewer = await reviewerContext.newPage(), admin = await adminContext.newPage();
        const adminToken = await login(admin, "admin@example.test");
        const ownerToken = await login(owner, "requester-a@example.test");
        await login(reviewer, "reviewer@example.test");
        const headers = { authorization: `Bearer ${adminToken}` };
        const keyed = () => ({ ...headers, "Idempotency-Key": randomUUID() });
        const ownerHeaders = { authorization: `Bearer ${ownerToken}`, "Idempotency-Key": randomUUID() };
        const base = `${apiUrl.origin}/api/v1`;
        const suffix = randomUUID().slice(0, 8);
        const fields = [{ key: "category", kind: "SELECT", label: { en: "Category" }, required: true, constraints: { options: [{ value: "OPERATIONS", label: { en: "Operations" } }, { value: "OTHER", label: { en: "Other" } }] } }];
        const createdType = await admin.request.post(`${base}/admin/request-types`, { headers, data: { code: `RR_${suffix}`, name: { en: `Revision ${suffix}` }, monetary: false, supportsLineItems: false, fields } });
        expect(createdType.status()).toBe(201);
        const type = await createdType.json() as { id: string; version: number };
        const publishedType = await admin.request.post(`${base}/admin/request-types/${type.id}/publish`, { headers: keyed(), data: { expectedVersion: type.version } });
        expect(publishedType.status()).toBe(201);
        const v1 = await publishedType.json() as { versionId: string };
        const createdPolicy = await admin.request.post(`${base}/admin/approval-policies`, { headers, data: { code: `RR_POLICY_${suffix}`, typeId: type.id, departmentId: null, priority: 10, minAmount: null, maxAmount: null, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["general-review"], slaBusinessMinutes: 480 }] } });
        expect(createdPolicy.status()).toBe(201);
        const policy = await createdPolicy.json() as { id: string; version: number };
        const firstPolicy = await admin.request.post(`${base}/admin/approval-policies/${policy.id}/publish`, { headers: keyed(), data: { expectedVersion: policy.version } });
        expect(firstPolicy.status()).toBe(201);
        const policyV1 = await firstPolicy.json() as { version: number; versionId: string };
        const draftResponse = await owner.request.post(`${base}/requests`, { headers: ownerHeaders, data: { typeId: type.id, formDefinitionVersionId: v1.versionId, title: `Revision ${suffix}`, justification: "Original explanation", fields: { category: "OPERATIONS" } } });
        expect(draftResponse.status()).toBe(201);
        const draft = await draftResponse.json() as { id: string; version: number };
        const submit = await owner.request.post(`${base}/requests/${draft.id}/submit`, { headers: { ...ownerHeaders, "Idempotency-Key": randomUUID() }, data: { expectedVersion: draft.version } });
        expect(submit.status()).toBe(200);
        const submitted = await submit.json() as { requestNumber: string; currentApprovers: Array<{ slotId: string }> };
        const original = (await database.connection.select().from(requests).where(eq(requests.id, draft.id)))[0]!;
        const firstCycles = await database.connection.select().from(approvalCycles).where(eq(approvalCycles.requestId, draft.id));
        expect(firstCycles).toHaveLength(1);
        await reviewer.goto(`/reviews/${submitted.currentApprovers[0]!.slotId}`);
        await reviewer.getByRole("button", { name: "Return", exact: true }).click();
        await reviewer.getByRole("dialog").getByLabel(/Reason/).fill("Please correct the details");
        await reviewer.getByRole("button", { name: "Confirm return" }).click();
        await expect(reviewer.getByRole("dialog")).not.toBeVisible();

        const policyBranch = await admin.request.post(`${base}/admin/approval-policies/${policy.id}/draft`, { headers, data: { expectedVersion: policyV1.version } });
        expect(policyBranch.status()).toBe(201);
        const policyDraft = await policyBranch.json() as { version: number };
        const publishedPolicy = await admin.request.post(`${base}/admin/approval-policies/${policy.id}/publish`, { headers: keyed(), data: { expectedVersion: policyDraft.version } });
        expect(publishedPolicy.status()).toBe(201);
        const policyV2 = await publishedPolicy.json() as { versionId: string };
        const typeBranch = await admin.request.post(`${base}/admin/request-types/${type.id}/draft`, { headers, data: { expectedVersion: type.version + 1 } });
        expect(typeBranch.status()).toBe(201);
        const typeDraft = await typeBranch.json() as { version: number };
        const patch = await admin.request.patch(`${base}/admin/request-types/${type.id}/draft`, { headers, data: { expectedVersion: typeDraft.version, fields: [{ key: "newField", kind: "TEXT", label: { en: "New field" }, required: true }] } });
        expect(patch.status()).toBe(200);
        const changedType = await patch.json() as { version: number };
        const publishedV2 = await admin.request.post(`${base}/admin/request-types/${type.id}/publish`, { headers: keyed(), data: { expectedVersion: changedType.version } });
        expect(publishedV2.status()).toBe(201);
        const v2 = await publishedV2.json() as { versionId: string };
        expect(v2.versionId).not.toBe(v1.versionId);
        const disabled = await admin.request.post(`${base}/admin/request-types/${type.id}/disable`, { headers, data: { expectedVersion: changedType.version + 1 } });
        expect(disabled.status()).toBe(200);
        await owner.goto(`/requests/${draft.id}/edit`);
        await owner.getByLabel("Justification", { exact: false }).fill("Corrected explanation");
        await owner.getByRole("button", { name: "Next", exact: true }).click();
        const category = owner.getByLabel("Category", { exact: false });
        await expect(category).toBeVisible();
        await expect(category.locator('option[value="OPERATIONS"]')).toHaveText("Operations");
        await expect(category.locator('option[value="OTHER"]')).toHaveText("Other");
        await expect(owner.getByLabel("New field", { exact: false })).toHaveCount(0);
        await category.selectOption("OTHER");
        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await expect(owner.getByRole("heading", { name: "Items & Attachments" })).toBeVisible();
        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await owner.getByRole("button", { name: "Resubmit request" }).click();
        const keys: string[] = [];
        await owner.route("**/requests/*/resubmit", async (route) =>
        {
            keys.push(route.request().headers()["idempotency-key"]!);
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            if (keys.length === 1) await route.abort("failed");
            else await route.fulfill({ response });
        });
        await owner.getByRole("button", { name: "Confirm resubmission" }).click();
        await expect(owner.getByRole("alert")).toContainText("Network request failed");
        await owner.getByRole("button", { name: "Resubmit request" }).click();
        const replay = owner.waitForResponse((response) => response.url().endsWith("/resubmit") && response.request().method() === "POST");
        await owner.getByRole("button", { name: "Confirm resubmission" }).click();
        expect(await (await replay).json()).toMatchObject({ requestNumber: submitted.requestNumber, status: "PENDING" });
        expect(keys).toHaveLength(2);
        expect(keys[0]).toBe(keys[1]);
        const cycles = await database.connection.select().from(approvalCycles).where(eq(approvalCycles.requestId, draft.id));
        expect(cycles).toHaveLength(2);
        expect(firstCycles[0]!.policyVersionId).toBe(policyV1.versionId);
        expect(cycles.find((cycle) => cycle.id !== firstCycles[0]!.id)!.policyVersionId).toBe(policyV2.versionId);
        expect(policyV2.versionId).not.toBe(policyV1.versionId);
        const revisions = await database.connection.select().from(requestRevisions).where(eq(requestRevisions.requestId, draft.id));
        expect(revisions).toHaveLength(2);
        expect(revisions.every((revision) => revision.formDefinitionVersionId === v1.versionId)).toBe(true);
        const current = (await database.connection.select().from(requests).where(eq(requests.id, draft.id)))[0]!;
        expect(current).toMatchObject({ requestNumber: original.requestNumber, departmentId: original.departmentId, departmentSnapshot: original.departmentSnapshot });
    }
    finally
    {
        await ownerContext.close();
        await reviewerContext.close();
        await adminContext.close();
        await database.Close();
    }
});
