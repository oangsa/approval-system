import { AlertTriangle, ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { RequestSummary } from "@workflow/contracts";
import { requestPriorityLabel } from "~/modules/requests/requestPresentation";

const priorityIcons = {
    LOW: ArrowDown,
    MEDIUM: Minus,
    HIGH: ArrowUp,
    URGENT: AlertTriangle,
} as const;

const priorityTones: Record<RequestSummary["priority"], string> = {
    LOW: "border-border bg-muted/40 text-muted-foreground",
    MEDIUM: "border-border bg-background text-foreground",
    HIGH: "border-foreground/30 bg-secondary text-secondary-foreground",
    URGENT: "border-foreground bg-foreground text-background",
};

export interface IPriorityBadgeProps
{
    priority: RequestSummary["priority"];
}

export function PriorityBadge({ priority }: IPriorityBadgeProps)
{
    const Icon = priorityIcons[priority];
    return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${priorityTones[priority]}`}>
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        <span>{requestPriorityLabel(priority)}</span>
    </span>;
}
