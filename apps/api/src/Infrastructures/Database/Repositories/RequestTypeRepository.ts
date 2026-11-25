import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
    adminRequestTypeSummarySchema,
    type AdminRequestTypeSearch,
    type PublishedRequestType,
    type RequestTypeDraftContent,
} from "@workflow/contracts";
import { isCurrentIdentity, type IActor } from "../../../Domains/Identity/Identity";
import type { IRequestTypeRecord, IRequestTypeRepository, IRequestTypeUnitOfWork } from "../../../Domains/RequestTypes/Ports";
import { RequestTypeError } from "../../../Domains/RequestTypes/RequestTypeRules";
import type { Database } from "../Database";
import { IdentityRepository } from "./IdentityRepository";
import { requestTypeIdempotencyRecords, requestTypes, requestTypeVersions } from "../schema";

type Connection = Database["connection"];
type Transaction = Parameters<Parameters<Connection["transaction"]>[0]>[0];

function isUniqueViolation(error: unknown): boolean
{
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++)
    {
        const record = current as { code?: unknown; cause?: unknown };
        if (record.code === "23505") return true;
        current = record.cause;
    }
    return false;
}

export class RequestTypeRepository implements IRequestTypeRepository
{
    constructor(private readonly db: Transaction)
    {
    }

    public async CurrentActor(actor: IActor): Promise<IActor>
    {
        const identity = new IdentityRepository(this.db);
        await identity.LockUser(actor.account.id);
        const current = await identity.ReadCurrentIdentity(actor.account.id, actor.family.id);
        if (!current || !current.roles.length || !isCurrentIdentity(current, actor.account.authVersion, new Date()))
        {
            throw new RequestTypeError("UNAUTHENTICATED");
        }
        return current;
    }

    public async Replay<T>(actorId: string, scope: string, key: string, bodyHash: string): Promise<T | null>
    {
        await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actorId}:${scope}:${key}`}, 0))`);
        const row = (await this.db.select().from(requestTypeIdempotencyRecords).where(
            and(
                eq(requestTypeIdempotencyRecords.actorId, actorId),
                eq(requestTypeIdempotencyRecords.scope, scope),
                eq(requestTypeIdempotencyRecords.key, key),
            ),
        ))[0];
        if (!row) return null;
        if (row.bodyHash !== bodyHash) throw new RequestTypeError("IDEMPOTENCY_CONFLICT");
        return row.response as T;
    }

    public async Complete(actorId: string, scope: string, key: string, bodyHash: string, result: Record<string, unknown>): Promise<void>
    {
        await this.db.insert(requestTypeIdempotencyRecords).values({ actorId, scope, key, bodyHash, response: result });
    }

    public async Read(id: string, lock = false): Promise<IRequestTypeRecord | null>
    {
        const query = this.db.select().from(requestTypes).where(eq(requestTypes.id, id));
        const row = (await (lock ? query.for("update") : query))[0];
        if (!row) return null;
        const versionRows = await this.db
            .select()
            .from(requestTypeVersions)
            .where(eq(requestTypeVersions.typeId, row.id))
            .orderBy(desc(requestTypeVersions.versionNumber));
        const currentVersionRow = row.publishedVersionId
            ? versionRows.find((item) => item.id === row.publishedVersionId) ?? null
            : null;
        const publishedVersion = currentVersionRow
            ? { ...currentVersionRow.definition, isEnabled: row.isEnabled }
            : null;
        return {
            id: row.id,
            code: row.code,
            isEnabled: row.isEnabled,
            version: row.version,
            publishedVersionId: row.publishedVersionId,
            publishedVersion,
            draft: row.draft,
            versions: versionRows.map((item) => ({
                versionId: item.id,
                versionNumber: item.versionNumber,
                publishedAt: item.definition.publishedAt,
            })),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    public async SearchAdmin(query: AdminRequestTypeSearch)
    {
        const predicates = [];
        const escape = (value: string) => value.replace(/[\\%_]/g, "\\$&");
        const englishName = sql<string>`coalesce(${requestTypes.draft}->'name'->>'en', ${requestTypeVersions.definition}->'name'->>'en', ${requestTypes.code})`;
        const thaiName = sql<string>`coalesce(${requestTypes.draft}->'name'->>'th', ${requestTypeVersions.definition}->'name'->>'th', '')`;

        for (const filter of query.search)
        {
            if (filter.name === "isEnabled")
            {
                predicates.push(eq(requestTypes.isEnabled, filter.value));
            }
            else if (filter.name === "hasDraft")
            {
                predicates.push(filter.value ? isNotNull(requestTypes.draft) : isNull(requestTypes.draft));
            }
            else if (filter.name === "isPublished")
            {
                predicates.push(filter.value ? isNotNull(requestTypes.publishedVersionId) : isNull(requestTypes.publishedVersionId));
            }
            else if (filter.name === "code")
            {
                if (filter.condition === "EQUAL") predicates.push(ilike(requestTypes.code, escape(filter.value)));
                else if (filter.condition === "CONTAINS") predicates.push(ilike(requestTypes.code, `%${escape(filter.value)}%`));
                else predicates.push(ilike(requestTypes.code, `${escape(filter.value)}%`));
            }
        }
        if (query.searchTerm)
        {
            const term = `%${escape(query.searchTerm.value)}%`;
            const columns = query.searchTerm.name.split(",");
            predicates.push(
                or(
                    ...columns.map((column) =>
                        column === "code"
                            ? ilike(requestTypes.code, term)
                            : or(ilike(englishName, term), ilike(thaiName, term)),
                    ),
                )!,
            );
        }

        const where = predicates.length ? and(...predicates) : undefined;
        const direction = query.orderBy.endsWith("desc") ? desc : asc;
        const orderColumn = query.orderBy.startsWith("name")
            ? englishName
            : query.orderBy.startsWith("updatedAt")
                ? requestTypes.updatedAt
                : requestTypes.code;

        const total = (
            await this.db
                .select({ count: count() })
                .from(requestTypes)
                .leftJoin(requestTypeVersions, eq(requestTypes.publishedVersionId, requestTypeVersions.id))
                .where(where)
        )[0]!.count;

        const rows = await this.db
            .select({
                type: requestTypes,
                definition: requestTypeVersions.definition,
            })
            .from(requestTypes)
            .leftJoin(requestTypeVersions, eq(requestTypes.publishedVersionId, requestTypeVersions.id))
            .where(where)
            .orderBy(direction(orderColumn), asc(requestTypes.id))
            .limit(query.pageSize)
            .offset((query.pageNumber - 1) * query.pageSize);

        const items = rows.map(({ type, definition }) =>
        {
            const source = type.draft ?? definition;
            const description = source?.description;
            return adminRequestTypeSummarySchema.parse({
                id: type.id,
                code: type.code,
                name: source?.name ?? { en: type.code },
                ...(description ? { description } : {}),
                isEnabled: type.isEnabled,
                monetary: source?.monetary ?? false,
                supportsLineItems: source?.supportsLineItems ?? false,
                version: type.version,
                publishedVersionId: type.publishedVersionId,
                publishedVersionNumber: definition?.versionNumber ?? null,
                publishedAt: definition?.publishedAt ?? null,
                hasDraft: type.draft !== null,
                updatedAt: type.updatedAt.toISOString(),
            });
        });

        const totalPages = Math.ceil(total / query.pageSize);
        return {
            items,
            pagination: {
                currentPage: query.pageNumber,
                pageSize: query.pageSize,
                totalPages,
                totalCount: total,
                hasPrevious: query.pageNumber > 1,
                hasNext: query.pageNumber < totalPages,
            },
        };
    }

    public async Create(id: string, code: string, draft: RequestTypeDraftContent, now: Date): Promise<void>
    {
        try
        {
            await this.db.insert(requestTypes).values({
                id,
                code,
                isEnabled: true,
                publishedVersionId: null,
                version: 0,
                draft,
                createdAt: now,
                updatedAt: now,
            });
        }
        catch (error)
        {
            if (isUniqueViolation(error))
            {
                throw new RequestTypeError("CONFLICT", [{ field: "code", code: "DUPLICATE_CODE", message: "A request type with this code already exists." }]);
            }
            throw error;
        }
    }

    public async SaveDraft(id: string, draft: RequestTypeDraftContent, nextVersion: number, now: Date): Promise<void>
    {
        await this.db
            .update(requestTypes)
            .set({ draft, version: nextVersion, updatedAt: now })
            .where(eq(requestTypes.id, id));
    }

    public async Publish(id: string, version: PublishedRequestType, nextVersion: number, now: Date): Promise<void>
    {
        await this.db.insert(requestTypeVersions).values({
            id: version.versionId,
            typeId: id,
            versionNumber: version.versionNumber,
            definition: version,
        });
        await this.db
            .update(requestTypes)
            .set({ publishedVersionId: version.versionId, draft: null, version: nextVersion, updatedAt: now })
            .where(eq(requestTypes.id, id));
    }

    public async SetEnabled(id: string, isEnabled: boolean, nextVersion: number, now: Date): Promise<void>
    {
        await this.db
            .update(requestTypes)
            .set({ isEnabled, version: nextVersion, updatedAt: now })
            .where(eq(requestTypes.id, id));
    }
}

export class RequestTypeUnitOfWork implements IRequestTypeUnitOfWork
{
    constructor(private readonly db: Connection)
    {
    }

    public Run<T>(operation: (repository: IRequestTypeRepository) => Promise<T>): Promise<T>
    {
        return this.db.transaction((tx) => operation(new RequestTypeRepository(tx)));
    }
}
