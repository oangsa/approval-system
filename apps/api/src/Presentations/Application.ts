import type { ElysiaAdapter } from "elysia";
import type { IIdentityHttpDependencies } from "./composition";
import { createApplication } from "./createApplication";

export class Application
{
    public readonly app;
    private closed = false;
    constructor(adapter: ElysiaAdapter, identity?: IIdentityHttpDependencies, private readonly close?: () => Promise<void>)
    {
        this.app = createApplication(adapter, identity);
    }
    public Start(port: number, hostname: string): void
    {
        this.app.listen({ port, hostname });
        console.info(`API listening on http://${hostname}:${port}`);
    }
    public async Stop(): Promise<void>
    {
        if (this.closed) return;
        this.closed = true;
        try 
{
 await this.app.stop(); 
}
        finally 
{
 await this.close?.(); 
}
    }
}
