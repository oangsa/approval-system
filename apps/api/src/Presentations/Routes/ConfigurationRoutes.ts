import { z } from "zod";
import { approvalPolicySchema, assignmentRuleSchema, budgetPolicySchema, configurationSearchSchema, createApprovalPolicySchema, createAssignmentRuleSchema, createBudgetPolicySchema, departmentSummarySchema, eligibleReviewerSchema, errorResponseSchema, patchApprovalPolicySchema, patchAssignmentRuleSchema, patchBudgetPolicySchema, policyActionSchema, type ConfigurationKind } from "@workflow/contracts";
import type { ConfigurationService } from "../../Applications/Policies/ConfigurationService";
import { RequestError } from "../../Domains/Requests/RequestRules";
import type { IIdentityHttpDependencies } from "../composition";
import { requireAuthentication } from "../Guards/authentication";
import { HttpError } from "../errors";

const base = "/api/v1/admin";
const routes = [
    ["POST", `${base}/approval-policies`, createApprovalPolicySchema, approvalPolicySchema, "createPolicy"],
    ["PATCH", `${base}/approval-policies/:id/draft`, patchApprovalPolicySchema, approvalPolicySchema, "patch"],
    ["POST", `${base}/approval-policies/:id/draft`, policyActionSchema, approvalPolicySchema, "branch"],
    ["POST", `${base}/approval-policies/:id/publish`, policyActionSchema, approvalPolicySchema, "publish"],
    ["POST", `${base}/approval-policies/:id/disable`, policyActionSchema, approvalPolicySchema, "disable"],
    ["POST", `${base}/reviewer-assignments`, createAssignmentRuleSchema, assignmentRuleSchema, "createAssignment"],
    ["PATCH", `${base}/reviewer-assignments/:id`, patchAssignmentRuleSchema, assignmentRuleSchema, "patchAssignment"],
    ["POST", `${base}/budget-policies`, createBudgetPolicySchema, budgetPolicySchema, "createBudget"],
    ["PATCH", `${base}/budget-policies/:id`, patchBudgetPolicySchema, budgetPolicySchema, "patchBudget"],
] as const;
const searches = [
    [`${base}/approval-policies/search`, "approval-policies", approvalPolicySchema],
    [`${base}/reviewer-assignments/search`, "reviewer-assignments", assignmentRuleSchema],
    [`${base}/budget-policies/search`, "budget-policies", budgetPolicySchema],
    ["/api/v1/reviewers/eligible/search", "reviewers", eligibleReviewerSchema],
    ["/api/v1/departments/search", "departments", departmentSummarySchema],
] as const;
function parse<T>(schema: z.ZodType<T>, value: unknown): T
{
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new RequestError("VALIDATION_ERROR", parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || "body", code: "VALIDATION_ERROR", message: issue.message })));
    return parsed.data;
}
export function createConfigurationOpenApi()
{
    const paths: Record<string, Record<string, unknown>> = {};
    for (const [method, path, body, response, action] of routes)
    {
        const name = path.replace(":id", "{id}");
        paths[name] ??= {};
        paths[name]![method.toLowerCase()] = {
            security: [{ bearerAuth: [] }],
            parameters: [...(path.includes(":id") ? [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }] : []), ...(action === "publish" ? [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", format: "uuid" } }] : [])],
            requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(body, { io: "input", unrepresentable: "any" }) } } },
            responses: { [action.startsWith("create") || action === "branch" || action === "publish" ? "201" : "200"]: { description: "Success", content: { "application/json": { schema: z.toJSONSchema(response, { io: "input", unrepresentable: "any" }) } } }, default: { description: "Error", content: { "application/json": { schema: z.toJSONSchema(errorResponseSchema) } } } },
        };
    }
    for (const [path, kind, schema] of searches)
    {
        paths[path] = { post: { security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(configurationSearchSchema(kind), { io: "input", unrepresentable: "any" }) } } }, responses: { "200": { description: "Paged configuration metadata", headers: { "X-Pagination": { schema: { type: "string" } } }, content: { "application/json": { schema: z.toJSONSchema(z.array(schema), { io: "input", unrepresentable: "any" }) } } } } } };
    }
    return { openapi: "3.1.0", info: { title: "Policy configuration API", version: "1.0.0" }, paths, components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } } };
}
export function registerConfigurationRoutes(app: { route(method: "POST" | "PATCH", path: string, handler: (context: { request: Request; params: Record<string, string> }) => Promise<Response>, hook: { parse: "none" }): unknown }, identity: IIdentityHttpDependencies, service: ConfigurationService): void
{
    async function actorAndBody(request: Request)
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
        if (!actor.roles.includes("ADMINISTRATOR")) throw new HttpError("FORBIDDEN");
        let body: unknown;
        try
        {
            body = await request.json();
        }
        catch
        {
            throw new HttpError("BAD_REQUEST");
        }
        return { actor, body };
    }
    for (const [method, path, schema, response, action] of routes)
    {
        app.route(method, path, async ({ request, params = {} }) =>
        {
            const { actor, body } = await actorAndBody(request);
            if (params.id && !z.uuid().safeParse(params.id).success) throw new HttpError("NOT_FOUND");
            parse(schema as z.ZodType, body);
            const suppliedKey = request.headers.get("idempotency-key");
            if ((action === "publish" || suppliedKey !== null) && !z.uuid().safeParse(suppliedKey).success) throw new HttpError("VALIDATION_ERROR");
            let result: unknown;
            if (action === "createPolicy") result = await service.CreatePolicy(actor, parse(createApprovalPolicySchema, body));
            else if (action === "createAssignment" || action === "patchAssignment") result = await service.Assignment(actor, params.id ?? null, action === "createAssignment" ? parse(createAssignmentRuleSchema, body) : parse(patchAssignmentRuleSchema, body));
            else if (action === "createBudget" || action === "patchBudget") result = await service.Budget(actor, params.id ?? null, action === "createBudget" ? parse(createBudgetPolicySchema, body) : parse(patchBudgetPolicySchema, body));
            else result = await service.PolicyAction(actor, params.id!, action, parse(patchApprovalPolicySchema, body), suppliedKey?.toLowerCase());
            return Response.json(response.parse(result), { status: action.startsWith("create") || action === "publish" || action === "branch" ? 201 : 200 });
        }, { parse: "none" });
    }
    for (const [path, kind] of searches)
    {
        app.route("POST", path, async ({ request }) =>
        {
            const { actor, body } = await actorAndBody(request);
            const page = await service.Search(actor, kind as ConfigurationKind, parse(configurationSearchSchema(kind), body));
            return Response.json(page.items, { headers: { "X-Pagination": JSON.stringify(page.pagination) } });
        }, { parse: "none" });
    }
}
