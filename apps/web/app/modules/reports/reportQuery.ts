import { z } from "zod";
import { reportSearchSchema, type ReportSearch } from "@workflow/contracts";

export const emptyReportFilters = { status: "", statusCondition: "EQUAL", typeId: "", departmentId: "", createdFrom: "", createdTo: "" };
export type ReportFilters = typeof emptyReportFilters;
export function readReportFilters(params: URLSearchParams): ReportFilters
{
    const result = { ...emptyReportFilters };
    for (const key of Object.keys(result) as (keyof ReportFilters)[]) result[key] = params.get(key) ?? result[key];
    return result;
}
export function writeReportFilters(params: URLSearchParams, filters: ReportFilters): URLSearchParams
{
    const next = new URLSearchParams(params);
    for (const key of Object.keys(filters) as (keyof ReportFilters)[])
    {
        if (filters[key] && filters[key] !== emptyReportFilters[key]) next.set(key, filters[key]); else next.delete(key);
    }
    next.delete("page");
    return next;
}
export function buildReportQuery(params: URLSearchParams): { query: ReportSearch; error?: never } | { query?: never; error: string }
{
    const f = readReportFilters(params);
    for (const date of [f.createdFrom, f.createdTo]) if (date && !z.iso.date().safeParse(date).success) return { error: "Enter valid calendar dates." };
    if (f.createdFrom && f.createdTo && f.createdFrom > f.createdTo) return { error: "Start date must be on or before end date." };
    const search: unknown[] = [];
    if (f.status) search.push({ name: "status", condition: f.statusCondition, value: f.status });
    if (f.typeId) search.push({ name: "typeId", condition: "EQUAL", value: f.typeId });
    if (f.departmentId) search.push(f.departmentId === "ISNULL" || f.departmentId === "ISNOTNULL" ? { name: "departmentId", condition: f.departmentId } : { name: "departmentId", condition: "EQUAL", value: f.departmentId });
    if (f.createdFrom) search.push({ name: "createdAt", condition: "GREATEROREQUAL", value: new Date(`${f.createdFrom}T00:00:00+07:00`).toISOString() });
    if (f.createdTo) search.push({ name: "createdAt", condition: "LESSER", value: new Date(new Date(`${f.createdTo}T00:00:00+07:00`).valueOf() + 86400000).toISOString() });
    const term = (params.get("search") ?? "").trim();
    const parsed = reportSearchSchema.safeParse({ dimension: params.get("dimension") ?? "STATUS", pageNumber: Number(params.get("page") ?? 1), pageSize: Number(params.get("pageSize") ?? 20), orderBy: params.get("sort") ?? "key asc", search, ...(term ? { searchTerm: { name: "label", value: term } } : {}) });
    return parsed.success ? { query: parsed.data } : { error: "Some report criteria are invalid. Adjust or clear them to continue." };
}
