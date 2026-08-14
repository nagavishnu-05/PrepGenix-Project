import * as React from "react";
import { cn } from "@/lib/utils";
const Input = React.forwardRef(({ className, type, ...props }, ref) => {
    return (<input type={type} className={cn("flex h-10 w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white/50 dark:bg-zinc-800/50 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 transition-colors", className)} ref={ref} {...props}/>);
});
Input.displayName = "Input";
export { Input };
