import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { requestSearchSchema } from "@workflow/contracts";
import { createTestDatabase } from "../helpers/testDatabase";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import { RequestUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { requests, requestTypes, sessionFamilies, userRoles, users } from "../../src/Infrastructures/Database/schema";

const database = createTestDatabase();
const db = database.connection;
const service = new RequestService(new RequestUnitOfWork(db));
afterAll(async () => database.Close());

test("request search scopes counts and stable pages and matches literal text and dates", async () =>
{
    const ownerId = randomUUID(), foreignId = randomUUID(), familyId = randomUUID(), typeId = randomUUID();
    const tied = new Date("2026-01-01T00:00:00.123Z");
    await db.insert(users).values([ownerId, foreignId].map((id) => ({ id, email: `${id}@example.test`, displayName: id, passwordHash: "not-for-login" })));
    await db.insert(userRoles).values([ownerId, foreignId].map((userId) => ({ userId, roleCode: "REQUESTER" as const })));
    await db.insert(sessionFamilies).values({ id: familyId, userId: ownerId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    await db.insert(requestTypes).values({ id: typeId, code: `T${typeId}` });
    const actor = (await new IdentityRepository(db).ReadCurrentIdentity(ownerId, familyId))!;
    const search = (query: unknown) => service.Search(actor, requestSearchSchema.parse(query));
    const foreignRequest = { id: randomUUID(), requesterId: foreignId, typeId, title: "Literal %_\\ value", justification: "", priority: "HIGH" as const, updatedAt: tied };
    await db.insert(requests).values(foreignRequest);
    expect((await search({})).pagination).toEqual({ currentPage: 1, pageSize: 20, totalPages: 0, totalCount: 0, hasPrevious: false, hasNext: false });
    const ids: string[] = [];
    for (const count of [1, 45, 101])
    {
        const additions = Array.from({ length: count - ids.length }, () => randomUUID());
        const previous = ids.length;
        ids.push(...additions);
        await db.insert(requests).values(additions.map((id, index) => ({ id, requesterId: ownerId, typeId, title: previous + index === 0 ? "Literal %_\\ value" : "Other", justification: "", priority: "HIGH" as const, updatedAt: tied })));
        const all: string[] = [];
        const pageSize = 20;
        const totalPages = Math.ceil(count / pageSize);
        for (let pageNumber = 1; pageNumber <= totalPages + 1; pageNumber++)
        {
            const page = await search({ pageSize, pageNumber });
            expect(page.pagination).toEqual({ currentPage: pageNumber, pageSize, totalPages, totalCount: count, hasPrevious: pageNumber > 1, hasNext: pageNumber < totalPages });
            all.push(...page.items.map((row) => row.id));
            if (pageNumber > totalPages) expect(page.items).toEqual([]);
        }
        expect(all).toEqual([...ids].sort());
        expect((await search({ searchTerm: { name: "title", value: "%_\\" } })).items.map((row) => row.id)).toEqual([ids[0]]);
        expect((await search({ search: [{ name: "submittedAt", condition: "ISNULL" }] })).pagination.totalCount).toBe(count);
        expect((await search({ search: [{ name: "submittedAt", condition: "ISNOTNULL" }] })).pagination.totalCount).toBe(0);
        expect((await search({ search: [{ name: "updatedAt", condition: "GREATER", value: "2026-01-01T00:00:00.123001Z" }] })).pagination.totalCount).toBe(0);
        expect((await search({ search: [{ name: "updatedAt", condition: "LESSER", value: "2026-01-01T00:00:00.123001Z" }] })).pagination.totalCount).toBe(count);
    }
});
