import type { DashboardDTO, IPageResult, ReportAggregateRow, ReportSearch } from "@workflow/contracts";
import type { IReportingScope } from "./ReportingRules";
import type { IActor } from "../Identity/Identity";

export interface IReportingRepository
{
    CurrentActor(actor: IActor, now: Date): Promise<IActor>;
    Dashboard(actor: IActor, scope: IReportingScope, now: Date): Promise<DashboardDTO>;
    Search(actor: IActor, scope: IReportingScope, query: ReportSearch): Promise<IPageResult<ReportAggregateRow>>;
}
export interface IReportingUnitOfWork { Run<T>(operation: (repository: IReportingRepository) => Promise<T>): Promise<T>; }
