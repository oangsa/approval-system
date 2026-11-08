import { RequestService } from "./Applications/Requests/RequestService";
import { ApprovalTaskService } from "./Applications/Approvals/ApprovalTaskService";
import { ApprovalTaskUnitOfWork } from "./Infrastructures/Database/Repositories/ApprovalTaskRepository";
import { RequestUnitOfWork } from "./Infrastructures/Database/Repositories/RequestRepository";
import { node } from "@elysia/node";
import { readEnvironment } from "./Infrastructures/Configuration/environment";
import { Database } from "./Infrastructures/Database/Database";
import { Application } from "./Presentations/Application";
import { createIdentityComposition } from "./Presentations/composition";

async function main(): Promise<void>
{
    const environment = readEnvironment();
    const database = new Database(environment.DATABASE_URL);
    try
    {
        const identity = await createIdentityComposition(environment, database);
        const application = new Application(node(), identity, () => database.Close(), new RequestService(new RequestUnitOfWork(database.connection)), new ApprovalTaskService(new ApprovalTaskUnitOfWork(database.connection)));
        application.Start(environment.PORT, environment.HOST);
        let shuttingDown = false;
        const shutdown = async () =>
        {
            if (shuttingDown) return;
            shuttingDown = true;
            try
{
 await application.Stop();
}
            catch
{
 console.error({ code: "SHUTDOWN_FAILED" }); process.exitCode = 1;
}
        };
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
    }
    catch (error)
    {
        await database.Close();
        throw error;
    }
}
main().catch(() =>
{
    console.error({ code: "STARTUP_FAILED" });
    process.exitCode = 1;
});
