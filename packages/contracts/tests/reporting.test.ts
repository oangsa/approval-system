import { expect, test } from "vitest";
import { reportAggregateRowSchema, reportSearchSchema } from "../src";

const id = "11111111-1111-4111-8111-111111111111";
test("report search defaults and validates its filter boundary", () =>
{
    expect(reportSearchSchema.parse({})).toEqual({ dimension: "STATUS", pageNumber: 1, pageSize: 20, search: [], orderBy: "key asc" });
    expect(reportSearchSchema.safeParse({ dimension: "DEPARTMENT", search: [{ name: "departmentId", condition: "ISNULL" }, { name: "typeId", condition: "EQUAL", value: id }, { name: "status", condition: "NOTEQUAL", value: "DRAFT" }, { name: "createdAt", condition: "GREATEROREQUAL", value: "2026-01-01T00:00:00.000001Z" }, { name: "createdAt", condition: "LESSER", value: "2026-01-01T00:00:00.000002Z" }], searchTerm: { name: "label", value: " Test " } }).success).toBe(true);
    for (const query of [
        { search: [{ name: "requesterId", condition: "EQUAL", value: id }] },
        { search: [{ name: "departmentId", condition: "ISNULL", value: id }] },
        { search: [{ name: "typeId", condition: "EQUAL", value: "bad" }] },
        { search: [{ name: "status", condition: "EQUAL", value: "UNKNOWN" }] },
        { search: [{ name: "createdAt", condition: "GREATER", value: "2026-01-01T00:00:00Z" }] },
        { search: [{ name: "createdAt", condition: "LESSER", value: "2026-01-01T00:00:00+07:00" }] },
        { search: [{ name: "createdAt", condition: "GREATEROREQUAL", value: "2026-01-01T00:00:00.000002Z" }, { name: "createdAt", condition: "LESSER", value: "2026-01-01T00:00:00.000001Z" }] },
        { search: Array(21).fill({ name: "departmentId", condition: "ISNULL" }) },
        { searchTerm: { name: "label", value: " " } }, { searchTerm: { name: "label", value: "😀".repeat(201) } },
        { pageNumber: 0 }, { pageNumber: 10001 }, { pageSize: 101 }, { pageSize: 1.5 }, { orderBy: "key ASC" }, { requesterId: id },
    ]) expect(reportSearchSchema.safeParse(query).success).toBe(false);
});
test("aggregate rows reject invalid counts and unknown fields", () =>
{
    const row = { dimension: "STATUS", key: "DRAFT", label: "Draft", count: 1 };
    expect(reportAggregateRowSchema.safeParse(row).success).toBe(true);
    for (const invalid of [{ ...row, count: 0 }, { ...row, count: 1.5 }, { ...row, private: true }, { ...row, key: "UNKNOWN" }, { ...row, dimension: "OUTCOME", key: "PENDING" }, { ...row, dimension: "TYPE", key: "bad" }, { ...row, dimension: "DEPARTMENT", key: "UNASSIGNED" }]) expect(reportAggregateRowSchema.safeParse(invalid).success).toBe(false);
});

test.each([
    ["2026-01-01T00:00Z", "2026-01-01T00:00:00Z"],
    ["2026-01-01T00:00Z", "2026-01-01T00:00:00.000000Z"],
    ["2026-01-01T00:00:00Z", "2026-01-01T00:00:00.000000Z"],
    ["2026-01-01T00:00:00.1Z", "2026-01-01T00:00:00.100000Z"],
])("accepts equivalent report bounds in both directions", (first, second) =>
{
    for (const [lower, upper] of [[first, second], [second, first]])
    {
        const search = [{ name: "createdAt", condition: "GREATEROREQUAL", value: lower }, { name: "createdAt", condition: "LESSER", value: upper }];
        expect(reportSearchSchema.parse({ search }).search).toEqual(search);
    }
});

test.each([
    ["2026-01-01T00:00:00.000001Z", "2026-01-01T00:00:00.000002Z"],
    ["2026-01-01T00:00:00.000000001Z", "2026-01-01T00:00:00.000000002Z"],
])("orders precise report bounds and rejects reversed bounds", (lower, upper) =>
{
    const search = [{ name: "createdAt", condition: "GREATEROREQUAL", value: lower }, { name: "createdAt", condition: "LESSER", value: upper }];
    expect(reportSearchSchema.parse({ search }).search).toEqual(search);
    const reversed = reportSearchSchema.safeParse({ search: [{ ...search[0], value: upper }, { ...search[1], value: lower }] });
    expect(reversed.success).toBe(false);
    if (!reversed.success) expect(reversed.error.issues).toContainEqual(expect.objectContaining({ path: ["search"], message: "Created date range is reversed" }));
});
