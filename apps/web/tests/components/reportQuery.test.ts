import { describe, expect, it } from "vitest";
import { buildReportQuery, readReportFilters, writeReportFilters } from "../../app/modules/reports/reportQuery";

describe("report URL query", () =>
{
    it("uses inclusive Bangkok calendar days and preserves pagination and sort", () =>
    {
        const result = buildReportQuery(new URLSearchParams("createdFrom=2026-01-01&createdTo=2026-01-02&page=2&sort=count+desc"));
        expect(result.query?.search).toEqual([{ name: "createdAt", condition: "GREATEROREQUAL", value: "2025-12-31T17:00:00.000Z" }, { name: "createdAt", condition: "LESSER", value: "2026-01-02T17:00:00.000Z" }]);
        expect(result.query).toMatchObject({ pageNumber: 2, orderBy: "count desc" });
    });
    it("rejects invalid and reversed dates and invalid page", () =>
    {
        for (const query of ["createdFrom=2026-02-30", "createdFrom=2026-02-02&createdTo=2026-02-01", "page=10001"]) expect(buildReportQuery(new URLSearchParams(query)).error).toBeTruthy();
    });
    it("resets the page when committing filters and round trips browser URL state", () =>
    {
        const original = new URLSearchParams("dimension=TYPE&page=4&status=PENDING");
        const next = writeReportFilters(original, { ...readReportFilters(original), status: "APPROVED" });
        expect(next.toString()).toBe("dimension=TYPE&status=APPROVED");
        expect(readReportFilters(original).status).toBe("PENDING");
        expect(readReportFilters(next).status).toBe("APPROVED");
    });
});
