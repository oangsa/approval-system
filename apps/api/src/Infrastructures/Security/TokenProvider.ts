import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { IAccessClaims, IAccessTokenProvider, IClock } from "../../Domains/Identity/Ports";

const claimsSchema = z.object({ sub: z.uuid(), sid: z.uuid(), ver: z.number().int().nonnegative(), iat: z.number().int(), exp: z.number().int() });
export class TokenProvider implements IAccessTokenProvider
{
    private readonly key: Uint8Array;
    constructor(secret: string, private readonly clock: IClock)
    {
        this.key = new TextEncoder().encode(secret);
        if (this.key.length < 32) throw new Error("JWT secret must be at least 32 UTF-8 bytes");
    }
    public async Sign(sub: string, sid: string, ver: number): Promise<string>
    {
        const iat = Math.floor(this.clock.Now().getTime() / 1000);
        const claims = claimsSchema.parse({ sub, sid, ver, iat, exp: iat + 900 });
        return new SignJWT({ sid: claims.sid, ver: claims.ver }).setProtectedHeader({ alg: "HS256" }).setSubject(claims.sub)
            .setIssuer("workflow-approval-api").setAudience("workflow-approval-web").setIssuedAt(iat).setExpirationTime(iat + 900).sign(this.key);
    }
    public async Verify(token: string): Promise<IAccessClaims>
    {
        const now = this.clock.Now();
        const result = await jwtVerify(token, this.key, { algorithms: ["HS256"], issuer: "workflow-approval-api", audience: "workflow-approval-web", currentDate: now });
        const claims = claimsSchema.parse(result.payload);
        if (claims.iat > Math.floor(now.getTime() / 1000) || claims.exp - claims.iat !== 900) throw new Error("Invalid token lifetime");
        return claims;
    }
}
