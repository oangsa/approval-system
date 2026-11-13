import { Workflow } from "lucide-react";
import { cn } from "~/lib/utils";

interface IProductIdentityProps
{
    compact?: boolean;
    className?: string;
}

export function ProductIdentity({ compact = false, className }: IProductIdentityProps)
{
    return <span className={cn("inline-flex min-w-0 items-center gap-3", className)}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Workflow className="size-4.5" aria-hidden="true" /></span>
        <span className={compact ? "sr-only" : "min-w-0 text-left leading-tight"}><span className="block truncate text-sm font-semibold tracking-tight">Workflow</span><span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">Approval system</span></span>
    </span>;
}
