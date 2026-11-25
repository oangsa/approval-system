import { z } from "zod";
import { requestStatusSchema } from "./requests";

export const reportDimensionSchema = z.enum(["STATUS", "TYPE", "DEPARTMENT", "OUTCOME"]);
const filterSchema = z.union([
    z.strictObject({ name: z.literal("status"), condition: z.enum(["EQUAL", "NOTEQUAL"]), value: requestStatusSchema }),
    z.strictObject({ name: z.enum(["typeId", "departmentId"]), condition: z.literal("EQUAL"), value: z.uuid() }),
    z.strictObject({ name: z.literal("departmentId"), condition: z.enum(["ISNULL", "ISNOTNULL"]) }),
    z.strictObject({ name: z.literal("createdAt"), condition: z.enum(["GREATEROREQUAL", "LESSER"]), value: z.iso.datetime() }),
]);
export const reportSearchSchema = z.strictObject({
    dimension: reportDimensionSchema.default("STATUS"),
    pageNumber: z.number().int().min(1).max(10000).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
    search: z.array(filterSchema).max(20).default([]),
    searchTerm: z.strictObject({ name: z.literal("label"), value: z.string().trim().min(1).refine((value) => [...value].length <= 200) }).optional(),
    orderBy: z.enum(["key asc", "key desc", "label asc", "label desc", "count asc", "count desc"]).default("key asc"),
}).superRefine((query, context) =>
{
    const bounds = query.search.filter((filter) => filter.name === "createdAt");
    for (const lower of bounds.filter((filter) => filter.condition === "GREATEROREQUAL"))
    {
        for (const upper of bounds.filter((filter) => filter.condition === "LESSER"))
        {
            const [lowerTime = "", lowerFraction = ""] = lower.value.slice(0, -1).split(".");
            const [upperTime = "", upperFraction = ""] = upper.value.slice(0, -1).split(".");
            const width = Math.max(lowerFraction.length, upperFraction.length);
            if (`${lowerTime.padEnd(19, ":00")}.${lowerFraction.padEnd(width, "0")}` > `${upperTime.padEnd(19, ":00")}.${upperFraction.padEnd(width, "0")}`)
            {
                context.addIssue({ code: "custom", path: ["search"], message: "Created date range is reversed" });
                return;
            }
        }
    }
});
const rowFields = { label: z.string().min(1), count: z.number().int().positive() };
export const reportAggregateRowSchema = z.discriminatedUnion("dimension", [
    z.strictObject({ dimension: z.literal("STATUS"), key: requestStatusSchema, ...rowFields }),
    z.strictObject({ dimension: z.literal("OUTCOME"), key: z.enum(["APPROVED", "REJECTED", "WITHDRAWN"]), ...rowFields }),
    z.strictObject({ dimension: z.literal("TYPE"), key: z.uuid(), ...rowFields }),
    z.strictObject({ dimension: z.literal("DEPARTMENT"), key: z.union([z.uuid(), z.literal("UNASSIGNED")]), ...rowFields }).refine((row) => row.key !== "UNASSIGNED" || row.label === "No department"),
]);
export type ReportDimension = z.infer<typeof reportDimensionSchema>;
export type ReportSearch = z.infer<typeof reportSearchSchema>;
export type ReportAggregateRow = z.infer<typeof reportAggregateRowSchema>;
