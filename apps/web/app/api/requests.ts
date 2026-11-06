import { z } from "zod";
import { publishedRequestTypeSchema, requestDetailSchema, type CreateRequest, type PatchDraft } from "@workflow/contracts";
import { httpFor } from "./http";

export const requestApi = {
    types: (signal?: AbortSignal) => httpFor("/v1/request-types/search", z.array(publishedRequestTypeSchema), { method: "POST", body: { pageSize: 100 }, signal }),
    type: (id: string) => httpFor(`/v1/request-types/${id}`, publishedRequestTypeSchema),
    read: (id: string, signal?: AbortSignal) => httpFor(`/v1/requests/${id}`, requestDetailSchema, { signal }),
    create: (body: CreateRequest, key: string) => httpFor("/v1/requests", requestDetailSchema, { method: "POST", body, headers: { "Idempotency-Key": key } }),
    patch: (id: string, body: PatchDraft, key: string) => httpFor(`/v1/requests/${id}/draft`, requestDetailSchema, { method: "PATCH", body, headers: { "Idempotency-Key": key } }),
    submit: (id: string, expectedVersion: number, key: string) => httpFor(`/v1/requests/${id}/submit`, requestDetailSchema, { method: "POST", body: { expectedVersion }, headers: { "Idempotency-Key": key } }),
};
