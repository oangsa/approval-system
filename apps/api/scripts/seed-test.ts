import { seedRequests } from "../src/Infrastructures/Database/seedRequests";
import { eq, or } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import { Database } from "../src/Infrastructures/Database/Database";
import { assertTestDatabaseTarget } from "../src/Infrastructures/Database/testDatabaseTargetGuard";
import { departmentMemberships, departments, roles, userRoles, users } from "../src/Infrastructures/Database/schema";
import { PasswordHasher } from "../src/Infrastructures/Security/PasswordHasher";
import { fixtureDepartments, fixtureUsers } from "../tests/helpers/identityFixtures";
import { loadTestEnvironment } from "../tests/helpers/testEnvironment";

export async function seedTest(): Promise<void>
{
    loadTestEnvironment();
    const database = new Database(assertTestDatabaseTarget());
    try
    {
        await database.connection.transaction(async (tx) =>
        {
            await tx.insert(roles).values([{ code: "REQUESTER" }, { code: "REVIEWER" }, { code: "ADMINISTRATOR" }]).onConflictDoNothing();
            for (const department of fixtureDepartments)
            {
                const existing = await tx.select().from(departments).where(or(eq(departments.id, department.id), eq(departments.code, department.code)));
                if (existing.some((row) => row.id !== department.id || row.code !== department.code)) throw new Error("Fixture department identity conflict");
                await tx.insert(departments).values(department).onConflictDoNothing();
            }
            for (const fixture of fixtureUsers)
            {
                const existing = await tx.select().from(users).where(or(eq(users.id, fixture.id), eq(users.email, fixture.email)));
                if (existing.some((row) => row.id !== fixture.id || row.email !== fixture.email)) throw new Error("Fixture user identity conflict");
                if (existing.length) continue;
                const passwordHash = await new PasswordHasher().Hash("Test-password-42!");
                const inserted = await tx.insert(users).values({ id: fixture.id, email: fixture.email, displayName: fixture.displayName, isActive: fixture.isActive, passwordHash }).onConflictDoNothing().returning({ id: users.id });
                if (!inserted.length) throw new Error("Fixture user insertion conflict");
                await tx.insert(userRoles).values(fixture.roles.map((roleCode) => ({ userId: fixture.id, roleCode })));
                await tx.insert(departmentMemberships).values({ userId: fixture.id, departmentId: fixture.departmentId, isPrimary: true });
            }
        });
        await seedRequests(database, fixtureDepartments.map((department) => department.id), fixtureUsers[2]!.id);
    }
    finally
{
 await database.Close();
}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await seedTest();
