import { z } from "zod";
import { dashboardSchema, errorResponseSchema, reportAggregateRowSchema, reportSearchSchema } from "@workflow/contracts";
import type { ReportingService } from "../../Applications/Reporting/ReportingService";
import type { IIdentityHttpDependencies } from "../composition";
import { requireAuthentication } from "../Guards/authentication";
import { HttpError } from "../errors";

export function createReportingOpenApi()
{
    const response = (schema: z.ZodType) => ({ description: "Success", content: { "application/json": { schema: z.toJSONSchema(schema) } } });
    const error = { description: "Error", content: { "application/json": { schema: z.toJSONSchema(errorResponseSchema) } } };
    return { openapi: "3.1.0", info: { title: "Reporting API", version: "1.0.0" }, paths: {
        "/api/v1/dashboard": { get: { security: [{ bearerAuth: [] }], responses: { "200": response(dashboardSchema), default: error } } },
        "/api/v1/reports/requests/search": { post: { security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(reportSearchSchema, { io: "input" }) } } }, responses: { "200": { ...response(z.array(reportAggregateRowSchema)), headers: { "X-Pagination": { schema: { type: "string" } } } }, default: error } } },
    }, components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } } };
}
export function registerReportingRoutes(app: {
    route(method: "GET" | "POST", path: string, handler: (context: { request: Request }) => Promise<Response>, hook: { parse: "none" }): unknown;
}, identity: IIdentityHttpDependencies, service: ReportingService): void
{
    app.route("GET", "/api/v1/dashboard", async ({ request }) =>
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
        return Response.json(dashboardSchema.parse(await service.Dashboard(actor)));
    }, { parse: "none" });
    app.route("POST", "/api/v1/reports/requests/search", async ({ request }) =>
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
        const query = reportSearchSchema.safeParse(body);
        if (!query.success) throw new HttpError("VALIDATION_ERROR");
        const result = await service.Search(actor, query.data);
        return Response.json(z.array(reportAggregateRowSchema).parse(result.items), { headers: { "X-Pagination": JSON.stringify(result.pagination) } });
    }, { parse: "none" });
}
