import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2", {
    variants: {
        variant: {
            default: "border-transparent bg-zinc-100 text-zinc-900",
            secondary: "border-transparent bg-zinc-800 text-zinc-300",
            destructive: "border-transparent bg-red-500/10 text-red-400",
            outline: "text-zinc-300 border-zinc-700",
            success: "border-transparent bg-emerald-500/10 text-emerald-400",
            warning: "border-transparent bg-amber-500/10 text-amber-400",
            info: "border-transparent bg-blue-500/10 text-blue-400",
        },
    },
    defaultVariants: {
        variant: "default",
    },
});
function Badge({ className, variant, ...props }) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props}/>;
}
export { Badge, badgeVariants };
