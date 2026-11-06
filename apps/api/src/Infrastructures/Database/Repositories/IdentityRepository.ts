import { and, eq, isNull, sql } from "drizzle-orm";
import type { IIdentityRepository, IIdentityUnitOfWork } from "../../../Domains/Identity/Ports";
import type { IActor, IRefreshHistory, ISessionFamily } from "../../../Domains/Identity/Identity";
import type { Database } from "../Database";
import { departmentMemberships, departments, refreshTokens, sessionFamilies, userRoles, users } from "../schema";

type Connection = Database["connection"];
type Transaction = Parameters<Parameters<Connection["transaction"]>[0]>[0];
type QueryConnection = Pick<Transaction, "select" | "insert" | "update">;

export class IdentityRepository implements IIdentityRepository
{
    constructor(private readonly db: QueryConnection)
{}
    public async FindUserByEmail(email: string)
{
 return (await this.db.select().from(users).where(eq(users.email, email)))[0];
}
    public async FindUserById(id: string)
{
 return (await this.db.select().from(users).where(eq(users.id, id)))[0];
}
    public async FindRefreshTokenByHash(hash: string)
    {
        return (await this.db.select({ token: refreshTokens, family: sessionFamilies }).from(refreshTokens)
            .innerJoin(sessionFamilies, eq(refreshTokens.familyId, sessionFamilies.id)).where(eq(refreshTokens.tokenHash, hash)))[0];
    }
    public async LockUser(id: string)
{
 return (await this.db.select().from(users).where(eq(users.id, id)).for("update"))[0];
}
    public async LockFamily(id: string)
{
 return (await this.db.select().from(sessionFamilies).where(eq(sessionFamilies.id, id)).for("update"))[0];
}
    public async ReadCurrentIdentity(userId: string, familyId: string): Promise<IActor | undefined>
    {
        const rows = await this.db.select({ account: users, family: sessionFamilies, role: userRoles.roleCode, department: departments })
            .from(users).innerJoin(sessionFamilies, and(eq(sessionFamilies.userId, users.id), eq(sessionFamilies.id, familyId)))
            .leftJoin(userRoles, eq(userRoles.userId, users.id))
            .leftJoin(departmentMemberships, and(eq(departmentMemberships.userId, users.id), eq(departmentMemberships.isPrimary, true), eq(departmentMemberships.isActive, true)))
            .leftJoin(departments, and(eq(departments.id, departmentMemberships.departmentId), eq(departments.isActive, true)))
            .where(eq(users.id, userId));
        const first = rows[0];
        if (!first) return undefined;
        return { account: first.account, family: first.family, roles: [...new Set(rows.flatMap((row) => row.role ? [row.role] : []))].sort(), department: first.department };
    }
    public async InsertFamily(family: ISessionFamily): Promise<void>
{
 await this.db.insert(sessionFamilies).values(family);
}
    public async InsertRefreshToken(token: IRefreshHistory): Promise<void>
{
 await this.db.insert(refreshTokens).values(token);
}
    public async ConsumeRefreshToken(id: string, at: Date): Promise<boolean>
    {
        return (await this.db.update(refreshTokens).set({ consumedAt: at }).where(and(eq(refreshTokens.id, id), isNull(refreshTokens.consumedAt))).returning({ id: refreshTokens.id })).length === 1;
    }
    public async RevokeFamily(id: string, at: Date): Promise<void>
    {
        await this.db.update(sessionFamilies).set({ revokedAt: at }).where(and(eq(sessionFamilies.id, id), isNull(sessionFamilies.revokedAt)));
    }
    public async RevokeAllFamilies(userId: string, at: Date): Promise<void>
    {
        await this.db.update(sessionFamilies).set({ revokedAt: at }).where(and(eq(sessionFamilies.userId, userId), isNull(sessionFamilies.revokedAt)));
    }
    public async IncrementAuthVersion(userId: string): Promise<void>
    {
        await this.db.update(users).set({ authVersion: sql`${users.authVersion} + 1` }).where(eq(users.id, userId));
    }
}
export class IdentityUnitOfWork implements IIdentityUnitOfWork
{
    constructor(private readonly db: Connection)
{}
    public Run<T>(operation: (repository: IIdentityRepository) => Promise<T>): Promise<T>
    {
        return this.db.transaction((transaction) => operation(new IdentityRepository(transaction)));
    }
}
