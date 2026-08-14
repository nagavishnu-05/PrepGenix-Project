import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
const alertVariants = cva("relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground", {
    variants: {
        variant: {
            default: "bg-slate-50 dark:bg-zinc-900/50 text-slate-900 dark:text-zinc-100 border-slate-200 dark:border-zinc-700",
            destructive: "border-red-200 dark:border-red-500/50 text-red-700 dark:text-red-400 [&>svg]:text-red-600 dark:[&>svg]:text-red-400 bg-red-50 dark:bg-red-500/5",
            success: "border-emerald-200 dark:border-emerald-500/50 text-emerald-700 dark:text-emerald-400 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/5",
            warning: "border-amber-200 dark:border-amber-500/50 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400 bg-amber-50 dark:bg-amber-500/5",
        },
    },
    defaultVariants: {
        variant: "default",
    },
});
const Alert = React.forwardRef(({ className, variant, ...props }, ref) => (<div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props}/>));
Alert.displayName = "Alert";
const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (<h5 ref={ref} className={cn("mb-1 font-medium leading-none tracking-tight text-slate-900 dark:text-zinc-100", className)} {...props}/>));
AlertTitle.displayName = "AlertTitle";
const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (<div ref={ref} className={cn("text-sm text-slate-600 dark:text-zinc-400 [&_p]:leading-relaxed", className)} {...props}/>));
AlertDescription.displayName = "AlertDescription";
export { Alert, AlertTitle, AlertDescription };
