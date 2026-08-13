import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
export function StatsCard({ title, value, icon, trend, description, className }) {
    return (<Card className={cn("hover:border-zinc-700 transition-colors", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-zinc-400 mb-1">{title}</p>
            <p className="text-3xl font-bold text-zinc-100">{value}</p>
            {trend && (<div className={cn("flex items-center gap-1 mt-2 text-xs font-medium", trend.isPositive ? "text-emerald-400" : "text-red-400")}>
                {trend.isPositive ? <TrendingUp className="h-3 w-3"/> : <TrendingDown className="h-3 w-3"/>}
                {trend.value}% {trend.isPositive ? "increase" : "decrease"}
              </div>)}
            {description && <p className="text-xs text-zinc-500 mt-1">{description}</p>}
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/50 text-zinc-400">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>);
}
