import { createHash, randomUUID } from "node:crypto";
import { afterAll, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
    errorResponseSchema,
    MAX_ATTACHMENTS_PER_REVISION,
    type CreateRequest,
    type PublishedRequestType,
    type UserRole,
} from "@workflow/contracts";
import { createTestDatabase } from "../helpers/testDatabase";
import { DecisionService } from "../../src/Applications/Approvals/DecisionService";
import { AttachmentService } from "../../src/Applications/Requests/AttachmentService";
import { CommentService } from "../../src/Applications/Requests/CommentService";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import type { IActor } from "../../src/Domains/Identity/Identity";
import { readEnvironment } from "../../src/Infrastructures/Configuration/environment";
import {
    AttachmentRepository,
    AttachmentUnitOfWork,
} from "../../src/Infrastructures/Database/Repositories/AttachmentRepository";
import {
    CommentRepository,
    CommentUnitOfWork,
} from "../../src/Infrastructures/Database/Repositories/CommentRepository";
import { DecisionUnitOfWork } from "../../src/Infrastructures/Database/Repositories/DecisionRepository";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import {
    RequestRepository,
    RequestUnitOfWork,
} from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";
import {
    approvalPolicyVersions,
    approvalSlots,
    approvalStages,
    attachmentCleanupJobs,
    attachments,
    attachmentUploadReservations,
    departmentMemberships,
    departments,
    requestComments,
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

const requestServiceA = new RequestService(new RequestUnitOfWork(db));
const requestServiceB = new RequestService(new RequestUnitOfWork(observer.connection));
const decisionServiceA = new DecisionService(new DecisionUnitOfWork(db));
const commentServiceA = new CommentService(new CommentUnitOfWork(db));
const commentServiceB = new CommentService(new CommentUnitOfWork(observer.connection));

afterAll(async () =>
{
    await database.Close();
    await observer.Close();
});

function sha256Hex(bytes: Uint8Array): string
{
    return createHash("sha256").update(bytes).digest("hex");
}

function pdfBytes(label: string): Uint8Array
{
    return new TextEncoder().encode(`%PDF-1.7\n%concurrency-${label}\n`);
}

function rendezvous(parties = 2): () => Promise<void>
{
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) =>
    {
        release = resolve;
    });

    return async () =>
    {
        if (++arrivals >= parties)
        {
            release();
        }
        await gate;
    };
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

async function seedConcurrencyFixture()
{
    const owner = await seedActor("Concurrency Owner", ["REQUESTER"]);
    const reviewer = await seedActor("Concurrency Reviewer", ["REVIEWER"]);
    const departmentId = randomUUID();
    const typeId = randomUUID();
    const versionId = randomUUID();
    const policyId = randomUUID();

    const definition: PublishedRequestType = {
        ...seededDefinition,
        id: typeId,
        versionId,
        code: `CX_${typeId.slice(0, 8)}`,
        monetary: false,
        supportsLineItems: false,
    };

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
            stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }],
        });
        await tx.insert(reviewerAssignmentRules).values({
            id: randomUUID(),
            assignmentKey: "review",
            departmentId,
            reviewerId: reviewer.id,
        });
    });

    const content: CreateRequest = {
        typeId,
        formDefinitionVersionId: versionId,
        title: "Concurrency test request",
        justification: "Verify serialization across independent DB connections",
        priority: "HIGH",
        fields: { category: "OPERATIONS" },
    };

    const createDraft = () => requestServiceA.Mutate(owner.actor, "create", null, content, randomUUID());
    const storage = new InMemoryPrivateObjectStorage();
    const attachmentServiceA = new AttachmentService(new AttachmentUnitOfWork(db), storage);
    const attachmentServiceB = new AttachmentService(new AttachmentUnitOfWork(observer.connection), storage);

    return {
        owner,
        reviewer,
        content,
        createDraft,
        storage,
        attachmentServiceA,
        attachmentServiceB,
    };
}

test("ATT-CX-01 paused upload while Submit() commits marks reservation ABANDONED, enqueues COMMIT_CONFLICT job, and leaves zero late attachments", async () =>
{
    const fx = await seedConcurrencyFixture();
    const draft = await fx.createDraft();
    const workingRevisionId = draft.workingRevision!.id;

    let enteredPut!: () => void;
    let releasePut!: () => void;
    const putEntered = new Promise<void>((resolve) =>
    {
        enteredPut = resolve;
    });
    const putRelease = new Promise<void>((resolve) =>
    {
        releasePut = resolve;
    });

    fx.storage.SetFaultHooks({
        onPutObject: async () =>
        {
            enteredPut();
            await putRelease;
        },
    });

    const uploadPromise = fx.attachmentServiceA.UploadAttachment({
        actor: fx.owner.actor,
        requestId: draft.id,
        fileName: "late-upload.pdf",
        declaredMediaType: "application/pdf",
        bytes: pdfBytes("cx-01"),
        workingRevisionId,
    });

    try
    {
        await putEntered;
        const submitted = await requestServiceB.Mutate(
            fx.owner.actor,
            "submit",
            draft.id,
            { expectedVersion: 0 },
            randomUUID(),
        );
        expect(submitted.status).toBe("PENDING");
        expect(submitted.submittedRevision?.id).toBe(workingRevisionId);
    }
    finally
    {
        releasePut();
    }

    await expect(uploadPromise).rejects.toMatchObject({ code: "INVALID_REQUEST_TRANSITION" });

    const committedAttachments = await observer.connection
        .select()
        .from(attachments)
        .where(eq(attachments.requestId, draft.id));
    expect(committedAttachments).toHaveLength(0);

    const reservations = await observer.connection
        .select()
        .from(attachmentUploadReservations)
        .where(eq(attachmentUploadReservations.requestId, draft.id));
    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.status).toBe("ABANDONED");
    expect(reservations[0]?.abandonedAt).not.toBeNull();

    const jobs = await observer.connection
        .select()
        .from(attachmentCleanupJobs)
        .where(eq(attachmentCleanupJobs.reservationId, reservations[0]!.id));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
        reason: "COMMIT_CONFLICT",
        status: "PENDING",
        storageKey: reservations[0]!.storageKey,
    });
});

test("ATT-CX-02 Submit() vs DELETE working attachment serializes cleanly under requests FOR UPDATE", async () =>
{
    const fx = await seedConcurrencyFixture();
    const draft = await fx.createDraft();
    const uploaded = await fx.attachmentServiceA.UploadAttachment({
        actor: fx.owner.actor,
        requestId: draft.id,
        fileName: "working.pdf",
        declaredMediaType: "application/pdf",
        bytes: pdfBytes("cx-02"),
        workingRevisionId: draft.workingRevision!.id,
    });

    const barrier = rendezvous(2);
    const originalCurrentActor = RequestRepository.prototype.CurrentActor;
    const spy = vi.spyOn(RequestRepository.prototype, "CurrentActor").mockImplementation(async function (this: RequestRepository, actor)
    {
        if (actor.account.id === fx.owner.id)
        {
            await barrier();
        }
        return originalCurrentActor.call(this, actor);
    });

    let submitOutcome: PromiseSettledResult<Awaited<ReturnType<RequestService["Mutate"]>>>;
    let deleteOutcome: PromiseSettledResult<void>;
    try
    {
        [submitOutcome, deleteOutcome] = await Promise.allSettled([
            requestServiceA.Mutate(fx.owner.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID()),
            fx.attachmentServiceB.DeleteWorkingAttachment({
                actor: fx.owner.actor,
                requestId: draft.id,
                attachmentId: uploaded.id,
            }),
        ]);
    }
    finally
    {
        spy.mockRestore();
    }

    expect(submitOutcome.status).toBe("fulfilled");
    if (submitOutcome.status === "fulfilled")
    {
        expect(submitOutcome.value.status).toBe("PENDING");
    }

    const savedAttachments = await observer.connection
        .select()
        .from(attachments)
        .where(eq(attachments.requestId, draft.id));
    const cleanupRows = await observer.connection
        .select()
        .from(attachmentCleanupJobs)
        .where(eq(attachmentCleanupJobs.attachmentId, uploaded.id));

    if (deleteOutcome.status === "fulfilled")
    {
        expect(savedAttachments).toHaveLength(0);
        expect(cleanupRows).toHaveLength(1);
        expect(cleanupRows[0]?.reason).toBe("WORKING_DELETED");
    }
    else
    {
        expect(deleteOutcome.reason).toMatchObject({ code: "INVALID_REQUEST_TRANSITION" });
        expect(savedAttachments).toHaveLength(1);
        expect(savedAttachments[0]?.id).toBe(uploaded.id);
        expect(cleanupRows).toHaveLength(0);
    }
});

test("ATT-CX-03 Upload X raced with Submit() leaves no torn state", async () =>
{
    const fx = await seedConcurrencyFixture();
    const draft = await fx.createDraft();
    const workingRevisionId = draft.workingRevision!.id;

    const barrier = rendezvous(2);
    const originalFinalize = AttachmentRepository.prototype.FinalizeUpload;
    const originalRead = RequestRepository.prototype.Read;

    const finalizeSpy = vi.spyOn(AttachmentRepository.prototype, "FinalizeUpload").mockImplementation(async function (this: AttachmentRepository, input)
    {
        if (input.requestId === draft.id)
        {
            await barrier();
        }
        return originalFinalize.call(this, input);
    });
    const readSpy = vi.spyOn(RequestRepository.prototype, "Read").mockImplementation(async function (this: RequestRepository, id, lock = false)
    {
        if (id === draft.id && lock)
        {
            await barrier();
        }
        return originalRead.call(this, id, lock);
    });

    let uploadOutcome: PromiseSettledResult<Awaited<ReturnType<AttachmentService["UploadAttachment"]>>>;
    let submitOutcome: PromiseSettledResult<Awaited<ReturnType<RequestService["Mutate"]>>>;
    try
    {
        [uploadOutcome, submitOutcome] = await Promise.allSettled([
            fx.attachmentServiceA.UploadAttachment({
                actor: fx.owner.actor,
                requestId: draft.id,
                fileName: "race-x.pdf",
                declaredMediaType: "application/pdf",
                bytes: pdfBytes("cx-03"),
                workingRevisionId,
            }),
            requestServiceB.Mutate(fx.owner.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID()),
        ]);
    }
    finally
    {
        finalizeSpy.mockRestore();
        readSpy.mockRestore();
    }

    expect(submitOutcome.status).toBe("fulfilled");
    const savedAttachments = await observer.connection
        .select()
        .from(attachments)
        .where(eq(attachments.requestId, draft.id));
    const reservations = await observer.connection
        .select()
        .from(attachmentUploadReservations)
        .where(eq(attachmentUploadReservations.requestId, draft.id));
    expect(reservations).toHaveLength(1);

    if (uploadOutcome.status === "fulfilled")
    {
        expect(savedAttachments).toHaveLength(1);
        expect(savedAttachments[0]?.revisionId).toBe(workingRevisionId);
        expect(reservations[0]?.status).toBe("FINALIZED");
    }
    else
    {
        expect(uploadOutcome.reason).toMatchObject({ code: "INVALID_REQUEST_TRANSITION" });
        expect(savedAttachments).toHaveLength(0);
        expect(reservations[0]?.status).toBe("ABANDONED");
        const jobs = await observer.connection
            .select()
            .from(attachmentCleanupJobs)
            .where(eq(attachmentCleanupJobs.reservationId, reservations[0]!.id));
        expect(jobs).toHaveLength(1);
        expect(jobs[0]?.reason).toBe("COMMIT_CONFLICT");
    }
});

test("ATT-CX-04 RETURNED request races Resubmit() against working upload and delete without touching cycle-1 evidence", async () =>
{
    const fx = await seedConcurrencyFixture();

    async function setupReturnedWithCycle1AndCycle2Evidence()
    {
        const draft = await fx.createDraft();
        const rev1Id = draft.workingRevision!.id;
        const cycle1Att = await fx.attachmentServiceA.UploadAttachment({
            actor: fx.owner.actor,
            requestId: draft.id,
            fileName: "cycle1.pdf",
            declaredMediaType: "application/pdf",
            bytes: pdfBytes("cx-04-cycle1"),
            workingRevisionId: rev1Id,
        });
        const pending1 = await requestServiceA.Mutate(fx.owner.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
        const returned = await decisionServiceA.Decide(
            fx.reviewer.actor,
            pending1.currentApprovers[0]!.slotId,
            { decision: "RETURN", reason: "Revise cycle 2", expectedVersion: 0 },
            randomUUID(),
        );
        const returnedDetail = await requestServiceA.Read(fx.owner.actor, draft.id);
        const rev2Id = returnedDetail.workingRevision!.id;
        const cycle2WorkingAtt = await fx.attachmentServiceA.UploadAttachment({
            actor: fx.owner.actor,
            requestId: draft.id,
            fileName: "cycle2-existing.pdf",
            declaredMediaType: "application/pdf",
            bytes: pdfBytes("cx-04-cycle2"),
            workingRevisionId: rev2Id,
        });

        return {
            requestId: draft.id,
            rev1Id,
            rev2Id,
            version: returned.requestVersion,
            cycle1Att,
            cycle2WorkingAtt,
        };
    }

    // Race 1: Resubmit vs Upload on cycle-2 working revision.
    const caseUpload = await setupReturnedWithCycle1AndCycle2Evidence();
    const uploadBarrier = rendezvous(2);
    const originalFinalize = AttachmentRepository.prototype.FinalizeUpload;
    const originalRead = RequestRepository.prototype.Read;
    const finalizeSpy = vi.spyOn(AttachmentRepository.prototype, "FinalizeUpload").mockImplementation(async function (this: AttachmentRepository, input)
    {
        if (input.requestId === caseUpload.requestId)
        {
            await uploadBarrier();
        }
        return originalFinalize.call(this, input);
    });
    const readSpy1 = vi.spyOn(RequestRepository.prototype, "Read").mockImplementation(async function (this: RequestRepository, id, lock = false)
    {
        if (id === caseUpload.requestId && lock)
        {
            await uploadBarrier();
        }
        return originalRead.call(this, id, lock);
    });

    let resubmit1: PromiseSettledResult<Awaited<ReturnType<RequestService["Mutate"]>>>;
    let uploadRace: PromiseSettledResult<Awaited<ReturnType<AttachmentService["UploadAttachment"]>>>;
    try
    {
        [resubmit1, uploadRace] = await Promise.allSettled([
            requestServiceA.Mutate(fx.owner.actor, "resubmit", caseUpload.requestId, { expectedVersion: caseUpload.version }, randomUUID()),
            fx.attachmentServiceB.UploadAttachment({
                actor: fx.owner.actor,
                requestId: caseUpload.requestId,
                fileName: "cycle2-new.pdf",
                declaredMediaType: "application/pdf",
                bytes: pdfBytes("cx-04-new"),
                workingRevisionId: caseUpload.rev2Id,
            }),
        ]);
    }
    finally
    {
        finalizeSpy.mockRestore();
        readSpy1.mockRestore();
    }

    expect(resubmit1.status).toBe("fulfilled");
    const rev1AfterUploadRace = await observer.connection
        .select()
        .from(attachments)
        .where(eq(attachments.revisionId, caseUpload.rev1Id));
    expect(rev1AfterUploadRace.map((row) => row.id)).toEqual([caseUpload.cycle1Att.id]);

    const rev2AfterUploadRace = await observer.connection
        .select()
        .from(attachments)
        .where(eq(attachments.revisionId, caseUpload.rev2Id));
    if (uploadRace.status === "fulfilled")
    {
        expect(rev2AfterUploadRace).toHaveLength(2);
    }
    else
    {
        expect(uploadRace.reason).toMatchObject({ code: "INVALID_REQUEST_TRANSITION" });
        expect(rev2AfterUploadRace).toHaveLength(1);
    }

    // Race 2: Resubmit vs Delete on cycle-2 working attachment.
    const caseDelete = await setupReturnedWithCycle1AndCycle2Evidence();
    const deleteBarrier = rendezvous(2);
    const originalCurrentActor = RequestRepository.prototype.CurrentActor;
    const actorSpy = vi.spyOn(RequestRepository.prototype, "CurrentActor").mockImplementation(async function (this: RequestRepository, actor)
    {
        if (actor.account.id === fx.owner.id)
        {
            await deleteBarrier();
        }
        return originalCurrentActor.call(this, actor);
    });

    let resubmit2: PromiseSettledResult<Awaited<ReturnType<RequestService["Mutate"]>>>;
    let deleteRace: PromiseSettledResult<void>;
    try
    {
        [resubmit2, deleteRace] = await Promise.allSettled([
            requestServiceA.Mutate(fx.owner.actor, "resubmit", caseDelete.requestId, { expectedVersion: caseDelete.version }, randomUUID()),
            fx.attachmentServiceB.DeleteWorkingAttachment({
                actor: fx.owner.actor,
                requestId: caseDelete.requestId,
                attachmentId: caseDelete.cycle2WorkingAtt.id,
            }),
        ]);
    }
    finally
    {
        actorSpy.mockRestore();
    }

    expect(resubmit2.status).toBe("fulfilled");
    const rev1AfterDeleteRace = await observer.connection
        .select()
        .from(attachments)
        .where(eq(attachments.revisionId, caseDelete.rev1Id));
    expect(rev1AfterDeleteRace.map((row) => row.id)).toEqual([caseDelete.cycle1Att.id]);

    const rev2AfterDeleteRace = await observer.connection
        .select()
        .from(attachments)
        .where(eq(attachments.revisionId, caseDelete.rev2Id));
    if (deleteRace.status === "fulfilled")
    {
        expect(rev2AfterDeleteRace).toHaveLength(0);
    }
    else
    {
        expect(deleteRace.reason).toMatchObject({ code: "INVALID_REQUEST_TRANSITION" });
        expect(rev2AfterDeleteRace.map((row) => row.id)).toEqual([caseDelete.cycle2WorkingAtt.id]);
    }
});

test("ATT-CX-05 working revision with 9 attachments races two concurrent uploads against the 10-attachment cap", async () =>
{
    const fx = await seedConcurrencyFixture();
    const draft = await fx.createDraft();
    const workingRevisionId = draft.workingRevision!.id;

    for (let index = 1; index <= MAX_ATTACHMENTS_PER_REVISION - 1; index++)
    {
        await fx.attachmentServiceA.UploadAttachment({
            actor: fx.owner.actor,
            requestId: draft.id,
            fileName: `seed-${index}.pdf`,
            declaredMediaType: "application/pdf",
            bytes: pdfBytes(`seed-${index}`),
            workingRevisionId,
        });
    }

    const barrier = rendezvous(2);
    const originalFinalize = AttachmentRepository.prototype.FinalizeUpload;
    const spy = vi.spyOn(AttachmentRepository.prototype, "FinalizeUpload").mockImplementation(async function (this: AttachmentRepository, input)
    {
        if (input.requestId === draft.id)
        {
            await barrier();
        }
        return originalFinalize.call(this, input);
    });

    let outcomes: PromiseSettledResult<Awaited<ReturnType<AttachmentService["UploadAttachment"]>>>[];
    try
    {
        outcomes = await Promise.allSettled([
            fx.attachmentServiceA.UploadAttachment({
                actor: fx.owner.actor,
                requestId: draft.id,
                fileName: "tenth-a.pdf",
                declaredMediaType: "application/pdf",
                bytes: pdfBytes("tenth-a"),
                workingRevisionId,
            }),
            fx.attachmentServiceB.UploadAttachment({
                actor: fx.owner.actor,
                requestId: draft.id,
                fileName: "tenth-b.pdf",
                declaredMediaType: "application/pdf",
                bytes: pdfBytes("tenth-b"),
                workingRevisionId,
            }),
        ]);
    }
    finally
    {
        spy.mockRestore();
    }

    const fulfilled = outcomes.filter((item) => item.status === "fulfilled");
    const rejected = outcomes.filter((item) => item.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: "VALIDATION_ERROR" });

    const persisted = await observer.connection
        .select()
        .from(attachments)
        .where(eq(attachments.revisionId, workingRevisionId));
    expect(persisted).toHaveLength(MAX_ATTACHMENTS_PER_REVISION);

    const reservations = await observer.connection
        .select()
        .from(attachmentUploadReservations)
        .where(eq(attachmentUploadReservations.requestId, draft.id));
    const abandoned = reservations.filter((item) => item.status === "ABANDONED");
    expect(abandoned).toHaveLength(1);

    const cleanupJobs = await observer.connection
        .select()
        .from(attachmentCleanupJobs)
        .where(eq(attachmentCleanupJobs.reservationId, abandoned[0]!.id));
    expect(cleanupJobs).toHaveLength(1);
    expect(cleanupJobs[0]?.reason).toBe("COMMIT_CONFLICT");
});

test("ATT-CX-06 two concurrent DELETE requests on the same working attachment return one 204/success + one 404 with 1 cleanup job", async () =>
{
    const fx = await seedConcurrencyFixture();
    const draft = await fx.createDraft();
    const uploaded = await fx.attachmentServiceA.UploadAttachment({
        actor: fx.owner.actor,
        requestId: draft.id,
        fileName: "delete-race.pdf",
        declaredMediaType: "application/pdf",
        bytes: pdfBytes("cx-06"),
        workingRevisionId: draft.workingRevision!.id,
    });

    const barrier = rendezvous(2);
    const originalCurrentActor = RequestRepository.prototype.CurrentActor;
    const spy = vi.spyOn(RequestRepository.prototype, "CurrentActor").mockImplementation(async function (this: RequestRepository, actor)
    {
        if (actor.account.id === fx.owner.id)
        {
            await barrier();
        }
        return originalCurrentActor.call(this, actor);
    });

    let outcomes: PromiseSettledResult<void>[];
    try
    {
        outcomes = await Promise.allSettled([
            fx.attachmentServiceA.DeleteWorkingAttachment({
                actor: fx.owner.actor,
                requestId: draft.id,
                attachmentId: uploaded.id,
            }),
            fx.attachmentServiceB.DeleteWorkingAttachment({
                actor: fx.owner.actor,
                requestId: draft.id,
                attachmentId: uploaded.id,
            }),
        ]);
    }
    finally
    {
        spy.mockRestore();
    }

    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter((item) => item.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: "NOT_FOUND" });

    expect(await observer.connection.select().from(attachments).where(eq(attachments.id, uploaded.id))).toHaveLength(0);
    const jobs = await observer.connection
        .select()
        .from(attachmentCleanupJobs)
        .where(eq(attachmentCleanupJobs.attachmentId, uploaded.id));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.reason).toBe("WORKING_DELETED");
});

test("ATT-CX-07 PATCH /draft (expectedVersion) raced with attachment upload and comment post succeeds without version drift", async () =>
{
    const fx = await seedConcurrencyFixture();
    const draft = await fx.createDraft();
    const v1 = await requestServiceA.Mutate(fx.owner.actor, "patch", draft.id, { expectedVersion: 0, title: "Title v1" });
    const v2 = await requestServiceA.Mutate(fx.owner.actor, "patch", draft.id, { expectedVersion: v1.version, title: "Title v2" });
    const v3 = await requestServiceA.Mutate(fx.owner.actor, "patch", draft.id, { expectedVersion: v2.version, title: "Title v3" });
    expect(v3.version).toBe(3);

    const barrier = rendezvous(3);
    const originalRead = RequestRepository.prototype.Read;
    const originalFinalize = AttachmentRepository.prototype.FinalizeUpload;
    const originalCommentContext = CommentRepository.prototype.ReadRequestAccessContext;

    const readSpy = vi.spyOn(RequestRepository.prototype, "Read").mockImplementation(async function (this: RequestRepository, id, lock = false)
    {
        if (id === draft.id && lock)
        {
            await barrier();
        }
        return originalRead.call(this, id, lock);
    });
    const finalizeSpy = vi.spyOn(AttachmentRepository.prototype, "FinalizeUpload").mockImplementation(async function (this: AttachmentRepository, input)
    {
        if (input.requestId === draft.id)
        {
            await barrier();
        }
        return originalFinalize.call(this, input);
    });
    const commentSpy = vi.spyOn(CommentRepository.prototype, "ReadRequestAccessContext").mockImplementation(async function (this: CommentRepository, id, lock)
    {
        if (id === draft.id)
        {
            await barrier();
        }
        return originalCommentContext.call(this, id, lock);
    });

    let patchResult: Awaited<ReturnType<RequestService["Mutate"]>>;
    let uploadResult: Awaited<ReturnType<AttachmentService["UploadAttachment"]>>;
    let commentResult: Awaited<ReturnType<CommentService["AddComment"]>>;
    try
    {
        [patchResult, uploadResult, commentResult] = await Promise.all([
            requestServiceA.Mutate(fx.owner.actor, "patch", draft.id, { expectedVersion: 3, title: "Patched concurrently at v3" }),
            fx.attachmentServiceB.UploadAttachment({
                actor: fx.owner.actor,
                requestId: draft.id,
                fileName: "concurrent-draft.pdf",
                declaredMediaType: "application/pdf",
                bytes: pdfBytes("cx-07"),
                workingRevisionId: v3.workingRevision!.id,
            }),
            commentServiceA.AddComment(fx.owner.actor, draft.id, "Concurrent draft note"),
        ]);
    }
    finally
    {
        readSpy.mockRestore();
        finalizeSpy.mockRestore();
        commentSpy.mockRestore();
    }

    expect(patchResult.version).toBe(4);
    expect(patchResult.title).toBe("Patched concurrently at v3");
    expect(uploadResult.requestId).toBe(draft.id);
    expect(commentResult.requestId).toBe(draft.id);

    const requestRow = (await observer.connection.select().from(requests).where(eq(requests.id, draft.id)))[0]!;
    expect(requestRow.version).toBe(4);
    expect(await observer.connection.select().from(attachments).where(eq(attachments.requestId, draft.id))).toHaveLength(1);
    expect(await observer.connection.select().from(requestComments).where(eq(requestComments.requestId, draft.id))).toHaveLength(1);
});

test("ATT-CX-08 Withdraw() raced with POST /comments and attachment download completes safely and owner retains read access", async () =>
{
    const fx = await seedConcurrencyFixture();
    const draft = await fx.createDraft();
    const payload = pdfBytes("cx-08-evidence");
    const uploaded = await fx.attachmentServiceA.UploadAttachment({
        actor: fx.owner.actor,
        requestId: draft.id,
        fileName: "evidence.pdf",
        declaredMediaType: "application/pdf",
        bytes: payload,
        workingRevisionId: draft.workingRevision!.id,
    });
    const pending = await requestServiceA.Mutate(fx.owner.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    expect(pending.version).toBe(1);

    const barrier = rendezvous(3);
    const originalRead = RequestRepository.prototype.Read;
    const originalCommentContext = CommentRepository.prototype.ReadRequestAccessContext;
    const originalFindForDownload = AttachmentRepository.prototype.FindForDownload;

    const readSpy = vi.spyOn(RequestRepository.prototype, "Read").mockImplementation(async function (this: RequestRepository, id, lock = false)
    {
        if (id === draft.id && lock)
        {
            await barrier();
        }
        return originalRead.call(this, id, lock);
    });
    const commentSpy = vi.spyOn(CommentRepository.prototype, "ReadRequestAccessContext").mockImplementation(async function (this: CommentRepository, id, lock)
    {
        if (id === draft.id)
        {
            await barrier();
        }
        return originalCommentContext.call(this, id, lock);
    });
    const downloadSpy = vi.spyOn(AttachmentRepository.prototype, "FindForDownload").mockImplementation(async function (this: AttachmentRepository, id)
    {
        if (id === uploaded.id)
        {
            await barrier();
        }
        return originalFindForDownload.call(this, id);
    });

    let withdrawResult: Awaited<ReturnType<RequestService["Mutate"]>>;
    let commentResult: Awaited<ReturnType<CommentService["AddComment"]>>;
    let downloadResult: Awaited<ReturnType<AttachmentService["DownloadAttachment"]>>;
    try
    {
        [withdrawResult, commentResult, downloadResult] = await Promise.all([
            requestServiceA.Mutate(fx.owner.actor, "withdraw", draft.id, { expectedVersion: 1, reason: "No longer required" }, randomUUID()),
            commentServiceB.AddComment(fx.owner.actor, draft.id, "Withdrawing request comment"),
            fx.attachmentServiceB.DownloadAttachment({ actor: fx.owner.actor, attachmentId: uploaded.id }),
        ]);
    }
    finally
    {
        readSpy.mockRestore();
        commentSpy.mockRestore();
        downloadSpy.mockRestore();
    }

    expect(withdrawResult.status).toBe("WITHDRAWN");
    expect(withdrawResult.version).toBe(2);
    expect(commentResult.requestId).toBe(draft.id);
    const concurrentBytes = new Uint8Array(await new Response(downloadResult.stream).arrayBuffer());
    expect(sha256Hex(concurrentBytes)).toBe(sha256Hex(payload));

    const slots = await observer.connection
        .select({ status: approvalSlots.status })
        .from(approvalSlots)
        .innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id))
        .where(eq(approvalStages.cycleId, pending.currentCycleId!));
    expect(slots.every((slot) => slot.status === "CANCELLED")).toBe(true);

    // Owner still retains read and download access after withdrawal completes.
    const postWithdrawDetail = await requestServiceA.Read(fx.owner.actor, draft.id);
    expect(postWithdrawDetail.status).toBe("WITHDRAWN");
    const postWithdrawDownload = await fx.attachmentServiceA.DownloadAttachment({ actor: fx.owner.actor, attachmentId: uploaded.id });
    const postBytes = new Uint8Array(await new Response(postWithdrawDownload.stream).arrayBuffer());
    expect(sha256Hex(postBytes)).toBe(sha256Hex(payload));
});

test("ATT-CX-09 upload with stale cycle-1 workingRevisionId after cycle-2 working revision is active rejects 409 before storage commit", async () =>
{
    const fx = await seedConcurrencyFixture();
    const draft = await fx.createDraft();
    const cycle1WorkingRevisionId = draft.workingRevision!.id;

    const pending = await requestServiceA.Mutate(fx.owner.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    await decisionServiceA.Decide(
        fx.reviewer.actor,
        pending.currentApprovers[0]!.slotId,
        { decision: "RETURN", reason: "Start cycle 2 working revision", expectedVersion: 0 },
        randomUUID(),
    );

    const environment = readEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        AUTH_JWT_SECRET: "issue13-cx09-pg-test-secret-012345678901234",
        AUTH_JWT_ISSUER: "issue13-pg-tests",
        AUTH_JWT_AUDIENCE: "issue13-api",
        AUTH_ALLOWED_ORIGINS: "http://localhost:3000",
        AUTH_COOKIE_SECURE: "false",
    });
    const identity = await createIdentityComposition(environment, database);
    const app = createApplication(
        undefined,
        identity,
        requestServiceA,
        undefined,
        decisionServiceA,
        undefined,
        undefined,
        undefined,
        undefined,
        { attachments: fx.attachmentServiceA, attachmentStorage: fx.storage },
    );
    const token = await new TokenProvider(
        environment.AUTH_JWT_SECRET,
        { Now: () => new Date() },
        environment.AUTH_JWT_ISSUER,
        environment.AUTH_JWT_AUDIENCE,
    ).Sign(fx.owner.id, fx.owner.actor.family.id, fx.owner.actor.account.authVersion);

    const putSpy = vi.spyOn(fx.storage, "PutObject");
    try
    {
        const form = new FormData();
        const bytes = pdfBytes("stale-rev");
        const buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
        form.append("file", new File([buffer], "stale.pdf", { type: "application/pdf" }));
        form.append("workingRevisionId", cycle1WorkingRevisionId);

        const response = await app.handle(
            new Request(`http://localhost/api/v1/requests/${draft.id}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${token}` },
                body: form,
            }),
        );
        expect(response.status).toBe(409);
        const body = errorResponseSchema.parse(await response.json());
        expect(body.code).toBe("REQUEST_STALE");
        expect(putSpy).not.toHaveBeenCalled();
    }
    finally
    {
        putSpy.mockRestore();
    }

    expect(fx.storage.Size()).toBe(0);
    expect(await observer.connection.select().from(attachments).where(eq(attachments.requestId, draft.id))).toHaveLength(0);
    expect(await observer.connection.select().from(attachmentUploadReservations).where(eq(attachmentUploadReservations.requestId, draft.id))).toHaveLength(0);
});
