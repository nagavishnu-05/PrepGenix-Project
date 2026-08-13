import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
const toggleVariants = cva("inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-zinc-700 data-[state=on]:text-zinc-100", {
    variants: {
        variant: {
            default: "bg-transparent",
            outline: "border border-zinc-700 bg-transparent",
        },
        size: {
            default: "h-10 px-3",
            sm: "h-9 px-2.5",
            lg: "h-11 px-5",
        },
    },
    defaultVariants: {
        variant: "default",
        size: "default",
    },
});
const Toggle = React.forwardRef(({ className, variant, size, ...props }, ref) => (<TogglePrimitive.Root ref={ref} className={cn(toggleVariants({ variant, size, className }))} {...props}/>));
Toggle.displayName = TogglePrimitive.Root.displayName;
export { Toggle, toggleVariants };
