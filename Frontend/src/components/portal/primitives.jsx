import { cn } from "@/lib/utils";

export function PageHeader({ title, description, action }) {
    return (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
                {description && <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">{description}</p>}
            </div>
            {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
    );
}

export function EmptyState({ icon: Icon, title, description, action }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/20 px-6 py-16 text-center">
            {Icon && <Icon className="mb-3 h-10 w-10 text-slate-400 dark:text-zinc-600" />}
            <h3 className="text-base font-semibold text-slate-800 dark:text-zinc-300">{title}</h3>
            {description && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-zinc-500">{description}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

export function DifficultyBadge({ difficulty, className }) {
    const map = {
        easy: "text-emerald-700 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-500/30 dark:bg-emerald-500/10",
        medium: "text-amber-700 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-500/30 dark:bg-amber-500/10",
        hard: "text-red-700 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:bg-red-500/10",
    };
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                map[difficulty] || "border-slate-200 text-slate-600 dark:border-zinc-700 dark:text-zinc-300",
                className
            )}
        >
            {difficulty}
        </span>
    );
}

export function SimpleProgress({ value, className }) {
    return (
        <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800", className)}>
            <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500" style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
        </div>
    );
}
