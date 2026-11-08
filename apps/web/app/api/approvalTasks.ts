import { z } from "zod";
import { approvalTaskSchema, approvalTaskSearchSchema, type ApprovalTaskSearch } from "@workflow/contracts";
import { httpFor, httpPageFor } from "./http";

export const approvalTaskApi = {
    search: (query: ApprovalTaskSearch, signal?: AbortSignal, generation?: number) => httpPageFor("/v1/approval-tasks/search", z.array(approvalTaskSchema), { method: "POST", body: approvalTaskSearchSchema.parse(query), signal, generation }),
    read: (id: string, signal?: AbortSignal, generation?: number) => httpFor(`/v1/approval-tasks/${encodeURIComponent(id)}`, approvalTaskSchema, { signal, generation }),
};
