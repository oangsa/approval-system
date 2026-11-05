import { node } from "@elysia/node";
import { readEnvironment } from "./Infrastructures/Configuration/environment";
import { Application } from "./Presentations/Application";

const environment = readEnvironment();
const application = new Application(node());
application.Start(environment.PORT, environment.HOST);

async function shutdown()
{
    await application.Stop();
    process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
