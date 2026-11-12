import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./Database";
import { seededDefinition, seededPolicyId, seededTypeId, seededVersionId } from "./seedRequests";
import { approvalPolicyVersions, departmentMemberships, departments, requestTypes, requestTypeVersions, reviewerAssignmentRules, roles, userRoles, users } from "./schema";
import { PasswordHasher } from "../Security/PasswordHasher";

const accountSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), displayName: z.string().trim().min(1).max(100), password: z.string().min(16).max(1024) });
export const initializationSchema = z.object({
    requester: accountSchema,
    reviewer: accountSchema,
}).refine((value) => value.requester.email !== value.reviewer.email);
export type Initialization = z.infer<typeof initializationSchema>;
const departmentId = "20000000-0000-4000-8000-000000000001";
const assignmentId = "30000000-0000-4000-8000-000000000010";

export function assertProductionInitializationTarget(environment: NodeJS.ProcessEnv): string
{
    try
    {
        const url = new URL(environment.DATABASE_URL ?? "");
        if (environment.NODE_ENV !== "production" || environment.PRODUCTION_INIT_ACK !== "initialize-minimum-sprint-1" ||
            !environment.PRODUCTION_DB_HOST || !environment.PRODUCTION_DB_USER ||
            url.hostname !== environment.PRODUCTION_DB_HOST || decodeURIComponent(url.username) !== environment.PRODUCTION_DB_USER ||
            !/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) || url.port !== "5432" || url.pathname !== "/postgres" ||
            !["postgres:", "postgresql:"].includes(url.protocol) || url.search !== "?sslmode=verify-full" || url.hash)
        {
            throw new Error();
        }
        return url.toString();
    }
    catch
    {
        // Do not expose URL parser/validation exceptions, credentials or input data.
        throw new Error("Production initialization target or acknowledgment is invalid");
    }
}

function requireCompatible(condition: boolean): void
{
    if (!condition) throw new Error("Existing initialization data conflicts; human review required; nothing overwritten");
}

export async function initializeProduction(database: { connection: Pick<Database["connection"], "transaction"> }, input: Initialization): Promise<void>
{
    const configuration = initializationSchema.parse(input);
    await database.connection.transaction(async (tx) =>
    {
        await tx.execute(sql`select pg_advisory_xact_lock(260026)`);
        await tx.insert(roles).values([{ code: "REQUESTER" }, { code: "REVIEWER" }, { code: "ADMINISTRATOR" }]).onConflictDoNothing();
        await tx.insert(departments).values({ id: departmentId, code: "OPS", name: "Operations" }).onConflictDoNothing();
        const department = (await tx.select().from(departments).where(eq(departments.id, departmentId)))[0];
        requireCompatible(department?.code === "OPS" && department.name === "Operations" && department.isActive);

        let reviewerId = "";
        for (const [account, role] of [[configuration.requester, "REQUESTER"], [configuration.reviewer, "REVIEWER"]] as const)
        {
            let existing = (await tx.select().from(users).where(eq(users.email, account.email)))[0];
            if (!existing)
            {
                existing = (await tx.insert(users).values({ id: randomUUID(), email: account.email, displayName: account.displayName, passwordHash: await new PasswordHasher().Hash(account.password) }).returning())[0]!;
                await tx.insert(userRoles).values({ userId: existing.id, roleCode: role });
                await tx.insert(departmentMemberships).values({ userId: existing.id, departmentId, isPrimary: true });
            }
            const assignedRoles = await tx.select().from(userRoles).where(eq(userRoles.userId, existing.id));
            const memberships = await tx.select().from(departmentMemberships).where(eq(departmentMemberships.userId, existing.id));
            requireCompatible(existing.isActive && assignedRoles.some((value) => value.roleCode === role) && memberships.some((value) => value.departmentId === departmentId && value.isActive && value.isPrimary));
            if (role === "REVIEWER") reviewerId = existing.id;
        }

        const createdType = await tx.insert(requestTypes).values({ id: seededTypeId, code: "GENERAL" }).onConflictDoNothing().returning();
        await tx.insert(requestTypeVersions).values({ id: seededVersionId, typeId: seededTypeId, versionNumber: 1, definition: seededDefinition }).onConflictDoNothing();
        if (createdType.length)
        {
            await tx.update(requestTypes).set({ publishedVersionId: seededVersionId }).where(eq(requestTypes.id, seededTypeId));
        }
        const type = (await tx.select().from(requestTypes).where(eq(requestTypes.id, seededTypeId)))[0];
        const version = (await tx.select().from(requestTypeVersions).where(eq(requestTypeVersions.id, seededVersionId)))[0];
        requireCompatible(type?.code === "GENERAL" && type.isEnabled && type.publishedVersionId === seededVersionId && version?.typeId === seededTypeId && version.versionNumber === 1 && isDeepStrictEqual(version.definition, seededDefinition));

        const stages = [{ stageNumber: 1 as const, reviewerAssignmentKeys: ["general-review"], slaBusinessMinutes: 480 }];
        await tx.insert(approvalPolicyVersions).values({ id: seededPolicyId, code: "GENERAL_REVIEW", versionNumber: 1, typeId: seededTypeId, priority: 10, stages }).onConflictDoNothing();
        const policy = (await tx.select().from(approvalPolicyVersions).where(eq(approvalPolicyVersions.id, seededPolicyId)))[0];
        requireCompatible(policy?.code === "GENERAL_REVIEW" && policy.versionNumber === 1 && policy.typeId === seededTypeId && policy.priority === 10 && policy.isActive && policy.departmentId === null && policy.minAmount === null && policy.maxAmount === null && isDeepStrictEqual(policy.stages, stages));
        await tx.insert(reviewerAssignmentRules).values({ id: assignmentId, assignmentKey: "general-review", departmentId, reviewerId }).onConflictDoNothing();
        const assignment = (await tx.select().from(reviewerAssignmentRules).where(eq(reviewerAssignmentRules.id, assignmentId)))[0];
        requireCompatible(assignment?.assignmentKey === "general-review" && assignment.departmentId === departmentId && assignment.reviewerId === reviewerId && assignment.isActive);
    });
}
