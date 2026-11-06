import { IdentityError } from "../../Domains/Identity/IdentityError";
import { isCurrentIdentity } from "../../Domains/Identity/Identity";
import type { IAccessTokenProvider, IClock, IIdentityRepository } from "../../Domains/Identity/Ports";

export class Authenticate
{
    constructor(
        private readonly tokens: IAccessTokenProvider,
        private readonly repository: IIdentityRepository,
        private readonly clock: IClock,
    )
    {}

    public async Execute(token: string)
    {
        let claims;
        try
        {
            claims = await this.tokens.Verify(token);
        }
        catch
        {
            throw new IdentityError("INVALID_SESSION");
        }
        const actor = await this.repository.ReadCurrentIdentity(claims.sub, claims.sid);
        if (!actor || !isCurrentIdentity(actor, claims.ver, this.clock.Now()) || actor.roles.length === 0)
        {
            throw new IdentityError("INVALID_SESSION");
        }
        return actor;
    }
}
