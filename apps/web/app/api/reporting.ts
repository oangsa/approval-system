import { z } from "zod";
import { reportAggregateRowSchema, type ReportSearch } from "@workflow/contracts";
import { httpPageFor } from "./http";

export const reportingApi = {
    search: (body: ReportSearch, signal?: AbortSignal, generation?: number) => httpPageFor("/v1/reports/requests/search", z.array(reportAggregateRowSchema), { method: "POST", body, signal, generation }),
};
