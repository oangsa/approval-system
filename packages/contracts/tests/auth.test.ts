import { expect, test } from "vitest";
import { departmentSummarySchema, errorResponseSchema, loginRequestSchema, loginResponseSchema, messageResponseSchema, refreshResponseSchema, userRoleSchema, userSummarySchema } from "@workflow/contracts";

const id = "7bb91ef4-5982-405f-8bd5-61b5c3cf410b";
const department = { id, code: "OPS", name: "Operations", isActive: true };
const user = { id, displayName: "Test User", email: "test@example.test", roles: ["REQUESTER", "REVIEWER", "ADMINISTRATOR"], isActive: true, department };

test("identity contracts serialize frozen shapes and roles", () =>
{
    expect(loginRequestSchema.parse({ email: "  TEST@example.test ", password: " a " })).toEqual({ email: "test@example.test", password: " a " });
    expect(loginResponseSchema.parse(JSON.parse(JSON.stringify({ accessToken: "token", user })))).toEqual({ accessToken: "token", user });
    expect(userSummarySchema.parse({ ...user, department: null }).department).toBeNull();
    expect(departmentSummarySchema.parse(department)).toEqual(department);
    expect(refreshResponseSchema.parse({ accessToken: "token" })).toEqual({ accessToken: "token" });
    expect(messageResponseSchema.parse({ message: "ok" })).toEqual({ message: "ok" });
    expect(errorResponseSchema.parse({ statusCode: 422, code: "VALIDATION_ERROR", message: "Invalid", error: "Unprocessable Entity", requestId: id, details: [{ field: "email", code: "INVALID", message: "Invalid" }] }).details).toHaveLength(1);
    for (const role of user.roles) expect(userRoleSchema.safeParse(role).success).toBe(true);
});

test("identity schemas reject invalid and secret fields", () =>
{
    for (const value of [ { ...user, id: "bad" }, { ...user, email: "bad" }, { ...user, roles: [] }, { ...user, roles: ["REQUESTER", "REQUESTER"] }, { ...user, roles: ["OWNER"] }, { ...user, department: undefined }, { ...user, passwordHash: "secret" }, { ...user, department: { ...department, secret: "secret" } } ])
        expect(userSummarySchema.safeParse(value).success).toBe(false);
    for (const value of [ { email: "bad", password: "x" }, { email: "a@example.test", password: "" }, { email: "a@example.test", password: "x", role: "ADMINISTRATOR" }, { email: "a@example.test", password: "x", userId: id } ])
        expect(loginRequestSchema.safeParse(value).success).toBe(false);
    expect(errorResponseSchema.safeParse({ statusCode: 401, code: "X", message: "x", error: "Unauthorized", requestId: "bad" }).success).toBe(false);
    expect(loginResponseSchema.safeParse({ accessToken: "token", user, refreshToken: "secret" }).success).toBe(false);
});
