import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Database } from "../src/Infrastructures/Database/Database";
import { departmentMemberships, departments, roles, userRoles, users } from "../src/Infrastructures/Database/schema";
import { seedRequests } from "../src/Infrastructures/Database/seedRequests";
import { PasswordHasher } from "../src/Infrastructures/Security/PasswordHasher";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/workflow_dev" || process.env.NODE_ENV !== "development") throw new Error("Development seed requires loopback workflow_dev in development mode");
const requesterPassword = process.env.DEV_REQUESTER_PASSWORD;
const reviewerPassword = process.env.DEV_REVIEWER_PASSWORD;
if (!requesterPassword || !reviewerPassword) throw new Error("Set DEV_REQUESTER_PASSWORD and DEV_REVIEWER_PASSWORD in the ignored API .env");
const database = new Database(url.toString());
try
{
    const departmentId = "20000000-0000-4000-8000-000000000001";
    let reviewerId = "";
    await database.connection.transaction(async (tx) =>
    {
        await tx.insert(roles).values([{ code: "REQUESTER" }, { code: "REVIEWER" }, { code: "ADMINISTRATOR" }]).onConflictDoNothing();
        await tx.insert(departments).values({ id: departmentId, code: "OPS", name: "Operations" }).onConflictDoNothing();
        for (const [email, displayName, password, role] of [
            ["requester@example.test", "Local Requester", requesterPassword, "REQUESTER"],
            ["reviewer@example.test", "Local Reviewer", reviewerPassword, "REVIEWER"],
        ] as const)
        {
            let account = (await tx.select().from(users).where(eq(users.email, email)))[0];
            if (!account)
            {
                account = (await tx.insert(users).values({ id: randomUUID(), email, displayName, passwordHash: await new PasswordHasher().Hash(password) }).returning())[0]!;
                await tx.insert(userRoles).values({ userId: account.id, roleCode: role });
                await tx.insert(departmentMemberships).values({ userId: account.id, departmentId, isPrimary: true });
            }
            if (role === "REVIEWER") reviewerId = account.id;
        }
    });
    await seedRequests(database, [departmentId], reviewerId);
    console.info("Local request type, department, requester and eligible reviewer are ready. Passwords remain in the ignored API .env.");
}
finally
{
    await database.Close();
}
