import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
export const id = "7bb91ef4-5982-405f-8bd5-61b5c3cf410b";
export const definition: PublishedRequestType = {
    id, code: "OPS", name: { en: "Operations" }, versionId: "8bb91ef4-5982-405f-8bd5-61b5c3cf410b", versionNumber: 1,
    isEnabled: true, supportsLineItems: false, monetary: false, publishedAt: "2026-11-06T00:00:00Z", fields: [],
};
export const draft: RequestDetail = {
    id, typeId: id, typeCode: "OPS", title: "Saved incomplete", justification: "", priority: "MEDIUM", status: "DRAFT", requestNumber: null,
    requester: { id, email: "owner@example.test", displayName: "Owner", roles: ["REQUESTER"], isActive: true, department: null }, department: null,
    revisionNumber: null, currentCycleId: null, createdAt: "2026-11-06T00:00:00Z", updatedAt: "2026-11-06T00:00:00Z", submittedAt: null, version: 2,
    workingRevision: { id, revisionNumber: 1, formDefinitionVersionId: definition.versionId, fields: {}, lineItems: [], amount: null, currency: null, submittedAt: null, submittedBy: null },
    submittedRevision: null, currentStageNumber: null, currentApprovers: [], availableActions: ["EDIT_DRAFT", "SUBMIT"],
};
