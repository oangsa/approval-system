import type { CommentDTO, CommentQuery, IPageResult } from "@workflow/contracts";
import type { IActor } from "../Identity/Identity";
import type { IRequestAccessContext } from "./RequestAccessPolicy";

export interface ICreateCommentRecordInput
{
    requestId: string;
    authorId: string;
    body: string;
}

export interface ICommentRepository
{
    CurrentActor(actor: IActor): Promise<IActor>;
    ReadRequestAccessContext(requestId: string, lock?: false | "share" | "update"): Promise<IRequestAccessContext | null>;
    ListByRequest(requestId: string, query: CommentQuery): Promise<IPageResult<CommentDTO>>;
    Create(input: ICreateCommentRecordInput): Promise<CommentDTO>;
}

export interface ICommentUnitOfWork
{
    Run<T>(operation: (repository: ICommentRepository) => Promise<T>): Promise<T>;
}
