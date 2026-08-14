import * as React from "react";
import { cn } from "@/lib/utils";
const Textarea = React.forwardRef(({ className, ...props }, ref) => {
    return (<textarea className={cn("flex min-h-[80px] w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white/50 dark:bg-zinc-800/50 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 transition-colors resize-none", className)} ref={ref} {...props}/>);
});
Textarea.displayName = "Textarea";
export { Textarea };
