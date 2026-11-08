import { z } from "zod";
import { publishedRequestTypeSchema, requestDetailSchema, requestSummarySchema, type RequestSearchQuery, type CreateRequest, type PatchDraft } from "@workflow/contracts";
import { httpFor, httpPageFor } from "./http";

export const requestApi = {
    search: (body: RequestSearchQuery, signal?: AbortSignal, generation?: number) => httpPageFor("/v1/requests/search", z.array(requestSummarySchema), { method: "POST", body, signal, generation }),
    types: (pageNumber = 1, signal?: AbortSignal) => httpPageFor("/v1/request-types/search", z.array(publishedRequestTypeSchema), { method: "POST", body: { pageNumber, pageSize: 100 }, signal }),
    type: (id: string) => httpFor(`/v1/request-types/${id}`, publishedRequestTypeSchema),
    version: (id: string, versionId: string, requestId: string, signal?: AbortSignal, generation?: number) => httpFor(`/v1/request-types/${id}/versions/${versionId}?requestId=${requestId}`, publishedRequestTypeSchema, { signal, generation }),
    read: (id: string, signal?: AbortSignal, generation?: number) => httpFor(`/v1/requests/${id}`, requestDetailSchema, { signal, generation }),
    create: (body: CreateRequest, key: string) => httpFor("/v1/requests", requestDetailSchema, { method: "POST", body, headers: { "Idempotency-Key": key } }),
    patch: (id: string, body: PatchDraft, key: string) => httpFor(`/v1/requests/${id}/draft`, requestDetailSchema, { method: "PATCH", body, headers: { "Idempotency-Key": key } }),
    submit: (id: string, expectedVersion: number, key: string) => httpFor(`/v1/requests/${id}/submit`, requestDetailSchema, { method: "POST", body: { expectedVersion }, headers: { "Idempotency-Key": key } }),
};
