import { sql } from "drizzle-orm";
import { Database } from "../src/Infrastructures/Database/Database";
import { readEnvironment } from "../src/Infrastructures/Configuration/environment";

const database = new Database(readEnvironment().DATABASE_URL);
try
{
    await database.connection.execute(sql`select 1`);
    console.info("PostgreSQL connection verified.");
}
finally
{
    await database.Close();
}
