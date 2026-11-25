import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import {
    adminRequestTypeDetailSchema,
    adminRequestTypeSummarySchema,
    publishedRequestTypeSchema,
    requestDetailSchema,
    requestTypeDraftDtoSchema,
    type CreateRequestType,
    type UserRole,
} from "@workflow/contracts";
import { createTestDatabase } from "../helpers/testDatabase";
import { readEnvironment } from "../../src/Infrastructures/Configuration/environment";
import { createIdentityComposition } from "../../src/Presentations/composition";
import { createApplication } from "../../src/Presentations/createApplication";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import { RequestUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { RequestTypeService } from "../../src/Applications/RequestTypes/RequestTypeService";
import { RequestTypeUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestTypeRepository";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import {
    approvalPolicyVersions,
    departmentMemberships,
    departments,
    requestRevisions,
    requests,
    requestTypeVersions,
    reviewerAssignmentRules,
    sessionFamilies,
    userRoles,
    users,
} from "../../src/Infrastructures/Database/schema";
import { TokenProvider } from "../../src/Infrastructures/Security/TokenProvider";

const database = createTestDatabase();
const observer = createTestDatabase();
const db = database.connection;
const requestService = new RequestService(new RequestUnitOfWork(db));
const requestTypeService = new RequestTypeService(new RequestTypeUnitOfWork(db));
const observerTypeService = new RequestTypeService(new RequestTypeUnitOfWork(observer.connection));
const observerRequestService = new RequestService(new RequestUnitOfWork(observer.connection));

afterAll(async () =>
{
    await database.Close();
    await observer.Close();
});

async function createActorWithToken(roles: UserRole[], departmentId?: string)
{
    const id = randomUUID();
    const familyId = randomUUID();
    await db.transaction(async (tx) =>
    {
        await tx.insert(users).values({ id, email: `${id}@example.test`, displayName: roles.join("+"), passwordHash: "not-for-login" });
        await tx.insert(userRoles).values(roles.map((roleCode) => ({ userId: id, roleCode })));
        if (departmentId) await tx.insert(departmentMemberships).values({ userId: id, departmentId, isPrimary: true });
        await tx.insert(sessionFamilies).values({ id: familyId, userId: id, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    });
    const actor = (await new IdentityRepository(db).ReadCurrentIdentity(id, familyId))!;
    const env = readEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        AUTH_JWT_SECRET: "request-type-test-secret-0123456789abcdef",
        AUTH_JWT_ISSUER: "request-type-tests",
        AUTH_JWT_AUDIENCE: "request-type-api",
        AUTH_ALLOWED_ORIGINS: "http://localhost:3000",
        AUTH_COOKIE_SECURE: "false",
    });
    const token = await new TokenProvider(env.AUTH_JWT_SECRET, { Now: () => new Date() }, env.AUTH_JWT_ISSUER, env.AUTH_JWT_AUDIENCE).Sign(id, familyId, 0);
    return { id, actor, token, env };
}

async function setupApp(env: ReturnType<typeof readEnvironment>)
{
    const identity = await createIdentityComposition(env, database);
    return createApplication(undefined, identity, requestService, undefined, undefined, undefined, requestTypeService);
}

function sampleDraft(code: string): CreateRequestType
{
    return {
        code,
        name: { en: `Type ${code}`, th: `ประเภท ${code}` },
        description: { en: "Configurable test type" },
        monetary: true,
        supportsLineItems: true,
        fields: [
            {
                key: "category",
                kind: "SELECT",
                label: { en: "Category", th: "หมวด" },
                required: true,
                constraints: {
                    options: [
                        { value: "IT", label: { en: "IT" } },
                        { value: "OTHER", label: { en: "Other" } },
                    ],
                },
            },
            {
                key: "extraDetail",
                kind: "TEXTAREA",
                label: { en: "Extra detail" },
                required: false,
                visibleWhen: { all: [{ fieldKey: "category", operator: "EQ", value: "OTHER" }] },
                requiredWhen: { all: [{ fieldKey: "category", operator: "EQ", value: "OTHER" }] },
            },
        ],
    };
}

test("EP-023..031 FT-033 admin request-type lifecycle, security isolation, idempotency, and zero draft leakage", async () =>
{
    const admin = await createActorWithToken(["ADMINISTRATOR"]);
    const multiRole = await createActorWithToken(["ADMINISTRATOR", "REQUESTER"]);
    const requester = await createActorWithToken(["REQUESTER"]);
    const app = await setupApp(admin.env);

    const send = (method: string, path: string, body?: unknown, token = admin.token, key?: string) => app.handle(new Request(`http://localhost/api/v1${path}`, {
        method,
        headers: {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            "content-type": "application/json",
            origin: "http://localhost:3000",
            ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));

    const code = `CF_${randomUUID().slice(0, 8)}`;
    const draftBody = sampleDraft(code);

    // Anonymous and non-admin callers denied.
    expect((await send("POST", "/admin/request-types", draftBody, "")).status).toBe(401);
    expect((await send("POST", "/admin/request-types", draftBody, requester.token)).status).toBe(403);
    expect((await send("POST", "/request-types/search?view=admin", {}, requester.token)).status).toBe(403);

    // Invalid graph rejected before creation.
    const cyclic = {
        ...draftBody,
        fields: [
            { key: "a", kind: "TEXT", label: { en: "A" }, required: false, visibleWhen: { all: [{ fieldKey: "b", operator: "PRESENT" }] } },
            { key: "b", kind: "TEXT", label: { en: "B" }, required: false, requiredWhen: { all: [{ fieldKey: "a", operator: "PRESENT" }] } },
        ],
    };
    const invalidCreate = await send("POST", "/admin/request-types", cyclic);
    expect(invalidCreate.status).toBe(422);

    // Admin creates draft.
    const createKey = randomUUID();
    const createdResponse = await send("POST", "/admin/request-types", draftBody, admin.token, createKey);
    expect(createdResponse.status).toBe(201);
    expect(createdResponse.headers.get("cache-control")).toBe("no-store");
    const created = requestTypeDraftDtoSchema.parse(await createdResponse.json());
    expect(createdResponse.headers.get("location")).toBe(`/api/v1/request-types/${created.id}?view=admin`);
    expect(created.version).toBe(0);
    expect(created.publishedVersionId).toBeNull();

    // Non-admin and default (non-admin) GET cannot see unpublished draft via search or GET.
    expect((await send("GET", `/request-types/${created.id}`, undefined, requester.token)).status).toBe(404);
    expect((await send("GET", `/request-types/${created.id}`, undefined, admin.token)).status).toBe(404);
    expect((await send("GET", `/request-types/${created.id}`, undefined, multiRole.token)).status).toBe(404);
    expect((await send("GET", `/request-types/${created.id}?view=admin`, undefined, requester.token)).status).toBe(403);
    const reqSearchUnpub = await send("POST", "/request-types/search", { search: [{ name: "code", condition: "EQUAL", value: code }] }, requester.token);
    expect(reqSearchUnpub.status).toBe(200);
    expect(await reqSearchUnpub.json()).toEqual([]);

    // Admin sees unpublished draft via ?view=admin search & GET (including via Location).
    const adminSearch = await send("POST", "/request-types/search?view=admin", { search: [{ name: "code", condition: "EQUAL", value: code }] });
    expect(adminSearch.status).toBe(200);
    const adminList = adminRequestTypeSummarySchema.array().parse(await adminSearch.json());
    expect(adminList).toEqual([expect.objectContaining({ id: created.id, hasDraft: true, publishedVersionId: null })]);
    const adminDetail = adminRequestTypeDetailSchema.parse(await (await send("GET", `/request-types/${created.id}?view=admin`)).json());
    expect(adminDetail.draft?.fields).toHaveLength(2);

    // Stale PATCH rejected 409 without mutating draft.
    expect((await send("PATCH", `/admin/request-types/${created.id}/draft`, { expectedVersion: 99, name: { en: "Stale" } })).status).toBe(409);

    // Valid PATCH preserves omitted fields and updates version.
    const patched = requestTypeDraftDtoSchema.parse(await (await send("PATCH", `/admin/request-types/${created.id}/draft`, { expectedVersion: 0, name: { en: `Updated ${code}` } })).json());
    expect(patched.version).toBe(1);
    expect(patched.fields).toHaveLength(2);

    // Publish requires Idempotency-Key.
    expect((await send("POST", `/admin/request-types/${created.id}/publish`, { expectedVersion: 1 })).status).toBe(422);

    // Publish v1.
    const publishKey = randomUUID();
    const pubResponse = await send("POST", `/admin/request-types/${created.id}/publish`, { expectedVersion: 1 }, admin.token, publishKey);
    expect(pubResponse.status).toBe(201);
    const v1 = publishedRequestTypeSchema.parse(await pubResponse.json());
    expect(pubResponse.headers.get("location")).toBe(`/api/v1/request-types/${created.id}/versions/${v1.versionId}`);
    expect(v1.versionNumber).toBe(1);

    // Same-key publish replay returns stored v1 even after version incremented; changed body conflicts 409.
    const replayPub = await send("POST", `/admin/request-types/${created.id}/publish`, { expectedVersion: 1 }, admin.token, publishKey);
    expect(replayPub.status).toBe(201);
    expect(await replayPub.json()).toEqual(v1);
    expect((await send("POST", `/admin/request-types/${created.id}/publish`, { expectedVersion: 2 }, admin.token, publishKey)).status).toBe(409);

    // Requester now sees published v1.
    const reqGet = await send("GET", `/request-types/${created.id}`, undefined, requester.token);
    expect(reqGet.status).toBe(200);
    expect(publishedRequestTypeSchema.parse(await reqGet.json())).toEqual(v1);

    // Branch v2 draft, patch, publish v2.
    expect((await send("POST", `/admin/request-types/${created.id}/draft`, { expectedVersion: 2 }, requester.token)).status).toBe(403);
    const branchedResp = await send("POST", `/admin/request-types/${created.id}/draft`, { expectedVersion: 2 }, admin.token, randomUUID());
    expect(branchedResp.status).toBe(201);
    expect(branchedResp.headers.get("location")).toBe(`/api/v1/request-types/${created.id}?view=admin`);
    const branched = requestTypeDraftDtoSchema.parse(await branchedResp.json());
    expect(branched.version).toBe(3);

    const patchedV2 = requestTypeDraftDtoSchema.parse(await (await send("PATCH", `/admin/request-types/${created.id}/draft`, { expectedVersion: 3, monetary: false, supportsLineItems: false })).json());
    expect(patchedV2.version).toBe(4);
    const v2 = publishedRequestTypeSchema.parse(await (await send("POST", `/admin/request-types/${created.id}/publish`, { expectedVersion: 4 }, admin.token, randomUUID())).json());
    expect(v2.versionNumber).toBe(2);

    // v1 row remains immutable in PostgreSQL.
    await expect(db.update(requestTypeVersions).set({ versionNumber: 99 }).where(eq(requestTypeVersions.id, v1.versionId))).rejects.toThrow();

    // Disable and re-enable preserve version history.
    expect((await send("POST", `/admin/request-types/${created.id}/disable`, { expectedVersion: 5 }, requester.token)).status).toBe(403);
    const disabled = adminRequestTypeSummarySchema.parse(await (await send("POST", `/admin/request-types/${created.id}/disable`, { expectedVersion: 5 })).json());
    expect(disabled.isEnabled).toBe(false);
    expect((await send("GET", `/request-types/${created.id}`, undefined, requester.token)).status).toBe(404);
    expect((await send("GET", `/request-types/${created.id}`, undefined, multiRole.token)).status).toBe(404);
    expect((await send("GET", `/request-types/${created.id}?view=admin`, undefined, multiRole.token)).status).toBe(200);
    const enabled = adminRequestTypeSummarySchema.parse(await (await send("POST", `/admin/request-types/${created.id}/enable`, { expectedVersion: 6 })).json());
    expect(enabled.isEnabled).toBe(true);
    expect((await send("GET", `/request-types/${created.id}`, undefined, requester.token)).status).toBe(200);

    // CORS preflight on admin routes succeeds.
    const preflight = await app.handle(new Request("http://localhost/api/v1/admin/request-types", {
        method: "OPTIONS",
        headers: { origin: "http://localhost:3000", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type,idempotency-key" },
    }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("POST, PATCH");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("Idempotency-Key");

    const patchPreflight = await app.handle(new Request(`http://localhost/api/v1/admin/request-types/${created.id}/draft`, {
        method: "OPTIONS",
        headers: { origin: "http://localhost:3000", "access-control-request-method": "PATCH", "access-control-request-headers": "authorization,content-type,idempotency-key" },
    }));
    expect(patchPreflight.status).toBe(204);
    expect(patchPreflight.headers.get("access-control-allow-methods")).toBe("POST, PATCH");
    expect(patchPreflight.headers.get("access-control-allow-headers")).toContain("Idempotency-Key");
});

test("DB-13 concurrent publish vs publish and patch vs publish allow one winner and preserve immutable history", async () =>
{
    const admin = await createActorWithToken(["ADMINISTRATOR"]);
    const created = await requestTypeService.Create(admin.actor, sampleDraft(`RACE_${randomUUID().slice(0, 8)}`), randomUUID());

    const publishRace = await Promise.allSettled([
        requestTypeService.Publish(admin.actor, created.id, { expectedVersion: 0 }, randomUUID()),
        observerTypeService.Publish(admin.actor, created.id, { expectedVersion: 0 }, randomUUID()),
    ]);
    expect(publishRace.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(publishRace.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(publishRace.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });

    const versionsAfterFirst = await observer.connection.select().from(requestTypeVersions).where(eq(requestTypeVersions.typeId, created.id));
    expect(versionsAfterFirst).toHaveLength(1);

    const branched = await requestTypeService.BranchDraft(admin.actor, created.id, { expectedVersion: 1 }, randomUUID());
    const patchVsPublish = await Promise.allSettled([
        requestTypeService.PatchDraft(admin.actor, created.id, { expectedVersion: branched.version, name: { en: "Patched concurrently" } }, randomUUID()),
        observerTypeService.Publish(admin.actor, created.id, { expectedVersion: branched.version }, randomUUID()),
    ]);
    expect(patchVsPublish.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(patchVsPublish.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(patchVsPublish.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
});

test("CX-12 concurrent admin publish vs requester submit enforces coherent active version boundary", async () =>
{
    const departmentId = randomUUID();
    await db.insert(departments).values({ id: departmentId, code: `D_${departmentId.slice(0, 8)}`, name: "Dept" });
    const admin = await createActorWithToken(["ADMINISTRATOR"]);
    const owner = await createActorWithToken(["REQUESTER"], departmentId);
    const reviewer = await createActorWithToken(["REVIEWER"], departmentId);

    const created = await requestTypeService.Create(admin.actor, sampleDraft(`CX12_${randomUUID().slice(0, 8)}`), randomUUID());
    const v1 = await requestTypeService.Publish(admin.actor, created.id, { expectedVersion: 0 }, randomUUID());
    await db.insert(approvalPolicyVersions).values({
        id: randomUUID(),
        code: `POL_${created.code}`,
        versionNumber: 1,
        typeId: created.id,
        priority: 10,
        stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["r1"], slaBusinessMinutes: 480 }],
    });
    await db.insert(reviewerAssignmentRules).values({
        id: randomUUID(),
        assignmentKey: "r1",
        departmentId,
        reviewerId: reviewer.id,
    });
    const branched = await requestTypeService.BranchDraft(admin.actor, created.id, { expectedVersion: 1 }, randomUUID());

    const draft = await requestService.Mutate(owner.actor, "create", null, {
        typeId: created.id,
        formDefinitionVersionId: v1.versionId,
        title: "Concurrent submit",
        justification: "Testing CX-12",
        priority: "HIGH",
        fields: { category: "IT" },
        lineItems: [{ description: "Monitor", quantity: "1", unitAmount: "300.00" }],
    }, randomUUID());

    const [publishOutcome, submitOutcome] = await Promise.allSettled([
        requestTypeService.Publish(admin.actor, created.id, { expectedVersion: branched.version }, randomUUID()),
        observerRequestService.Mutate(owner.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID()),
    ]);
    expect(publishOutcome.status).toBe("fulfilled");
    if (submitOutcome.status === "fulfilled")
    {
        expect(submitOutcome.value.submittedRevision?.formDefinitionVersionId).toBe(v1.versionId);
    }
    else
    {
        expect(submitOutcome.reason).toMatchObject({ code: "FORM_DEFINITION_CHANGED" });
        expect((await requestService.Read(owner.actor, draft.id)).status).toBe("DRAFT");
    }
});

test("FT-024/034 disabled type allows pinned RETURNED editing; line items & priorities round-trip accurately", async () =>
{
    const departmentId = randomUUID();
    await db.insert(departments).values({ id: departmentId, code: `D_${departmentId.slice(0, 8)}`, name: "Ops" });
    const admin = await createActorWithToken(["ADMINISTRATOR"]);
    const owner = await createActorWithToken(["REQUESTER"], departmentId);
    const reviewer = await createActorWithToken(["REVIEWER"], departmentId);

    const created = await requestTypeService.Create(admin.actor, sampleDraft(`RET_${randomUUID().slice(0, 8)}`), randomUUID());
    const v1 = await requestTypeService.Publish(admin.actor, created.id, { expectedVersion: 0 }, randomUUID());
    await db.insert(approvalPolicyVersions).values({
        id: randomUUID(),
        code: `POL_${created.code}`,
        versionNumber: 1,
        typeId: created.id,
        priority: 10,
        stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["r1"], slaBusinessMinutes: 480 }],
    });
    await db.insert(reviewerAssignmentRules).values({
        id: randomUUID(),
        assignmentKey: "r1",
        departmentId,
        reviewerId: reviewer.id,
    });

    // Priority LOW/MEDIUM/HIGH/URGENT + exact decimal line items (0.10 + 0.20 = 0.30).
    for (const priority of ["LOW", "MEDIUM", "HIGH", "URGENT"] as const)
    {
        const saved = await requestService.Mutate(owner.actor, "create", null, {
            typeId: created.id,
            formDefinitionVersionId: v1.versionId,
            title: `Priority ${priority}`,
            justification: "Round trip check",
            priority,
            fields: { category: "IT" },
            lineItems: [
                { description: "First", quantity: "1", unitAmount: "0.10" },
                { description: "Second", quantity: "2", unitAmount: "0.10" },
            ],
        }, randomUUID());
        expect(saved.priority).toBe(priority);
        expect(saved.workingRevision?.amount).toBe("0.30");
        expect(saved.workingRevision?.lineItems.map((item) => item.description)).toEqual(["First", "Second"]);
    }

    // Create draft, disable type, verify new draft blocked while RETURNED pinned working revision remains editable.
    const draft = await requestService.Mutate(owner.actor, "create", null, {
        typeId: created.id,
        formDefinitionVersionId: v1.versionId,
        title: "Returned later",
        justification: "Pinned edit",
        priority: "URGENT",
        fields: { category: "IT" },
        lineItems: [{ description: "Item", quantity: "1", unitAmount: "100.00" }],
    }, randomUUID());
    const submitted = await requestService.Mutate(owner.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    expect(submitted.status).toBe("PENDING");

    // Disable the type.
    await requestTypeService.SetEnabled(admin.actor, created.id, false, { expectedVersion: 1 }, randomUUID());

    // New draft creation on disabled type is blocked.
    await expect(requestService.Mutate(owner.actor, "create", null, {
        typeId: created.id,
        formDefinitionVersionId: v1.versionId,
    }, randomUUID())).rejects.toMatchObject({ code: "CONFIGURATION_INCOMPLETE" });

    // Simulate RETURNED state with a new working revision pinned to v1.
    const workingRevId = randomUUID();
    await db.insert(requestRevisions).values({
        id: workingRevId,
        requestId: draft.id,
        typeId: created.id,
        formDefinitionVersionId: v1.versionId,
        revisionNumber: 2,
        fields: { category: "IT" },
        amount: "100.00",
        currency: "THB",
    });
    await db.update(requests).set({
        status: "RETURNED",
        workingRevisionId: workingRevId,
        currentCycleId: null,
    }).where(eq(requests.id, draft.id));

    // Pinned TypeVersion read succeeds for owner even while type is disabled, including uppercase UUID parameters!
    const pinnedRead = await requestService.TypeVersion(owner.actor, created.id.toUpperCase(), v1.versionId.toUpperCase(), draft.id.toUpperCase());
    expect(pinnedRead).toEqual(v1);
    expect((await requestTypeService.ReadAdmin(admin.actor, created.id)).isEnabled).toBe(false);

    // Owner can edit RETURNED draft on pinned v1 (including uppercase pinned formDefinitionVersionId).
    const returnedPatched = await requestService.Mutate(owner.actor, "patch", draft.id, {
        expectedVersion: submitted.version,
        formDefinitionVersionId: v1.versionId.toUpperCase(),
        title: "Returned edited title",
        lineItems: [{ description: "Revised item", quantity: "2", unitAmount: "75.00" }],
    });
    expect(requestDetailSchema.parse(returnedPatched).workingRevision?.amount).toBe("150.00");

    // Returned draft cannot switch formDefinitionVersionId.
    const adminDetail = await requestTypeService.ReadAdmin(admin.actor, created.id);
    const branched = await requestTypeService.BranchDraft(admin.actor, created.id, { expectedVersion: adminDetail.version }, randomUUID());
    const v2 = await requestTypeService.Publish(admin.actor, created.id, { expectedVersion: branched.version }, randomUUID());
    await expect(requestService.Mutate(owner.actor, "patch", draft.id, {
        expectedVersion: returnedPatched.version,
        formDefinitionVersionId: v2.versionId,
    })).rejects.toMatchObject({ code: "FORM_DEFINITION_CHANGED" });
    expect((await db.select().from(requests).where(and(eq(requests.id, draft.id))))[0]?.version).toBe(returnedPatched.version);
});
