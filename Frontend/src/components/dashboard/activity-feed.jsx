import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, AlertTriangle, Info, Clock } from "lucide-react";
import { motion } from "framer-motion";
const iconMap = {
    success: <CheckCircle className="h-4 w-4 text-emerald-400"/>,
    warning: <AlertTriangle className="h-4 w-4 text-amber-400"/>,
    info: <Info className="h-4 w-4 text-blue-400"/>,
    error: <AlertTriangle className="h-4 w-4 text-red-400"/>,
};
export function ActivityFeed({ activities, className }) {
    return (<ScrollArea className={cn("h-[400px]", className)}>
      <div className="space-y-1">
        {activities.map((activity, index) => (<motion.div key={activity.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className="flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-800/50 transition-colors">
            <div className="mt-0.5">{iconMap[activity.type]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200">{activity.action}</p>
              <div className="flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3 text-zinc-500"/>
                <span className="text-xs text-zinc-500">{activity.time}</span>
              </div>
            </div>
          </motion.div>))}
      </div>
    </ScrollArea>);
}
