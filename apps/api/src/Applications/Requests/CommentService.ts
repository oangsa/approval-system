import type { CommentDTO, CommentQuery, IPageResult } from "@workflow/contracts";
import type { IActor } from "../../Domains/Identity/Identity";
import type { ICommentUnitOfWork } from "../../Domains/Requests/CommentPorts";
import { NormalizeCommentBody } from "../../Domains/Requests/CommentRules";
import { RequestAccessPolicy } from "../../Domains/Requests/RequestAccessPolicy";
import { RequestError } from "../../Domains/Requests/RequestRules";

/**
 * Application service orchestrating request discussion comments without mutating
 * request workflow status, request versions, or approval slots.
 */
export class CommentService
{
    constructor(private readonly unit: ICommentUnitOfWork)
    {
    }

    public async ListComments(actor: IActor, requestId: string, query: CommentQuery): Promise<IPageResult<CommentDTO>>
    {
        const normalizedRequestId = requestId.toLowerCase();
        return this.unit.Run(async (repository) =>
        {
            const currentActor = await repository.CurrentActor(actor);
            const context = await repository.ReadRequestAccessContext(normalizedRequestId, "share");
            if (!context)
            {
                throw new RequestError("NOT_FOUND");
            }

            RequestAccessPolicy.AssertCanReadCurrentRequest(currentActor, context);
            return repository.ListByRequest(normalizedRequestId, query);
        });
    }

    public async AddComment(actor: IActor, requestId: string, body: string): Promise<CommentDTO>
    {
        const normalizedRequestId = requestId.toLowerCase();
        return this.unit.Run(async (repository) =>
        {
            const currentActor = await repository.CurrentActor(actor);
            const context = await repository.ReadRequestAccessContext(normalizedRequestId, "share");
            if (!context)
            {
                throw new RequestError("NOT_FOUND");
            }

            RequestAccessPolicy.AssertCanPostComment(currentActor, context);
            const normalizedBody = NormalizeCommentBody(body);
            return repository.Create({
                requestId: normalizedRequestId,
                authorId: currentActor.account.id,
                body: normalizedBody,
            });
        });
    }
}
