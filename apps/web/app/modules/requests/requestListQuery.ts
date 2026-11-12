import { z } from "zod";
import { requestSearchSchema, type RequestSearchQuery } from "@workflow/contracts";

export const emptyRequestFilters = {
    status: "", statusCondition: "EQUAL", typeId: "", priority: "",
    createdFrom: "", createdTo: "", updatedFrom: "", updatedTo: "", submittedFrom: "", submittedTo: "",
    submitted: "", number: "", numberCondition: "CONTAINS", title: "", titleCondition: "CONTAINS",
};
export type RequestFilters = typeof emptyRequestFilters;
export const requestFilterKeys = Object.keys(emptyRequestFilters) as (keyof RequestFilters)[];
export const requestSorts = requestSearchSchema.shape.orderBy.unwrap().options;
export const pageSizes = [10, 20, 50, 100] as const;

export function readRequestFilters(params: URLSearchParams): RequestFilters
{
    const filters = { ...emptyRequestFilters };
    for (const key of requestFilterKeys)
    {
        filters[key] = params.get(key) ?? filters[key];
    }
    // Preserve links created before date ranges were introduced.
    if (params.has("updatedOn") && !params.has("updatedFrom") && !params.has("updatedTo"))
    {
        filters.updatedFrom = filters.updatedTo = params.get("updatedOn") ?? "";
    }
    return filters;
}

export function writeRequestFilters(params: URLSearchParams, filters: RequestFilters): URLSearchParams
{
    const next = new URLSearchParams(params);
    next.delete("updatedOn");
    next.delete("page");
    for (const key of requestFilterKeys)
    {
        if (filters[key] && filters[key] !== emptyRequestFilters[key]) next.set(key, filters[key]);
        else next.delete(key);
    }
    return next;
}

export function buildRequestQuery(params: URLSearchParams): { query: RequestSearchQuery; error?: never } | { error: string; query?: never }
{
    const filters = readRequestFilters(params);
    const search: unknown[] = [];
    if (filters.status) search.push({ name: "status", condition: filters.statusCondition, value: filters.status });
    if (filters.typeId) search.push({ name: "typeId", condition: "EQUAL", value: filters.typeId });
    if (filters.priority) search.push({ name: "priority", condition: "EQUAL", value: filters.priority });
    for (const [name, from, to] of [
        ["createdAt", filters.createdFrom, filters.createdTo],
        ["updatedAt", filters.updatedFrom, filters.updatedTo],
        ["submittedAt", filters.submittedFrom, filters.submittedTo],
    ])
    {
        if ([from, to].some((value) => value && !z.iso.date().safeParse(value).success)) return { error: "Enter valid calendar dates." };
        if (from && to && from > to) return { error: "Date range start must be on or before its end." };
        if (from) search.push({ name, condition: "GREATEROREQUAL", value: new Date(`${from}T00:00:00+07:00`).toISOString() });
        if (to)
        {
            const end = new Date(`${to}T00:00:00+07:00`).valueOf() + 86400000;
            search.push({ name, condition: "LESSER", value: new Date(end).toISOString() });
        }
    }
    if (filters.submitted && !["yes", "no"].includes(filters.submitted)) return { error: "Choose a valid submission filter." };
    if (filters.submitted === "no" && (filters.submittedFrom || filters.submittedTo)) return { error: "Not submitted cannot be combined with a submitted date range." };
    if (filters.submitted) search.push({ name: "submittedAt", condition: filters.submitted === "yes" ? "ISNOTNULL" : "ISNULL" });
    if (filters.number.trim()) search.push({ name: "requestNumber", condition: filters.numberCondition, value: filters.number.trim() });
    if (filters.title.trim()) search.push({ name: "title", condition: filters.titleCondition, value: filters.title.trim() });
    const pageSize = Number(params.get("pageSize") ?? 20);
    if (!pageSizes.some((size) => size === pageSize)) return { error: "Choose 10, 20, 50 or 100 rows per page." };
    const term = (params.get("search") ?? "").trim();
    const parsed = requestSearchSchema.safeParse({
        pageNumber: Number(params.get("page") ?? 1), pageSize, search,
        ...(term ? { searchTerm: { name: "requestNumber,title", value: term } } : {}),
        orderBy: params.get("sort") ?? "updatedAt desc",
    });
    return parsed.success ? { query: parsed.data } : { error: "Some search criteria are invalid. Adjust filters or clear them to continue." };
}
