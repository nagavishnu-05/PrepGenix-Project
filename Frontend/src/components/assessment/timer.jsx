import { useEffect } from "react";
import { Clock } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { useTestStore } from "@/store/test-store";
export function Timer({ totalSeconds, onTimeUp }) {
    const { timeRemaining, tick } = useTestStore();
    useEffect(() => {
        if (timeRemaining <= 0)
            return;
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [timeRemaining, tick]);
    useEffect(() => {
        if (timeRemaining === 0 && totalSeconds > 0) {
            onTimeUp();
        }
    }, [timeRemaining, totalSeconds, onTimeUp]);
    const percentage = totalSeconds > 0 ? (timeRemaining / totalSeconds) * 100 : 0;
    const isUrgent = percentage < 25;
    const isWarning = percentage >= 25 && percentage < 50;
    return (<div className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-sm tabular-nums transition-colors", isUrgent && "bg-red-500/10 text-red-400 animate-pulse", isWarning && "bg-amber-500/10 text-amber-400", !isUrgent && !isWarning && "bg-emerald-500/10 text-emerald-400")}>
      <Clock className="h-4 w-4"/>
      <span>{formatTime(timeRemaining)}</span>
    </div>);
}
