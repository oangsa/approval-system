import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { requestDetailSchema } from "@workflow/contracts";
async function login(page: Page, email: string)
{
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Test-password-42!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
}
async function logout(page: Page, name: string)
{
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("region", { name: "Account details" }).getByRole("button", { name: "Sign out", exact: true }).click();
}
async function submittedTask(page: Page)
{
    const title = `Decision evidence ${Date.now()}`;
    await login(page, "requester-a@example.test");
    await page.goto("/requests");
    await page.getByRole("link", { name: "New request" }).click();
    await page.getByLabel("Request type (required)").selectOption({ label: "General request" });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Title", { exact: false }).fill(title);
    await page.getByLabel("Justification", { exact: false }).fill("Synthetic decision browser evidence");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Category", { exact: false }).selectOption("OPERATIONS");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Submit request", exact: true }).click();
    const response = page.waitForResponse((item) => item.url().endsWith("/submit") && item.request().method() === "POST");
    await page.getByRole("button", { name: "Confirm submission" }).click();
    const submitted = await (await response).json();
    await expect(page.getByRole("heading", { name: "Request submitted" })).toBeVisible();
    await logout(page, "Requester A");
    await login(page, "reviewer@example.test");
    await page.getByRole("link", { name: "My Reviews" }).click();
    await page.getByLabel("Search requests").fill(title);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: title });
    const taskRequest = page.waitForRequest((item) => /\/approval-tasks\/[^/]+$/.test(item.url()) && item.method() === "GET");
    await row.getByRole("link").click();
    const request = await taskRequest;
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
    return { title, requestId: submitted.id as string, taskUrl: request.url(), token: request.headers().authorization! };
}

test("Lab 7 separate requester and reviewer sessions reject exactly ten and preserve denied state", async ({ browser }, testInfo) =>
{
    const requesterContext = await browser.newContext({ viewport: { width: 768, height: 900 } });
    const reviewerContext = await browser.newContext({ viewport: { width: 768, height: 900 } });
    try
    {
        const requester = await requesterContext.newPage(), reviewer = await reviewerContext.newPage();
        const title = `Lab 7 synthetic ${Date.now()}`;
        await login(requester, "requester-a@example.test");
        await requester.goto("/requests/new");
        await requester.getByLabel("Request type (required)").selectOption({ label: "General request" });
        await requester.getByRole("button", { name: "Next", exact: true }).click();
        await requester.getByLabel("Title", { exact: false }).fill(title);
        await requester.getByLabel("Justification", { exact: false }).fill("Synthetic Lab 7 boundary verification");
        await requester.getByRole("button", { name: "Next", exact: true }).click();
        await requester.getByLabel("Category", { exact: false }).selectOption("OPERATIONS");
        await requester.getByRole("button", { name: "Next", exact: true }).click();
        await requester.getByRole("button", { name: "Submit request", exact: true }).click();
        const submittedResponse = requester.waitForResponse((response) => response.url().endsWith("/submit") && response.request().method() === "POST");
        await requester.getByRole("button", { name: "Confirm submission" }).click();
        const response = await submittedResponse;
        expect(response.status()).toBe(200);
        const submitted = requestDetailSchema.parse(await response.json());
        const requesterToken = response.request().headers().authorization!;
        await expect(requester.getByRole("heading", { name: "Request submitted" })).toBeVisible();
        await requester.screenshot({ path: testInfo.outputPath("B-L7-01-submitted.png"), fullPage: true });

        await login(reviewer, "reviewer@example.test");
        await reviewer.goto("/reviews");
        await reviewer.getByLabel("Search requests").fill(title);
        await reviewer.getByRole("button", { name: "Search", exact: true }).click();
        const taskRead = reviewer.waitForRequest((request) => /\/approval-tasks\/[^/]+$/.test(request.url()) && request.method() === "GET");
        await reviewer.getByRole("row").filter({ hasText: title }).getByRole("link").click();
        const taskRequest = await taskRead, taskUrl = taskRequest.url(), reviewerToken = taskRequest.headers().authorization!;
        const apiRoot = new URL(taskUrl).origin;
        async function snapshot()
        {
            const detail: unknown = await (await requester.request.get(`${apiRoot}/api/v1/requests/${submitted.id}`, { headers: { authorization: requesterToken } })).json();
            const history: unknown = await (await requester.request.get(`${apiRoot}/api/v1/requests/${submitted.id}/timeline`, { headers: { authorization: requesterToken } })).json();
            const task: unknown = await (await reviewer.request.get(taskUrl, { headers: { authorization: reviewerToken } })).json();
            return { detail, history, task };
        }
        const before = await snapshot();
        await reviewer.getByRole("button", { name: "Reject", exact: true }).click();
        const dialog = reviewer.getByRole("dialog"), reason = dialog.getByLabel(/Reason/);
        await reason.fill("123456789");
        await expect(reason).toHaveValue("123456789");
        await expect(reason).toHaveAccessibleDescription(/at least 10 characters/);
        await expect(dialog.getByRole("button", { name: "Confirm rejection" })).toBeDisabled();
        await reviewer.screenshot({ path: testInfo.outputPath("B-L7-02-invalid-nine.png"), fullPage: true });
        const invalid = await reviewer.request.post(`${taskUrl}/decisions`, { headers: { authorization: reviewerToken, "Idempotency-Key": crypto.randomUUID() }, data: { decision: "REJECT", reason: "123456789", expectedVersion: 0 } });
        expect(invalid.status()).toBe(422);
        const invalidBody: unknown = await invalid.json();
        const denied = await requester.request.post(`${taskUrl}/decisions`, { headers: { authorization: requesterToken, "Idempotency-Key": crypto.randomUUID() }, data: { decision: "APPROVE", expectedVersion: 0 } });
        expect(denied.status()).toBe(403);
        const deniedBody: unknown = await denied.json();
        expect(deniedBody).toMatchObject({ code: "SELF_APPROVAL_FORBIDDEN" });
        expect(await snapshot()).toEqual(before);
        await reason.fill("1234567890");
        await expect(dialog.getByRole("button", { name: "Confirm rejection" })).toBeEnabled();
        const decisionResponse = reviewer.waitForResponse((value) => value.url().endsWith("/decisions") && value.request().method() === "POST");
        await dialog.getByRole("button", { name: "Confirm rejection" }).click();
        expect((await decisionResponse).status()).toBe(201);
        await expect(reviewer.getByRole("status").filter({ hasText: "Decision recorded" })).toContainText("REJECTED");
        await reviewer.screenshot({ path: testInfo.outputPath("B-L7-03-rejected.png"), fullPage: true });
        await requester.goto(`/requests/${submitted.id}?tab=history`);
        await expect(requester.getByRole("tabpanel", { name: "History" })).toContainText("1234567890");
        await requester.reload();
        await expect(requester.getByRole("tabpanel", { name: "History" })).toContainText("1234567890");
        await expect(requester.getByRole("tabpanel", { name: "History" })).toContainText("DECISION REJECT");
        await requester.screenshot({ path: testInfo.outputPath("B-L7-04-requester-history.png"), fullPage: true });
        await writeFile(testInfo.outputPath("B-L7-browser-observations.json"), JSON.stringify({ observedUtc: new Date().toISOString(), method: "automated Playwright; real frontend/API/disposable PostgreSQL; separate browser contexts", title, requestId: submitted.id, invalidStatus: 422, invalidBody, selfApprovalStatus: 403, deniedBody, invalidAndDeniedStateUnchanged: true, validReason: "1234567890", acceptedStatus: 201, requesterHistoryAfterRefresh: "DECISION REJECT and 1234567890 verified" }, null, 2));
    }
    finally
    {
        await requesterContext.close();
        await reviewerContext.close();
    }
});

test("Lab 7 preserves approval without a reason on a separate request", async ({ page }, testInfo) =>
{
    const item = await submittedTask(page);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/Reason/)).toHaveValue("");
    const accepted = page.waitForResponse((response) => response.url().endsWith("/decisions") && response.request().method() === "POST");
    await dialog.getByRole("button", { name: "Confirm approval" }).click();
    expect((await accepted).status()).toBe(201);
    await expect(page.getByRole("status").filter({ hasText: "Decision recorded" })).toContainText("APPROVED");
    await page.screenshot({ path: testInfo.outputPath("B-L7-05-approval-without-reason.png"), fullPage: true });
    await logout(page, "Reviewer");
    await login(page, "requester-a@example.test");
    await page.goto(`/requests/${item.requestId}?tab=history`);
    await expect(page.getByRole("tabpanel", { name: "History" })).toContainText("DECISION APPROVE");
    await page.reload();
    await expect(page.getByRole("tabpanel", { name: "History" })).toContainText("DECISION APPROVE");
});
for (const decision of ["Approve", "Reject"])
{
    test(`${decision} requires keyboard confirmation and persists immutable history`, async ({ page, request }) =>
    {
        const item = await submittedTask(page);
        const ssr = await request.get(`/reviews/${item.taskUrl.split("/").at(-1)}`);
        expect(await ssr.text()).not.toContain(item.title);
        await page.getByRole("button", { name: decision, exact: true }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.getByLabel(/Reason/)).toBeFocused();
        if (decision === "Reject") await expect(dialog.getByRole("button", { name: "Confirm rejection" })).toBeDisabled();
        await dialog.getByLabel(/Reason/).fill("Browser decision reason");
        await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible();
        await expect(page.getByRole("button", { name: decision, exact: true })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(dialog.getByLabel(/Reason/)).toHaveValue("Browser decision reason");
        const accepted = page.waitForResponse((response) => response.url().endsWith("/decisions") && response.request().method() === "POST");
        await dialog.getByRole("button", { name: decision === "Approve" ? "Confirm approval" : "Confirm rejection" }).click();
        expect((await accepted).status()).toBe(201);
        await expect(page.getByRole("status").filter({ hasText: "Decision recorded" })).toContainText(decision === "Approve" ? "APPROVED" : "REJECTED");
        await expect(page.getByText("Browser decision reason", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Approve", exact: true })).not.toBeVisible();
        await expect(page.getByRole("status").filter({ hasText: "Decision recorded" })).toContainText("Current stage: No active stage");
        await page.reload();
        await expect(page.getByRole("region", { name: "Handled task" })).toContainText("Read-only handled task");
        await expect(page.getByText("Browser decision reason", { exact: true })).toBeVisible();
        await expect(page.getByRole("region", { name: "Request result" })).not.toBeVisible();
        await expect(page.getByRole("button", { name: "Approve", exact: true })).not.toBeVisible();
        await logout(page, "Reviewer");
        await login(page, "requester-a@example.test");
        await page.goto(`/requests/${item.requestId}?tab=history`);
        await expect(page.getByRole("tabpanel", { name: "History" })).toContainText("Browser decision reason");
        await expect(page.getByRole("tabpanel", { name: "History" })).toContainText(decision === "Approve" ? "DECISION APPROVE" : "DECISION REJECT");
        await page.reload();
        await expect(page.getByRole("tabpanel", { name: "History" })).toContainText("Browser decision reason");
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `/tmp/approval-${decision.toLowerCase()}-history.png`, fullPage: true });
    });
}
test("stale confirmation closes safely, retains reason and offers task reload", async ({ page }) =>
{
    const item = await submittedTask(page);
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await page.getByRole("dialog").getByLabel(/Reason/).fill("Retain this typed reason");
    const competitor = await page.request.post(`${item.taskUrl}/decisions`, { headers: { authorization: item.token, "Idempotency-Key": crypto.randomUUID() }, data: { decision: "APPROVE", expectedVersion: 0 } });
    expect(competitor.status()).toBe(201);
    await page.getByRole("button", { name: "Confirm rejection" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Retain this typed reason");
    await page.getByRole("button", { name: "Reload task" }).click();
    await expect(page.getByRole("region", { name: "Handled task" })).toContainText("Read-only handled task");
    await expect(page.getByRole("region", { name: "Saved decision reason" })).toContainText("Retain this typed reason");
    await page.getByRole("button", { name: "Discard saved reason" }).click();
    await expect(page.getByRole("region", { name: "Saved decision reason" })).not.toBeVisible();
});
test("lost accepted response retries with the same key and pending blocks repeat activation", async ({ page }) =>
{
    await submittedTask(page);
    const keys: string[] = [];
    await page.route("**/approval-tasks/*/decisions", async (route) =>
    {
        keys.push(route.request().headers()["idempotency-key"]!);
        if (keys.length === 1)
        {
            const response = await route.fetch();
            expect(response.status()).toBe(201);
            await route.abort("failed");
        }
        else
        {
            await new Promise((done) => setTimeout(done, 200));
            await route.continue();
        }
    });
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Reason/).fill("Retry unchanged reason");
    await dialog.getByRole("button", { name: "Confirm rejection" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Retry the unchanged action safely");
    await dialog.getByRole("button", { name: "Confirm rejection" }).click();
    await expect(dialog.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Decision recorded" })).toContainText("REJECTED");
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    await expect(page.getByText("Retry unchanged reason", { exact: true })).toBeVisible();
});
