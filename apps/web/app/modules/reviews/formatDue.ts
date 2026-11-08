import type { ApprovalTask } from "@workflow/contracts";

const BANGKOK = "Asia/Bangkok";

/** Single display rule for instants: EN-GB medium date + short time in Asia/Bangkok. */
export function formatInstant(value: string): string
{
    return `${new Date(value).toLocaleString("en-GB", { timeZone: BANGKOK, dateStyle: "medium", timeStyle: "short" })} (Bangkok)`;
}

/** Queue/task due label: shared instant format plus an overdue marker for actionable tasks. */
export function formatDueLabel(task: ApprovalTask): string
{
    if (!task.dueAt)
    {
        return "No due date";
    }
    const overdue = task.status === "ACTIONABLE" && new Date(task.dueAt).getTime() <= Date.now();
    return `${formatInstant(task.dueAt)}${overdue ? " · Overdue" : ""}`;
}
