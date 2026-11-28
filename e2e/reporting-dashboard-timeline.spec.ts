import { expect, test, type Page } from "@playwright/test";
import { dashboardSchema } from "@workflow/contracts";
import { apiUrl } from "./helpers/environment";

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
    await page.getByRole("region", { name: "Account details" }).getByRole("button", { name: "Sign out" }).click();
}

async function submitRequest(page: Page, title: string)
{
    await page.goto("/requests/new");
    await page.getByLabel("Request type (required)").selectOption({ label: "General request" });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Title", { exact: false }).fill(title);
    await page.getByLabel("Justification", { exact: false }).fill("Reporting lifecycle evidence");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Category", { exact: false }).selectOption("OPERATIONS");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Submit request", exact: true }).click();
    const submittedResponse = page.waitForResponse((item) => item.url().endsWith("/submit") && item.request().method() === "POST");
    await page.getByRole("button", { name: "Confirm submission" }).click();
    const submitted = await (await submittedResponse).json();
    await expect(page.getByRole("heading", { name: "Request submitted" })).toBeVisible();
    return submitted;
}

test("requester dashboard and reports use live scoped data and URL filters", async ({ page }, testInfo) =>
{
    const dashboard = page.waitForResponse((response) => response.url().endsWith("/v1/dashboard"));
    await login(page, "requester-a@example.test");
    const dashboardResponse = await dashboard;
    const data = await dashboardResponse.json();
    const token = dashboardResponse.request().headers().authorization!;
    await expect(page.locator("dt").filter({ hasText: "My requests" }).locator(".. ").locator("dd")).toHaveText(String(data.summary.ownRequests));
    await expect(page.getByRole("heading", { name: "Administration" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("dashboard-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("dashboard-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await submitRequest(page, `Report positive ${Date.now()}`);
    const report = page.waitForResponse((response) => response.url().endsWith("/reports/requests/search"));
    await page.goto("/reports");
    const response = await report;
    expect(response.ok()).toBeTruthy();
    const rows = await response.json();
    expect(rows.length).toBeGreaterThan(0);
    const pagination = JSON.parse(response.headers()["x-pagination"]!);
    await expect(page.getByText(`${pagination.totalCount} groups`, { exact: false })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("reports-desktop.png"), fullPage: true });
    for (const name of ["typeId", "departmentId"])
    {
        const foreign = await page.request.post(`${apiUrl.origin}/api/v1/reports/requests/search`, { headers: { authorization: token }, data: { search: [{ name, condition: "EQUAL", value: "ffffffff-ffff-4fff-8fff-ffffffffffff" }] } });
        expect(foreign.status()).toBe(200);
        expect(await foreign.json()).toEqual([]);
        expect(JSON.parse(foreign.headers()["x-pagination"]!).totalCount).toBe(0);
    }
    for (const row of rows) await expect(page.getByRole("row").filter({ hasText: row.label })).toContainText(String(row.count));
    for (const dimension of ["TYPE", "DEPARTMENT", "OUTCOME", "STATUS"])
    {
        const next = page.waitForResponse((item) => item.url().endsWith("/reports/requests/search"));
        await page.getByLabel("Group by").selectOption(dimension);
        const result = await next;
        expect(result.ok()).toBeTruthy();
        expect((await result.json()).every((row: { dimension: string }) => row.dimension === dimension)).toBe(true);
    }
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("APPROVED");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Applied filters")).toHaveCount(0);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByLabel("Created from (Bangkok)").fill("2099-01-01");
    const filtered = page.waitForResponse((item) => item.url().endsWith("/reports/requests/search"));
    await page.getByRole("button", { name: "Apply filters" }).click();
    const filteredResponse = await filtered;
    expect(filteredResponse.request().postDataJSON().search).toContainEqual({ name: "createdAt", condition: "GREATEROREQUAL", value: "2098-12-31T17:00:00.000Z" });
    await expect(page.getByText("No groups match these filters.")).toBeVisible();
    expect(JSON.parse(filteredResponse.headers()["x-pagination"]!).totalCount).toBe(0);
    await page.reload();
    await expect(page.getByText("No groups match these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByRole("button", { name: "Reset filters" }).click();
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByLabel("Applied filters")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("reports-mobile.png"), fullPage: true });
});

test("dashboard role sections and private SSR", async ({ page, request }, testInfo) =>
{
    for (const path of ["/dashboard", "/reports"])
    {
        const html = await (await request.get(path)).text();
        expect(html).not.toContain("Recent requests");
        expect(html).not.toContain("Requests by status");
    }
    await login(page, "admin@example.test");
    await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent requests" })).toHaveCount(0);
    await expect(page.locator('a[href^="/requests/"]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("dashboard-admin.png"), fullPage: true });
    await logout(page, "Administrator");
    await login(page, "multi@example.test");
    await expect(page.getByRole("heading", { name: "Recent requests" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pending reviews" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent decisions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Administration" })).toHaveCount(0);
});

test("persisted decision updates dashboard and owner history without historic detail fetch", async ({ page }, testInfo) =>
{
    const title = `Reporting journey ${Date.now()}`;
    await login(page, "requester-a@example.test");
    const submitted = await submitRequest(page, title);
    await logout(page, "Requester A");
    const dashboard = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/dashboard" && response.request().method() === "GET");
    await login(page, "reviewer@example.test");
    const dashboardResponse = await dashboard;
    expect(dashboardResponse.ok()).toBe(true);
    const dto = dashboardSchema.parse(await dashboardResponse.json());
    if (!("pendingTasks" in dto)) throw new Error("Reviewer dashboard has no pending tasks");
    const pendingCount = page.locator("dt").filter({ hasText: "Pending reviews" }).locator("..").locator("dd");
    const beforeCount = dto.summary.pendingReviews;
    await expect(pendingCount).toHaveText(String(beforeCount));
    const firstTask = dto.pendingTasks[0];
    if (!firstTask) throw new Error("Reviewer dashboard has no pending tasks");
    const pendingSection = page.getByRole("heading", { name: "Pending reviews", exact: true }).locator("..");
    const previewLinks = pendingSection.locator('a[href^="/reviews/"]');
    await expect(previewLinks).toHaveCount(Math.min(5, beforeCount));
    expect(await previewLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(dto.pendingTasks.map((task) => `/reviews/${task.slotId}`));
    const newSlotId = submitted.currentApprovers[0].slotId;
    const taskPath = `/reviews/${newSlotId}`;
    const pendingLink = pendingSection.locator(`a[href="${taskPath}"]`);
    const taskRead = page.waitForRequest((item) => new URL(item.url()).pathname === `/api/v1/approval-tasks/${newSlotId}` && item.method() === "GET");
    await previewLinks.first().click();
    await expect(page).toHaveURL(new RegExp(`/reviews/${firstTask.slotId}$`));
    await expect(page.getByRole("heading", { name: "Review task" })).toBeVisible();
    if (firstTask.slotId !== newSlotId)
    {
        await page.getByRole("link", { name: "My Reviews" }).click();
        await page.getByLabel("Search requests").fill(title);
        await page.getByRole("button", { name: "Search", exact: true }).click();
        const row = page.getByRole("row").filter({ hasText: title });
        await expect(row).toBeVisible();
        const taskLink = row.getByRole("link");
        await expect(taskLink).toHaveAttribute("href", taskPath);
        await taskLink.click();
    }
    await expect(page).toHaveURL(new RegExp(`${taskPath}$`));
    await expect(page.getByRole("region", { name: "Request result" })).toContainText(title);
    const token = (await taskRead).headers().authorization!;
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByRole("button", { name: "Confirm approval" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Decision recorded" })).toBeVisible();
    await page.goto("/dashboard");
    await expect(pendingCount).toHaveText(String(beforeCount - 1));
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(pendingCount).toHaveText(String(beforeCount - 1));
    await expect(pendingLink).toHaveCount(0);
    const recent = page.getByRole("heading", { name: "Recent decisions" }).locator("..");
    const link = recent.locator(`a[href="${taskPath}"]`);
    await expect(link).toBeVisible();
    const forbidden: string[] = [];
    page.on("request", (request) =>
    {
        const path = new URL(request.url()).pathname;
        if (request.method() === "GET" && (path === `/api/v1/requests/${submitted.id}` || /\/api\/v1\/request-types\/[^/]+\/versions\/[^/]+$/.test(path))) forbidden.push(path);
    });
    await link.click();
    await expect(page.getByRole("heading", { name: "Review task" })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Read-only handled task" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Formal decision and status history" }).locator("time").first()).toBeVisible();
    expect(forbidden).toEqual([]);
    const denied = await page.request.get(`${apiUrl.origin}/api/v1/requests/${submitted.id}`, { headers: { authorization: token } });
    expect(denied.status()).toBe(404);
    await logout(page, "Reviewer");
    await login(page, "requester-a@example.test");
    await page.goto(`/requests/${submitted.id}`);
    await page.getByRole("tab", { name: "Overview" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "History" })).toBeFocused();
    const history = page.getByRole("region", { name: "Formal decision and status history" });
    await expect(history).toContainText("Decision: approved");
    await expect(history).toContainText("Requester A");
    await expect(history).toContainText("Reviewer");
    const times = await history.locator("time").evaluateAll((items) => items.map((item) => item.getAttribute("datetime")!));
    expect(times.length).toBeGreaterThan(1);
    expect(times).toEqual([...times].sort());
    await expect(history).toContainText("Cycle ID:");
    await expect(history).toContainText("Revision ID:");
    await page.screenshot({ path: testInfo.outputPath("timeline-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("timeline-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await submitRequest(page, `Pending paging ${Date.now()}`);
    const firstReport = page.waitForResponse((item) => item.url().endsWith("/reports/requests/search"));
    await page.goto("/reports?pageSize=1&sort=key+asc");
    const firstResponse = await firstReport;
    expect(JSON.parse(firstResponse.headers()["x-pagination"]!).totalCount).toBeGreaterThanOrEqual(2);
    const firstRows = await firstResponse.json();
    expect(firstRows).toHaveLength(1);
    await expect(page.locator("tbody tr")).toContainText(firstRows[0].label);
    const firstUrl = page.url();
    const nextReport = page.waitForResponse((item) => item.url().endsWith("/reports/requests/search"));
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const secondRows = await (await nextReport).json();
    expect(secondRows).toHaveLength(1);
    expect(secondRows[0].key).not.toBe(firstRows[0].key);
    await expect(page.locator("tbody tr")).toContainText(secondRows[0].label);
    await expect(page).toHaveURL(/page=2/);
    const secondUrl = page.url();
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page.locator("tbody tr")).toContainText(firstRows[0].label);
    await expect(page).toHaveURL(/page=1/);
    await page.goBack();
    await expect(page).toHaveURL(secondUrl);
    await expect(page.locator("tbody tr")).toContainText(secondRows[0].label);
    await page.goBack();
    await expect(page).toHaveURL(firstUrl);
    await expect(page.locator("tbody tr")).toContainText(firstRows[0].label);

    await logout(page, "Requester A");
    await login(page, "requester-b@example.test");
    const foreignRequest = await submitRequest(page, `Foreign reporting ${Date.now()}`);
    await logout(page, "Requester B");
    const ownerDashboard = page.waitForResponse((item) => item.url().endsWith("/v1/dashboard"));
    await login(page, "requester-a@example.test");
    const ownerToken = (await ownerDashboard).request().headers().authorization!;
    const foreignDetail = await page.request.get(`${apiUrl.origin}/api/v1/requests/${foreignRequest.id}`, { headers: { authorization: ownerToken } });
    expect(foreignDetail.status()).toBe(404);
    const foreignDepartment = await page.request.post(`${apiUrl.origin}/api/v1/reports/requests/search`, { headers: { authorization: ownerToken }, data: { search: [{ name: "departmentId", condition: "EQUAL", value: "20000000-0000-4000-8000-000000000002" }] } });
    expect(foreignDepartment.status()).toBe(200);
    expect(await foreignDepartment.json()).toEqual([]);
    expect(JSON.parse(foreignDepartment.headers()["x-pagination"]!).totalCount).toBe(0);
});





test("report error can be retried against the live API", async ({ page }) =>
{
    await login(page, "requester-a@example.test");
    await page.route("**/reports/requests/search", async (route) =>
    {
        await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    }, { times: 1 });
    await page.goto("/reports");
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByText(/groups · Page/)).toBeVisible();
});
