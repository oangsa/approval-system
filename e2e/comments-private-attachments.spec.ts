import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { attachmentSchema, commentSchema, requestDetailSchema } from "@workflow/contracts";
import { apiUrl } from "./helpers/environment";

async function login(page: Page, email: string): Promise<string>
{
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Test-password-42!");
    const responsePromise = page.waitForResponse((item) => item.url().endsWith("/auth/login") && item.request().method() === "POST");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { accessToken: string };
    await expect(page).toHaveURL(/\/dashboard$/);
    return body.accessToken;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void>
{
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(noOverflow).toBe(true);
}

test("E2E-12 collaboration comments, private attachments, non-decision invariant, and return-revision isolation", async ({ browser }) =>
{
    test.setTimeout(120_000);
    const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const reviewerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const outsiderContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });

    const primaryPdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "utf8");
    const unwantedTxtBytes = Buffer.from("Temporary working note that should be removed before submission.\n", "utf8");
    const replacementPdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "utf8");

    try
    {
        const owner = await ownerContext.newPage();
        const reviewer = await reviewerContext.newPage();
        const outsider = await outsiderContext.newPage();

        const title = `Collaboration E2E ${Date.now()}`;
        const ownerComment = "Please review the attached cycle-1 PDF evidence before making a decision.";
        const reviewerReply = "Reviewed the PDF; please attach the signed addendum before resubmitting.";

        await login(owner, "requester-a@example.test");
        await owner.goto("/requests/new");
        await owner.getByLabel("Request type (required)", { exact: true }).selectOption({ label: "General request" });
        await owner.getByRole("button", { name: "Next", exact: true }).click();

        await owner.getByLabel("Title", { exact: false }).fill(title);
        await owner.getByLabel("Justification", { exact: false }).fill("Verify comments and private attachments lifecycle");
        await owner.getByRole("button", { name: "Next", exact: true }).click();

        await owner.getByLabel("Category", { exact: false }).selectOption("OPERATIONS");
        await owner.getByRole("button", { name: "Next", exact: true }).click();

        await expect(owner.getByRole("heading", { name: "Items & Attachments", exact: true })).toBeVisible();
        await expect(owner.getByText("0 / 10 files", { exact: true })).toBeVisible();

        const autoDraftPromise = owner.waitForResponse((response) => /\/api\/v1\/requests$/.test(new URL(response.url()).pathname) && response.request().method() === "POST");
        const primaryUploadPromise = owner.waitForResponse((response) => /\/api\/v1\/requests\/[^/]+\/attachments$/.test(new URL(response.url()).pathname) && response.request().method() === "POST");

        await owner.getByLabel("Attach supporting file", { exact: true }).setInputFiles({
            name: "cycle1-evidence.pdf",
            mimeType: "application/pdf",
            buffer: primaryPdfBytes,
        });

        const autoDraftResponse = await autoDraftPromise;
        expect(autoDraftResponse.status()).toBe(201);
        const autoDraft = requestDetailSchema.parse(await autoDraftResponse.json());
        const requestId = autoDraft.id;

        const primaryUploadResponse = await primaryUploadPromise;
        expect(primaryUploadResponse.status()).toBe(201);
        const primaryAttachment = attachmentSchema.parse(await primaryUploadResponse.json());
        expect(primaryAttachment.fileName).toBe("cycle1-evidence.pdf");

        await expect(owner.getByRole("status")).toContainText("Draft saved");
        await expect(owner.getByText("1 / 10 files", { exact: true })).toBeVisible();

        const workingList = owner.getByRole("list", { name: "Working attachments" });
        await expect(workingList).toContainText("cycle1-evidence.pdf");
        await expect(workingList).toContainText("Uploaded");

        const unwantedUploadPromise = owner.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/requests/${requestId}/attachments` && response.request().method() === "POST");
        await owner.getByLabel("Attach supporting file", { exact: true }).setInputFiles({
            name: "unwanted-note.txt",
            mimeType: "text/plain",
            buffer: unwantedTxtBytes,
        });
        const unwantedUploadResponse = await unwantedUploadPromise;
        expect(unwantedUploadResponse.status()).toBe(201);
        const unwantedAttachment = attachmentSchema.parse(await unwantedUploadResponse.json());

        await expect(owner.getByText("2 / 10 files", { exact: true })).toBeVisible();
        await expect(workingList).toContainText("unwanted-note.txt");

        const deletePromise = owner.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/requests/${requestId}/attachments/${unwantedAttachment.id}` && response.request().method() === "DELETE");
        await owner.getByRole("button", { name: "Delete unwanted-note.txt", exact: true }).click();
        expect((await deletePromise).status()).toBe(204);

        await expect(owner.getByText("1 / 10 files", { exact: true })).toBeVisible();
        await expect(workingList).toContainText("cycle1-evidence.pdf");
        await expect(workingList).not.toContainText("unwanted-note.txt");
        await expectNoHorizontalOverflow(owner);

        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await expect(owner.getByRole("heading", { name: "Review & Submit", exact: true })).toBeVisible();
        await expect(owner.getByRole("heading", { name: "Attachments (1)", exact: true })).toBeVisible();
        const reviewAttachments = owner.getByRole("list", { name: "Review attachments" });
        await expect(reviewAttachments).toContainText("cycle1-evidence.pdf");
        await expect(reviewAttachments).not.toContainText("unwanted-note.txt");

        await owner.getByRole("button", { name: "Submit request", exact: true }).click();
        const submitPromise = owner.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/requests/${requestId}/submit` && response.request().method() === "POST");
        await owner.getByRole("button", { name: "Confirm submission", exact: true }).click();
        const submitResponse = await submitPromise;
        expect(submitResponse.status()).toBe(200);
        const submittedDetail = requestDetailSchema.parse(await submitResponse.json());
        expect(submittedDetail.status).toBe("PENDING");
        await expect(owner.getByRole("heading", { name: "Request submitted", exact: true })).toBeVisible();

        await owner.getByRole("link", { name: "Open saved request", exact: true }).click();
        await expect(owner.getByRole("heading", { level: 1, name: title })).toBeVisible();

        await owner.getByRole("tab", { name: "Discussion / Files", exact: true }).click();
        const ownerPanel = owner.getByRole("tabpanel", { name: "Discussion / Files" });
        await expect(ownerPanel.getByText("Comments are for business discussion only and do not record formal approval decisions.")).toBeVisible();
        await expect(ownerPanel.getByRole("button", { name: /^(Approve|Reject|Return)$/ })).toHaveCount(0);

        await expect(ownerPanel.getByLabel("Attach supporting file")).toHaveCount(0);
        await expect(ownerPanel.getByRole("button", { name: /^Delete / })).toHaveCount(0);
        const ownerSubmittedSection = ownerPanel.getByRole("region", { name: "Submitted Revision Evidence" });
        await expect(ownerSubmittedSection).toContainText("Revision 1");
        await expect(ownerSubmittedSection).toContainText("cycle1-evidence.pdf");

        const ownerCommentPromise = owner.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/requests/${requestId}/comments` && response.request().method() === "POST");
        await ownerPanel.getByLabel("Add a comment", { exact: true }).fill(ownerComment);
        await ownerPanel.getByRole("button", { name: "Post comment", exact: true }).click();
        const ownerCommentResponse = await ownerCommentPromise;
        expect(ownerCommentResponse.status()).toBe(201);
        commentSchema.parse(await ownerCommentResponse.json());

        await expect(ownerPanel.getByLabel("Add a comment", { exact: true })).toHaveValue("");
        await expect(ownerPanel.getByRole("list", { name: "Comments list" })).toContainText(ownerComment);
        await expect(ownerPanel.getByRole("list", { name: "Comments list" })).toContainText("Requester A");

        await owner.reload();
        await expect(ownerPanel.getByRole("list", { name: "Comments list" })).toContainText(ownerComment);
        await expect(ownerSubmittedSection).toContainText("cycle1-evidence.pdf");
        await expectNoHorizontalOverflow(owner);

        await owner.setViewportSize({ width: 390, height: 844 });
        await expectNoHorizontalOverflow(owner);
        await owner.setViewportSize({ width: 1280, height: 900 });

        const outsiderToken = await login(outsider, "requester-b@example.test");
        await outsider.goto(`/requests/${requestId}?tab=discussion`);
        await expect(outsider.getByRole("alert")).toContainText("This request is unavailable.");
        await expect(outsider.locator("body")).not.toContainText(title);
        await expect(outsider.locator("body")).not.toContainText(ownerComment);
        await expect(outsider.locator("body")).not.toContainText("cycle1-evidence.pdf");

        const apiBase = `${apiUrl.origin}/api/v1`;
        const outsiderHeaders = { authorization: `Bearer ${outsiderToken}` };
        const outsiderGetComments = await outsider.request.get(`${apiBase}/requests/${requestId}/comments`, { headers: outsiderHeaders });
        expect(outsiderGetComments.status()).toBe(404);
        expect(await outsiderGetComments.text()).not.toContain(ownerComment);

        const outsiderPostComment = await outsider.request.post(`${apiBase}/requests/${requestId}/comments`, {
            headers: outsiderHeaders,
            data: { body: "Unauthorized comment" },
        });
        expect(outsiderPostComment.status()).toBe(404);

        const outsiderGetAttachments = await outsider.request.get(`${apiBase}/requests/${requestId}/attachments`, { headers: outsiderHeaders });
        expect(outsiderGetAttachments.status()).toBe(404);
        expect(await outsiderGetAttachments.text()).not.toContain("cycle1-evidence.pdf");

        const outsiderDownload = await outsider.request.get(`${apiBase}/attachments/${primaryAttachment.id}/download`, { headers: outsiderHeaders });
        expect(outsiderDownload.status()).toBe(404);
        expect(await outsiderDownload.text()).not.toContain("%PDF-");

        const reviewerToken = await login(reviewer, "reviewer@example.test");
        await reviewer.goto(`/requests/${requestId}?tab=discussion`);
        const reviewerPanel = reviewer.getByRole("tabpanel", { name: "Discussion / Files" });
        await expect(reviewerPanel.getByRole("list", { name: "Comments list" })).toContainText(ownerComment);
        await expect(reviewerPanel.getByLabel("Attach supporting file")).toHaveCount(0);
        await expect(reviewerPanel.getByRole("button", { name: /^Delete / })).toHaveCount(0);

        const reviewerSubmittedSection = reviewerPanel.getByRole("region", { name: "Submitted Revision Evidence" });
        await expect(reviewerSubmittedSection).toContainText("cycle1-evidence.pdf");

        const reviewerCommentPromise = reviewer.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/requests/${requestId}/comments` && response.request().method() === "POST");
        await reviewerPanel.getByLabel("Add a comment", { exact: true }).fill(reviewerReply);
        await reviewerPanel.getByRole("button", { name: "Post comment", exact: true }).click();
        expect((await reviewerCommentPromise).status()).toBe(201);

        await expect(reviewerPanel.getByRole("list", { name: "Comments list" })).toContainText(reviewerReply);
        await expect(reviewerPanel.getByRole("list", { name: "Comments list" })).toContainText("Reviewer");
        await expect(reviewer.getByText("Pending approval", { exact: true })).toBeVisible();

        const statusCheck = await reviewer.request.get(`${apiBase}/requests/${requestId}`, {
            headers: { authorization: `Bearer ${reviewerToken}` },
        });
        expect(statusCheck.status()).toBe(200);
        expect(requestDetailSchema.parse(await statusCheck.json()).status).toBe("PENDING");

        const downloadPromise = reviewer.waitForEvent("download");
        await reviewerSubmittedSection.getByRole("button", { name: "Download", exact: true }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe("cycle1-evidence.pdf");
        const downloadedPath = await download.path();
        expect(downloadedPath).toBeTruthy();
        const downloadedBytes = await readFile(downloadedPath!);
        expect(downloadedBytes.length).toBeGreaterThan(0);
        expect(downloadedBytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
        expect(downloadedBytes.equals(primaryPdfBytes)).toBe(true);
        await expectNoHorizontalOverflow(reviewer);

        await reviewer.goto("/reviews");
        await reviewer.getByLabel("Search requests", { exact: true }).fill(title);
        await reviewer.getByRole("button", { name: "Search", exact: true }).click();
        const reviewCard = reviewer.getByRole("listitem").filter({ hasText: title });
        await expect(reviewCard).toBeVisible();
        await reviewCard.getByRole("link").click();

        await reviewer.getByRole("button", { name: "Return", exact: true }).click();
        const returnDialog = reviewer.getByRole("dialog");
        await returnDialog.getByLabel(/Reason/).fill("Please attach the signed addendum PDF");
        const returnDecisionPromise = reviewer.waitForResponse((response) => response.url().endsWith("/decisions") && response.request().method() === "POST");
        await returnDialog.getByRole("button", { name: "Confirm return", exact: true }).click();
        expect((await returnDecisionPromise).status()).toBe(201);

        await owner.goto(`/requests/${requestId}?tab=discussion`);
        await expect(owner.getByText("Returned for revision", { exact: true })).toBeVisible();

        const returnedWorkingSection = ownerPanel.getByRole("region", { name: "Working Revision Files" });
        await expect(returnedWorkingSection).toContainText("0 / 10 files");
        await expect(returnedWorkingSection).toContainText("No working files attached yet.");

        await expect(ownerSubmittedSection).toContainText("Revision 1");
        await expect(ownerSubmittedSection).toContainText("cycle1-evidence.pdf");
        await expect(ownerSubmittedSection.getByRole("button", { name: /^Delete / })).toHaveCount(0);
        await expect(ownerPanel.getByRole("list", { name: "Comments list" })).toContainText(ownerComment);
        await expect(ownerPanel.getByRole("list", { name: "Comments list" })).toContainText(reviewerReply);
        await expectNoHorizontalOverflow(owner);

        await owner.getByRole("link", { name: "Edit returned request", exact: true }).click();
        await expect(owner.getByRole("heading", { name: "Edit returned request", exact: true })).toBeVisible();
        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await expect(owner.getByRole("heading", { name: "Items & Attachments", exact: true })).toBeVisible();
        await expect(owner.getByText("0 / 10 files", { exact: true })).toBeVisible();
        await expect(owner.getByText("No working files attached yet.", { exact: true })).toBeVisible();

        const replacementUploadPromise = owner.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/requests/${requestId}/attachments` && response.request().method() === "POST");
        await owner.getByLabel("Attach supporting file", { exact: true }).setInputFiles({
            name: "cycle2-signed-addendum.pdf",
            mimeType: "application/pdf",
            buffer: replacementPdfBytes,
        });
        const replacementUploadResponse = await replacementUploadPromise;
        expect(replacementUploadResponse.status()).toBe(201);
        attachmentSchema.parse(await replacementUploadResponse.json());

        await expect(owner.getByText("1 / 10 files", { exact: true })).toBeVisible();
        await expect(owner.getByRole("list", { name: "Working attachments" })).toContainText("cycle2-signed-addendum.pdf");

        await owner.getByRole("button", { name: "Next", exact: true }).click();
        await expect(owner.getByRole("heading", { name: "Review & Submit", exact: true })).toBeVisible();
        await expect(owner.getByRole("heading", { name: "Attachments (1)", exact: true })).toBeVisible();
        await expect(owner.getByRole("list", { name: "Review attachments" })).toContainText("cycle2-signed-addendum.pdf");

        await owner.getByRole("button", { name: "Resubmit request", exact: true }).click();
        const resubmitPromise = owner.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/requests/${requestId}/resubmit` && response.request().method() === "POST");
        await owner.getByRole("button", { name: "Confirm resubmission", exact: true }).click();
        const resubmitResponse = await resubmitPromise;
        expect(resubmitResponse.status()).toBe(200);
        const resubmittedDetail = requestDetailSchema.parse(await resubmitResponse.json());
        expect(resubmittedDetail.status).toBe("PENDING");

        await owner.getByRole("link", { name: "Open saved request", exact: true }).click();
        await owner.getByRole("tab", { name: "Discussion / Files", exact: true }).click();
        await expect(owner.getByText("Pending approval", { exact: true })).toBeVisible();
        await expect(ownerSubmittedSection).toContainText("cycle1-evidence.pdf");
        await expect(ownerSubmittedSection).toContainText("cycle2-signed-addendum.pdf");
        await expect(ownerPanel.getByRole("button", { name: /^Delete / })).toHaveCount(0);
        await expect(ownerPanel.getByLabel("Attach supporting file")).toHaveCount(0);
        await expect(ownerPanel.getByRole("list", { name: "Comments list" })).toContainText(ownerComment);
        await expect(ownerPanel.getByRole("list", { name: "Comments list" })).toContainText(reviewerReply);

        await owner.setViewportSize({ width: 390, height: 844 });
        await expectNoHorizontalOverflow(owner);
    }
    finally
    {
        await ownerContext.close();
        await reviewerContext.close();
        await outsiderContext.close();
    }
});
