import { Database } from "../../src/Infrastructures/Database/Database";
import { assertTestDatabaseTarget } from "../../src/Infrastructures/Database/testDatabaseTargetGuard";

export function createTestDatabase(environment: NodeJS.ProcessEnv = process.env): Database
{
    return new Database(assertTestDatabaseTarget(environment));
}
