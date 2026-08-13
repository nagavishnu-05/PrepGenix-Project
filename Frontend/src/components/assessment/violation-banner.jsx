import { useTestStore } from "@/store/test-store";
import { cn } from "@/lib/utils";
import { AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
export function ViolationBanner() {
    const { violations } = useTestStore();
    const [dismissed, setDismissed] = useState(new Set());
    const [currentViolation, setCurrentViolation] = useState(null);
    useEffect(() => {
        if (violations.length === 0)
            return;
        const latest = violations[violations.length - 1];
        if (!dismissed.has(latest.id)) {
            setCurrentViolation(latest);
            const timer = setTimeout(() => {
                setDismissed((prev) => new Set(prev).add(latest.id));
                setCurrentViolation(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [violations, dismissed]);
    return (<AnimatePresence>
      {currentViolation && (<motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -100, opacity: 0 }} className={cn("fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-xl shadow-xl", currentViolation.severity === "critical" && "bg-red-500/10 border-red-500/30 text-red-400", currentViolation.severity === "high" && "bg-orange-500/10 border-orange-500/30 text-orange-400", currentViolation.severity === "medium" && "bg-amber-500/10 border-amber-500/30 text-amber-400", currentViolation.severity === "low" && "bg-yellow-500/10 border-yellow-500/30 text-yellow-400")}>
          <AlertTriangle className="h-5 w-5 shrink-0"/>
          <div className="flex-1">
            <p className="text-sm font-medium">{currentViolation.description}</p>
            <p className="text-xs opacity-70 capitalize">Severity: {currentViolation.severity}</p>
          </div>
          <button onClick={() => {
                setDismissed((prev) => new Set(prev).add(currentViolation.id));
                setCurrentViolation(null);
            }} className="p-1 hover:bg-white/10 rounded">
            <X className="h-4 w-4"/>
          </button>
        </motion.div>)}
    </AnimatePresence>);
}
