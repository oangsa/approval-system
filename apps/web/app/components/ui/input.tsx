import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

export interface IInputProps extends ComponentProps<"input">
{
    className?: string;
}

export function Input({ className, ...props }: IInputProps)
{
    return <input className={cn("w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...props} />;
}
