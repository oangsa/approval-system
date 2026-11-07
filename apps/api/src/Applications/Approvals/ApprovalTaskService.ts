import type { ApprovalTaskSearch } from "@workflow/contracts";
import type { IActor } from "../../Domains/Identity/Identity";
import { ApprovalTaskError } from "../../Domains/Approvals/ApprovalTaskRules";
import type { IApprovalTaskUnitOfWork } from "../../Domains/Approvals/Ports";
export class ApprovalTaskService
{
    constructor(private readonly unit: IApprovalTaskUnitOfWork)
    {}
    public Search(actor: IActor, query: ApprovalTaskSearch)
    {
        return this.unit.Run(async (repository) =>
        {
            const current = await repository.CurrentActor(actor);
            if (!current.roles.includes("REVIEWER")) throw new ApprovalTaskError("FORBIDDEN");
            return repository.Search(current.account.id, query);
        });
    }
    public Read(actor: IActor, id: string)
    {
        return this.unit.Run(async (repository) =>
        {
            const current = await repository.CurrentActor(actor);
            if (!current.roles.includes("REVIEWER")) throw new ApprovalTaskError("FORBIDDEN");
            const task = await repository.ReadCurrent(current.account.id, id);
            if (!task) throw new ApprovalTaskError("NOT_FOUND");
            return task;
        });
    }
}
