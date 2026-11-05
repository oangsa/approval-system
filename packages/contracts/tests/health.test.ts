import { expect, expectTypeOf, test } from "vitest";
import { healthResponseSchema, type HealthResponse } from "@workflow/contracts";

test("package export validates the infrastructure health response", () =>
{
    expect(healthResponseSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
    expectTypeOf<HealthResponse>().toEqualTypeOf<{ status: "ok" }>();
});

test.each([undefined, null, {}, { status: "invalid" }, { status: 1 }])("invalid response %j is rejected", (response) =>
{
    expect(healthResponseSchema.safeParse(response).success).toBe(false);
});
