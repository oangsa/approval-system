export type IdentityErrorCode = "INVALID_CREDENTIALS" | "INVALID_SESSION" | "FORBIDDEN" | "RATE_LIMITED";
export class IdentityError extends Error
{
    constructor(public readonly code: IdentityErrorCode)
    {
        super(code);
    }
}
