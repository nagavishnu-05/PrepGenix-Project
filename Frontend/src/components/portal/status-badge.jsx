import { cn } from "@/lib/utils";

const VARIANTS = {
    excellent: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
    good: "border-teal-500/30 bg-teal-500/15 text-teal-400",
    average: "border-amber-500/30 bg-amber-500/15 text-amber-400",
    weak: "border-orange-500/30 bg-orange-500/15 text-orange-400",
    very_weak: "border-red-500/30 bg-red-500/15 text-red-400",
    passed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
    failed: "border-red-500/30 bg-red-500/15 text-red-400",
    completed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
    in_progress: "border-amber-500/30 bg-amber-500/15 text-amber-400",
    scheduled: "border-blue-500/30 bg-blue-500/15 text-blue-400",
    cancelled: "border-zinc-600 bg-zinc-800/60 text-zinc-400",
    pending: "border-blue-500/30 bg-blue-500/15 text-blue-400",
};

export function StatusBadge({ value, fallback = "—", className }) {
    const text = value == null || value === "" ? fallback : String(value).replace(/_/g, " ");
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
                VARIANTS[value] || "border-zinc-700 bg-zinc-800/60 text-zinc-300",
                className
            )}
        >
            {text}
        </span>
    );
}
