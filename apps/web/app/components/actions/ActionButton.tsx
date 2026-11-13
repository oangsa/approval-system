import { cva, type VariantProps } from "class-variance-authority";
import { Button, type IButtonProps } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export const actionStyles = cva(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
    {
        variants: {
            variant: {
                primary: "bg-primary text-primary-foreground hover:bg-primary/90",
                outline: "border bg-background text-foreground hover:bg-accent",
                ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
            },
            size: {
                default: "min-h-11 px-4 py-2",
                small: "min-h-9 px-3 py-1.5 text-xs",
                icon: "size-11 p-2.5",
            },
        },
        defaultVariants: { variant: "outline", size: "default" },
    },
);

interface IActionButtonProps extends IButtonProps, VariantProps<typeof actionStyles> {}

export function ActionButton({ variant, size, className, ...props }: IActionButtonProps)
{
    return <Button className={cn(actionStyles({ variant, size }), className)} {...props} />;
}
