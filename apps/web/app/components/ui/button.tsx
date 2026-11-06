import type { ComponentProps } from "react";
import { cva } from "class-variance-authority";
import { cn } from "~/lib/utils";

const buttonVariants = cva("rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 motion-reduce:transition-none");

export interface IButtonProps extends ComponentProps<"button">
{
    className?: string;
}

export function Button({ className, ...props }: IButtonProps)
{
    return <button className={cn(buttonVariants(), className)} {...props} />;
}
