import { z } from "zod";
import { approvalTaskSearchSchema, type ApprovalTaskSearch } from "@workflow/contracts";

export const queuePageSizes = [10, 20, 50, 100] as const;
export const queueQueryKeys = ["search", "stage", "due", "status", "dueFrom", "dueTo", "sort", "page", "pageSize"] as const;

export function buildReviewQueueQuery(params: URLSearchParams): { query: ApprovalTaskSearch; error?: never } | { error: string; query?: never }
{
    const search: ApprovalTaskSearch["search"] = [];
    const stage = params.get("stage") ?? "";
    const due = params.get("due") ?? "";
    const status = params.get("status") ?? "";
    const from = params.get("dueFrom") ?? "";
    const to = params.get("dueTo") ?? "";
    if ((stage && !["1", "2"].includes(stage)) || (due && due !== "overdue") || (status && status !== "ACTIONABLE")) return { error: "Some review filters are invalid. Reset filters to continue." };
    if ([from, to].some((value) => value && !z.iso.date().safeParse(value).success) || (from && to && from > to)) return { error: "Enter a valid due date range with start on or before end." };
    if (stage) search.push({ name: "stageNumber", condition: "EQUAL", value: stage === "1" ? 1 : 2 });
    if (due) search.push({ name: "overdue", condition: "EQUAL", value: true });
    if (status) search.push({ name: "status", condition: "EQUAL", value: "ACTIONABLE" });
    if (from) search.push({ name: "dueAt", condition: "GREATEROREQUAL", value: new Date(`${from}T00:00:00+07:00`).toISOString() });
    if (to) search.push({ name: "dueAt", condition: "LESSER", value: new Date(new Date(`${to}T00:00:00+07:00`).valueOf() + 86400000).toISOString() });
    const term = (params.get("search") ?? "").trim();
    const pageSize = Number(params.get("pageSize") ?? 20);
    if (!queuePageSizes.some((size) => size === pageSize)) return { error: "Choose 10, 20, 50 or 100 rows per page." };
    const parsed = approvalTaskSearchSchema.safeParse({
        pageNumber: Number(params.get("page") ?? 1), pageSize, search,
        orderBy: params.get("sort") ?? "dueAt asc",
        ...(term ? { searchTerm: { name: "requestNumber,title", value: term } } : {}),
    });
    return parsed.success ? { query: parsed.data } : { error: "Some review search criteria are invalid. Reset filters to continue." };
}
