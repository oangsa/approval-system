import type { DecisionService } from "../Applications/Approvals/DecisionService";
import type { RequestService } from "../Applications/Requests/RequestService";
import type { ApprovalTaskService } from "../Applications/Approvals/ApprovalTaskService";
import type { ElysiaAdapter } from "elysia";
import type { IIdentityHttpDependencies } from "./composition";
import { createApplication } from "./createApplication";

export class Application
{
    public readonly app;
    private closed = false;
    constructor(adapter: ElysiaAdapter, identity?: IIdentityHttpDependencies, private readonly close?: () => Promise<void>, requests?: RequestService, approvalTasks?: ApprovalTaskService, decisions?: DecisionService, checkHealth?: () => Promise<void>)
    {
        this.app = createApplication(adapter, identity, requests, approvalTasks, decisions, checkHealth);
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
