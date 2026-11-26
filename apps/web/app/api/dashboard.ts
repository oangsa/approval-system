import { dashboardSchema } from "@workflow/contracts";
import { httpFor } from "./http";

export const dashboardApi = {
    read: (signal?: AbortSignal, generation?: number) => httpFor("/v1/dashboard", dashboardSchema, { signal, generation }),
};
