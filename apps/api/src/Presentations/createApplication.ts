import type { ConfigurationService } from "../Applications/Policies/ConfigurationService";
import type { ReportingService } from "../Applications/Reporting/ReportingService";
import type { DecisionService } from "../Applications/Approvals/DecisionService";
import { AttachmentService } from "../Applications/Requests/AttachmentService";
import type { CommentService } from "../Applications/Requests/CommentService";
import type { RequestService } from "../Applications/Requests/RequestService";
import type { RequestTypeService } from "../Applications/RequestTypes/RequestTypeService";
import type { ApprovalTaskService } from "../Applications/Approvals/ApprovalTaskService";
import type { IAttachmentUnitOfWork, IPrivateObjectStorage } from "../Domains/Requests/AttachmentPorts";
import { CreatePrivateObjectStorage } from "../Infrastructures/Storage";
import { registerApprovalTaskRoutes } from "./Routes/ApprovalTaskRoutes";
import { registerAttachmentRoutes } from "./Routes/AttachmentRoutes";
import { registerCommentRoutes } from "./Routes/CommentRoutes";
import { registerConfigurationRoutes } from "./Routes/ConfigurationRoutes";
import { registerDecisionRoutes } from "./Routes/DecisionRoutes";
import { registerReportingRoutes } from "./Routes/ReportingRoutes";
import { registerRequestRoutes } from "./Routes/RequestRoutes";
import { registerRequestTypeRoutes } from "./Routes/RequestTypeRoutes";
import { randomUUID } from "node:crypto";
import { Elysia, type ElysiaAdapter } from "elysia";
import { healthResponseSchema } from "@workflow/contracts";
import { z } from "zod";
import type { IIdentityHttpDependencies } from "./composition";
import { checkOrigin, corsHeaders, preflight } from "./cors";
import { errorResponse, HttpError } from "./errors";
import { authRouteDescriptors, registerAuthRoutes } from "./Routes/AuthRoutes";

export interface ICreateApplicationOptions
{
    comments?: CommentService;
    attachments?: AttachmentService;
    attachmentStorage?: IPrivateObjectStorage;
    attachmentUnitOfWork?: IAttachmentUnitOfWork;
}

export function createApplication(
    adapter?: ElysiaAdapter,
    identity?: IIdentityHttpDependencies,
    requests?: RequestService,
    approvalTasks?: ApprovalTaskService,
    decisions?: DecisionService,
    checkHealth?: () => Promise<void>,
    requestTypes?: RequestTypeService,
    reporting?: ReportingService,
    configuration?: ConfigurationService,
    options?: ICreateApplicationOptions,
)
{
    const storage = options?.attachmentStorage ?? CreatePrivateObjectStorage({ ATTACHMENT_STORAGE_DRIVER: "memory" });
    const comments = options?.comments;
    const attachments = options?.attachments
        ?? (options?.attachmentUnitOfWork ? new AttachmentService(options.attachmentUnitOfWork, storage) : undefined);

    const ids = new WeakMap<Request, string>();
    const app = new Elysia({ adapter })
        .onRequest(({ request, set }) =>
        {
            const supplied = request.headers.get("x-request-id");
            const id = supplied && z.uuid().safeParse(supplied).success ? supplied.toLowerCase() : randomUUID();
            ids.set(request, id);
            set.headers["X-Request-Id"] = id;
            const path = new URL(request.url).pathname;
            if (path.startsWith("/api/v1/"))
            {
                set.headers["Cache-Control"] = "no-store";
                if (identity)
                {
                    if (request.method === "OPTIONS")
                    {
                        const method = request.headers.get("access-control-request-method")?.toUpperCase();
                        const allowedReporting = Boolean(reporting && (method === "GET" && path === "/api/v1/dashboard" || method === "POST" && path === "/api/v1/reports/requests/search"));
                        const allowedConfiguration = Boolean(configuration && /^(?:POST|PATCH)$/.test(method ?? "") && /^\/api\/v1\/(?:admin\/(?:approval-policies|reviewer-assignments|budget-policies)(?:\/|$)|reviewers\/eligible\/search$|departments\/search$)/.test(path));
                        const allowedDecision = Boolean(decisions && (method === "POST" && /^\/api\/v1\/approval-tasks\/[^/]+\/decisions$/.test(path) || method === "GET" && /^\/api\/v1\/requests\/[^/]+\/timeline$/.test(path)));
                        const allowedAuth = authRouteDescriptors.some((route) => route.path === path && route.method === method);
                        const allowedRequest = Boolean(requests && /^(?:GET|POST|PATCH)$/.test(method ?? "") && /^\/api\/v1\/(?:requests|request-types)(?:\/|$)/.test(path));
                        const allowedRequestType = Boolean(requestTypes && /^(?:POST|PATCH)$/.test(method ?? "") && /^\/api\/v1\/admin\/request-types(?:\/|$)/.test(path));
                        const allowedApprovalTask = Boolean(approvalTasks && (method === "POST" && path === "/api/v1/approval-tasks/search" || method === "GET" && /^\/api\/v1\/approval-tasks\/[^/]+$/.test(path) && path !== "/api/v1/approval-tasks/search"));
                        const allowedComment = Boolean(comments && (method === "GET" || method === "POST") && /^\/api\/v1\/requests\/[^/]+\/comments$/.test(path));
                        const allowedAttachment = Boolean(
                            attachments
                            && (
                                ((method === "GET" || method === "POST") && /^\/api\/v1\/requests\/[^/]+\/attachments$/.test(path))
                                || (method === "DELETE" && /^\/api\/v1\/requests\/[^/]+\/attachments\/[^/]+$/.test(path))
                                || (method === "GET" && /^\/api\/v1\/attachments\/[^/]+\/download$/.test(path))
                            ),
                        );

                        if (
                            !allowedReporting
                            && !allowedConfiguration
                            && !allowedDecision
                            && !allowedAuth
                            && !allowedRequest
                            && !allowedRequestType
                            && !allowedApprovalTask
                            && !allowedComment
                            && !allowedAttachment
                        )
                        {
                            throw new HttpError("FORBIDDEN");
                        }
                        return preflight(request, identity.allowedOrigins);
                    }
                    const required = ["/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout"].includes(path);
                    const origin = checkOrigin(request, identity.allowedOrigins, required);
                    const headers = new Headers();
                    corsHeaders(headers, origin);
                    headers.forEach((value, key) =>
                    {
                        set.headers[key] = value;
                    });
                }
            }
        })
        .onError(({ code, error, request, set }) =>
        {
            const id = ids.get(request) ?? randomUUID();
            const result = errorResponse(error, code, id);
            set.status = result.statusCode;
            set.headers["X-Request-Id"] = id;
            const responseHeaders = error && typeof error === "object" && "responseHeaders" in error && error.responseHeaders instanceof Headers ? error.responseHeaders : null;
            if (!responseHeaders?.has("Cache-Control")) set.headers["Cache-Control"] = "no-store";
            if (result.code === "RATE_LIMITED") set.headers["Retry-After"] = "900";
            if (responseHeaders)
            {
                responseHeaders.forEach((value, key) =>
                {
                    set.headers[key] = value;
                });
            }
            if (result.statusCode >= 500) console.error({ code: result.code, requestId: id });
            return result;
        })
        .get("/health", async ({ set }) =>
        {
            set.headers["Cache-Control"] = "no-store";
            try
            {
                await checkHealth?.();
            }
            catch
            {
                throw new HttpError("SERVICE_UNAVAILABLE");
            }
            return { status: "ok" as const };
        }, { response: healthResponseSchema });
    if (identity) registerAuthRoutes(app, identity);
    if (identity && requests) registerRequestRoutes(app, identity, requests, requestTypes);
    if (identity && comments) registerCommentRoutes(app, identity, comments);
    if (identity && attachments) registerAttachmentRoutes(app, identity, attachments);
    if (identity && configuration) registerConfigurationRoutes(app, identity, configuration);
    if (identity && requestTypes) registerRequestTypeRoutes(app, identity, requestTypes);
    if (identity && approvalTasks) registerApprovalTaskRoutes(app, identity, approvalTasks);
    if (identity && decisions) registerDecisionRoutes(app, identity, decisions);
    if (identity && reporting) registerReportingRoutes(app, identity, reporting);
    return app;
}
