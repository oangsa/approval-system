import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { apiUrl } from "./helpers/environment";
async function signIn(page: Page, email: string)
{
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Test-password-42!");
    const response = page.waitForResponse((item) => item.url().endsWith("/auth/login") && item.request().method() === "POST");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const result = await (await response).json() as { accessToken: string };
    await expect(page).toHaveURL(/\/dashboard$/);
    return result.accessToken;
}
async function choose(page: Page, label: string, term: string, name: string, multiple = false)
{
    await page.getByRole("button", { name: `Choose ${label.toLowerCase()}`, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `Choose ${label.toLowerCase()}`, exact: true });
    await dialog.getByLabel(`Search ${label.toLowerCase()}`, { exact: true }).fill(term);
    await dialog.getByRole("button", { name: `Select ${name}`, exact: true }).click();
    if (multiple) await dialog.getByRole("button", { name: "Apply selection", exact: true }).click();
    await expect(dialog).not.toBeVisible();
}
test("E2E-08 admin configures mappings, immutable policy versions and ceiling; requester submits at ceiling", async ({ page, browser, request }) =>
{
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const code = `E2E_PRB_${suffix}`;
    const assignmentKey = `E2E_REVIEW_${suffix}`;
    const adminToken = await signIn(page, "admin@example.test");
    const headers = { Authorization: `Bearer ${adminToken}` };
    // Request type setup belongs to Issue #8; this browser flow owns routing configuration.
    const createdType = await request.post(`${apiUrl.origin}/api/v1/admin/request-types`, { headers, data: { code, name: { en: `Routing ${suffix}` }, monetary: true, supportsLineItems: false, fields: [] } });
    expect(createdType.status()).toBe(201);
    const type = await createdType.json() as { id: string; version: number };
    const publishedType = await request.post(`${apiUrl.origin}/api/v1/admin/request-types/${type.id}/publish`, { headers: { ...headers, "Idempotency-Key": randomUUID() }, data: { expectedVersion: type.version } });
    expect(publishedType.status()).toBe(201);
    const { createTestDatabase } = await import("../apps/api/tests/helpers/testDatabase");
    const { users, userRoles, departmentMemberships } = await import("../apps/api/src/Infrastructures/Database/schema");
    const database = createTestDatabase();
    const reviewerName = `Routing reviewer ${suffix}`;
    try
    {
        await database.connection.transaction(async (transaction) =>
        {
            const reviewerId = randomUUID();
            await transaction.insert(users).values({ id: reviewerId, email: `${reviewerId}@example.test`, displayName: reviewerName, passwordHash: "not-for-login" });
            await transaction.insert(userRoles).values({ userId: reviewerId, roleCode: "REVIEWER" });
            await transaction.insert(departmentMemberships).values({ userId: reviewerId, departmentId: "20000000-0000-4000-8000-000000000001", isPrimary: true });
        });
    }
    finally
    {
        await database.Close();
    }
    await page.goto("/admin/reviewer-assignments");
    await page.getByRole("button", { name: "New assignment", exact: true }).click();
    await page.getByLabel("Assignment key", { exact: true }).fill(assignmentKey);
    await choose(page, "Eligible reviewers", reviewerName, reviewerName, true);
    await page.getByRole("button", { name: "Save configuration", exact: true }).click();
    await expect(page.getByText("Configuration saved.", { exact: true })).toBeVisible();
    await page.getByLabel("Search key", { exact: true }).fill(assignmentKey);
    await expect(page.getByRole("cell", { name: assignmentKey, exact: false }).first()).toBeVisible();

    await page.goto("/admin/approval-policies/new");
    await page.getByLabel("Policy code", { exact: true }).fill(code);
    await choose(page, "Request type", code, `${code} — Routing ${suffix}`);
    await choose(page, "Stage 1 assignment keys", assignmentKey, assignmentKey, true);
    await page.getByLabel("Numeric priority", { exact: true }).fill("90");
    await page.getByLabel("Sample amount", { exact: true }).fill("20.20");
    await expect(page.getByRole("complementary", { name: "Local routing explanation" })).toContainText("ALL slots required");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/approval-policies\/[0-9a-f-]+$/);
    const policyId = page.url().split("/").pop()!;
    await page.getByRole("button", { name: "Publish version", exact: true }).click();
    await page.getByRole("button", { name: "Confirm publish", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Published immutable version 1");
    await expect(page.getByRole("heading", { name: "Stage 1 — ALL must approve", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Branch new draft", exact: true }).click();
    await page.getByRole("button", { name: "Add stage 2", exact: true }).click();
    await choose(page, "Stage 2 assignment keys", assignmentKey, assignmentKey, true);
    await expect(page.getByRole("button", { name: "Add stage 3", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved.");
    await page.getByRole("button", { name: "Publish version", exact: true }).click();
    await page.getByRole("button", { name: "Confirm publish", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Published immutable version 2");
    await expect(page.getByText(/Equal highest priorities cause 409 AMBIGUOUS_APPROVAL_POLICY/)).toBeVisible();

    await page.goto("/admin/budget-policies");
    await page.getByRole("button", { name: "New ceiling", exact: true }).click();
    await choose(page, "Request type", code, `${code} — Routing ${suffix}`);
    await page.getByLabel("Maximum amount", { exact: true }).fill("20.20");
    await expect(page.getByText(/No balance ledger\./)).toBeVisible();
    await page.getByRole("button", { name: "Save configuration", exact: true }).click();
    await expect(page.getByText("Configuration saved.", { exact: true })).toBeVisible();
    await choose(page, "Request type filter", code, `${code} — Routing ${suffix}`);
    await page.getByRole("button", { name: "New ceiling", exact: true }).click();
    await choose(page, "Request type", code, `${code} — Routing ${suffix}`);
    await page.getByLabel("Maximum amount", { exact: true }).fill("30.00");
    await page.getByRole("button", { name: "Save configuration", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Configuration changed or conflicts with an existing scope");
    await page.getByRole("dialog", { name: "Budget ceiling", exact: true }).getByRole("button", { name: "Close filters", exact: true }).click();
    const ssr = await request.get(`/admin/approval-policies/${policyId}`);
    expect(await ssr.text()).not.toContain(assignmentKey);
    await page.screenshot({ path: "artifacts/policies-routing-budget/admin-budget-desktop.png", fullPage: true });

    const requesterContext = await browser.newContext();
    const requesterPage = await requesterContext.newPage();
    try
    {
        const requesterToken = await signIn(requesterPage, "requester-a@example.test");
        await requesterPage.goto("/admin/approval-policies");
        await expect(requesterPage.getByRole("alert")).toContainText("Administrator access required");
        // Direct type selection remains server-paged; use API-created draft to pin this type for the wizard.
        const draftResponse = await requesterPage.request.post(`${apiUrl.origin}/api/v1/requests`, { headers: { Authorization: `Bearer ${requesterToken}`, "Idempotency-Key": randomUUID() }, data: { typeId: type.id, formDefinitionVersionId: (await publishedType.json() as { versionId: string }).versionId, title: `Routing ${suffix}`, justification: "Verify configured routing", monetaryAmount: "20.21", fields: {} } });
        expect(draftResponse.status()).toBe(201);
        const draft = await draftResponse.json() as { id: string };
        await requesterPage.goto(`/requests/${draft.id}/edit`);
        // Existing edit UI submits a saved draft, making above-ceiling 422 visible.
        await requesterPage.getByRole("button", { name: "Next", exact: true }).click();
        await requesterPage.getByRole("button", { name: "Next", exact: true }).click();
        await requesterPage.getByRole("button", { name: "Submit request", exact: true }).click();
        await requesterPage.getByRole("button", { name: "Confirm submission", exact: true }).click();
        await expect(requesterPage.getByText("Amount exceeds the configured limit", { exact: true })).toBeVisible();
        // Correct amount via existing edit API, then submit through browser UI.
        const current = await requesterPage.request.get(`${apiUrl.origin}/api/v1/requests/${draft.id}`, { headers: { Authorization: `Bearer ${requesterToken}` } });
        const state = await current.json() as { version: number };
        const patched = await requesterPage.request.patch(`${apiUrl.origin}/api/v1/requests/${draft.id}/draft`, { headers: { Authorization: `Bearer ${requesterToken}` }, data: { expectedVersion: state.version, monetaryAmount: "20.20" } });
        expect(patched.status()).toBe(200);
        await requesterPage.goto(`/requests/${draft.id}/edit`);
        for (let step = 0; step < 2; step++) await requesterPage.getByRole("button", { name: "Next", exact: true }).click();
        await requesterPage.getByRole("button", { name: "Submit request", exact: true }).click();
        await requesterPage.getByRole("button", { name: "Confirm submission", exact: true }).click();
        await expect(requesterPage.getByRole("heading", { name: "Request submitted" })).toBeVisible();
        const accepted = await requesterPage.request.get(`${apiUrl.origin}/api/v1/requests/${draft.id}`, { headers: { Authorization: `Bearer ${requesterToken}` } });
        expect(await accepted.json()).toMatchObject({ status: "PENDING", currentApprovers: [{ stageNumber: 1 }, { stageNumber: 2 }] });
        await requesterPage.screenshot({ path: "artifacts/policies-routing-budget/request-submitted.png", fullPage: true });
    }
    finally
    {
        await requesterContext.close();
    }
    await page.goto(`/admin/approval-policies/${policyId}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await expect(page.getByRole("heading", { name: `Policy ${code}`, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "artifacts/policies-routing-budget/policy-mobile.png", fullPage: true });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--background").trim())).toMatch(/^oklch\((?:0\.145|14\.5%) 0 0\)$/);
    await expect(page.getByRole("button", { name: "Branch new draft", exact: true })).toHaveCSS("transition-property", "none");
    await page.screenshot({ path: "artifacts/policies-routing-budget/policy-mobile-dark.png", fullPage: true });
});
