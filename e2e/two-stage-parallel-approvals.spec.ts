import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { apiUrl } from "./helpers/environment";

async function login(page: Page, email: string)
{
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Test-password-42!");
    const response = page.waitForResponse((item) => item.url().endsWith("/auth/login") && item.request().method() === "POST");
    await page.getByRole("button", { name: "Sign in" }).click();
    const body = await (await response).json() as { accessToken: string };
    await expect(page).toHaveURL(/\/dashboard$/);
    return { authorization: `Bearer ${body.accessToken}` };
}

test("two-stage parallel approval progresses through waiting and partial votes", async ({ browser }, testInfo) =>
{
    const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
    try
    {
        const [admin, owner, reviewer, peer] = await Promise.all(contexts.map((context) => context.newPage()));
        const [adminHeaders, ownerHeaders, reviewerHeaders] = await Promise.all([login(admin!, "admin@example.test"), login(owner!, "requester-a@example.test"), login(reviewer!, "reviewer@example.test"), login(peer!, "multi@example.test")]);
        const api = `${apiUrl.origin}/api/v1`;
        const key = `TP_${randomUUID().slice(0, 8)}`;
        const typeResponse = await admin!.request.post(`${api}/admin/request-types`, { headers: adminHeaders, data: { code: key, name: { en: key }, monetary: false, supportsLineItems: false, fields: [] } });
        expect(typeResponse.status()).toBe(201);
        const type = await typeResponse.json() as { id: string; version: number };
        const publishedType = await admin!.request.post(`${api}/admin/request-types/${type.id}/publish`, { headers: { ...adminHeaders, "Idempotency-Key": randomUUID() }, data: { expectedVersion: type.version } });
        expect(publishedType.status()).toBe(201);
        const { versionId } = await publishedType.json() as { versionId: string };
        const assignment = await admin!.request.post(`${api}/admin/reviewer-assignments`, { headers: adminHeaders, data: { key, reviewerUserIds: ["10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000004"], isActive: true } });
        expect(assignment.status()).toBe(201);
        const policy = await admin!.request.post(`${api}/admin/approval-policies`, { headers: adminHeaders, data: { code: key, typeId: type.id, priority: 10, stages: [{ stageNumber: 1, reviewerAssignmentKeys: [key] }, { stageNumber: 2, reviewerAssignmentKeys: [key] }] } });
        expect(policy.status()).toBe(201);
        const policyBody = await policy.json() as { id: string; version: number };
        expect((await admin!.request.post(`${api}/admin/approval-policies/${policyBody.id}/publish`, { headers: { ...adminHeaders, "Idempotency-Key": randomUUID() }, data: { expectedVersion: policyBody.version } })).status()).toBe(201);
        const draft = await owner!.request.post(`${api}/requests`, { headers: { ...ownerHeaders, "Idempotency-Key": randomUUID() }, data: { typeId: type.id, formDefinitionVersionId: versionId, title: key, justification: "Parallel browser verification", priority: "MEDIUM", fields: {} } });
        expect(draft.status()).toBe(201);
        const draftBody = await draft.json() as { id: string; version: number };
        await owner!.goto(`/requests/${draftBody.id}/edit`);
        for (let step = 0; step < 3; step++) await owner!.getByRole("button", { name: "Next", exact: true }).click();
        await owner!.getByRole("button", { name: "Submit request", exact: true }).click();
        const submittedResponse = owner!.waitForResponse((response) => response.url().endsWith("/submit") && response.request().method() === "POST");
        await owner!.getByRole("button", { name: "Confirm submission" }).click();
        const submitted = await (await submittedResponse).json() as { currentApprovers: Array<{ slotId: string; stageNumber: number; reviewer: { id: string } }> };
        const slot = (stage: number, id: string) => submitted.currentApprovers.find((item) => item.stageNumber === stage && item.reviewer.id === id)!.slotId;
        const reviewerId = "10000000-0000-4000-8000-000000000003", peerId = "10000000-0000-4000-8000-000000000004";
        await owner!.goto(`/requests/${draftBody.id}?tab=approval`);
        await expect(owner!.getByRole("region", { name: "Stage 2" })).toContainText("waiting");
        await owner!.screenshot({ path: testInfo.outputPath("waiting-desktop.png"), fullPage: true });
        await reviewer!.goto("/reviews");
        await reviewer!.getByLabel("Search requests").fill(key);
        await reviewer!.getByRole("button", { name: "Search", exact: true }).click();
        await expect(reviewer!.locator(`a[href='/reviews/${slot(1, reviewerId)}']`).first()).toBeVisible();
        await expect(reviewer!.locator(`a[href='/reviews/${slot(2, reviewerId)}']`)).toHaveCount(0);
        const overdueSearch = reviewer!.waitForResponse((response) => response.url().includes("/approval-tasks/search") && response.request().method() === "POST" && (response.request().postData() ?? "").includes('"name":"overdue"'));
        await reviewer!.getByRole("combobox", { name: /^Due/ }).selectOption("overdue");
        expect((await overdueSearch).status()).toBe(200);
        await expect(reviewer!.locator(`a[href='/reviews/${slot(2, reviewerId)}']`)).toHaveCount(0);
        await reviewer!.goto(`/reviews/${slot(1, reviewerId)}`);
        await expect(reviewer!.getByRole("region", { name: "Stage 2" })).toContainText("waiting");
        async function vote(page: Page, task: string, expected: string)
        {
            await page.goto(`/reviews/${task}`);
            await page.getByRole("button", { name: "Approve", exact: true }).click();
            await page.getByRole("dialog").getByRole("button", { name: "Confirm approval" }).click();
            await expect(page.getByRole("status").filter({ hasText: "Decision recorded" })).toContainText(expected);
        }
        await reviewer!.getByRole("button", { name: "Approve", exact: true }).click();
        await reviewer!.getByRole("dialog").getByLabel(/Reason/).fill("Keep this reason");
        const competingVote = await reviewer!.request.post(`${api}/approval-tasks/${slot(1, reviewerId)}/decisions`, { headers: { ...reviewerHeaders, "Idempotency-Key": randomUUID() }, data: { decision: "APPROVE", expectedVersion: 0 } });
        expect(competingVote.status()).toBe(201);
        await reviewer!.getByRole("dialog").getByRole("button", { name: "Confirm approval" }).click();
        await expect(reviewer!.getByRole("alert")).toContainText("Keep this reason");
        await reviewer!.getByRole("button", { name: "Reload task" }).click();
        await expect(reviewer!.getByRole("region", { name: "Handled task" })).toContainText("Read-only handled task");
        await owner!.reload();
        await expect(owner!.getByRole("region", { name: "Stage 1" })).toContainText("1 of 2 approved");
        await expect(owner!.getByRole("region", { name: "Stage 2" })).toContainText("waiting");
        await vote(peer!, slot(1, peerId), "Stage 2");
        await owner!.reload();
        await expect(owner!.getByRole("region", { name: "Stage 2" })).toContainText("active");
        await vote(reviewer!, slot(2, reviewerId), "PENDING");
        await owner!.reload();
        await expect(owner!.getByRole("region", { name: "Stage 2" })).toContainText("1 of 2 approved");
        await owner!.setViewportSize({ width: 390, height: 844 });
        expect(await owner!.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await owner!.screenshot({ path: testInfo.outputPath("partial-mobile.png"), fullPage: true });
        await vote(peer!, slot(2, peerId), "APPROVED");
    }
    finally
    {
        await Promise.all(contexts.map((context) => context.close()));
    }
});
