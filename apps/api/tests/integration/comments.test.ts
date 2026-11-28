import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { commentSchema, errorResponseSchema, loginResponseSchema, type CommentDTO, type UserRole } from "@workflow/contracts";
import { SignJWT } from "jose";
import { CommentService } from "../../src/Applications/Requests/CommentService";
import type { ICommentRepository, ICommentUnitOfWork } from "../../src/Domains/Requests/CommentPorts";
import type { IRequestAccessContext } from "../../src/Domains/Requests/RequestAccessPolicy";
import { createApplication } from "../../src/Presentations/createApplication";
import { expectHttpError, identityHttpFixture, testAudience, testIssuer, testSecret } from "../helpers/identityHttp";

interface IStoredComment
{
    id: string;
    requestId: string;
    authorId: string;
    authorDisplayName: string;
    body: string;
    createdAt: Date;
}

function createCommentsFixture()
{
    const identity = identityHttpFixture();
    const now = new Date("2026-11-28T06:00:00.000Z");

    const reviewerId = "00000000-0000-4000-8000-000000000003";
    const historicReviewerId = "00000000-0000-4000-8000-000000000004";
    const adminId = "00000000-0000-4000-8000-000000000005";

    const addUser = (id: string, email: string, displayName: string, roles: UserRole[]) =>
    {
        identity.accounts.set(id, {
            id,
            email,
            displayName,
            passwordHash: "hash",
            isActive: true,
            authVersion: 0,
            createdAt: now,
            updatedAt: now,
        });
        identity.identities.set(id, { roles, department: null });
    };

    addUser(reviewerId, "reviewer@example.test", "Current Reviewer", ["REVIEWER"]);
    addUser(historicReviewerId, "historic@example.test", "Historic Reviewer", ["REVIEWER"]);
    addUser(adminId, "admin@example.test", "System Admin", ["ADMINISTRATOR"]);

    const requestId = "10000000-0000-4000-8000-000000000001";
    const requestsMap = new Map<string, IRequestAccessContext>([
        [
            requestId,
            {
                requestId,
                requesterId: identity.account.id,
                status: "PENDING",
                workingRevisionId: null,
                submittedRevisionId: "20000000-0000-4000-8000-000000000001",
                currentApprovers: [
                    { reviewerId, status: "ACTIONABLE" },
                    { reviewerId: historicReviewerId, status: "APPROVED" },
                ],
            },
        ],
    ]);

    const comments: IStoredComment[] = [];
    let tick = 0;

    const repository: ICommentRepository = {
        CurrentActor: async (actor) => actor,
        ReadRequestAccessContext: async (id) => requestsMap.get(id) ?? null,
        ListByRequest: async (id, query) =>
        {
            const filtered = comments
                .filter((item) => item.requestId === id)
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
            const totalCount = filtered.length;
            const totalPages = Math.ceil(totalCount / query.pageSize);
            const start = (query.pageNumber - 1) * query.pageSize;
            const items: CommentDTO[] = filtered.slice(start, start + query.pageSize).map((item) =>
                commentSchema.parse({
                    id: item.id,
                    requestId: item.requestId,
                    author: { id: item.authorId, displayName: item.authorDisplayName },
                    body: item.body,
                    createdAt: item.createdAt.toISOString(),
                }),
            );
            return {
                items,
                pagination: {
                    currentPage: query.pageNumber,
                    pageSize: query.pageSize,
                    totalPages,
                    totalCount,
                    hasPrevious: query.pageNumber > 1,
                    hasNext: query.pageNumber < totalPages,
                },
            };
        },
        Create: async (input) =>
        {
            const createdAt = new Date(now.getTime() + ++tick * 1000);
            const author = identity.accounts.get(input.authorId)!;
            const stored: IStoredComment = {
                id: randomUUID(),
                requestId: input.requestId,
                authorId: input.authorId,
                authorDisplayName: author.displayName,
                body: input.body,
                createdAt,
            };
            comments.push(stored);
            return commentSchema.parse({
                id: stored.id,
                requestId: stored.requestId,
                author: { id: stored.authorId, displayName: stored.authorDisplayName },
                body: stored.body,
                createdAt: stored.createdAt.toISOString(),
            });
        },
    };

    const unit: ICommentUnitOfWork = {
        Run: (operation) => operation(repository),
    };

    const app = createApplication(
        undefined,
        identity.dependencies,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { comments: new CommentService(unit) },
    );

    const login = async (email: string) =>
    {
        const response = await app.handle(
            new Request("http://localhost/api/v1/auth/login", {
                method: "POST",
                headers: { origin: "http://localhost:3000", "content-type": "application/json" },
                body: JSON.stringify({ email, password: "password" }),
            }),
        );
        expect(response.status).toBe(200);
        return loginResponseSchema.parse(await response.json()).accessToken;
    };

    return {
        identity,
        app,
        login,
        requestId,
        comments,
        requestsMap,
        reviewerEmail: "reviewer@example.test",
        historicReviewerEmail: "historic@example.test",
        adminEmail: "admin@example.test",
    };
}

describe("Comments HTTP API", () =>
{
    it("CMT-API-01 allows owner and current reviewer to post and read comments with Location, X-Pagination, and no-store", async () =>
    {
        const fx = createCommentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);
        const reviewerToken = await fx.login(fx.reviewerEmail);

        const postOwner = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/comments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
                body: JSON.stringify({ body: "  Owner note  " }),
            }),
        );
        expect(postOwner.status).toBe(201);
        expect(postOwner.headers.get("location")).toBe(`/api/v1/requests/${fx.requestId}/comments`);
        expect(postOwner.headers.get("cache-control")).toBe("no-store");
        const ownerDto = commentSchema.parse(await postOwner.json());
        expect(ownerDto.body).toBe("Owner note");
        expect(ownerDto.author).toEqual({ id: fx.identity.account.id, displayName: fx.identity.account.displayName });

        const postReviewer = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/comments`, {
                method: "POST",
                headers: { authorization: `Bearer ${reviewerToken}`, "content-type": "application/json" },
                body: JSON.stringify({ body: "Reviewer question" }),
            }),
        );
        expect(postReviewer.status).toBe(201);

        const listResponse = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/comments`, {
                headers: { authorization: `Bearer ${reviewerToken}` },
            }),
        );
        expect(listResponse.status).toBe(200);
        expect(listResponse.headers.get("cache-control")).toBe("no-store");
        expect(JSON.parse(listResponse.headers.get("x-pagination")!)).toEqual({
            currentPage: 1,
            pageSize: 20,
            totalPages: 1,
            totalCount: 2,
            hasPrevious: false,
            hasNext: false,
        });
        const items = commentSchema.array().parse(await listResponse.json());
        expect(items.map((item) => item.body)).toEqual(["Owner note", "Reviewer question"]);
    });

    it("CMT-API-02 returns chronological paginated slice and accurate X-Pagination metadata", async () =>
    {
        const fx = createCommentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);

        for (let index = 1; index <= 25; index++)
        {
            const response = await fx.app.handle(
                new Request(`http://localhost/api/v1/requests/${fx.requestId}/comments`, {
                    method: "POST",
                    headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
                    body: JSON.stringify({ body: `Comment ${index}` }),
                }),
            );
            expect(response.status).toBe(201);
        }

        const page2 = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/comments?pageNumber=2&pageSize=10`, {
                headers: { authorization: `Bearer ${ownerToken}` },
            }),
        );
        expect(page2.status).toBe(200);
        expect(JSON.parse(page2.headers.get("x-pagination")!)).toEqual({
            currentPage: 2,
            pageSize: 10,
            totalPages: 3,
            totalCount: 25,
            hasPrevious: true,
            hasNext: true,
        });
        const items = commentSchema.array().parse(await page2.json());
        expect(items).toHaveLength(10);
        expect(items.map((item) => item.body)).toEqual(
            Array.from({ length: 10 }, (_, idx) => `Comment ${idx + 11}`),
        );
    });

    it("CMT-API-03 rejects anonymous, revoked-session, and expired JWT requests with 401 and no-store", async () =>
    {
        const fx = createCommentsFixture();
        const token = await fx.login(fx.identity.account.email);
        const family = [...fx.identity.families.values()][0]!;

        const expiredJwt = await new SignJWT({ sid: family.id, ver: 0 })
            .setProtectedHeader({ alg: "HS256" })
            .setSubject(fx.identity.account.id)
            .setIssuer(testIssuer)
            .setAudience(testAudience)
            .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
            .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
            .sign(new TextEncoder().encode(testSecret));

        for (const auth of [undefined, "Bearer invalid", `Bearer ${expiredJwt}`])
        {
            const getRes = await fx.app.handle(
                new Request(`http://localhost/api/v1/requests/${fx.requestId}/comments`, {
                    headers: auth ? { authorization: auth } : {},
                }),
            );
            await expectHttpError(getRes, 401);

            const postRes = await fx.app.handle(
                new Request(`http://localhost/api/v1/requests/${fx.requestId}/comments`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        ...(auth ? { authorization: auth } : {}),
                    },
                    body: JSON.stringify({ body: "Blocked" }),
                }),
            );
            await expectHttpError(postRes, 401);
        }

        family.revokedAt = new Date();
        const revokedGet = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/comments`, {
                headers: { authorization: `Bearer ${token}` },
            }),
        );
        await expectHttpError(revokedGet, 401);
    });

    it("CMT-API-04 returns indistinguishable 404 for foreign requester, historic reviewer, unrelated admin, and missing request", async () =>
    {
        const fx = createCommentsFixture();
        const foreignToken = await fx.login(fx.identity.other.email);
        const historicToken = await fx.login(fx.historicReviewerEmail);
        const adminToken = await fx.login(fx.adminEmail);
        const missingId = randomUUID();

        for (const token of [foreignToken, historicToken, adminToken])
        {
            for (const targetId of [fx.requestId, missingId])
            {
                const getRes = await fx.app.handle(
                    new Request(`http://localhost/api/v1/requests/${targetId}/comments`, {
                        headers: { authorization: `Bearer ${token}` },
                    }),
                );
                await expectHttpError(getRes, 404);

                const postRes = await fx.app.handle(
                    new Request(`http://localhost/api/v1/requests/${targetId}/comments`, {
                        method: "POST",
                        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                        body: JSON.stringify({ body: "Probe" }),
                    }),
                );
                await expectHttpError(postRes, 404);
            }
        }
    });

    it("CMT-API-05 enforces 422 validation, 400 malformed JSON, and sanitized error envelopes", async () =>
    {
        const fx = createCommentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);

        for (const payload of [
            JSON.stringify({ body: "   " }),
            JSON.stringify({ body: "x".repeat(4001) }),
            JSON.stringify({ body: "valid", extraField: true }),
        ])
        {
            const response = await fx.app.handle(
                new Request(`http://localhost/api/v1/requests/${fx.requestId}/comments`, {
                    method: "POST",
                    headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
                    body: payload,
                }),
            );
            expect(response.status).toBe(422);
            const body = errorResponseSchema.parse(await response.json());
            expect(body.code).toBe("VALIDATION_ERROR");
            expect(response.headers.get("cache-control")).toBe("no-store");
        }

        const malformedJson = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/comments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
                body: "{",
            }),
        );
        await expectHttpError(malformedJson, 400);

        const badPageSize = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/comments?pageSize=101`, {
                headers: { authorization: `Bearer ${ownerToken}` },
            }),
        );
        await expectHttpError(badPageSize, 422);

        const malformedId = await fx.app.handle(
            new Request("http://localhost/api/v1/requests/not-a-uuid/comments", {
                headers: { authorization: `Bearer ${ownerToken}` },
            }),
        );
        await expectHttpError(malformedId, 404);
    });
});
