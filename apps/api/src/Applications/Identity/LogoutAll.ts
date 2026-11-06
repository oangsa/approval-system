import { isCurrentIdentity } from "../../Domains/Identity/Identity";
import type { IActor } from "../../Domains/Identity/Identity";
import { IdentityError } from "../../Domains/Identity/IdentityError";
import type { IClock, IIdentityUnitOfWork } from "../../Domains/Identity/Ports";

export class LogoutAll
{
    constructor(private readonly unitOfWork: IIdentityUnitOfWork, private readonly clock: IClock)
    {}

    public async Execute(actor: IActor): Promise<void>
    {
        await this.unitOfWork.Run(async (repository) =>
        {
            const user = await repository.LockUser(actor.account.id);
            const family = await repository.LockFamily(actor.family.id);
            const now = this.clock.Now();
            if (!user || !family || !user.isActive || family.userId !== user.id || family.revokedAt !== null || family.expiresAt <= now || user.authVersion !== actor.account.authVersion || family.authVersion !== user.authVersion)
            {
                throw new IdentityError("INVALID_SESSION");
            }
            const current = await repository.ReadCurrentIdentity(user.id, family.id);
            if (!current || current.account.id !== user.id || current.family.id !== family.id || current.roles.length === 0 || !isCurrentIdentity(current, actor.account.authVersion, now))
            {
                throw new IdentityError("INVALID_SESSION");
            }
            await repository.IncrementAuthVersion(user.id);
            await repository.RevokeAllFamilies(user.id, now);
        });
    }
}
