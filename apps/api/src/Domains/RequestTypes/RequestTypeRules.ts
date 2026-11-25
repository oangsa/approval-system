import {
    validateRequestTypeDefinition,
    type IFieldIssue,
    type PatchRequestTypeDraft,
    type PublishedRequestType,
    type RequestTypeDraftContent,
} from "@workflow/contracts";

export type RequestTypeErrorCode =
    | "VALIDATION_ERROR"
    | "CONFLICT"
    | "IDEMPOTENCY_CONFLICT"
    | "NOT_FOUND"
    | "FORBIDDEN"
    | "UNAUTHENTICATED";

export class RequestTypeError extends Error
{
    constructor(public readonly code: RequestTypeErrorCode, public readonly details: IFieldIssue[] = [])
    {
        super(code);
    }
}

export function assertValidDefinition(content: RequestTypeDraftContent): void
{
    const issues = validateRequestTypeDefinition(content);
    if (issues.length) throw new RequestTypeError("VALIDATION_ERROR", issues);
}

export function mergeDraftPatch(current: RequestTypeDraftContent, patch: PatchRequestTypeDraft): RequestTypeDraftContent
{
    const description = patch.description === null ? undefined : patch.description ?? current.description;
    return {
        name: patch.name ?? current.name,
        ...(description ? { description } : {}),
        monetary: patch.monetary ?? current.monetary,
        supportsLineItems: patch.supportsLineItems ?? current.supportsLineItems,
        fields: patch.fields ?? current.fields,
    };
}

export function buildDraftFromPublished(published: PublishedRequestType): RequestTypeDraftContent
{
    return {
        name: published.name,
        ...(published.description ? { description: published.description } : {}),
        monetary: published.monetary,
        supportsLineItems: published.supportsLineItems,
        fields: published.fields,
    };
}

export function assertExpectedVersion(actual: number, expected: number): void
{
    if (actual !== expected)
    {
        throw new RequestTypeError("CONFLICT", [{ field: "expectedVersion", code: "STALE_VERSION", message: "Request type version does not match." }]);
    }
}
