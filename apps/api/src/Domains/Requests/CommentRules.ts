import { MAX_COMMENT_BODY_LENGTH } from "@workflow/contracts";
import { RequestError } from "./RequestRules";

/**
 * Normalizes a request discussion comment body by trimming outer whitespace,
 * preserving internal newlines, and enforcing the 1..4000 character bound.
 */
export function NormalizeCommentBody(body: string): string
{
    if (typeof body !== "string")
    {
        throw new RequestError("VALIDATION_ERROR", [
            { field: "body", code: "VALIDATION_ERROR", message: "Comment body must be a string." },
        ]);
    }

    const normalized = body.trim();
    if (normalized.length < 1 || normalized.length > MAX_COMMENT_BODY_LENGTH)
    {
        throw new RequestError("VALIDATION_ERROR", [
            {
                field: "body",
                code: "VALIDATION_ERROR",
                message: `Comment body must be between 1 and ${MAX_COMMENT_BODY_LENGTH} characters.`,
            },
        ]);
    }

    return normalized;
}
