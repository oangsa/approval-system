import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { CreateRequest, PublishedRequestType, UserRole } from "@workflow/contracts";
import type { Database } from "../../src/Infrastructures/Database/Database";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import { RequestUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { approvalPolicyVersions, departmentMemberships, departments, requests, requestTypes, requestTypeVersions, reviewerAssignmentRules, sessionFamilies, userRoles, users } from "../../src/Infrastructures/Database/schema";

export async function reportingFixture(db: Database["connection"])
{
    const ownerId = randomUUID(), foreignId = randomUUID(), typeId = randomUUID(), departmentId = randomUUID();
    await db.insert(users).values([ownerId, foreignId].map((id) => ({ id, email: `${id}@example.test`, displayName: id, passwordHash: "not-for-login" })));
    await db.insert(userRoles).values([ownerId, foreignId].map((userId) => ({ userId, roleCode: "REQUESTER" as const })));
    await db.insert(requestTypes).values({ id: typeId, code: `T%_${typeId}` });
    await db.insert(departments).values({ id: departmentId, code: departmentId, name: `Department ${departmentId}` });
    const timestamp = new Date("2026-01-01T00:00:00.123Z");
    const rows = ["DRAFT", "PENDING", "RETURNED", "APPROVED", "REJECTED", "WITHDRAWN"] as const;
    await db.insert(requests).values(rows.map((status, index) => ({ id: randomUUID(), requesterId: ownerId, typeId, departmentId: index % 2 ? departmentId : null, title: `Private ${index}`, justification: "Private", priority: "HIGH" as const, status, createdAt: timestamp, updatedAt: timestamp })));
    await db.insert(requests).values({ id: randomUUID(), requesterId: foreignId, typeId, departmentId, title: "Foreign private", justification: "Private", priority: "HIGH", status: "APPROVED", createdAt: timestamp });
    async function actor(id: string, roles: UserRole[])
    {
        await db.delete(userRoles).where(eq(userRoles.userId, id));
        await db.insert(userRoles).values(roles.map((roleCode) => ({ userId: id, roleCode })));
        const familyId = randomUUID(), now = new Date();
        await db.insert(sessionFamilies).values({ id: familyId, userId: id, authVersion: 0, createdAt: now, expiresAt: new Date(now.getTime() + 3600000) });
        return (await new IdentityRepository(db).ReadCurrentIdentity(id, familyId))!;
    }
    return { ownerId, foreignId, typeId, departmentId, actor };
}


export async function approvalReportingFixture(db: Database["connection"], parallel = false)
{
    const ownerId = randomUUID(), reviewerId = randomUUID(), departmentId = randomUUID(), typeId = randomUUID(), versionId = randomUUID();
    const definition: PublishedRequestType = { ...seededDefinition, id: typeId, versionId, code: `T${typeId}` };
    await db.insert(users).values([ownerId, reviewerId].map((id) => ({ id, email: `${id}@example.test`, displayName: id, passwordHash: "not-for-login" })));
    await db.insert(userRoles).values([{ userId: ownerId, roleCode: "REQUESTER" }, { userId: reviewerId, roleCode: "REVIEWER" }]);
    await db.insert(departments).values({ id: departmentId, code: departmentId, name: "Operations" });
    await db.insert(departmentMemberships).values({ userId: ownerId, departmentId, isPrimary: true });
    await db.insert(requestTypes).values({ id: typeId, code: definition.code });
    await db.insert(requestTypeVersions).values({ id: versionId, typeId, versionNumber: 1, definition });
    await db.update(requestTypes).set({ publishedVersionId: versionId }).where(eq(requestTypes.id, typeId));
    await db.insert(approvalPolicyVersions).values({ id: randomUUID(), typeId, code: randomUUID(), versionNumber: 1, priority: 1, stages: [{ stageNumber: 1, reviewerAssignmentKeys: parallel ? ["review", "peer"] : ["review"], slaBusinessMinutes: 480 }, ...(parallel ? [{ stageNumber: 2 as const, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }] : [])] });
    await db.insert(reviewerAssignmentRules).values([{ id: randomUUID(), assignmentKey: "review", departmentId, reviewerId }, ...(parallel ? [{ id: randomUUID(), assignmentKey: "peer", departmentId, reviewerId }] : [])]);
    async function actor(id: string)
    {
        const familyId = randomUUID(), now = new Date();
        await db.insert(sessionFamilies).values({ id: familyId, userId: id, authVersion: 0, createdAt: now, expiresAt: new Date(now.getTime() + 3600000) });
        return (await new IdentityRepository(db).ReadCurrentIdentity(id, familyId))!;
    }
    const owner = await actor(ownerId), reviewer = await actor(reviewerId);
    const requestService = new RequestService(new RequestUnitOfWork(db));
    const content: CreateRequest = { typeId, formDefinitionVersionId: versionId, title: "Operational request", justification: "Needed for the team", priority: "HIGH", fields: { category: "OPERATIONS" } };
    async function submit()
    {
        const draft = await requestService.Mutate(owner, "create", null, content, randomUUID());
        return requestService.Mutate(owner, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    }
    return { owner, reviewer, ownerId, reviewerId, typeId, departmentId, requestService, submit };
}