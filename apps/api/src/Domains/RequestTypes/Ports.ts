import type {
    AdminRequestTypeSearch,
    AdminRequestTypeSummary,
    AdminRequestTypeVersionSummary,
    IPageResult,
    PublishedRequestType,
    RequestTypeDraftContent,
} from "@workflow/contracts";
import type { IActor } from "../Identity/Identity";

export interface IRequestTypeRecord
{
    id: string;
    code: string;
    isEnabled: boolean;
    version: number;
    publishedVersionId: string | null;
    publishedVersion: PublishedRequestType | null;
    draft: RequestTypeDraftContent | null;
    versions: AdminRequestTypeVersionSummary[];
    createdAt: Date;
    updatedAt: Date;
}

export interface IRequestTypeRepository
{
    CurrentActor(actor: IActor): Promise<IActor>;
    Replay<T>(actorId: string, scope: string, key: string, bodyHash: string): Promise<T | null>;
    Complete(actorId: string, scope: string, key: string, bodyHash: string, result: Record<string, unknown>): Promise<void>;
    Read(id: string, lock?: boolean): Promise<IRequestTypeRecord | null>;
    SearchAdmin(query: AdminRequestTypeSearch): Promise<IPageResult<AdminRequestTypeSummary>>;
    Create(id: string, code: string, draft: RequestTypeDraftContent, now: Date): Promise<void>;
    SaveDraft(id: string, draft: RequestTypeDraftContent, nextVersion: number, now: Date): Promise<void>;
    Publish(id: string, version: PublishedRequestType, nextVersion: number, now: Date): Promise<void>;
    SetEnabled(id: string, isEnabled: boolean, nextVersion: number, now: Date): Promise<void>;
}

export interface IRequestTypeUnitOfWork
{
    Run<T>(operation: (repository: IRequestTypeRepository) => Promise<T>): Promise<T>;
}
