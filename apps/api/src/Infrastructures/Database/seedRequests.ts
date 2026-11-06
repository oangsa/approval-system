import type { PublishedRequestType } from "@workflow/contracts";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "./Database";
import { approvalPolicyVersions, requestTypes, requestTypeVersions, reviewerAssignmentRules } from "./schema";

export const seededTypeId = "30000000-0000-4000-8000-000000000001";
export const seededVersionId = "30000000-0000-4000-8000-000000000002";
export const seededPolicyId = "30000000-0000-4000-8000-000000000003";
export const seededDefinition: PublishedRequestType = {
    id: seededTypeId, versionId: seededVersionId, code: "GENERAL", name: { en: "General request", th: "คำขอทั่วไป" }, description: { en: "Submit a general operational request for review." },
    versionNumber: 1, isEnabled: true, monetary: false, supportsLineItems: false, publishedAt: "2026-11-06T00:00:00.000Z",
    fields: [
        { key: "category", kind: "SELECT", label: { en: "Category", th: "ประเภท" }, required: true, constraints: { options: [{ value: "OPERATIONS", label: { en: "Operations", th: "งานปฏิบัติการ" } }, { value: "OTHER", label: { en: "Other", th: "อื่น ๆ" } }] } },
        { key: "reason", kind: "TEXTAREA", label: { en: "Additional details", th: "รายละเอียดเพิ่มเติม" }, required: true, constraints: { maxLength: 2000 }, visibleWhen: { all: [{ fieldKey: "category", operator: "EQ", value: "OTHER" }] } },
    ],
};
export async function seedRequests(database: Database, departmentIds: string[], reviewerId: string): Promise<void>
{
    await database.connection.transaction(async (tx) =>
    {
        await tx.insert(requestTypes).values({ id: seededTypeId, code: "GENERAL" }).onConflictDoNothing();
        await tx.insert(requestTypeVersions).values({ id: seededVersionId, typeId: seededTypeId, versionNumber: 1, definition: seededDefinition }).onConflictDoNothing();
        await tx.update(requestTypes).set({ publishedVersionId: seededVersionId }).where(and(eq(requestTypes.id, seededTypeId), isNull(requestTypes.publishedVersionId)));
        await tx.insert(approvalPolicyVersions).values({ id: seededPolicyId, code: "GENERAL_REVIEW", versionNumber: 1, typeId: seededTypeId, priority: 10, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["general-review"], slaBusinessMinutes: 480 }] }).onConflictDoNothing();
        for (const [index, departmentId] of departmentIds.entries())
        {
            await tx.insert(reviewerAssignmentRules).values({ id: `30000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`, assignmentKey: "general-review", departmentId, reviewerId }).onConflictDoNothing();
        }
    });
}
