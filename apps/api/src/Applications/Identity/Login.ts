import { randomUUID } from "node:crypto";
import { IdentityError } from "../../Domains/Identity/IdentityError";
import type { IAccessTokenProvider, IClock, IIdentityRepository, IIdentityUnitOfWork, ILoginThrottle, IPasswordHasher, IRefreshTokenProvider } from "../../Domains/Identity/Ports";
import { GetCurrentUser } from "./GetCurrentUser";

export class Login
{
    constructor(
        private readonly repository: IIdentityRepository,
        private readonly unitOfWork: IIdentityUnitOfWork,
        private readonly passwords: IPasswordHasher,
        private readonly tokens: IAccessTokenProvider,
        private readonly refreshTokens: IRefreshTokenProvider,
        private readonly throttle: ILoginThrottle,
        private readonly clock: IClock,
        private readonly dummyHash: string,
    )
    {}

    public async Execute(email: string, password: string, ip: string | null)
    {
        const normalized = email.trim().toLowerCase();
        if (!this.throttle.Check(ip, normalized)) throw new IdentityError("RATE_LIMITED");
        const candidate = await this.repository.FindUserByEmail(normalized);
        const valid = await this.passwords.Verify(password, candidate?.isActive ? candidate.passwordHash : this.dummyHash);
        if (!candidate || !candidate.isActive || !valid)
        {
            this.throttle.RecordFailure(ip, normalized);
            throw new IdentityError("INVALID_CREDENTIALS");
        }
        const result = await this.unitOfWork.Run(async (repository) =>
        {
            const user = await repository.LockUser(candidate.id);
            if (!user || !user.isActive || user.passwordHash !== candidate.passwordHash) return null;
            const now = this.clock.Now();
            const family = { id: randomUUID(), userId: user.id, authVersion: user.authVersion, createdAt: now, expiresAt: new Date(now.getTime() + 7 * 86400000), revokedAt: null };
            await repository.InsertFamily(family);
            const actor = await repository.ReadCurrentIdentity(user.id, family.id);
            if (!actor || actor.roles.length === 0) throw new IdentityError("INVALID_CREDENTIALS");
            const secret = this.refreshTokens.Generate();
            await repository.InsertRefreshToken({ id: randomUUID(), familyId: family.id, tokenHash: this.refreshTokens.Hash(secret), createdAt: now, expiresAt: family.expiresAt, consumedAt: null });
            const accessToken = await this.tokens.Sign(user.id, family.id, user.authVersion);
            return { accessToken, user: new GetCurrentUser().Execute(actor), secret, expiresAt: family.expiresAt };
        }).catch((error: unknown) =>
        {
            if (error instanceof IdentityError && error.code === "INVALID_CREDENTIALS") this.throttle.RecordFailure(ip, normalized);
            throw error;
        });
        if (!result)
        {
            this.throttle.RecordFailure(ip, normalized);
            throw new IdentityError("INVALID_CREDENTIALS");
        }
        this.throttle.RecordSuccess(ip, normalized);
        return result;
    }
}
