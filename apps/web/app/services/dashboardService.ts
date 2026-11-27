import { dashboardApi } from "~/api/dashboard";
export function readDashboard(signal?: AbortSignal, generation?: number)
{
    return dashboardApi.read(signal, generation);
}
