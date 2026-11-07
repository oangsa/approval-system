import { z } from "zod";
import { prioritySchema, requestStatusSchema } from "./requests";
import { paginationSchema } from "./requestSearch";

const text = (max: number) => z.string().trim().min(1).refine((value) => [...value].length <= max);
const filterSchema = z.union([
    z.strictObject({ name: z.literal("status"), condition: z.enum(["EQUAL", "NOTEQUAL"]), value: requestStatusSchema }),
    z.strictObject({ name: z.literal("typeId"), condition: z.literal("EQUAL"), value: z.uuid() }),
    z.strictObject({ name: z.literal("priority"), condition: z.literal("EQUAL"), value: prioritySchema }),
    z.strictObject({ name: z.enum(["createdAt", "updatedAt", "submittedAt"]), condition: z.enum(["GREATER", "LESSER", "GREATEROREQUAL", "LESSEROREQUAL"]), value: z.iso.datetime() }),
    z.strictObject({ name: z.literal("submittedAt"), condition: z.enum(["ISNULL", "ISNOTNULL"]) }),
    z.strictObject({ name: z.literal("requestNumber"), condition: z.enum(["EQUAL", "CONTAINS", "STARTWITH"]), value: text(100) }),
    z.strictObject({ name: z.literal("title"), condition: z.enum(["EQUAL", "CONTAINS", "STARTWITH"]), value: text(200) }),
]);
export const requestSearchSchema = z.strictObject({
    pageNumber: z.number().int().min(1).max(10000).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
    search: z.array(filterSchema).max(20).default([]),
    searchTerm: z.strictObject({ name: z.enum(["requestNumber", "title", "requestNumber,title", "title,requestNumber"]), value: text(100) }).optional(),
    orderBy: z.enum(["updatedAt asc", "updatedAt desc", "createdAt asc", "createdAt desc", "submittedAt asc", "submittedAt desc", "requestNumber asc", "requestNumber desc", "title asc", "title desc"]).default("updatedAt desc"),
});
export type RequestSearchQuery = z.infer<typeof requestSearchSchema>;
export interface IPageResult<T> { items: T[]; pagination: z.infer<typeof paginationSchema>; }
