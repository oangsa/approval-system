import { readFileSync } from "node:fs";
import { afterAll, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase } from "../helpers/testDatabase";

const database = createTestDatabase();
afterAll(() => database.Close());

test("activation migration preserves legacy stages and leaves activation nullable", async () =>
{
    const migration = readFileSync(new URL("../../src/Infrastructures/Database/migrations/0015_parallel_moon_knight.sql", import.meta.url), "utf8");
    await expect(database.connection.transaction(async (tx) =>
    {
        await tx.execute(sql`CREATE TEMP TABLE approval_stages (
            id uuid PRIMARY KEY NOT NULL,
            cycle_id uuid NOT NULL,
            stage_number integer NOT NULL CHECK (stage_number IN (1, 2)),
            status text NOT NULL,
            sla_business_minutes integer NOT NULL,
            UNIQUE (cycle_id, stage_number)
        ) ON COMMIT DROP`);
        await tx.execute(sql`SET LOCAL search_path = pg_temp`);
        const relation = await tx.execute<{ isolated: boolean }>(sql`
            SELECT 'approval_stages'::regclass::oid = to_regclass('pg_temp.approval_stages')::oid
                AND (SELECT relnamespace = pg_my_temp_schema() FROM pg_class WHERE oid = 'approval_stages'::regclass) AS isolated
        `);
        expect(relation[0]?.isolated).toBe(true);
        await tx.execute(sql`INSERT INTO approval_stages VALUES
            ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'ACTIVE', 480),
            ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 1, 'COMPLETED', 240),
            ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 2, 'WAITING', 120)`);
        const before = await tx.execute(sql`SELECT * FROM approval_stages ORDER BY id`);

        await tx.execute(sql.raw(migration));

        const column = await tx.execute<{ type: string; nullable: boolean }>(sql`
            SELECT format_type(atttypid, atttypmod) AS type, NOT attnotnull AS nullable
            FROM pg_attribute WHERE attrelid = 'pg_temp.approval_stages'::regclass AND attname = 'activated_at'
        `);
        expect(column[0]).toEqual({ type: "timestamp with time zone", nullable: true });
        const after = await tx.execute(sql`SELECT * FROM approval_stages ORDER BY id`);
        expect(after).toEqual(before.map((row) => ({ ...row, activated_at: null })));
        await tx.execute(sql`INSERT INTO approval_stages (id, cycle_id, stage_number, status, sla_business_minutes)
            VALUES ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 1, 'WAITING', 480)`);
        const inserted = await tx.execute(sql`SELECT activated_at FROM approval_stages WHERE id = '00000000-0000-0000-0000-000000000004'`);
        expect(inserted[0]).toEqual({ activated_at: null });
        throw new Error("rollback-activation-migration-fixture");
    })).rejects.toThrow("rollback-activation-migration-fixture");
});
