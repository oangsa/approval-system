import { reportSearchSchema, type ReportSearch } from "@workflow/contracts";
import { reportingApi } from "~/api/reporting";
export function searchReports(query: ReportSearch, signal?: AbortSignal, generation?: number)
{
    return reportingApi.search(reportSearchSchema.parse(query), signal, generation);
}
