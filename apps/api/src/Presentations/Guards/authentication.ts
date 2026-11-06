import { IdentityError } from "../../Domains/Identity/IdentityError";
import type { Authenticate } from "../../Applications/Identity/Authenticate";

export async function requireAuthentication(authorization: string | null, authenticate: Authenticate)
{
    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? "");
    if (!match) throw new IdentityError("INVALID_SESSION");
    const actor = await authenticate.Execute(match[1]!);
    return Object.freeze({
        ...actor,
        account: Object.freeze({ ...actor.account }),
        family: Object.freeze({ ...actor.family }),
        roles: Object.freeze([...actor.roles]),
        department: actor.department ? Object.freeze({ ...actor.department }) : null,
    });
}
