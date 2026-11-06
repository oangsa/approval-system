import type { DepartmentSummary, UserRole } from "@workflow/contracts";

export interface IAccount
{
    id: string; email: string; displayName: string; passwordHash: string; isActive: boolean;
    authVersion: number; createdAt: Date; updatedAt: Date;
}
export interface ISessionFamily
{
    id: string; userId: string; authVersion: number; createdAt: Date; expiresAt: Date; revokedAt: Date | null;
}
export interface IRefreshHistory
{
    id: string; familyId: string; tokenHash: string; createdAt: Date; expiresAt: Date; consumedAt: Date | null;
}
export interface IActor
{
    account: IAccount; family: ISessionFamily; roles: readonly UserRole[]; department: DepartmentSummary | null;
}
export function isCurrentIdentity(actor: IActor, version: number, now: Date): boolean
{
    return actor.account.isActive && actor.family.userId === actor.account.id && actor.family.revokedAt === null
        && actor.account.authVersion === version && actor.family.authVersion === version && now < actor.family.expiresAt;
}
export function isCurrentRefresh(token: IRefreshHistory, family: ISessionFamily, now: Date): boolean
{
    return token.familyId === family.id && token.consumedAt === null && now < token.expiresAt
        && token.expiresAt <= family.expiresAt && family.revokedAt === null && now < family.expiresAt;
}
