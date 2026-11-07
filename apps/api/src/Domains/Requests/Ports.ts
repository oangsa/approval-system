import type { CreateRequest, PatchDraft, PublishedRequestType, RequestDetail, RequestTypeSearch, IRequestTypeSearchResult } from "@workflow/contracts";
import type { IActor } from "../Identity/Identity";
import type { IConfiguration, IPlan } from "./RequestRules";

export interface IRequestRepository
{
    CurrentActor(actor: IActor): Promise<IActor>;
    Replay(actorId: string, scope: string, key: string, bodyHash: string): Promise<RequestDetail | null>;
    Complete(actorId: string, scope: string, key: string, bodyHash: string, result: RequestDetail): Promise<void>;
    Read(id: string, lock?: boolean): Promise<RequestDetail | null>;
    Configuration(typeId: string, versionId: string, actorId: string): Promise<IConfiguration>;
    Create(actor: IActor, content: CreateRequest, amount: string | null): Promise<string>;
    Patch(id: string, actorId: string, content: CreateRequest, amount: string | null): Promise<void>;
    Submit(id: string, actorId: string, plan: IPlan): Promise<void>;
    Types(query: RequestTypeSearch): Promise<IRequestTypeSearchResult>;
    TypeVersion(id: string, versionId: string): Promise<PublishedRequestType | null>;
    Type(id: string): Promise<PublishedRequestType | null>;
}
export interface IRequestUnitOfWork { Run<T>(operation: (repository: IRequestRepository) => Promise<T>): Promise<T>; }
export type RequestMutation = CreateRequest | PatchDraft | { expectedVersion: number };
