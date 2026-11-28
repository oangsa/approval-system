import { randomUUID } from "node:crypto";
import { asc, count, eq } from "drizzle-orm";
import { commentSchema, type CommentDTO, type CommentQuery, type IPageResult } from "@workflow/contracts";
import type { IActor } from "../../../Domains/Identity/Identity";
import type { ICommentRepository, ICommentUnitOfWork, ICreateCommentRecordInput } from "../../../Domains/Requests/CommentPorts";
import type { IRequestAccessContext } from "../../../Domains/Requests/RequestAccessPolicy";
import type { Database } from "../Database";
import { approvalSlots, approvalStages, requestComments, requests, users } from "../schema";
import { RequestRepository } from "./RequestRepository";

type Connection = Database["connection"];
export type RepositoryTransaction = Parameters<Parameters<Connection["transaction"]>[0]>[0];

/**
 * Loads current request access context with canonical lock ordering
 * after CurrentActor has locked users FOR SHARE.
 */
export async function ReadRequestAccessContextFromTransaction(
    db: RepositoryTransaction,
    requestId: string,
    lock: false | "share" | "update" = false,
): Promise<IRequestAccessContext | null>
{
    const baseQuery = db
        .select({
            id: requests.id,
            requesterId: requests.requesterId,
            status: requests.status,
            workingRevisionId: requests.workingRevisionId,
            submittedRevisionId: requests.submittedRevisionId,
            currentCycleId: requests.currentCycleId,
        })
        .from(requests)
        .where(eq(requests.id, requestId));

    const row = (await (
        lock === "update"
            ? baseQuery.for("update")
            : lock === "share"
                ? baseQuery.for("share")
                : baseQuery
    ))[0];

    if (!row)
    {
        return null;
    }

    const slots = row.currentCycleId
        ? await db
            .select({
                reviewerId: approvalSlots.reviewerId,
                status: approvalSlots.status,
            })
            .from(approvalStages)
            .innerJoin(approvalSlots, eq(approvalSlots.stageId, approvalStages.id))
            .where(eq(approvalStages.cycleId, row.currentCycleId))
            .orderBy(asc(approvalStages.stageNumber), asc(approvalSlots.id))
        : [];

    return {
        requestId: row.id,
        requesterId: row.requesterId,
        status: row.status,
        workingRevisionId: row.workingRevisionId,
        submittedRevisionId: row.submittedRevisionId,
        currentApprovers: slots,
    };
}

export class CommentRepository implements ICommentRepository
{
    constructor(private readonly db: RepositoryTransaction)
    {
    }

    public CurrentActor(actor: IActor): Promise<IActor>
    {
        return new RequestRepository(this.db).CurrentActor(actor);
    }

    public ReadRequestAccessContext(requestId: string, lock: false | "share" | "update" = false): Promise<IRequestAccessContext | null>
    {
        return ReadRequestAccessContextFromTransaction(this.db, requestId, lock);
    }

    public async ListByRequest(requestId: string, query: CommentQuery): Promise<IPageResult<CommentDTO>>
    {
        const where = eq(requestComments.requestId, requestId);
        const totalCount = (await this.db.select({ value: count() }).from(requestComments).where(where))[0]!.value;
        const rows = await this.db
            .select({
                id: requestComments.id,
                requestId: requestComments.requestId,
                body: requestComments.body,
                createdAt: requestComments.createdAt,
                authorId: users.id,
                authorDisplayName: users.displayName,
            })
            .from(requestComments)
            .innerJoin(users, eq(requestComments.authorId, users.id))
            .where(where)
            .orderBy(asc(requestComments.createdAt), asc(requestComments.id))
            .limit(query.pageSize)
            .offset((query.pageNumber - 1) * query.pageSize);

        const totalPages = Math.ceil(totalCount / query.pageSize);
        return {
            items: rows.map((row) =>
                commentSchema.parse({
                    id: row.id,
                    requestId: row.requestId,
                    author: {
                        id: row.authorId,
                        displayName: row.authorDisplayName,
                    },
                    body: row.body,
                    createdAt: row.createdAt.toISOString(),
                }),
            ),
            pagination: {
                currentPage: query.pageNumber,
                pageSize: query.pageSize,
                totalPages,
                totalCount,
                hasPrevious: query.pageNumber > 1,
                hasNext: query.pageNumber < totalPages,
            },
        };
    }

    public async Create(input: ICreateCommentRecordInput): Promise<CommentDTO>
    {
        const id = randomUUID();
        const createdAt = new Date();
        await this.db.insert(requestComments).values({
            id,
            requestId: input.requestId,
            authorId: input.authorId,
            body: input.body,
            createdAt,
        });

        const author = (await this.db
            .select({
                id: users.id,
                displayName: users.displayName,
            })
            .from(users)
            .where(eq(users.id, input.authorId)))[0]!;

        return commentSchema.parse({
            id,
            requestId: input.requestId,
            author: {
                id: author.id,
                displayName: author.displayName,
            },
            body: input.body,
            createdAt: createdAt.toISOString(),
        });
    }
}

export class CommentUnitOfWork implements ICommentUnitOfWork
{
    constructor(private readonly db: Connection)
    {
    }

    public Run<T>(operation: (repository: ICommentRepository) => Promise<T>): Promise<T>
    {
        return this.db.transaction((tx) => operation(new CommentRepository(tx)));
    }
}
