import { z } from "zod";

export const requestTypeSearchSchema = z.strictObject({
    pageNumber: z.number().int().min(1).max(10000).default(1), pageSize: z.number().int().min(1).max(100).default(20),
    search: z.array(z.strictObject({ name: z.enum(["code", "isEnabled"]), condition: z.literal("EQUAL"), value: z.union([z.string().max(100), z.boolean()]) }).refine((filter) => filter.name === "isEnabled" ? typeof filter.value === "boolean" : typeof filter.value === "string")).max(10).default([]),
    searchTerm: z.strictObject({ name: z.enum(["code", "name", "code,name"]), value: z.string().max(100) }).optional(),
    orderBy: z.enum(["code asc", "code desc", "name asc", "name desc"]).default("code asc"),
});
export type RequestTypeSearch = z.infer<typeof requestTypeSearchSchema>;
export interface IRequestTypeSearchResult
{
    items: import("./requests").PublishedRequestType[];
    pagination: { currentPage: number; pageSize: number; totalPages: number; totalCount: number; hasPrevious: boolean; hasNext: boolean };
}
