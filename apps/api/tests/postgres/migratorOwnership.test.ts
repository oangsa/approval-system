import { readFileSync } from "node:fs";
import { afterAll, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase } from "../helpers/testDatabase";

const database = createTestDatabase();
afterAll(() => database.Close());

test("migrator owns only application objects and can change schema while runtime grants survive", async () =>
{
    await expect(database.connection.transaction(async (tx) =>
    {
        await tx.execute(sql`CREATE ROLE approval_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
        await tx.execute(sql`CREATE ROLE approval_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
        // The guarded fixture is workflow_test; adapt only the production admin/database names.
        for (const path of ["runtime-grants.sql", "migrator-ownership.sql"])
        {
            const statements = readFileSync(new URL(`../../../../deploy/${path}`, import.meta.url), "utf8")
                .replace(/^--.*$/gm, "")
                .replace(/^BEGIN;|^COMMIT;/gm, "")
                .replace("ON DATABASE postgres", "ON DATABASE workflow_test")
                .replace("GRANT approval_migrator TO postgres", "GRANT approval_migrator TO workflow_test");
            for (const statement of statements.split(";").filter((value) => value.trim())) await tx.execute(sql.raw(statement));
        }
        const tables = await tx.execute<{ total: number; owned: number }>(sql`
            SELECT count(*)::int AS total,
                count(*) FILTER (WHERE tableowner = 'approval_migrator')::int AS owned
            FROM pg_tables WHERE schemaname IN ('public', 'drizzle')
        `);
        expect(tables[0]).toEqual({ total: 24, owned: 24 });
        const objects = await tx.execute<{ functions: number; enumOwner: string; sequenceOwner: string; journalSequenceOwner: string; schemaOwner: string }>(sql`
            SELECT (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) = 'approval_migrator') AS functions,
                (SELECT pg_get_userbyid(typowner) FROM pg_type WHERE oid = 'public.role_code'::regtype) AS "enumOwner",
                (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'public.request_number_sequence'::regclass) AS "sequenceOwner",
                (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = pg_get_serial_sequence('drizzle.__drizzle_migrations', 'id')::regclass) AS "journalSequenceOwner",
                (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'public') AS "schemaOwner"
        `);
        expect(objects[0]).toMatchObject({ functions: 8, enumOwner: "approval_migrator", sequenceOwner: "approval_migrator", journalSequenceOwner: "approval_migrator" });
        expect(objects[0]!.schemaOwner).not.toBe("approval_migrator");
        await tx.execute(sql`SET LOCAL ROLE approval_migrator`);
        const privileges = await tx.execute<{ createRole: boolean; createDatabase: boolean; superuser: boolean; bypassRls: boolean }>(sql`
            SELECT rolcreaterole AS "createRole", rolcreatedb AS "createDatabase", rolsuper AS superuser,
                rolbypassrls AS "bypassRls" FROM pg_roles WHERE rolname = current_user
        `);
        expect(privileges[0]).toEqual({ createRole: false, createDatabase: false, superuser: false, bypassRls: false });
        await tx.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
        await tx.execute(sql`ALTER TABLE public.request_types ADD COLUMN migration_probe boolean`);
        await tx.execute(sql`CREATE TABLE public.migration_probe (id integer)`);
        await tx.execute(sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('ownership-fixture', 0)`);
        await tx.execute(sql`SELECT nextval('public.request_number_sequence')`);
        await tx.execute(sql`SET LOCAL ROLE approval_runtime`);
        await tx.execute(sql`SELECT id FROM public.users LIMIT 1`);
        const runtime = await tx.execute<{ schemaCreate: boolean; passwordUpdate: boolean; journalAccess: boolean }>(sql`
            SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS "schemaCreate",
                has_column_privilege(current_user, 'public.users', 'password_hash', 'UPDATE') AS "passwordUpdate",
                has_schema_privilege(current_user, 'drizzle', 'USAGE') AS "journalAccess"
        `);
        expect(runtime[0]).toEqual({ schemaCreate: false, passwordUpdate: false, journalAccess: false });
        throw new Error("rollback-migrator-fixture");
    })).rejects.toThrow("rollback-migrator-fixture");
});
