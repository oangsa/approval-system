import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { apiUrl } from "./helpers/environment";

async function signIn(page: Page, email: string)
{
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Test-password-42!");
    const loginResponse = page.waitForResponse((response) => response.url().endsWith("/auth/login") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Sign in" }).click();
    const { accessToken } = await (await loginResponse).json() as { accessToken: string };
    await expect(page).toHaveURL(/\/dashboard$/);
    return accessToken;
}

test("E2E-03 and E2E-08 admin configures conditional line-item type, previews, publishes, and requester submits with priority", async ({ page, request }) =>
{
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const code = `E2E_CF_${suffix}`;
    const typeName = `Procurement ${suffix}`;

    // Admin signs in and creates/configures/previews/publishes request type.
    const adminToken = await signIn(page, "admin@example.test");
    await page.getByRole("link", { name: "Request Types", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/request-types$/);

    await page.getByRole("link", { name: "New request type", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/request-types\/new$/);

    await page.getByLabel("Type code (required)", { exact: true }).fill(code);
    await page.getByLabel("English name (required)", { exact: true }).fill(typeName);
    await page.getByLabel("Thai name (optional)", { exact: true }).fill(`จัดซื้อ ${suffix}`);
    await page.getByLabel("Monetary request", { exact: true }).check();
    await page.getByLabel("Enable line items", { exact: true }).check();

    // Field 1: BOOLEAN urgentFlag
    await page.getByRole("button", { name: "Add field", exact: true }).click();
    await page.locator("#fields\\[0\\]\\.key").fill("urgentFlag");
    await page.locator("#fields\\[0\\]\\.kind").selectOption("BOOLEAN");
    await page.locator("#fields\\[0\\]\\.label\\.en").fill("Urgent flag");

    // Field 2: TEXTAREA reason (visibleWhen urgentFlag EQ false, requiredWhen urgentFlag PRESENT)
    await page.getByRole("button", { name: "Add field", exact: true }).click();
    await page.locator("#fields\\[1\\]\\.key").fill("reason");
    await page.locator("#fields\\[1\\]\\.kind").selectOption("TEXTAREA");
    await page.locator("#fields\\[1\\]\\.label\\.en").fill("Urgent reason");
    await page.locator("#fields\\[1\\]\\.label\\.th").fill("เหตุผลด่วน");

    const reasonCard = page.getByRole("region", { name: /Field 2:/ });
    await reasonCard.getByRole("button", { name: "Add AND rule" }).nth(0).click();
    await page.locator("#fields\\[1\\]\\.visibleWhen\\.all\\.0\\.value").selectOption("false");

    await reasonCard.getByRole("button", { name: "Add AND rule" }).nth(1).click();
    await page.locator("#fields\\[1\\]\\.requiredWhen\\.all\\.0\\.operator").selectOption("PRESENT");

    // Reorder Field 2 up and back down.
    await page.getByRole("button", { name: "Move Urgent reason up" }).click();
    await expect(page.getByRole("region", { name: "Field 1: Urgent reason" })).toBeVisible();
    await page.getByRole("button", { name: "Move Urgent reason down" }).click();
    await expect(page.getByRole("region", { name: "Field 2: Urgent reason" })).toBeVisible();

    // Test shared-evaluator live preview (boolean false is PRESENT + Thai fallback).
    const preview = page.getByRole("complementary", { name: "Live form preview" });
    await expect(preview.getByLabel("Urgent reason", { exact: false })).toHaveCount(0);
    await preview.getByLabel("Urgent flag", { exact: false }).selectOption("false");
    await expect(preview.getByLabel("Urgent reason", { exact: false })).toBeVisible();
    await preview.getByLabel("Preview language", { exact: true }).selectOption("th");
    await expect(preview.getByLabel("เหตุผลด่วน", { exact: false })).toBeVisible();

    // Save draft and publish immutable v1.
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/request-types\/[0-9a-f-]+$/);
    const createdTypeId = page.url().split("/").pop()!;
    await expect(page.getByRole("status")).toContainText("Draft created.");

    await page.getByRole("button", { name: "Publish version", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Publish immutable version 1?" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm publish", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Published immutable version 1.");

    // Toggle disable and re-enable via list page.
    await page.getByRole("link", { name: "Request Types", exact: true }).first().click();
    await page.getByLabel("Search", { exact: true }).fill(code);
    const row = page.getByRole("row").filter({ hasText: code });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Disable", exact: true }).click();
    await page.getByRole("button", { name: "Confirm disable", exact: true }).click();
    await expect(row).toContainText("Disabled");
    await row.getByRole("button", { name: "Enable", exact: true }).click();
    await page.getByRole("button", { name: "Confirm enable", exact: true }).click();
    await expect(row).toContainText("Enabled");

    // Public SSR HTML must contain no private or draft configuration data.
    const ssrResponse = await request.get("/admin/request-types");
    expect(ssrResponse.ok()).toBe(true);
    expect(await ssrResponse.text()).not.toContain(typeName);

    // Requester signs in, sees admin route denied, verifies hidden-key 422 via API, then completes wizard.
    const requesterToken = await signIn(page, "requester-a@example.test");
    await page.goto("/admin/request-types");
    await expect(page.getByRole("alert")).toContainText("Administrator access is required");

    const v1Response = await page.request.get(`${apiUrl.origin}/api/v1/request-types/${createdTypeId}`, {
        headers: { authorization: `Bearer ${requesterToken}` },
    });
    const v1 = await v1Response.json() as { versionId: string };

    const hiddenKeyAttempt = await page.request.post(`${apiUrl.origin}/api/v1/requests`, {
        headers: { authorization: `Bearer ${requesterToken}`, "Idempotency-Key": randomUUID() },
        data: {
            typeId: createdTypeId,
            formDefinitionVersionId: v1.versionId,
            fields: { urgentFlag: true, reason: "Hidden value" },
        },
    });
    expect(hiddenKeyAttempt.status()).toBe(422);
    expect(await hiddenKeyAttempt.json()).toMatchObject({ code: "FORM_FIELD_NOT_APPLICABLE" });

    const { eq } = await import("drizzle-orm");
    const { createTestDatabase } = await import("../apps/api/tests/helpers/testDatabase");
    const { approvalCycles, approvalPolicyVersions, requestAuditEvents, requests } = await import("../apps/api/src/Infrastructures/Database/schema");
    const database = createTestDatabase();
    try
    {
        expect(await database.connection.select().from(requests).where(eq(requests.typeId, createdTypeId))).toHaveLength(0);

        // Open wizard, select published type, set URGENT priority, verify conditionally required validation & focus.
        await page.goto("/requests/new");
        await page.getByLabel("Request type (required)", { exact: true }).selectOption({ label: typeName });
        await page.getByRole("button", { name: "Next", exact: true }).click();

        await page.getByLabel("Title (required)", { exact: true }).fill(`Browser ${code}`);
        await page.getByLabel("Justification (required)", { exact: true }).fill("Verify E2E configurable form and items");
        await page.getByLabel("Priority", { exact: true }).selectOption("URGENT");
        await page.getByRole("button", { name: "Next", exact: true }).click();

        await page.getByLabel("Urgent flag", { exact: false }).selectOption("false");
        const reasonInput = page.getByLabel("Urgent reason (required)", { exact: true });
        await expect(reasonInput).toBeVisible();

        // B06: missing conditionally required field blocks Next, shows alert, marks aria-invalid, and focuses field.
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Request Details" })).toBeVisible();
        await expect(page.getByRole("alert")).toContainText("Urgent reason is required.");
        await expect(reasonInput).toHaveAttribute("aria-invalid", "true");
        await expect(reasonInput).toBeFocused();

        // Save incomplete draft while conditionally required reason is unset, then confirm server rejects submit & invalid whitespace patch without DB mutation.
        await page.getByRole("button", { name: "Save Draft", exact: true }).click();
        await expect(page.getByRole("status")).toContainText("Draft saved");
        const resumeHref = await page.getByRole("link", { name: "Resume saved draft" }).getAttribute("href");
        const draftId = resumeHref!.split("/")[2]!;

        const missingRequiredSubmit = await page.request.post(`${apiUrl.origin}/api/v1/requests/${draftId}/submit`, {
            headers: { authorization: `Bearer ${requesterToken}`, "Idempotency-Key": randomUUID() },
            data: { expectedVersion: 0 },
        });
        expect(missingRequiredSubmit.status()).toBe(422);
        expect(await missingRequiredSubmit.json()).toMatchObject({
            code: "VALIDATION_ERROR",
            details: expect.arrayContaining([expect.objectContaining({ field: "fields.reason", code: "REQUIRED" })]),
        });

        const whitespacePatch = await page.request.patch(`${apiUrl.origin}/api/v1/requests/${draftId}/draft`, {
            headers: { authorization: `Bearer ${requesterToken}` },
            data: { expectedVersion: 0, fields: { urgentFlag: false, reason: "   " } },
        });
        expect(whitespacePatch.status()).toBe(422);
        expect(await whitespacePatch.json()).toMatchObject({
            code: "VALIDATION_ERROR",
            details: expect.arrayContaining([expect.objectContaining({ field: "fields.reason", code: "INVALID_VALUE" })]),
        });

        const [persistedDraft] = await database.connection.select().from(requests).where(eq(requests.id, draftId));
        expect(persistedDraft).toMatchObject({ status: "DRAFT", version: 0, requestNumber: null, submittedRevisionId: null });
        expect(await database.connection.select().from(approvalCycles).where(eq(approvalCycles.requestId, draftId))).toHaveLength(0);
        expect(await database.connection.select().from(requestAuditEvents).where(eq(requestAuditEvents.requestId, draftId))).toHaveLength(1);

        // Fill reason, toggle flag so reason hides and is omitted, then add line items and verify localized currency formatting.
        await reasonInput.fill("Temporary reason");
        await page.getByLabel("Urgent flag", { exact: false }).selectOption("true");
        await expect(page.getByLabel("Urgent reason", { exact: false })).toHaveCount(0);
        await page.getByRole("button", { name: "Next", exact: true }).click();

        await page.getByRole("button", { name: "Add item", exact: true }).click();
        await page.getByLabel("Description (item 1)", { exact: true }).fill("Cable");
        await page.getByLabel("Quantity (item 1)", { exact: true }).fill("1");
        await page.getByLabel("Unit amount (item 1)", { exact: true }).fill("1000.10");

        await page.getByRole("button", { name: "Add item", exact: true }).click();
        await page.getByLabel("Description (item 2)", { exact: true }).fill("Adapter");
        await page.getByLabel("Quantity (item 2)", { exact: true }).fill("2");
        await page.getByLabel("Unit amount (item 2)", { exact: true }).fill("0.10");

        await expect(page.getByText("Subtotal: THB 1,000.10")).toBeVisible();
        await expect(page.getByText("Subtotal: THB 0.20")).toBeVisible();
        await expect(page.getByText("Estimated total: THB 1,000.30")).toBeVisible();
        await page.getByRole("button", { name: "Save Draft", exact: true }).click();
        await expect(page.getByRole("status")).toContainText("Draft saved");

        // Admin branches and publishes v2 before first submit -> requester hits FORM_DEFINITION_CHANGED and reviews.
        const adminDetailResp = await page.request.get(`${apiUrl.origin}/api/v1/request-types/${createdTypeId}?view=admin`, {
            headers: { authorization: `Bearer ${adminToken}` },
        });
        const adminDetail = await adminDetailResp.json() as { version: number };
        const branchResp = await page.request.post(`${apiUrl.origin}/api/v1/admin/request-types/${createdTypeId}/draft`, {
            headers: { authorization: `Bearer ${adminToken}`, "Idempotency-Key": randomUUID() },
            data: { expectedVersion: adminDetail.version },
        });
        expect(branchResp.status()).toBe(201);
        const branched = await branchResp.json() as { version: number };
        const publishV2Resp = await page.request.post(`${apiUrl.origin}/api/v1/admin/request-types/${createdTypeId}/publish`, {
            headers: { authorization: `Bearer ${adminToken}`, "Idempotency-Key": randomUUID() },
            data: { expectedVersion: branched.version },
        });
        expect(publishV2Resp.status()).toBe(201);

        await page.getByRole("button", { name: "Next", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Review & Submit" })).toBeVisible();
        await expect(page.getByText("Urgent", { exact: true })).toBeVisible();
        await expect(page.getByText("Total: THB 1,000.30")).toBeVisible();

        await page.getByRole("button", { name: "Submit request", exact: true }).click();
        await page.getByRole("button", { name: "Confirm submission", exact: true }).click();
        await expect(page.getByRole("alert")).toContainText("The form changed. Review the updated definition");
        await page.getByRole("button", { name: "Review updated form", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Request Details" })).toBeVisible();

        // Seed an approval policy for this unique type so submission succeeds.
        await database.connection.insert(approvalPolicyVersions).values({
            id: randomUUID(),
            code: `POL_${code}`,
            versionNumber: 1,
            typeId: createdTypeId,
            priority: 10,
            stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["general-review"], slaBusinessMinutes: 480 }],
        });
    }
    finally
    {
        await database.Close();
    }

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Submit request", exact: true }).click();
    await page.getByRole("button", { name: "Confirm submission", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Request submitted", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Request result" })).toContainText("Urgent");
    await expect(page.getByRole("region", { name: "Request result" })).toContainText("Total: THB 1,000.30");
    await expect(page.getByRole("region", { name: "Request result" })).not.toContainText("Temporary reason");
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await page.getByRole("link", { name: "Open saved request" }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Browser ${code}` })).toBeVisible();
    await expect(page.getByText("Total: THB 1,000.30")).toBeVisible();
});
