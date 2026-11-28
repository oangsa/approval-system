import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import {
    commentSchema,
    errorResponseSchema,
    paginationSchema,
    requestDetailSchema,
    requestRevisionSchema,
    type CreateRequest,
    type PublishedRequestType,
    type UserRole,
} from "@workflow/contracts";
import { z } from "zod";
import { createTestDatabase } from "../helpers/testDatabase";
import { expectHttpError } from "../helpers/identityHttp";
import { DecisionService } from "../../src/Applications/Approvals/DecisionService";
import { CommentService } from "../../src/Applications/Requests/CommentService";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import type { IActor } from "../../src/Domains/Identity/Identity";
import type { IStageDefinition } from "../../src/Domains/Requests/RequestRules";
import { readEnvironment } from "../../src/Infrastructures/Configuration/environment";
import { DecisionUnitOfWork } from "../../src/Infrastructures/Database/Repositories/DecisionRepository";
import { CommentUnitOfWork } from "../../src/Infrastructures/Database/Repositories/CommentRepository";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { RequestUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";
import {
    approvalDecisions,
    approvalPolicyVersions,
    approvalSlots,
    approvalStages,
    departmentMemberships,
    departments,
    requestComments,
    requestTypes,
    requestTypeVersions,
    reviewerAssignmentRules,
    sessionFamilies,
    userRoles,
    users,
} from "../../src/Infrastructures/Database/schema";
import { TokenProvider } from "../../src/Infrastructures/Security/TokenProvider";
import { createIdentityComposition } from "../../src/Presentations/composition";
import { createApplication } from "../../src/Presentations/createApplication";

const database = createTestDatabase();
const observer = createTestDatabase();
const db = database.connection;

const requestService = new RequestService(new RequestUnitOfWork(db));
const decisionService = new DecisionService(new DecisionUnitOfWork(db));
const commentService = new CommentService(new CommentUnitOfWork(db));
const observerCommentService = new CommentService(new CommentUnitOfWork(observer.connection));

afterAll(async () =>
{
    await database.Close();
    await observer.Close();
});

interface IPostgresErrorShape
{
    code?: string;
    message?: string;
    cause?: unknown;
}

function readPostgresError(error: unknown): { code: string | undefined; message: string }
{
    if (typeof error !== "object" || error === null)
    {
        return { code: undefined, message: String(error) };
    }
    const candidate = error as IPostgresErrorShape;
    if (typeof candidate.code === "string")
    {
        return { code: candidate.code, message: candidate.message ?? "" };
    }
    if (typeof candidate.cause === "object" && candidate.cause !== null)
    {
        const cause = candidate.cause as IPostgresErrorShape;
        return { code: cause.code, message: cause.message ?? candidate.message ?? "" };
    }
    return { code: undefined, message: candidate.message ?? "" };
}

async function expectSqlState(operation: () => Promise<unknown>, expectedCode: string): Promise<void>
{
    let caught: unknown;
    try
    {
        await operation();
    }
    catch (error)
    {
        caught = error;
    }
    expect(caught).toBeDefined();
    expect(readPostgresError(caught).code).toBe(expectedCode);
}

async function seedActor(
    displayName: string,
    roles: readonly UserRole[],
): Promise<{ id: string; actor: IActor }>
{
    const id = randomUUID();
    const familyId = randomUUID();
    await db.transaction(async (tx) =>
    {
        await tx.insert(users).values({
            id,
            email: `${id}@example.test`,
            displayName,
            passwordHash: "not-for-login",
        });
        await tx.insert(userRoles).values(roles.map((roleCode) => ({ userId: id, roleCode })));
        await tx.insert(sessionFamilies).values({
            id: familyId,
            userId: id,
            authVersion: 0,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3_600_000),
        });
    });

    const actor = (await new IdentityRepository(db).ReadCurrentIdentity(id, familyId))!;
    return { id, actor };
}

async function createHttpHarness()
{
    const environment = readEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        AUTH_JWT_SECRET: "issue13-collaboration-pg-test-secret-0123456789",
        AUTH_JWT_ISSUER: "issue13-pg-tests",
        AUTH_JWT_AUDIENCE: "issue13-api",
        AUTH_ALLOWED_ORIGINS: "http://localhost:3000",
        AUTH_COOKIE_SECURE: "false",
    });
    const identity = await createIdentityComposition(environment, database);
    const app = createApplication(
        undefined,
        identity,
        requestService,
        undefined,
        decisionService,
        undefined,
        undefined,
        undefined,
        undefined,
        { comments: commentService },
    );
    const tokens = new TokenProvider(
        environment.AUTH_JWT_SECRET,
        { Now: () => new Date() },
        environment.AUTH_JWT_ISSUER,
        environment.AUTH_JWT_AUDIENCE,
    );

    const tokenFor = (actor: IActor) => tokens.Sign(actor.account.id, actor.family.id, actor.account.authVersion);

    const request = async (method: "GET" | "POST", path: string, actor: IActor | null, body?: unknown) =>
    {
        const token = actor ? await tokenFor(actor) : null;
        return app.handle(
            new Request(`http://localhost/api/v1${path}`, {
                method,
                headers: {
                    ...(token ? { authorization: `Bearer ${token}` } : {}),
                    ...(body !== undefined ? { "content-type": "application/json" } : {}),
                },
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            }),
        );
    };

    return { app, request };
}

async function seedCollaborationFixture(twoStage = false)
{
    const owner = await seedActor("Request Owner", ["REQUESTER"]);
    const stage1Reviewer = await seedActor("Stage 1 Reviewer", ["REVIEWER"]);
    const stage2Reviewer = await seedActor("Stage 2 Reviewer", ["REVIEWER"]);
    const foreignRequester = await seedActor("Foreign Requester", ["REQUESTER"]);
    const admin = await seedActor("System Admin", ["ADMINISTRATOR"]);

    const departmentId = randomUUID();
    const typeId = randomUUID();
    const versionId = randomUUID();
    const policyId = randomUUID();
    const ruleOneId = randomUUID();
    const ruleTwoId = randomUUID();
    const definition: PublishedRequestType = {
        ...seededDefinition,
        id: typeId,
        versionId,
        code: `CMT_${typeId.slice(0, 8)}`,
        monetary: false,
        supportsLineItems: false,
    };

    const stages: IStageDefinition[] = twoStage
        ? [
            { stageNumber: 1, reviewerAssignmentKeys: ["stage1"], slaBusinessMinutes: 480 },
            { stageNumber: 2, reviewerAssignmentKeys: ["stage2"], slaBusinessMinutes: 480 },
        ]
        : [
            { stageNumber: 1, reviewerAssignmentKeys: ["stage1"], slaBusinessMinutes: 480 },
        ];

    await db.transaction(async (tx) =>
    {
        await tx.insert(departments).values({
            id: departmentId,
            code: `DEPT_${departmentId.slice(0, 8)}`,
            name: "Operations",
        });
        await tx.insert(departmentMemberships).values({
            userId: owner.id,
            departmentId,
            isPrimary: true,
        });
        await tx.insert(requestTypes).values({ id: typeId, code: definition.code });
        await tx.insert(requestTypeVersions).values({
            id: versionId,
            typeId,
            versionNumber: 1,
            definition,
        });
        await tx.update(requestTypes).set({ publishedVersionId: versionId }).where(eq(requestTypes.id, typeId));
        await tx.insert(approvalPolicyVersions).values({
            id: policyId,
            typeId,
            code: `POL_${policyId.slice(0, 8)}`,
            versionNumber: 1,
            priority: 1,
            stages,
        });
        await tx.insert(reviewerAssignmentRules).values([
            { id: ruleOneId, assignmentKey: "stage1", departmentId, reviewerId: stage1Reviewer.id },
            { id: ruleTwoId, assignmentKey: "stage2", departmentId, reviewerId: stage2Reviewer.id },
        ]);
    });

    const content: CreateRequest = {
        typeId,
        formDefinitionVersionId: versionId,
        title: "Collaboration test request",
        justification: "Verify discussion comments against PostgreSQL",
        priority: "MEDIUM",
        fields: { category: "OPERATIONS" },
    };

    const draft = await requestService.Mutate(owner.actor, "create", null, content, randomUUID());
    const http = await createHttpHarness();

    return {
        owner,
        stage1Reviewer,
        stage2Reviewer,
        foreignRequester,
        admin,
        departmentId,
        typeId,
        versionId,
        policyId,
        ruleOneId,
        ruleTwoId,
        draft,
        http,
    };
}

test("CMT-PG-01 owner and current ACTIONABLE/WAITING reviewers post comments and read paginated comments ordered (created_at ASC, id ASC)", async () =>
{
    const fx = await seedCollaborationFixture(true);

    const draftPost = await fx.http.request("POST", `/requests/${fx.draft.id}/comments`, fx.owner.actor, {
        body: "  Draft comment from owner  ",
    });
    expect(draftPost.status).toBe(201);
    expect(draftPost.headers.get("location")).toBe(`/api/v1/requests/${fx.draft.id}/comments`);
    expect(draftPost.headers.get("cache-control")).toBe("no-store");
    const c1 = commentSchema.parse(await draftPost.json());
    expect(c1.body).toBe("Draft comment from owner");

    const submitted = await requestService.Mutate(
        fx.owner.actor,
        "submit",
        fx.draft.id,
        { expectedVersion: 0 },
        randomUUID(),
    );
    expect(submitted.status).toBe("PENDING");
    expect(submitted.currentApprovers).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ stageNumber: 1, status: "ACTIONABLE", reviewer: expect.objectContaining({ id: fx.stage1Reviewer.id }) }),
            expect.objectContaining({ stageNumber: 2, status: "WAITING", reviewer: expect.objectContaining({ id: fx.stage2Reviewer.id }) }),
        ]),
    );

    const actionablePost = await fx.http.request("POST", `/requests/${fx.draft.id}/comments`, fx.stage1Reviewer.actor, {
        body: "Actionable reviewer question",
    });
    expect(actionablePost.status).toBe(201);
    const c2 = commentSchema.parse(await actionablePost.json());

    const waitingPost = await fx.http.request("POST", `/requests/${fx.draft.id}/comments`, fx.stage2Reviewer.actor, {
        body: "Waiting reviewer note",
    });
    expect(waitingPost.status).toBe(201);
    const c3 = commentSchema.parse(await waitingPost.json());

    // Insert two rows with an identical created_at timestamp to verify deterministic (created_at ASC, id ASC) tie-breaking.
    const sameTimestamp = new Date(Date.now() + 5_000);
    const rowIdLow = randomUUID();
    const rowIdHigh = randomUUID();
    const [orderedLow, orderedHigh] = rowIdLow < rowIdHigh ? [rowIdLow, rowIdHigh] : [rowIdHigh, rowIdLow];
    await db.insert(requestComments).values([
        {
            id: orderedHigh,
            requestId: fx.draft.id,
            authorId: fx.owner.id,
            body: "Tie-breaker second by id",
            createdAt: sameTimestamp,
        },
        {
            id: orderedLow,
            requestId: fx.draft.id,
            authorId: fx.stage1Reviewer.id,
            body: "Tie-breaker first by id",
            createdAt: sameTimestamp,
        },
    ]);

    const dbSnapshot = await observer.connection
        .select({
            id: requestComments.id,
            body: requestComments.body,
            createdAt: requestComments.createdAt,
        })
        .from(requestComments)
        .where(eq(requestComments.requestId, fx.draft.id))
        .orderBy(asc(requestComments.createdAt), asc(requestComments.id));

    expect(dbSnapshot.map((row) => row.id)).toEqual([c1.id, c2.id, c3.id, orderedLow, orderedHigh]);

    const page1 = await fx.http.request("GET", `/requests/${fx.draft.id}/comments?pageNumber=1&pageSize=2`, fx.stage2Reviewer.actor);
    expect(page1.status).toBe(200);
    expect(page1.headers.get("cache-control")).toBe("no-store");
    expect(paginationSchema.parse(JSON.parse(page1.headers.get("x-pagination") ?? "{}"))).toEqual({
        currentPage: 1,
        pageSize: 2,
        totalPages: 3,
        totalCount: 5,
        hasPrevious: false,
        hasNext: true,
    });
    const page1Items = z.array(commentSchema).parse(await page1.json());
    expect(page1Items.map((item) => item.id)).toEqual([c1.id, c2.id]);

    const page2 = await fx.http.request("GET", `/requests/${fx.draft.id}/comments?pageNumber=2&pageSize=2`, fx.stage1Reviewer.actor);
    expect(page2.status).toBe(200);
    expect(paginationSchema.parse(JSON.parse(page2.headers.get("x-pagination") ?? "{}"))).toEqual({
        currentPage: 2,
        pageSize: 2,
        totalPages: 3,
        totalCount: 5,
        hasPrevious: true,
        hasNext: true,
    });
    const page2Items = z.array(commentSchema).parse(await page2.json());
    expect(page2Items.map((item) => item.id)).toEqual([c3.id, orderedLow]);

    const page3 = await fx.http.request("GET", `/requests/${fx.draft.id}/comments?pageNumber=3&pageSize=2`, fx.owner.actor);
    expect(page3.status).toBe(200);
    expect(paginationSchema.parse(JSON.parse(page3.headers.get("x-pagination") ?? "{}"))).toEqual({
        currentPage: 3,
        pageSize: 2,
        totalPages: 3,
        totalCount: 5,
        hasPrevious: true,
        hasNext: false,
    });
    const page3Items = z.array(commentSchema).parse(await page3.json());
    expect(page3Items.map((item) => item.id)).toEqual([orderedHigh]);
});

test("CMT-PG-02 comments persist across DRAFT -> PENDING -> RETURNED -> PENDING revisions and cycles in chronological order", async () =>
{
    const fx = await seedCollaborationFixture(false);

    const r1 = await fx.http.request("POST", `/requests/${fx.draft.id}/comments`, fx.owner.actor, { body: "1. Draft note" });
    expect(r1.status).toBe(201);
    const c1 = commentSchema.parse(await r1.json());

    const draftList = await fx.http.request("GET", `/requests/${fx.draft.id}/comments`, fx.owner.actor);
    expect(z.array(commentSchema).parse(await draftList.json()).map((item) => item.id)).toEqual([c1.id]);

    const pendingCycle1 = await requestService.Mutate(fx.owner.actor, "submit", fx.draft.id, { expectedVersion: 0 }, randomUUID());
    const slot1 = pendingCycle1.currentApprovers[0]!.slotId;

    const r2 = await fx.http.request("POST", `/requests/${fx.draft.id}/comments`, fx.stage1Reviewer.actor, { body: "2. Cycle 1 reviewer note" });
    expect(r2.status).toBe(201);
    const c2 = commentSchema.parse(await r2.json());

    const pending1List = await fx.http.request("GET", `/requests/${fx.draft.id}/comments`, fx.stage1Reviewer.actor);
    expect(z.array(commentSchema).parse(await pending1List.json()).map((item) => item.id)).toEqual([c1.id, c2.id]);

    const returned = await decisionService.Decide(
        fx.stage1Reviewer.actor,
        slot1,
        { decision: "RETURN", reason: "Add more details", expectedVersion: 0 },
        randomUUID(),
    );
    expect(returned.requestStatus).toBe("RETURNED");

    const r3 = await fx.http.request("POST", `/requests/${fx.draft.id}/comments`, fx.owner.actor, { body: "3. Returned draft clarification" });
    expect(r3.status).toBe(201);
    const c3 = commentSchema.parse(await r3.json());

    const returnedList = await fx.http.request("GET", `/requests/${fx.draft.id}/comments`, fx.owner.actor);
    expect(z.array(commentSchema).parse(await returnedList.json()).map((item) => item.id)).toEqual([c1.id, c2.id, c3.id]);

    const pendingCycle2 = await requestService.Mutate(
        fx.owner.actor,
        "resubmit",
        fx.draft.id,
        { expectedVersion: returned.requestVersion },
        randomUUID(),
    );
    expect(pendingCycle2.status).toBe("PENDING");

    const r4 = await fx.http.request("POST", `/requests/${fx.draft.id}/comments`, fx.stage1Reviewer.actor, { body: "4. Cycle 2 reviewer note" });
    expect(r4.status).toBe(201);
    const c4 = commentSchema.parse(await r4.json());

    const pending2List = await fx.http.request("GET", `/requests/${fx.draft.id}/comments`, fx.owner.actor);
    expect(z.array(commentSchema).parse(await pending2List.json()).map((item) => item.id)).toEqual([c1.id, c2.id, c3.id, c4.id]);
});

test("CMT-PG-03 reviewer posting a comment on PENDING request leaves status, version, approval_slots, and approval_decisions unchanged", async () =>
{
    const fx = await seedCollaborationFixture(true);
    const submitted = await requestService.Mutate(fx.owner.actor, "submit", fx.draft.id, { expectedVersion: 0 }, randomUUID());
    const cycleId = submitted.currentCycleId!;

    const beforeDetail = requestDetailSchema.parse(await requestService.Read(fx.owner.actor, fx.draft.id));
    const beforeSlots = await observer.connection
        .select()
        .from(approvalSlots)
        .innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id))
        .where(eq(approvalStages.cycleId, cycleId))
        .orderBy(asc(approvalSlots.id));
    const beforeDecisions = await observer.connection
        .select()
        .from(approvalDecisions)
        .innerJoin(approvalSlots, eq(approvalDecisions.slotId, approvalSlots.id))
        .innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id))
        .where(eq(approvalStages.cycleId, cycleId));

    const postResponse = await fx.http.request("POST", `/requests/${fx.draft.id}/comments`, fx.stage1Reviewer.actor, {
        body: "Please clarify vendor timeline before approval.",
    });
    expect(postResponse.status).toBe(201);

    const afterDetail = requestDetailSchema.parse(await requestService.Read(fx.owner.actor, fx.draft.id));
    const afterSlots = await observer.connection
        .select()
        .from(approvalSlots)
        .innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id))
        .where(eq(approvalStages.cycleId, cycleId))
        .orderBy(asc(approvalSlots.id));
    const afterDecisions = await observer.connection
        .select()
        .from(approvalDecisions)
        .innerJoin(approvalSlots, eq(approvalDecisions.slotId, approvalSlots.id))
        .innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id))
        .where(eq(approvalStages.cycleId, cycleId));

    expect(afterDetail.status).toBe("PENDING");
    expect(afterDetail.version).toBe(beforeDetail.version);
    expect(afterSlots).toEqual(beforeSlots);
    expect(afterDecisions).toHaveLength(beforeDecisions.length);
    expect(afterDecisions).toHaveLength(0);
});

test("CMT-PG-04 former reviewer, foreign requester, and unrelated admin get 404 on comments while former reviewer retains historical revision access", async () =>
{
    const fx = await seedCollaborationFixture(false);
    const cycle1 = await requestService.Mutate(fx.owner.actor, "submit", fx.draft.id, { expectedVersion: 0 }, randomUUID());
    const rev1Id = cycle1.submittedRevision!.id;
    const slot1 = cycle1.currentApprovers[0]!.slotId;

    const ownerComment = await fx.http.request("POST", `/requests/${fx.draft.id}/comments`, fx.owner.actor, { body: "Cycle 1 discussion" });
    expect(ownerComment.status).toBe(201);

    const returned = await decisionService.Decide(
        fx.stage1Reviewer.actor,
        slot1,
        { decision: "RETURN", reason: "Reassigning for cycle 2", expectedVersion: 0 },
        randomUUID(),
    );
    expect(returned.requestStatus).toBe("RETURNED");

    // Reassign stage1 rule to stage2Reviewer before resubmit so stage1Reviewer is strictly a former reviewer in cycle 2.
    await db
        .update(reviewerAssignmentRules)
        .set({ reviewerId: fx.stage2Reviewer.id })
        .where(eq(reviewerAssignmentRules.id, fx.ruleOneId));

    const cycle2 = await requestService.Mutate(
        fx.owner.actor,
        "resubmit",
        fx.draft.id,
        { expectedVersion: returned.requestVersion },
        randomUUID(),
    );
    expect(cycle2.status).toBe("PENDING");

    for (const deniedActor of [fx.stage1Reviewer.actor, fx.foreignRequester.actor, fx.admin.actor])
    {
        const getRes = await fx.http.request("GET", `/requests/${fx.draft.id}/comments`, deniedActor);
        await expectHttpError(getRes, 404);

        const postRes = await fx.http.request("POST", `/requests/${fx.draft.id}/comments`, deniedActor, {
            body: "Unauthorized comment attempt",
        });
        await expectHttpError(postRes, 404);
    }

    // Former reviewer still retains access to the exact historical revision they handled in cycle 1.
    const formerRevisionRes = await fx.http.request("GET", `/requests/${fx.draft.id}/revisions/${rev1Id}`, fx.stage1Reviewer.actor);
    expect(formerRevisionRes.status).toBe(200);
    const rev1Dto = requestRevisionSchema.parse(await formerRevisionRes.json());
    expect(rev1Dto.id).toBe(rev1Id);

    // Foreign requester and unrelated admin remain blocked on historical revisions as well.
    for (const outsider of [fx.foreignRequester.actor, fx.admin.actor])
    {
        const res = await fx.http.request("GET", `/requests/${fx.draft.id}/revisions/${rev1Id}`, outsider);
        expect(res.status).toBe(404);
        errorResponseSchema.parse(await res.json());
    }
});

test("CMT-PG-05 direct SQL check constraint rejects blank and >4000 char bodies; concurrent comment inserts succeed without lost updates or version drift", async () =>
{
    const fx = await seedCollaborationFixture(false);
    const submitted = await requestService.Mutate(fx.owner.actor, "submit", fx.draft.id, { expectedVersion: 0 }, randomUUID());
    const versionBefore = submitted.version;

    await expectSqlState(
        () => db.insert(requestComments).values({
            id: randomUUID(),
            requestId: fx.draft.id,
            authorId: fx.owner.id,
            body: "   \n\t  ",
        }),
        "23514",
    );

    await expectSqlState(
        () => db.insert(requestComments).values({
            id: randomUUID(),
            requestId: fx.draft.id,
            authorId: fx.owner.id,
            body: "x".repeat(4001),
        }),
        "23514",
    );

    const concurrentInserts = [
        commentService.AddComment(fx.owner.actor, fx.draft.id, "Concurrent comment A"),
        observerCommentService.AddComment(fx.stage1Reviewer.actor, fx.draft.id, "Concurrent comment B"),
        commentService.AddComment(fx.owner.actor, fx.draft.id, "Concurrent comment C"),
        observerCommentService.AddComment(fx.stage1Reviewer.actor, fx.draft.id, "Concurrent comment D"),
        commentService.AddComment(fx.owner.actor, fx.draft.id, "Concurrent comment E"),
        observerCommentService.AddComment(fx.stage1Reviewer.actor, fx.draft.id, "Concurrent comment F"),
    ];

    const created = await Promise.all(concurrentInserts);
    expect(created).toHaveLength(6);
    expect(new Set(created.map((item) => item.id)).size).toBe(6);

    const persisted = await observer.connection
        .select()
        .from(requestComments)
        .where(eq(requestComments.requestId, fx.draft.id));
    expect(persisted).toHaveLength(6);

    const versionAfterRow = await observer.connection.execute<{ version: number; status: string }>(
        sql`SELECT version, status FROM public.requests WHERE id = ${fx.draft.id}`,
    );
    expect(versionAfterRow[0]?.version).toBe(versionBefore);
    expect(versionAfterRow[0]?.status).toBe("PENDING");
});
