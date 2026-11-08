import { expect, test } from "vitest";
import { requestSearchSchema, requestSummarySchema } from "../src";

const id = "11111111-1111-4111-8111-111111111111";
const date = "2026-01-01T00:00:00.123456Z";

test("draft summary has exactly the public fields", () =>
{
    const summary = { id, requestNumber: null, typeId: id, typeCode: "TYPE", title: "Draft", priority: "MEDIUM", status: "DRAFT", requester: { id, displayName: "Owner", email: "owner@example.test", roles: ["REQUESTER"], isActive: true, department: null }, department: null, revisionNumber: null, currentCycleId: null, createdAt: date, updatedAt: date, submittedAt: null, version: 0 };
    expect(Object.keys(requestSummarySchema.parse(summary))).toHaveLength(15);
    expect(requestSummarySchema.safeParse({ ...summary, secret: "hidden" }).success).toBe(false);
});

test("search defaults and typed filters are strict", () =>
{
    expect(requestSearchSchema.parse({})).toEqual({ pageNumber: 1, pageSize: 20, search: [], orderBy: "updatedAt desc" });
    expect(requestSearchSchema.parse({ search: [{ name: "submittedAt", condition: "GREATER", value: date }, { name: "submittedAt", condition: "ISNULL" }, { name: "title", condition: "CONTAINS", value: " title " }] }).search[2]).toMatchObject({ value: "title" });
    for (const query of [
        { search: [{ name: "requesterId", condition: "EQUAL", value: id }] },
        { search: [{ name: "createdAt", condition: "EQUAL", value: date }] },
        { search: [{ name: "createdAt", condition: "ISNULL" }] },
        { search: [{ name: "submittedAt", condition: "ISNULL", value: date }] },
        { search: [{ name: "submittedAt", condition: "LESSER", value: "2026-02-30T00:00:00Z" }] },
        { search: [{ name: "title", condition: "EQUAL", value: "  " }] },
        { search: [{ name: "title", condition: "EQUAL", value: "😀".repeat(201) }] },
        { search: [{ name: "requestNumber", condition: "EQUAL", value: "😀".repeat(101) }] },
        { searchTerm: { name: "title", value: "😀".repeat(101) } },
        { pageSize: 101 }, { orderBy: "id desc" },
    ]) expect(requestSearchSchema.safeParse(query).success).toBe(false);
    expect(requestSearchSchema.safeParse({ search: [{ name: "title", condition: "EQUAL", value: "😀".repeat(200) }] }).success).toBe(true);
});
