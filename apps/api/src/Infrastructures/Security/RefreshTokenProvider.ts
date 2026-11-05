import { createHash, randomBytes } from "node:crypto";
import type { IRefreshTokenProvider } from "../../Domains/Identity/Ports";
export class RefreshTokenProvider implements IRefreshTokenProvider
{
    public Generate(): string
{
 return randomBytes(32).toString("base64url");
}
    public Hash(secret: string): string
{
 return createHash("sha256").update(secret).digest("hex");
}
}
