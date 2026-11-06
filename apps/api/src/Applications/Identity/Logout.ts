import { IdentityError } from "../../Domains/Identity/IdentityError";
import { isCurrentIdentity } from "../../Domains/Identity/Identity";
import type { IActor } from "../../Domains/Identity/Identity";
import type { IClock, IIdentityRepository, IIdentityUnitOfWork, IRefreshTokenProvider } from "../../Domains/Identity/Ports";

export class Logout
{
    constructor(
        private readonly repository: IIdentityRepository,
        private readonly unitOfWork: IIdentityUnitOfWork,
        private readonly refreshTokens: IRefreshTokenProvider,
        private readonly clock: IClock,
    )
    {}

    public async Execute(actor: IActor | undefined, secret: string | undefined): Promise<void>
    {
        const hash = !actor && secret ? this.refreshTokens.Hash(secret) : undefined;
        const found = hash ? await this.repository.FindRefreshTokenByHash(hash) : undefined;
        const target = actor ? { userId: actor.account.id, familyId: actor.family.id } : found && { userId: found.family.userId, familyId: found.family.id };
        if (!target) throw new IdentityError("INVALID_SESSION");
        await this.unitOfWork.Run(async (repository) =>
        {
            const user = await repository.LockUser(target.userId);
            const family = await repository.LockFamily(target.familyId);
            if (!user || !family || user.id !== target.userId || family.id !== target.familyId || family.userId !== user.id)
            {
                throw new IdentityError("INVALID_SESSION");
            }
            const now = this.clock.Now();
            const current = await repository.ReadCurrentIdentity(user.id, family.id);
            if (!current || current.account.id !== user.id || current.family.id !== family.id || current.roles.length === 0 || !isCurrentIdentity(current, actor ? actor.account.authVersion : user.authVersion, now) || !user.isActive || family.revokedAt !== null || family.expiresAt <= now || family.authVersion !== user.authVersion || (actor && actor.account.authVersion !== user.authVersion))
            {
                throw new IdentityError("INVALID_SESSION");
            }
            if (!actor)
            {
                const reread = hash ? await repository.FindRefreshTokenByHash(hash) : undefined;
                if (!reread || reread.token.tokenHash !== hash || reread.token.familyId !== family.id || reread.family.id !== family.id || reread.family.userId !== user.id || reread.token.expiresAt <= now || reread.token.expiresAt > family.expiresAt)
                {
                    throw new IdentityError("INVALID_SESSION");
                }
            }
            await repository.RevokeFamily(family.id, now);
        });
    }
}
