import { z } from "zod";
import { approvalTaskSchema, approvalTaskSearchSchema, errorResponseSchema } from "@workflow/contracts";
import type { ApprovalTaskService } from "../../Applications/Approvals/ApprovalTaskService";
import type { IIdentityHttpDependencies } from "../composition";
import { requireAuthentication } from "../Guards/authentication";
import { HttpError } from "../errors";

export function createApprovalTaskOpenApi()
{
    const response = (schema: z.ZodType) => ({ description: "Success", content: { "application/json": { schema: z.toJSONSchema(schema) } } });
    const error = { description: "Error", content: { "application/json": { schema: z.toJSONSchema(errorResponseSchema) } } };
    return { openapi: "3.1.0", info: { title: "Approval tasks API", version: "1.0.0" }, paths: {
        "/api/v1/approval-tasks/search": { post: { security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(approvalTaskSearchSchema, { io: "input" }) } } }, responses: { "200": { ...response(z.array(approvalTaskSchema)), headers: { "X-Pagination": { schema: { type: "string" } } } }, default: error } } },
        "/api/v1/approval-tasks/{id}": { get: { security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": response(approvalTaskSchema), default: error } } },
    }, components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } } };
}
export function registerApprovalTaskRoutes(app: {
    route(method: "GET" | "POST", path: string, handler: (context: { request: Request; params: Record<string, string> }) => Promise<Response>, hook: { parse: "none" }): unknown;
}, identity: IIdentityHttpDependencies, service: ApprovalTaskService): void
{
    app.route("POST", "/api/v1/approval-tasks/search", async ({ request }) =>
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
        let body: unknown;
        try
        {
            body = await request.json();
        }
        catch
        {
            throw new HttpError("BAD_REQUEST");
        }
        const query = approvalTaskSearchSchema.safeParse(body);
        if (!query.success) throw new HttpError("VALIDATION_ERROR");
        const result = await service.Search(actor, query.data);
        return Response.json(z.array(approvalTaskSchema).parse(result.items), { headers: { "X-Pagination": JSON.stringify(result.pagination) } });
    }, { parse: "none" });
    app.route("GET", "/api/v1/approval-tasks/:id", async ({ request, params }) =>
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
        if (!z.uuid().safeParse(params.id).success) throw new HttpError("NOT_FOUND");
        return Response.json(approvalTaskSchema.parse(await service.Read(actor, params.id!)));
    }, { parse: "none" });
}
