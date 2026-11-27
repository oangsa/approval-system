import { z } from "zod";
import type { AdminRequestTypeSummary, PublishedRequestType } from "./requestTypes";

export const requestTypeSearchSchema = z.strictObject({
    pageNumber: z.number().int().min(1).max(10000).default(1), pageSize: z.number().int().min(1).max(100).default(20),
    search: z.array(z.strictObject({ name: z.enum(["code", "isEnabled"]), condition: z.literal("EQUAL"), value: z.union([z.string().max(100), z.boolean()]) }).refine((filter) => filter.name === "isEnabled" ? typeof filter.value === "boolean" : typeof filter.value === "string")).max(10).default([]),
    searchTerm: z.strictObject({ name: z.enum(["code", "name", "code,name"]), value: z.string().max(100) }).optional(),
    orderBy: z.enum(["code asc", "code desc", "name asc", "name desc"]).default("code asc"),
});
export type RequestTypeSearch = z.infer<typeof requestTypeSearchSchema>;

const adminRequestTypeFilterSchema = z.union([
    z.strictObject({ name: z.literal("code"), condition: z.enum(["EQUAL", "CONTAINS", "STARTWITH"]), value: z.string().trim().min(1).max(100) }),
    z.strictObject({ name: z.enum(["isEnabled", "hasDraft", "isPublished"]), condition: z.literal("EQUAL"), value: z.boolean() }),
]);

export const adminRequestTypeSearchSchema = z.strictObject({
    pageNumber: z.number().int().min(1).max(10000).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
    search: z.array(adminRequestTypeFilterSchema).max(10).default([]),
    searchTerm: z.strictObject({ name: z.enum(["code", "name", "code,name"]), value: z.string().trim().min(1).max(100) }).optional(),
    orderBy: z.enum(["code asc", "code desc", "name asc", "name desc", "updatedAt asc", "updatedAt desc"]).default("code asc"),
});
export type AdminRequestTypeSearch = z.infer<typeof adminRequestTypeSearchSchema>;

export const paginationSchema = z.strictObject({
    currentPage: z.number().int().positive(), pageSize: z.number().int().positive(), totalPages: z.number().int().nonnegative(), totalCount: z.number().int().nonnegative(), hasPrevious: z.boolean(), hasNext: z.boolean(),
});
export interface IRequestTypeSearchResult
{
    items: PublishedRequestType[];
    pagination: z.infer<typeof paginationSchema>;
}
export interface IAdminRequestTypeSearchResult
{
    items: AdminRequestTypeSummary[];
    pagination: z.infer<typeof paginationSchema>;
}
