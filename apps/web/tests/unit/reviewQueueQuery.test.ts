import { expect, test } from "vitest";
import { buildReviewQueueQuery } from "../../app/modules/reviews/reviewQueueQuery";

test("queue URL restores bounded pages, status and Bangkok inclusive dates", () =>
{
    const result = buildReviewQueueQuery(new URLSearchParams("stage=2&status=ACTIONABLE&dueFrom=2026-11-01&dueTo=2026-11-02&pageSize=50&page=3&sort=dueAt+desc"));
    expect(result.query).toMatchObject({ pageNumber: 3, pageSize: 50, orderBy: "dueAt desc", search: [
        { name: "stageNumber", condition: "EQUAL", value: 2 },
        { name: "status", condition: "EQUAL", value: "ACTIONABLE" },
        { name: "dueAt", condition: "GREATEROREQUAL", value: "2026-10-31T17:00:00.000Z" },
        { name: "dueAt", condition: "LESSER", value: "2026-11-02T17:00:00.000Z" },
    ] });
});

test.each(["stage=3", "status=WAITING", "due=anything", "dueFrom=2026-02-30", "dueFrom=2026-12-01&dueTo=2026-11-30", "page=0", "pageSize=999", "sort=private.desc", `search=${"x".repeat(101)}`])("invalid queue URL never falls back to an unrestricted query: %s", (input) =>
{
    expect(buildReviewQueueQuery(new URLSearchParams(input))).toEqual({ error: expect.any(String) });
});
