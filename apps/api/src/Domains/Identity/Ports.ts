import type { IAccount, IActor, IRefreshHistory, ISessionFamily } from "./Identity";

export interface IClock { Now(): Date; }
export interface IPasswordHasher { Hash(password: string): Promise<string>; Verify(password: string, record: string): Promise<boolean>; }
export interface IAccessClaims { sub: string; sid: string; ver: number; iat: number; exp: number; }
export interface IAccessTokenProvider { Sign(sub: string, sid: string, ver: number): Promise<string>; Verify(token: string): Promise<IAccessClaims>; }
export interface IRefreshTokenProvider { Generate(): string; Hash(secret: string): string; }
export interface ILoginThrottle { Check(ip: string | null, email: string): boolean; RecordFailure(ip: string | null, email: string): void; RecordSuccess(ip: string | null, email: string): void; }
export interface IIdentityRepository
{
    FindUserByEmail(email: string): Promise<IAccount | undefined>;
    FindUserById(id: string): Promise<IAccount | undefined>;
    FindRefreshTokenByHash(hash: string): Promise<{ token: IRefreshHistory; family: ISessionFamily } | undefined>;
    LockUser(id: string): Promise<IAccount | undefined>;
    LockFamily(id: string): Promise<ISessionFamily | undefined>;
    ReadCurrentIdentity(userId: string, familyId: string): Promise<IActor | undefined>;
    InsertFamily(family: ISessionFamily): Promise<void>;
    InsertRefreshToken(token: IRefreshHistory): Promise<void>;
    ConsumeRefreshToken(id: string, at: Date): Promise<boolean>;
    RevokeFamily(id: string, at: Date): Promise<void>;
    RevokeAllFamilies(userId: string, at: Date): Promise<void>;
    IncrementAuthVersion(userId: string): Promise<void>;
}
export interface IIdentityUnitOfWork { Run<T>(operation: (repository: IIdentityRepository) => Promise<T>): Promise<T>; }
