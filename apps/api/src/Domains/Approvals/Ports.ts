import type { ApprovalTask, ApprovalTaskSearch, paginationSchema } from "@workflow/contracts";
import type { z } from "zod";
import type { IActor } from "../Identity/Identity";
export interface IApprovalTaskRepository
{
    CurrentActor(actor: IActor): Promise<IActor>;
    Search(actorId: string, query: ApprovalTaskSearch): Promise<{ items: ApprovalTask[]; pagination: z.infer<typeof paginationSchema> }>;
    ReadHandled(actorId: string, taskId: string): Promise<ApprovalTask | null>;
    ReadCurrent(actorId: string, taskId: string): Promise<ApprovalTask | null>;
}
export interface IApprovalTaskUnitOfWork { Run<T>(operation: (repository: IApprovalTaskRepository) => Promise<T>): Promise<T>; }
