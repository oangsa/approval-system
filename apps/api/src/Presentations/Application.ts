import type { ElysiaAdapter } from "elysia";
import { createApplication } from "./createApplication";

export class Application
{
    public readonly app;

    constructor(adapter: ElysiaAdapter)
    {
        this.app = createApplication(adapter);
    }

    public Start(port: number, hostname: string): void
    {
        this.app.listen({ port, hostname });
        console.info(`API listening on http://${hostname}:${port}`);
    }

    public async Stop(): Promise<void>
    {
        await this.app.stop();
    }
}
