import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

export class Database
{
    private readonly client;
    public readonly connection;

    constructor(connectionString: string)
    {
        this.client = postgres(connectionString, { max: 5, connect_timeout: 5 });
        this.connection = drizzle(this.client, { schema });
    }

    public async Close(): Promise<void>
    {
        await this.client.end();
    }

    public async Check(): Promise<void>
    {
        await this.connection.execute(sql`select 1`);
    }
}
