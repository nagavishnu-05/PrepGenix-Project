import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, FileText, Clock, TrendingUp, Target, Award, Activity, ChevronRight, } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";
import { mockTests, performanceChartData, activityTimeline, leaderboardData, } from "@/lib/mock-data";
import { cn, formatDate, formatDuration } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, } from "recharts";
const statsCards = [
    {
        label: "Tests Taken",
        value: "5",
        icon: FileText,
        trend: "+2 this month",
        trendUp: true,
        color: "from-violet-500 to-indigo-500",
    },
    {
        label: "Average Score",
        value: "83%",
        icon: Target,
        trend: "+5% vs last month",
        trendUp: true,
        color: "from-emerald-500 to-teal-500",
    },
    {
        label: "Certificates",
        value: "1",
        icon: Award,
        trend: "1 pending",
        trendUp: true,
        color: "from-amber-500 to-orange-500",
    },
    {
        label: "Current Rank",
        value: "#1",
        icon: Trophy,
        trend: "Top performer",
        trendUp: true,
        color: "from-pink-500 to-rose-500",
    },
];
const activityColors = {
    success: "bg-emerald-500",
    info: "bg-blue-500",
    warning: "bg-amber-500",
};
export function CandidateDashboard() {
    const { user } = useAuthStore();
    const upcomingTests = mockTests.filter((t) => t.status === "upcoming" || t.status === "active");
    return (<div className="space-y-8">
      {/* Welcome */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-zinc-100">
          Welcome back, {user?.name?.split(" ")[0] || "Alex"} 👋
        </h1>
        <p className="mt-1 text-zinc-400">
          &ldquo;The only way to do great work is to love what you do.&rdquo; — Keep pushing forward!
        </p>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, i) => (<motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1, duration: 0.4 }}>
            <Card className="group relative overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-zinc-400">{stat.label}</p>
                    <p className="text-3xl font-bold text-zinc-100">{stat.value}</p>
                    <p className={cn("text-xs font-medium", stat.trendUp ? "text-emerald-400" : "text-red-400")}>
                      {stat.trend}
                    </p>
                  </div>
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br", stat.color)}>
                    <stat.icon className="h-6 w-6 text-white"/>
                  </div>
                </div>
              </CardContent>
              <div className={cn("absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r opacity-0 transition-opacity group-hover:opacity-100", stat.color)}/>
            </Card>
          </motion.div>))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Upcoming Tests */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Upcoming Tests</CardTitle>
                <Link to="/dashboard/tests">
                  <Button variant="ghost" size="sm">
                    View All <ChevronRight className="h-4 w-4"/>
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {upcomingTests.map((test) => (<div key={test.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-800/30 p-4 transition-colors hover:bg-zinc-800/60">
                  <div className="space-y-1">
                    <h4 className="font-medium text-zinc-100">{test.title}</h4>
                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5"/>
                        {formatDuration(test.duration)}
                      </span>
                      <span>{test.questions.length} questions</span>
                      <span>{formatDate(test.startDate)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={test.status === "active" ? "success" : "info"}>
                      {test.status}
                    </Badge>
                    <Link to={`/assessment/${test.id}`}>
                      <Button variant="gradient" size="sm">
                        {test.status === "active" ? "Start" : "View"}
                      </Button>
                    </Link>
                  </div>
                </div>))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Activity */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.4 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activityTimeline.map((item) => (<div key={item.id} className="flex items-start gap-3">
                    <div className="mt-1 flex h-2 w-2 shrink-0 rounded-full">
                      <div className={cn("h-2 w-2 rounded-full", activityColors[item.type])}/>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-300">{item.action}</p>
                      <p className="text-xs text-zinc-500">{item.time}</p>
                    </div>
                  </div>))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Performance Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.4 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-violet-400"/>
                Performance Over Time
              </CardTitle>
              <Badge variant="secondary">Last 6 months</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={performanceChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a"/>
                  <XAxis dataKey="month" stroke="#71717a" fontSize={12} tickLine={false}/>
                  <YAxis stroke="#71717a" fontSize={12} tickLine={false} domain={[50, 100]}/>
                  <Tooltip contentStyle={{
            backgroundColor: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "8px",
            color: "#e4e4e7",
        }}/>
                  <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={3} dot={{ fill: "#8b5cf6", strokeWidth: 2, r: 5 }} activeDot={{ r: 7 }}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Leaderboard Preview */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.4 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-amber-400"/>
                Top Performers
              </CardTitle>
              <Link to="/dashboard/leaderboard">
                <Button variant="ghost" size="sm">
                  Full Leaderboard <ChevronRight className="h-4 w-4"/>
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {leaderboardData.slice(0, 5).map((entry) => (<div key={entry.rank} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 transition-colors hover:bg-zinc-800/60">
                  <div className="flex items-center gap-3">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold", entry.rank === 1 && "bg-amber-500/20 text-amber-400", entry.rank === 2 && "bg-zinc-400/20 text-zinc-300", entry.rank === 3 && "bg-orange-500/20 text-orange-400", entry.rank > 3 && "bg-zinc-800 text-zinc-400")}>
                      {entry.rank}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-100">
                        {entry.name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {entry.testCount} tests · {entry.avgTime} avg
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-zinc-300">
                    {entry.score} pts
                  </span>
                </div>))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>);
}
