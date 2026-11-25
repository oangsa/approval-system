import { z } from "zod";
import {
    adminRequestTypeDetailSchema,
    adminRequestTypeSummarySchema,
    publishedRequestTypeSchema,
    requestTypeDraftDtoSchema,
    type AdminRequestTypeSearch,
    type CreateRequestType,
    type PatchRequestTypeDraft,
    type VersionedRequestTypeAction,
} from "@workflow/contracts";
import { httpFor, httpPageFor } from "./http";

export const requestTypeApi = {
    searchAdmin: (body: AdminRequestTypeSearch, signal?: AbortSignal, generation?: number) =>
        httpPageFor("/v1/request-types/search?view=admin", z.array(adminRequestTypeSummarySchema), { method: "POST", body, signal, generation }),
    readAdmin: (id: string, signal?: AbortSignal, generation?: number) =>
        httpFor(`/v1/request-types/${id}?view=admin`, adminRequestTypeDetailSchema, { signal, generation }),
    readVersion: (id: string, versionId: string, signal?: AbortSignal, generation?: number) =>
        httpFor(`/v1/request-types/${id}/versions/${versionId}`, publishedRequestTypeSchema, { signal, generation }),
    create: (body: CreateRequestType, key: string, generation?: number) =>
        httpFor("/v1/admin/request-types", requestTypeDraftDtoSchema, { method: "POST", body, headers: { "Idempotency-Key": key }, generation }),
    patchDraft: (id: string, body: PatchRequestTypeDraft, key: string, generation?: number) =>
        httpFor(`/v1/admin/request-types/${id}/draft`, requestTypeDraftDtoSchema, { method: "PATCH", body, headers: { "Idempotency-Key": key }, generation }),
    branchDraft: (id: string, body: VersionedRequestTypeAction, key: string, generation?: number) =>
        httpFor(`/v1/admin/request-types/${id}/draft`, requestTypeDraftDtoSchema, { method: "POST", body, headers: { "Idempotency-Key": key }, generation }),
    publish: (id: string, body: VersionedRequestTypeAction, key: string, generation?: number) =>
        httpFor(`/v1/admin/request-types/${id}/publish`, publishedRequestTypeSchema, { method: "POST", body, headers: { "Idempotency-Key": key }, generation }),
    enable: (id: string, body: VersionedRequestTypeAction, key: string, generation?: number) =>
        httpFor(`/v1/admin/request-types/${id}/enable`, adminRequestTypeSummarySchema, { method: "POST", body, headers: { "Idempotency-Key": key }, generation }),
    disable: (id: string, body: VersionedRequestTypeAction, key: string, generation?: number) =>
        httpFor(`/v1/admin/request-types/${id}/disable`, adminRequestTypeSummarySchema, { method: "POST", body, headers: { "Idempotency-Key": key }, generation }),
};
