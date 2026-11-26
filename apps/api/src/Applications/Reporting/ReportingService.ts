import { reportScope } from "../../Domains/Reporting/ReportingRules";
import type { ReportSearch } from "@workflow/contracts";
import type { IActor } from "../../Domains/Identity/Identity";
import type { IReportingUnitOfWork } from "../../Domains/Reporting/Ports";

export class ReportingService
{
    constructor(private readonly unit: IReportingUnitOfWork, private readonly now: () => Date = () => new Date())
    {}
    public Dashboard(actor: IActor)
    {
        const now = this.now();
        return this.unit.Run(async (repository) =>
{
 const current = await repository.CurrentActor(actor, now); return repository.Dashboard(current, reportScope(current), now);
});
    }
    public Search(actor: IActor, query: ReportSearch)
    {
        const now = this.now();
        return this.unit.Run(async (repository) =>
{
 const current = await repository.CurrentActor(actor, now); return repository.Search(current, reportScope(current), query);
});
    }
}
