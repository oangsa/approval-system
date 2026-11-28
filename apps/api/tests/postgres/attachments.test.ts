import { createHash, randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
    attachmentSchema,
    errorResponseSchema,
    paginationSchema,
    type CreateRequest,
    type PublishedRequestType,
    type UserRole,
} from "@workflow/contracts";
import { z } from "zod";
import { createTestDatabase } from "../helpers/testDatabase";
import { expectHttpError } from "../helpers/identityHttp";
import { DecisionService } from "../../src/Applications/Approvals/DecisionService";
import { AttachmentService } from "../../src/Applications/Requests/AttachmentService";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import type { IActor } from "../../src/Domains/Identity/Identity";
import type { IStageDefinition } from "../../src/Domains/Requests/RequestRules";
import { readEnvironment } from "../../src/Infrastructures/Configuration/environment";
import { AttachmentUnitOfWork } from "../../src/Infrastructures/Database/Repositories/AttachmentRepository";
import { DecisionUnitOfWork } from "../../src/Infrastructures/Database/Repositories/DecisionRepository";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { RequestUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";
import {
    approvalPolicyVersions,
    attachments,
    attachmentUploadReservations,
    departmentMemberships,
    departments,
    requestRevisions,
    requests,
    requestTypes,
    requestTypeVersions,
    reviewerAssignmentRules,
    sessionFamilies,
    userRoles,
    users,
} from "../../src/Infrastructures/Database/schema";
import { TokenProvider } from "../../src/Infrastructures/Security/TokenProvider";
import { InMemoryPrivateObjectStorage } from "../../src/Infrastructures/Storage";
import { createIdentityComposition } from "../../src/Presentations/composition";
import { createApplication } from "../../src/Presentations/createApplication";

const database = createTestDatabase();
const observer = createTestDatabase();
const db = database.connection;

const requestService = new RequestService(new RequestUnitOfWork(db));
const decisionService = new DecisionService(new DecisionUnitOfWork(db));

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

async function expectSqlState(
    operation: () => Promise<unknown>,
    expectedCode: string,
    expectedMessagePattern?: RegExp,
): Promise<void>
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
    const pgError = readPostgresError(caught);
    expect(pgError.code).toBe(expectedCode);
    if (expectedMessagePattern)
    {
        expect(pgError.message).toMatch(expectedMessagePattern);
    }
}

function sha256Hex(bytes: Uint8Array): string
{
    return createHash("sha256").update(bytes).digest("hex");
}

function pdfBytes(label = "1.7"): Uint8Array
{
    return new TextEncoder().encode(`%PDF-${label}\n%evidence-payload-${label}\n`);
}

function pngBytes(tag = 1): Uint8Array
{
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, tag & 0xff, 0x11, 0x22]);
}

function makeUploadForm(
    file: { bytes: Uint8Array; name: string; type: string },
    workingRevisionId?: string,
): FormData
{
    const form = new FormData();
    const buffer = new ArrayBuffer(file.bytes.byteLength);
    new Uint8Array(buffer).set(file.bytes);
    form.append("file", new File([buffer], file.name, { type: file.type }));
    if (workingRevisionId !== undefined)
    {
        form.append("workingRevisionId", workingRevisionId);
    }
    return form;
}

async function seedActor(displayName: string, roles: readonly UserRole[]): Promise<{ id: string; actor: IActor }>
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

async function seedAttachmentFixture(twoStage = false)
{
    const owner = await seedActor("Attachment Owner", ["REQUESTER"]);
    const stage1Reviewer = await seedActor("Stage 1 Reviewer", ["REVIEWER"]);
    const stage2Reviewer = await seedActor("Stage 2 Reviewer", ["REVIEWER"]);
    const foreignRequester = await seedActor("Foreign Requester", ["REQUESTER"]);
    const admin = await seedActor("Unrelated Admin", ["ADMINISTRATOR"]);

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
        code: `ATT_${typeId.slice(0, 8)}`,
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
        title: "Attachment test request",
        justification: "Verify private attachments against PostgreSQL",
        priority: "HIGH",
        fields: { category: "OPERATIONS" },
    };

    const draft = await requestService.Mutate(owner.actor, "create", null, content, randomUUID());
    const storage = new InMemoryPrivateObjectStorage();
    const attachmentService = new AttachmentService(new AttachmentUnitOfWork(db), storage);

    const environment = readEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        AUTH_JWT_SECRET: "issue13-attachments-pg-test-secret-0123456789",
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
        { attachments: attachmentService, attachmentStorage: storage },
    );
    const tokens = new TokenProvider(
        environment.AUTH_JWT_SECRET,
        { Now: () => new Date() },
        environment.AUTH_JWT_ISSUER,
        environment.AUTH_JWT_AUDIENCE,
    );

    const tokenFor = (actor: IActor) => tokens.Sign(actor.account.id, actor.family.id, actor.account.authVersion);

    const http = {
        get: async (path: string, actor: IActor) =>
        {
            const token = await tokenFor(actor);
            return app.handle(
                new Request(`http://localhost/api/v1${path}`, {
                    method: "GET",
                    headers: { authorization: `Bearer ${token}` },
                }),
            );
        },
        upload: async (
            requestId: string,
            actor: IActor,
            file: { bytes: Uint8Array; name: string; type: string },
            workingRevisionId?: string,
        ) =>
        {
            const token = await tokenFor(actor);
            return app.handle(
                new Request(`http://localhost/api/v1/requests/${requestId}/attachments`, {
                    method: "POST",
                    headers: { authorization: `Bearer ${token}` },
                    body: makeUploadForm(file, workingRevisionId),
                }),
            );
        },
        delete: async (requestId: string, attachmentId: string, actor: IActor) =>
        {
            const token = await tokenFor(actor);
            return app.handle(
                new Request(`http://localhost/api/v1/requests/${requestId}/attachments/${attachmentId}`, {
                    method: "DELETE",
                    headers: { authorization: `Bearer ${token}` },
                }),
            );
        },
    };

    return {
        owner,
        stage1Reviewer,
        stage2Reviewer,
        foreignRequester,
        admin,
        typeId,
        versionId,
        ruleOneId,
        content,
        draft,
        storage,
        attachmentService,
        http,
    };
}

test("ATT-PG-01 upload to DRAFT links attachments to working_revision_id, marks reservation FINALIZED, and leaves requests.version unchanged", async () =>
{
    const fx = await seedAttachmentFixture(false);
    const payload = pdfBytes("draft-01");
    const workingRevisionId = fx.draft.workingRevision!.id;

    const uploadRes = await fx.http.upload(
        fx.draft.id,
        fx.owner.actor,
        { bytes: payload, name: "quote.pdf", type: "application/pdf" },
        workingRevisionId,
    );
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.headers.get("cache-control")).toBe("no-store");
    const dto = attachmentSchema.parse(await uploadRes.json());
    expect(uploadRes.headers.get("location")).toBe(`/api/v1/attachments/${dto.id}/download`);
    expect(dto.workingOrSubmittedRevisionId).toBe(workingRevisionId);

    const attachmentRows = await observer.connection
        .select()
        .from(attachments)
        .where(eq(attachments.id, dto.id));
    expect(attachmentRows).toHaveLength(1);
    expect(attachmentRows[0]).toMatchObject({
        id: dto.id,
        requestId: fx.draft.id,
        revisionId: workingRevisionId,
        uploadedBy: fx.owner.id,
        fileName: "quote.pdf",
        mediaType: "application/pdf",
        sizeBytes: payload.byteLength,
        sha256: sha256Hex(payload),
    });

    const reservationRows = await observer.connection
        .select()
        .from(attachmentUploadReservations)
        .where(eq(attachmentUploadReservations.attachmentId, dto.id));
    expect(reservationRows).toHaveLength(1);
    expect(reservationRows[0]?.status).toBe("FINALIZED");
    expect(reservationRows[0]?.finalizedAt).not.toBeNull();
    expect(fx.storage.Has(attachmentRows[0]!.storageKey)).toBe(true);

    const requestRow = (await observer.connection
        .select({ version: requests.version })
        .from(requests)
        .where(eq(requests.id, fx.draft.id)))[0]!;
    expect(requestRow.version).toBe(fx.draft.version);
});

test("ATT-PG-02 owner and current ACTIONABLE/WAITING reviewers download SHA-256 matching bytes and list supports revisionId scoping & pagination", async () =>
{
    const fx = await seedAttachmentFixture(true);
    const workingRevisionId = fx.draft.workingRevision!.id;
    const payload1 = pdfBytes("rev1-file-one");
    const payload2 = pngBytes(42);

    const up1 = await fx.http.upload(fx.draft.id, fx.owner.actor, { bytes: payload1, name: "invoice.pdf", type: "application/pdf" }, workingRevisionId);
    expect(up1.status).toBe(201);
    const att1 = attachmentSchema.parse(await up1.json());

    const up2 = await fx.http.upload(fx.draft.id, fx.owner.actor, { bytes: payload2, name: "diagram.png", type: "image/png" }, workingRevisionId);
    expect(up2.status).toBe(201);
    const att2 = attachmentSchema.parse(await up2.json());

    const submitted = await requestService.Mutate(fx.owner.actor, "submit", fx.draft.id, { expectedVersion: 0 }, randomUUID());
    expect(submitted.status).toBe("PENDING");
    const submittedRevisionId = submitted.submittedRevision!.id;

    // Owner, ACTIONABLE stage-1 reviewer, and WAITING stage-2 reviewer can all download exact bytes.
    for (const [actor, target, expectedBytes] of [
        [fx.owner.actor, att1, payload1],
        [fx.stage1Reviewer.actor, att1, payload1],
        [fx.stage2Reviewer.actor, att2, payload2],
    ] as const)
    {
        const dl = await fx.http.get(`/attachments/${target.id}/download`, actor);
        expect(dl.status).toBe(200);
        expect(dl.headers.get("cache-control")).toBe("no-store");
        expect(dl.headers.get("x-content-type-options")).toBe("nosniff");
        expect(dl.headers.get("content-length")).toBe(String(expectedBytes.byteLength));
        const downloaded = new Uint8Array(await dl.arrayBuffer());
        expect(sha256Hex(downloaded)).toBe(sha256Hex(expectedBytes));
    }

    // Verify revisionId scoping and pagination.
    const page1 = await fx.http.get(
        `/requests/${fx.draft.id}/attachments?revisionId=${submittedRevisionId}&pageNumber=1&pageSize=1`,
        fx.stage1Reviewer.actor,
    );
    expect(page1.status).toBe(200);
    expect(paginationSchema.parse(JSON.parse(page1.headers.get("x-pagination") ?? "{}"))).toEqual({
        currentPage: 1,
        pageSize: 1,
        totalPages: 2,
        totalCount: 2,
        hasPrevious: false,
        hasNext: true,
    });
    const page1Items = z.array(attachmentSchema).parse(await page1.json());
    expect(page1Items.map((item) => item.id)).toEqual([att1.id]);

    const page2 = await fx.http.get(
        `/requests/${fx.draft.id}/attachments?revisionId=${submittedRevisionId}&pageNumber=2&pageSize=1`,
        fx.stage2Reviewer.actor,
    );
    expect(page2.status).toBe(200);
    expect(paginationSchema.parse(JSON.parse(page2.headers.get("x-pagination") ?? "{}"))).toEqual({
        currentPage: 2,
        pageSize: 1,
        totalPages: 2,
        totalCount: 2,
        hasPrevious: true,
        hasNext: false,
    });
    const page2Items = z.array(attachmentSchema).parse(await page2.json());
    expect(page2Items.map((item) => item.id)).toEqual([att2.id]);

    // Unrelated revisionId yields empty list without leaking other requests.
    const otherRev = await fx.http.get(`/requests/${fx.draft.id}/attachments?revisionId=${randomUUID()}`, fx.owner.actor);
    expect(otherRev.status).toBe(200);
    expect(await otherRev.json()).toEqual([]);
});

test("ATT-PG-03 former reviewer receives 404 on attachments and downloads while current cycle-2 reviewer reads and downloads cycle 1/2 evidence", async () =>
{
    const fx = await seedAttachmentFixture(false);
    const rev1Id = fx.draft.workingRevision!.id;
    const payload1 = pdfBytes("cycle-1-evidence");

    const up1 = await fx.http.upload(fx.draft.id, fx.owner.actor, { bytes: payload1, name: "cycle1.pdf", type: "application/pdf" }, rev1Id);
    expect(up1.status).toBe(201);
    const att1 = attachmentSchema.parse(await up1.json());

    const cycle1 = await requestService.Mutate(fx.owner.actor, "submit", fx.draft.id, { expectedVersion: 0 }, randomUUID());
    const slot1 = cycle1.currentApprovers[0]!.slotId;

    const returned = await decisionService.Decide(
        fx.stage1Reviewer.actor,
        slot1,
        { decision: "RETURN", reason: "Re-route in cycle 2", expectedVersion: 0 },
        randomUUID(),
    );
    expect(returned.requestStatus).toBe("RETURNED");

    // While RETURNED, former cycle-1 reviewer is denied 404 on attachment list and download.
    await expectHttpError(await fx.http.get(`/requests/${fx.draft.id}/attachments`, fx.stage1Reviewer.actor), 404);
    await expectHttpError(await fx.http.get(`/attachments/${att1.id}/download`, fx.stage1Reviewer.actor), 404);

    // Owner uploads cycle-2 evidence and reassigns reviewer to stage2Reviewer before resubmit.
    const returnedDetail = await requestService.Read(fx.owner.actor, fx.draft.id);
    const rev2Id = returnedDetail.workingRevision!.id;
    const payload2 = pngBytes(77);
    const up2 = await fx.http.upload(fx.draft.id, fx.owner.actor, { bytes: payload2, name: "cycle2.png", type: "image/png" }, rev2Id);
    expect(up2.status).toBe(201);
    const att2 = attachmentSchema.parse(await up2.json());

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

    // Former reviewer remains blocked 404 in cycle 2.
    await expectHttpError(await fx.http.get(`/requests/${fx.draft.id}/attachments`, fx.stage1Reviewer.actor), 404);
    await expectHttpError(await fx.http.get(`/attachments/${att1.id}/download`, fx.stage1Reviewer.actor), 404);
    await expectHttpError(await fx.http.get(`/attachments/${att2.id}/download`, fx.stage1Reviewer.actor), 404);

    // Current cycle-2 reviewer can list and download both cycle-1 and cycle-2 submitted evidence.
    const listRes = await fx.http.get(`/requests/${fx.draft.id}/attachments`, fx.stage2Reviewer.actor);
    expect(listRes.status).toBe(200);
    const listed = z.array(attachmentSchema).parse(await listRes.json());
    expect(listed.map((item) => item.id)).toEqual([att1.id, att2.id]);

    for (const [att, expectedBytes] of [[att1, payload1], [att2, payload2]] as const)
    {
        const dl = await fx.http.get(`/attachments/${att.id}/download`, fx.stage2Reviewer.actor);
        expect(dl.status).toBe(200);
        expect(sha256Hex(new Uint8Array(await dl.arrayBuffer()))).toBe(sha256Hex(expectedBytes));
    }
});

test("ATT-PG-04 foreign requester and unrelated administrator receive 404 on attachment list and download", async () =>
{
    const fx = await seedAttachmentFixture(false);
    const payload = pdfBytes("private-doc");
    const up = await fx.http.upload(
        fx.draft.id,
        fx.owner.actor,
        { bytes: payload, name: "private.pdf", type: "application/pdf" },
        fx.draft.workingRevision!.id,
    );
    expect(up.status).toBe(201);
    const att = attachmentSchema.parse(await up.json());

    for (const outsider of [fx.foreignRequester.actor, fx.admin.actor])
    {
        await expectHttpError(await fx.http.get(`/requests/${fx.draft.id}/attachments`, outsider), 404);
        await expectHttpError(await fx.http.get(`/attachments/${att.id}/download`, outsider), 404);
    }

    await requestService.Mutate(fx.owner.actor, "submit", fx.draft.id, { expectedVersion: 0 }, randomUUID());

    for (const outsider of [fx.foreignRequester.actor, fx.admin.actor])
    {
        await expectHttpError(await fx.http.get(`/requests/${fx.draft.id}/attachments`, outsider), 404);
        await expectHttpError(await fx.http.get(`/attachments/${att.id}/download`, outsider), 404);
    }
});

test("ATT-PG-05 Submit() preserves revision_id, keeps attachment readable, and subsequent DELETE returns 409 INVALID_REQUEST_TRANSITION", async () =>
{
    const fx = await seedAttachmentFixture(false);
    const rev1Id = fx.draft.workingRevision!.id;
    const payload = pdfBytes("submitted-lock");

    const up = await fx.http.upload(fx.draft.id, fx.owner.actor, { bytes: payload, name: "contract.pdf", type: "application/pdf" }, rev1Id);
    expect(up.status).toBe(201);
    const att = attachmentSchema.parse(await up.json());

    const submitted = await requestService.Mutate(fx.owner.actor, "submit", fx.draft.id, { expectedVersion: 0 }, randomUUID());
    expect(submitted.workingRevision).toBeNull();
    expect(submitted.submittedRevision?.id).toBe(rev1Id);

    const dbRow = (await observer.connection.select().from(attachments).where(eq(attachments.id, att.id)))[0]!;
    expect(dbRow.revisionId).toBe(rev1Id);

    const dl = await fx.http.get(`/attachments/${att.id}/download`, fx.owner.actor);
    expect(dl.status).toBe(200);
    expect(sha256Hex(new Uint8Array(await dl.arrayBuffer()))).toBe(sha256Hex(payload));

    const deleteRes = await fx.http.delete(fx.draft.id, att.id, fx.owner.actor);
    expect(deleteRes.status).toBe(409);
    const errorBody = errorResponseSchema.parse(await deleteRes.json());
    expect(errorBody.code).toBe("INVALID_REQUEST_TRANSITION");

    // Attachment row and stored object remain intact after rejected delete.
    expect(await observer.connection.select().from(attachments).where(eq(attachments.id, att.id))).toHaveLength(1);
    expect(fx.storage.Has(dbRow.storageKey)).toBe(true);
});

test("ATT-PG-06 RETURN creates new working revision with 0 attachments while prior submitted attachment stays immutable", async () =>
{
    const fx = await seedAttachmentFixture(false);
    const rev1Id = fx.draft.workingRevision!.id;
    const rev1Payload = pdfBytes("rev1-evidence");

    const up1 = await fx.http.upload(fx.draft.id, fx.owner.actor, { bytes: rev1Payload, name: "rev1.pdf", type: "application/pdf" }, rev1Id);
    expect(up1.status).toBe(201);
    const att1 = attachmentSchema.parse(await up1.json());

    const cycle1 = await requestService.Mutate(fx.owner.actor, "submit", fx.draft.id, { expectedVersion: 0 }, randomUUID());
    await decisionService.Decide(
        fx.stage1Reviewer.actor,
        cycle1.currentApprovers[0]!.slotId,
        { decision: "RETURN", reason: "Attach updated supporting file", expectedVersion: 0 },
        randomUUID(),
    );

    const returnedDetail = await requestService.Read(fx.owner.actor, fx.draft.id);
    const rev2Id = returnedDetail.workingRevision!.id;
    expect(rev2Id).not.toBe(rev1Id);

    // New working revision starts with 0 attachments.
    const rev2List = await fx.http.get(`/requests/${fx.draft.id}/attachments?revisionId=${rev2Id}`, fx.owner.actor);
    expect(rev2List.status).toBe(200);
    expect(await rev2List.json()).toEqual([]);

    // Submitted revision still retains att1.
    const rev1List = await fx.http.get(`/requests/${fx.draft.id}/attachments?revisionId=${rev1Id}`, fx.owner.actor);
    expect(rev1List.status).toBe(200);
    expect(z.array(attachmentSchema).parse(await rev1List.json()).map((item) => item.id)).toEqual([att1.id]);

    // Uploading and deleting on rev2 affects only rev2.
    const rev2Payload = pngBytes(99);
    const up2 = await fx.http.upload(fx.draft.id, fx.owner.actor, { bytes: rev2Payload, name: "rev2.png", type: "image/png" }, rev2Id);
    expect(up2.status).toBe(201);
    const att2 = attachmentSchema.parse(await up2.json());
    expect(att2.workingOrSubmittedRevisionId).toBe(rev2Id);

    const del2 = await fx.http.delete(fx.draft.id, att2.id, fx.owner.actor);
    expect(del2.status).toBe(204);

    // att1 on rev1 remains intact and cannot be deleted.
    const del1 = await fx.http.delete(fx.draft.id, att1.id, fx.owner.actor);
    expect(del1.status).toBe(409);
    expect(errorResponseSchema.parse(await del1.json()).code).toBe("INVALID_REQUEST_TRANSITION");

    const dl1 = await fx.http.get(`/attachments/${att1.id}/download`, fx.owner.actor);
    expect(dl1.status).toBe(200);
    expect(sha256Hex(new Uint8Array(await dl1.arrayBuffer()))).toBe(sha256Hex(rev1Payload));
});

test("ATT-PG-07 direct SQL INSERT, UPDATE, and DELETE on submitted revision attachments raises SQLSTATE 23514", async () =>
{
    const fx = await seedAttachmentFixture(false);
    const rev1Id = fx.draft.workingRevision!.id;
    const payload = pdfBytes("trigger-test");

    const up = await fx.http.upload(fx.draft.id, fx.owner.actor, { bytes: payload, name: "immutable.pdf", type: "application/pdf" }, rev1Id);
    expect(up.status).toBe(201);
    const att = attachmentSchema.parse(await up.json());

    await requestService.Mutate(fx.owner.actor, "submit", fx.draft.id, { expectedVersion: 0 }, randomUUID());

    await expectSqlState(
        () => db.insert(attachments).values({
            id: randomUUID(),
            requestId: fx.draft.id,
            revisionId: rev1Id,
            uploadedBy: fx.owner.id,
            fileName: "late-sql.pdf",
            mediaType: "application/pdf",
            sizeBytes: 16,
            storageKey: `attachments/${fx.draft.id}/${rev1Id}/${randomUUID()}`,
            sha256: "b".repeat(64),
        }),
        "23514",
        /Submitted attachments are immutable/,
    );

    await expectSqlState(
        () => db.update(attachments).set({ fileName: "tampered.pdf" }).where(eq(attachments.id, att.id)),
        "23514",
        /Submitted attachments are immutable/,
    );

    await expectSqlState(
        () => db.delete(attachments).where(eq(attachments.id, att.id)),
        "23514",
        /Submitted attachments are immutable/,
    );
});

test("ATT-PG-08 direct SQL INSERT into attachments with R1.id and R2.working_revision_id rejected by composite FK (23503)", async () =>
{
    const fx = await seedAttachmentFixture(false);
    const requestOne = fx.draft;
    const requestTwo = await requestService.Mutate(fx.owner.actor, "create", null, fx.content, randomUUID());

    // Sanity check that workingRevisionId exists on R2.
    const r2RevisionRows = await observer.connection
        .select({ id: requestRevisions.id })
        .from(requestRevisions)
        .where(sql`${requestRevisions.id} = ${requestTwo.workingRevision!.id}`);
    expect(r2RevisionRows).toHaveLength(1);

    await expectSqlState(
        () => db.insert(attachments).values({
            id: randomUUID(),
            requestId: requestOne.id,
            revisionId: requestTwo.workingRevision!.id,
            uploadedBy: fx.owner.id,
            fileName: "cross-request.pdf",
            mediaType: "application/pdf",
            sizeBytes: 32,
            storageKey: `attachments/${requestOne.id}/${requestTwo.workingRevision!.id}/${randomUUID()}`,
            sha256: "c".repeat(64),
        }),
        "23503",
    );
});
