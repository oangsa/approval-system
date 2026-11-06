import { randomUUID } from "node:crypto";
import { isCurrentIdentity, isCurrentRefresh } from "../../Domains/Identity/Identity";
import { IdentityError } from "../../Domains/Identity/IdentityError";
import type { IAccessTokenProvider, IClock, IIdentityRepository, IIdentityUnitOfWork, IRefreshTokenProvider } from "../../Domains/Identity/Ports";

export class RefreshSession
{
    constructor(
        private readonly repository: IIdentityRepository,
        private readonly unitOfWork: IIdentityUnitOfWork,
        private readonly tokens: IAccessTokenProvider,
        private readonly refreshTokens: IRefreshTokenProvider,
        private readonly clock: IClock,
    )
    {}

    public async Execute(secret: string)
    {
        const hash = this.refreshTokens.Hash(secret);
        const found = await this.repository.FindRefreshTokenByHash(hash);
        if (!found) throw new IdentityError("INVALID_SESSION");
        const result = await this.unitOfWork.Run(async (repository) =>
        {
            const user = await repository.LockUser(found.family.userId);
            const family = await repository.LockFamily(found.family.id);
            const current = await repository.FindRefreshTokenByHash(hash);
            const now = this.clock.Now();
            if (!user || !family || !current || current.family.id !== family.id) return { kind: "invalid" as const };
            if (current.token.consumedAt !== null)
            {
                await repository.RevokeFamily(family.id, now);
                return { kind: "replay" as const };
            }
            const actor = await repository.ReadCurrentIdentity(user.id, family.id);
            if (!actor || !isCurrentIdentity(actor, user.authVersion, now) || actor.roles.length === 0) return { kind: "invalid" as const };
            if (!isCurrentRefresh(current.token, family, now)) return { kind: "invalid" as const };
            if (!await repository.ConsumeRefreshToken(current.token.id, now)) return { kind: "invalid" as const };
            const successor = this.refreshTokens.Generate();
            await repository.InsertRefreshToken({ id: randomUUID(), familyId: family.id, tokenHash: this.refreshTokens.Hash(successor), createdAt: now, expiresAt: family.expiresAt, consumedAt: null });
            const accessToken = await this.tokens.Sign(user.id, family.id, user.authVersion);
            return { kind: "refreshed" as const, payload: { accessToken, secret: successor, expiresAt: family.expiresAt } };
        });
        if (result.kind !== "refreshed") throw new IdentityError("INVALID_SESSION");
        return result.payload;
    }
}
