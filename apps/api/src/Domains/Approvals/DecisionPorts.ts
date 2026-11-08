import type { AuditTimelineItem, DecisionRequest, DecisionResult, IPageResult, TimelineQuery } from "@workflow/contracts";
import type { IActor } from "../Identity/Identity";
import type { IDecisionState, IDecisionTransition } from "./DecisionRules";
export interface IDecisionRepository
{
    CurrentActor(actor: IActor): Promise<IActor>;
    Replay(actorId: string, scope: string, key: string, hash: string): Promise<DecisionResult | null>;
    Lock(actor: IActor, taskId: string): Promise<IDecisionState>;
    Save(actorId: string, taskId: string, body: DecisionRequest, state: IDecisionState, transition: IDecisionTransition): Promise<DecisionResult>;
    Complete(actorId: string, scope: string, key: string, hash: string, result: DecisionResult): Promise<void>;
    Timeline(actor: IActor, requestId: string, query: TimelineQuery): Promise<IPageResult<AuditTimelineItem>>;
}
export interface IDecisionUnitOfWork { Run<T>(operation: (repository: IDecisionRepository) => Promise<T>): Promise<T>; }
