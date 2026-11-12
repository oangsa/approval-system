import { Database } from "../src/Infrastructures/Database/Database";
import { assertProductionInitializationTarget, initializeProduction, initializationSchema } from "../src/Infrastructures/Database/productionInitialization";

async function main(): Promise<void>
{
    const target = assertProductionInitializationTarget(process.env);
    const input = initializationSchema.parse({
        requester: { email: process.env.INIT_REQUESTER_EMAIL, displayName: process.env.INIT_REQUESTER_NAME, password: process.env.INIT_REQUESTER_PASSWORD },
        reviewer: { email: process.env.INIT_REVIEWER_EMAIL, displayName: process.env.INIT_REVIEWER_NAME, password: process.env.INIT_REVIEWER_PASSWORD },
    });
    const database = new Database(target);
    try
    {
        await initializeProduction(database, input);
        console.info("Minimum Sprint 1 initialization verified; existing accounts and data preserved.");
    }
    finally
    {
        await database.Close();
    }
}
main().catch(() =>
{
    console.error("Production initialization failed; no input values logged. Review target/configuration and conflicting data privately.");
    process.exitCode = 1;
});
