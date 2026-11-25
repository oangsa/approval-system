import { approvalPolicySchema, type ApprovalPolicyDTO } from "@workflow/contracts";
import type { IPolicyRecord } from "./Ports";
import { RequestError } from "../Requests/RequestRules";
export function policyDto(record: IPolicyRecord): ApprovalPolicyDTO
{
    const content = record.draft ?? record.published;
    if (!content) throw new RequestError("CONFIGURATION_INCOMPLETE");
    const { priority, typeId, departmentId, minAmount, maxAmount, stages } = content;
    return approvalPolicySchema.parse({
        priority, typeId, departmentId, minAmount, maxAmount, stages, id: record.id, code: record.code,
        versionId: record.draft ? null : record.published!.versionId,
        versionNumber: record.draft ? null : record.published!.versionNumber,
        isPublished: record.draft === null, isEnabled: record.isEnabled, version: record.version
    });
}
export function assertConfigurationVersion(actual: number, expected: number): void
{
    if (actual !== expected) throw new RequestError("CONFLICT", [{ field: "expectedVersion", code: "STALE_CONFIGURATION", message: "Configuration changed. Reload before editing." }]);
}
