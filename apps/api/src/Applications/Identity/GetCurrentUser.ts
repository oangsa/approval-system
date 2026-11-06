import { userSummarySchema } from "@workflow/contracts";
import type { IActor } from "../../Domains/Identity/Identity";

export class GetCurrentUser
{
    public Execute(actor: IActor)
    {
        return userSummarySchema.parse({
            id: actor.account.id,
            displayName: actor.account.displayName,
            email: actor.account.email,
            roles: actor.roles,
            isActive: actor.account.isActive,
            department: actor.department,
        });
    }
}
