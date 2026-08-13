import { motion } from "framer-motion";
import { Trophy, Medal, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/auth-store";
import { leaderboardData } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
const topThree = leaderboardData.slice(0, 3);
const rest = leaderboardData.slice(3);
function getRankStyles(rank) {
    switch (rank) {
        case 1:
            return {
                bg: "bg-gradient-to-b from-amber-500/20 to-amber-500/5 border-amber-500/30",
                avatar: "bg-gradient-to-br from-amber-400 to-orange-500",
                icon: Crown,
                iconColor: "text-amber-400",
                height: "pb-10 pt-6",
            };
        case 2:
            return {
                bg: "bg-gradient-to-b from-zinc-300/20 to-zinc-300/5 border-zinc-300/30",
                avatar: "bg-gradient-to-br from-zinc-300 to-zinc-400",
                icon: Medal,
                iconColor: "text-zinc-300",
                height: "pb-6 pt-6",
            };
        case 3:
            return {
                bg: "bg-gradient-to-b from-orange-500/20 to-orange-500/5 border-orange-500/30",
                avatar: "bg-gradient-to-br from-orange-400 to-orange-600",
                icon: Medal,
                iconColor: "text-orange-400",
                height: "pb-4 pt-6",
            };
        default:
            return {
                bg: "",
                avatar: "",
                icon: Trophy,
                iconColor: "",
                height: "",
            };
    }
}
export default function LeaderboardPage() {
    const { user } = useAuthStore();
    // Order: 2nd, 1st, 3rd for podium display
    const podiumOrder = [topThree[1], topThree[0], topThree[2]];
    return (<div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500">
          <Trophy className="h-5 w-5 text-white"/>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Leaderboard</h1>
          <p className="text-zinc-400">Top performers across all assessments.</p>
        </div>
      </motion.div>

      {/* Podium */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }} className="grid grid-cols-3 gap-4 items-end px-4 md:px-12">
        {podiumOrder.map((entry, i) => {
            if (!entry)
                return null;
            const rank = entry.rank;
            const styles = getRankStyles(rank);
            const isCurrentUser = entry.name === user?.name;
            return (<motion.div key={entry.rank} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.15, duration: 0.5 }}>
              <Card className={cn("border text-center transition-all", styles.bg, rank === 1 && "scale-105", isCurrentUser && "ring-2 ring-violet-500")}>
                <CardContent className={cn("flex flex-col items-center space-y-3", styles.height)}>
                  <div className="relative">
                    <Avatar className={cn("h-16 w-16", rank === 1 && "h-20 w-20")}>
                      <AvatarFallback className={cn("text-lg font-bold text-white", styles.avatar)}>
                        {entry.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                      <styles.icon className={cn("h-6 w-6", styles.iconColor)}/>
                    </div>
                  </div>

                  <div className="pt-2">
                    <p className="font-semibold text-zinc-100">{entry.name}</p>
                    <p className="text-2xl font-bold text-zinc-100">
                      {entry.score}
                      <span className="text-sm font-normal text-zinc-500"> pts</span>
                    </p>
                  </div>

                  {isCurrentUser && (<Badge variant="info" className="text-xs">
                      You
                    </Badge>)}
                </CardContent>
              </Card>
            </motion.div>);
        })}
      </motion.div>

      {/* Full Leaderboard Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.4 }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Full Rankings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {leaderboardData.map((entry, i) => {
            const isCurrentUser = entry.name === user?.name;
            return (<motion.div key={entry.rank} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.05 }} className={cn("flex items-center justify-between rounded-xl border p-4 transition-all", isCurrentUser
                    ? "border-violet-500/30 bg-violet-500/5"
                    : "border-zinc-800 bg-zinc-800/20 hover:bg-zinc-800/40")}>
                    <div className="flex items-center gap-4">
                      <span className={cn("flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold", entry.rank === 1 && "bg-amber-500/20 text-amber-400", entry.rank === 2 && "bg-zinc-300/20 text-zinc-300", entry.rank === 3 && "bg-orange-500/20 text-orange-400", entry.rank > 3 && "bg-zinc-800 text-zinc-400")}>
                        {entry.rank}
                      </span>
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className={cn("text-sm font-bold text-white", entry.rank <= 3
                    ? "bg-gradient-to-br from-violet-500 to-indigo-500"
                    : "bg-zinc-700")}>
                          {entry.avatar}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-zinc-100">
                          {entry.name}
                          {isCurrentUser && (<Badge variant="info" className="ml-2 text-xs">
                              You
                            </Badge>)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {entry.testCount} tests completed
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-8 text-sm">
                      <div className="text-right hidden sm:block">
                        <p className="text-zinc-500">Avg Time</p>
                        <p className="font-medium text-zinc-300">{entry.avgTime}</p>
                      </div>
                      <div className="text-right min-w-[80px]">
                        <p className="text-zinc-500">Score</p>
                        <p className="text-lg font-bold text-zinc-100">{entry.score}</p>
                      </div>
                    </div>
                  </motion.div>);
        })}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>);
}
