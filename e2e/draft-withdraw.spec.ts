import { expect, test, type Page } from "@playwright/test";
import { requestDetailSchema } from "@workflow/contracts";
import { apiUrl } from "./helpers/environment";

async function login(page: Page, email = "requester-a@example.test")
{
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Test-password-42!");
    const response = page.waitForResponse((value) => value.url().endsWith("/auth/login") && value.request().method() === "POST");
    await page.getByRole("button", { name: "Sign in" }).click();
    const body = await (await response).json() as { accessToken: string };
    await expect(page).toHaveURL(/\/dashboard$/);
    return body.accessToken;
}

async function createPending(page: Page, token: string, title: string)
{
    const headers = { authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID() };
    const typeResponse = await page.request.post(`${apiUrl.origin}/api/v1/request-types/search`, { headers, data: {} });
    const types = await typeResponse.json() as { id: string; versionId: string; code: string }[];
    const type = types.find((item) => item.code === "GENERAL") ?? types[0]!;
    const create = await page.request.post(`${apiUrl.origin}/api/v1/requests`, { headers, data: { typeId: type.id, formDefinitionVersionId: type.versionId, title, justification: "Synthetic withdrawal browser check", fields: { category: "OPERATIONS" } } });
    expect(create.status()).toBe(201);
    const draft = requestDetailSchema.parse(await create.json());
    const submittedResponse = await page.request.post(`${apiUrl.origin}/api/v1/requests/${draft.id}/submit`, { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() }, data: { expectedVersion: 0 } });
    expect(submittedResponse.status()).toBe(200);
    const submitted = requestDetailSchema.parse(await submittedResponse.json());
    return submitted;
}

test("DW-AC-01–04 incomplete saves, reload/resume, navigation warning and input-preserving retry", async ({ page, request }, testInfo) =>
{
    await login(page);
    await page.goto("/requests/new");
    await expect(page.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    await expect(page.getByText("Select a request type to enable Save Draft.")).toBeVisible();
    await page.getByLabel("Request type (required)").selectOption({ label: "General request" });
    const created = page.waitForResponse((response) => /\/api\/v1\/requests$/.test(response.url()) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save Draft" }).click();
    const draft = requestDetailSchema.parse(await (await created).json());
    expect(draft).toMatchObject({ status: "DRAFT", requestNumber: null, submittedRevision: null, currentCycleId: null, currentApprovers: [] });
    await page.getByRole("link", { name: "Resume saved draft" }).click();
    await expect(page).toHaveURL(new RegExp(`/requests/${draft.id}/edit$`));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Edit draft" })).toBeVisible();
    const title = `Draft browser ${Date.now()}`;
    await page.getByLabel("Title (required)", { exact: true }).fill(title);
    const keys: string[] = [];
    await page.route("**/requests/*/draft", async (route) =>
    {
        keys.push(route.request().headers()["idempotency-key"]!);
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        if (keys.length === 1) await route.abort("failed");
        else await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByRole("alert")).toContainText("Network request failed");
    await expect(page.getByLabel("Title (required)", { exact: true })).toHaveValue(title);
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved");
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    await page.reload();
    await expect(page.getByLabel("Title (required)", { exact: true })).toHaveValue(title);
    await expect(page.getByLabel("Justification (required)")).toHaveValue("");
    await page.getByLabel("Justification (required)").fill("Complete basic information for navigation");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.unroute("**/requests/*/draft");
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved");
    await page.getByLabel("Category", { exact: false }).selectOption("OPERATIONS");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved");
    await page.getByRole("button", { name: /Basic Information/ }).click();
    await page.getByLabel("Title (required)", { exact: true }).fill(`${title} unsaved`);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("link", { name: "My Requests", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/requests/${draft.id}/edit$`));
    await expect(page.getByLabel("Title (required)", { exact: true })).toHaveValue(`${title} unsaved`);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("link", { name: "My Requests", exact: true }).click();
    await page.getByRole("textbox", { name: "Search", exact: true }).fill(title);
    const row = page.getByRole("row").filter({ hasText: title });
    await row.getByRole("link", { name: "Resume draft" }).click();
    await expect(page.getByLabel("Title (required)", { exact: true })).toHaveValue(title);
    const ssr = await request.get(`/requests/${draft.id}/edit`);
    expect(await ssr.text()).not.toContain(title);
    await page.screenshot({ path: testInfo.outputPath("resumed-draft.png"), fullPage: true });
});

test("E2E-06 optional withdrawal confirmation, lost-response replay, stale reviewer and refreshed queue", async ({ page, browser }, testInfo) =>
{
    const token = await login(page);
    const title = `Withdrawal browser ${Date.now()}`;
    const submitted = await createPending(page, token, title);
    const draft = submitted;
    const reviewerContext = await browser.newContext();
    try
    {
        const reviewer = await reviewerContext.newPage();
        await login(reviewer, "reviewer@example.test");
        await reviewer.goto(`/reviews/${submitted.currentApprovers[0]!.slotId}`);
        await reviewer.getByRole("button", { name: "Approve", exact: true }).click();
        await page.goto(`/requests/${draft.id}`);
        await page.getByRole("button", { name: "Withdraw", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Withdraw request?" });
        await expect(dialog.getByLabel("Reason (optional)")).toBeFocused();
        await expect(dialog.getByRole("button", { name: "Confirm withdrawal" })).toBeEnabled();
        await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible();
        await expect(page.getByRole("button", { name: "Withdraw", exact: true })).toBeFocused();
        await page.keyboard.press("Enter");
        const keys: string[] = [];
        await page.route("**/requests/*/withdraw", async (route) =>
        {
            keys.push(route.request().headers()["idempotency-key"]!);
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            if (keys.length === 1) await route.abort("failed");
            else await route.fulfill({ response });
        });
        await dialog.getByRole("button", { name: "Confirm withdrawal" }).click();
        await expect(dialog.getByRole("alert")).toContainText("Network request failed");
        await dialog.getByRole("button", { name: "Confirm withdrawal" }).click();
        await expect(page.getByText("Withdrawn", { exact: true })).toBeVisible();
        expect(keys).toHaveLength(2);
        expect(keys[0]).toBe(keys[1]);
        await expect(page.getByRole("button", { name: "Withdraw", exact: true })).not.toBeVisible();
        await reviewer.getByRole("button", { name: "Confirm approval" }).click();
        await expect(reviewer.getByRole("dialog")).not.toBeVisible();
        await expect(reviewer.getByRole("button", { name: "Reload task" })).toBeVisible();
        await reviewer.getByRole("button", { name: "Reload task" }).click();
        await expect(reviewer.getByRole("alert")).toContainText("unavailable");
        await reviewer.goto("/reviews");
        await reviewer.getByLabel("Search requests", { exact: true }).fill(title);
        await reviewer.getByRole("button", { name: "Search", exact: true }).click();
        await expect(reviewer.getByRole("row").filter({ hasText: title })).toHaveCount(0);
        await page.reload();
        await expect(page.getByText("Withdrawn", { exact: true })).toBeVisible();
        await page.getByRole("tab", { name: "History", exact: true }).click();
        await expect(page.getByRole("tabpanel", { name: "History" })).toContainText("REQUEST WITHDRAWN");
        await page.screenshot({ path: testInfo.outputPath("withdrawn-history.png"), fullPage: true });
    }
    finally
    {
        await reviewerContext.close();
    }
});

test("mobile list withdrawal retains optional reason in history and refreshes applied pending filter", async ({ page }, testInfo) =>
{
    const token = await login(page);
    const title = `List withdrawal ${Date.now()}`;
    const submitted = await createPending(page, token, title);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/requests?status=PENDING&search=${encodeURIComponent(title)}`);
    await page.getByRole("button", { name: "Withdraw", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Withdraw request?" });
    await dialog.getByLabel("Reason (optional)").fill("No longer needed by the team");
    await dialog.getByRole("button", { name: "Confirm withdrawal" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("No requests match your filters.")).toBeVisible();
    await page.goto(`/requests/${submitted.id}?tab=history`);
    await expect(page.getByRole("tabpanel", { name: "History" })).toContainText("No longer needed by the team");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("mobile-withdrawal-history.png"), fullPage: true });
});

test("review: concurrent draft edit recovers through confirmed reload and saves current version", async ({ page }) =>
{
    const token = await login(page);
    await page.goto("/requests/new");
    await page.getByLabel("Request type (required)").selectOption({ label: "General request" });
    const created = page.waitForResponse((response) => /\/api\/v1\/requests$/.test(response.url()) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save Draft" }).click();
    const draft = requestDetailSchema.parse(await (await created).json());
    await page.getByRole("link", { name: "Resume saved draft" }).click();
    await page.getByLabel("Title (required)", { exact: true }).fill("Unsaved local edit");
    const peer = await page.request.patch(`${apiUrl.origin}/api/v1/requests/${draft.id}/draft`, { headers: { authorization: `Bearer ${token}` }, data: { expectedVersion: draft.version, title: "Concurrent saved edit" } });
    expect(peer.status()).toBe(200);
    await page.getByRole("button", { name: "Save Draft" }).click();
    const reload = page.getByRole("button", { name: "Reload saved draft" });
    await expect(reload).toBeVisible();
    page.once("dialog", (dialog) => dialog.dismiss());
    await reload.click();
    await expect(page.getByLabel("Title (required)", { exact: true })).toHaveValue("Unsaved local edit");
    page.once("dialog", (dialog) => dialog.accept());
    await reload.click();
    await expect(page.getByLabel("Title (required)", { exact: true })).toHaveValue("Concurrent saved edit");
    await page.getByLabel("Title (required)", { exact: true }).fill("Saved after conflict review");
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved");
    await page.reload();
    await expect(page.getByLabel("Title (required)", { exact: true })).toHaveValue("Saved after conflict review");
});

test("review: Escape after withdrawal conflict reload refreshes terminal owner detail", async ({ page }) =>
{
    const token = await login(page);
    const submitted = await createPending(page, token, `Conflict withdrawal ${Date.now()}`);
    await page.goto(`/requests/${submitted.id}`);
    await page.getByRole("button", { name: "Withdraw", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Withdraw request?" });
    await dialog.getByLabel("Reason (optional)").fill("Retained during reload");
    const peer = await page.request.post(`${apiUrl.origin}/api/v1/requests/${submitted.id}/withdraw`, { headers: { authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID() }, data: { expectedVersion: submitted.version } });
    expect(peer.status()).toBe(200);
    await dialog.getByRole("button", { name: "Confirm withdrawal" }).click();
    await dialog.getByRole("button", { name: "Reload request" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Current server status: Withdrawn");
    await expect(dialog.getByLabel("Reason (optional)")).toHaveValue("Retained during reload");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Withdrawn", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Withdraw", exact: true })).not.toBeVisible();
});
