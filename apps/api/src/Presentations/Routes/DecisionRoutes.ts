import { z } from "zod";
import { auditTimelineItemSchema, decisionRequestSchema, decisionResultSchema, errorResponseSchema, timelineQuerySchema } from "@workflow/contracts";
import type { DecisionService } from "../../Applications/Approvals/DecisionService";
import type { IIdentityHttpDependencies } from "../composition";
import { requireAuthentication } from "../Guards/authentication";
import { HttpError } from "../errors";

export function createDecisionOpenApi()
{
    const response = (schema: z.ZodType) => ({ description: "Success", content: { "application/json": { schema: z.toJSONSchema(schema) } } });
    const error = { description: "Error", content: { "application/json": { schema: z.toJSONSchema(errorResponseSchema) } } };
    const id = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
    return { openapi: "3.1.0", info: { title: "Decision API", version: "1.0.0" }, paths: {
        "/api/v1/approval-tasks/{id}/decisions": { post: { security: [{ bearerAuth: [] }], parameters: [id, { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", format: "uuid" } }], requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(decisionRequestSchema, { io: "input" }) } } }, responses: { "201": response(decisionResultSchema), default: error } } },
        "/api/v1/requests/{id}/timeline": { get: { security: [{ bearerAuth: [] }], parameters: [id, ...["pageNumber", "pageSize"].map((name) => ({ name, in: "query", schema: { type: "integer", minimum: 1, maximum: name === "pageSize" ? 100 : 10000 } }))], responses: { "200": { ...response(z.array(auditTimelineItemSchema)), headers: { "X-Pagination": { schema: { type: "string" } } } }, default: error } } },
    } };
}
export function registerDecisionRoutes(app: {
    route(method: "GET" | "POST", path: string, handler: (context: { request: Request; params: Record<string, string> }) => Promise<Response>, hook: { parse: "none" }): unknown;
}, identity: IIdentityHttpDependencies, service: DecisionService): void
{
    app.route("POST", "/api/v1/approval-tasks/:id/decisions", async ({ request, params }) =>
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
        if (!z.uuid().safeParse(params.id).success) throw new HttpError("NOT_FOUND");
        const key = z.uuid().safeParse(request.headers.get("Idempotency-Key"));
        if (!key.success) throw new HttpError("VALIDATION_ERROR");
        let body: unknown;
        try
{
 body = await request.json();
}
        catch
{
 throw new HttpError("BAD_REQUEST");
}
        const parsed = decisionRequestSchema.safeParse(body);
        if (!parsed.success) throw new HttpError("VALIDATION_ERROR");
        return Response.json(decisionResultSchema.parse(await service.Decide(actor, params.id!.toLowerCase(), parsed.data, key.data.toLowerCase())), { status: 201 });
    }, { parse: "none" });
    app.route("GET", "/api/v1/requests/:id/timeline", async ({ request, params }) =>
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
        if (!z.uuid().safeParse(params.id).success) throw new HttpError("NOT_FOUND");
        const query = timelineQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!query.success) throw new HttpError("VALIDATION_ERROR");
        const result = await service.Timeline(actor, params.id!.toLowerCase(), query.data);
        return Response.json(z.array(auditTimelineItemSchema).parse(result.items), { headers: { "X-Pagination": JSON.stringify(result.pagination) } });
    }, { parse: "none" });
}
