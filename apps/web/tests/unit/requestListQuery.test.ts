import { expect, test } from "vitest";
import { buildRequestQuery, emptyRequestFilters, readRequestFilters, writeRequestFilters } from "../../app/modules/requests/requestListQuery";

test("advanced criteria map to existing typed transport and inclusive Bangkok dates", () =>
{
    const params = new URLSearchParams({ status: "RETURNED", statusCondition: "NOTEQUAL", priority: "HIGH", typeId: "11111111-1111-4111-8111-111111111111", createdFrom: "2026-11-01", createdTo: "2026-11-02", submitted: "yes", title: " travel ", titleCondition: "STARTWITH", number: "REQ-1", numberCondition: "EQUAL", search: " equipment ", sort: "title asc", page: "3", pageSize: "50" });
    expect(buildRequestQuery(params).query).toEqual({ pageNumber: 3, pageSize: 50, orderBy: "title asc", searchTerm: { name: "requestNumber,title", value: "equipment" }, search: [
        { name: "status", condition: "NOTEQUAL", value: "RETURNED" },
        { name: "typeId", condition: "EQUAL", value: "11111111-1111-4111-8111-111111111111" },
        { name: "priority", condition: "EQUAL", value: "HIGH" },
        { name: "createdAt", condition: "GREATEROREQUAL", value: "2026-10-31T17:00:00.000Z" },
        { name: "createdAt", condition: "LESSER", value: "2026-11-02T17:00:00.000Z" },
        { name: "submittedAt", condition: "ISNOTNULL" },
        { name: "requestNumber", condition: "EQUAL", value: "REQ-1" },
        { name: "title", condition: "STARTWITH", value: "travel" },
    ] });
    const written = writeRequestFilters(params, readRequestFilters(params));
    expect(written.has("page")).toBe(false);
    expect(written.get("sort")).toBe("title asc");
    expect(readRequestFilters(written)).toEqual(readRequestFilters(params));
});

test.each([
    "createdFrom=2026-02-30", "updatedFrom=2026-11-02&updatedTo=2026-11-01",
    "status=PENDING&statusCondition=IN", "priority=CRITICAL", "typeId=foreign", "submitted=perhaps",
    "submitted=no&submittedFrom=2026-11-01", "title=sample&titleCondition=ENDWITH",
    "page=0", "page=10001", "pageSize=101", "pageSize=25", "sort=requesterId+desc",
    `search=${"x".repeat(101)}`,
])("invalid URL cannot fall back to unfiltered search: %s", (value) =>
{
    const result = buildRequestQuery(new URLSearchParams(value));
    expect(result.error).toBeTruthy();
    expect(result.query).toBeUndefined();
});

test("legacy updatedOn remains a Bangkok day and clearing removes both bounds", () =>
{
    const params = new URLSearchParams("updatedOn=2026-11-01&page=2&sort=title+asc");
    expect(buildRequestQuery(params).query?.search).toEqual([
        { name: "updatedAt", condition: "GREATEROREQUAL", value: "2026-10-31T17:00:00.000Z" },
        { name: "updatedAt", condition: "LESSER", value: "2026-11-01T17:00:00.000Z" },
    ]);
    const next = writeRequestFilters(params, { ...emptyRequestFilters });
    expect(next.toString()).toBe("sort=title+asc");
    expect(buildRequestQuery(next).query?.search).toEqual([]);
});

test("filter validation identifies the specific range and related controls", () =>
{
    expect(buildRequestQuery(new URLSearchParams("createdFrom=2026-11-10&createdTo=2026-11-01"))).toEqual({ error: "Created date range: start must be on or before its end.", fields: ["createdFrom", "createdTo"] });
    expect(buildRequestQuery(new URLSearchParams("updatedTo=2026-02-30"))).toEqual({ error: "Updated: enter valid calendar dates.", fields: ["updatedTo"] });
    expect(buildRequestQuery(new URLSearchParams("submitted=no&submittedFrom=2026-11-01"))).toEqual({ error: "Not submitted cannot be combined with a submitted date range.", fields: ["submitted", "submittedFrom", "submittedTo"] });
});
