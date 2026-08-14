import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2", {
    variants: {
        variant: {
            default: "border-transparent bg-slate-100 text-slate-900 dark:bg-zinc-100 dark:text-zinc-900",
            secondary: "border-transparent bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300",
            destructive: "border-transparent bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
            outline: "text-slate-700 border-slate-200 dark:text-zinc-300 dark:border-zinc-700",
            success: "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
            warning: "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
            info: "border-transparent bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
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
