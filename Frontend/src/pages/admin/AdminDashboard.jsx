import { useState } from "react";
import { Users, FileCode, CheckCircle, TrendingUp, AlertTriangle, BarChart3, ArrowUpRight, ArrowDownRight, Plus, UserCheck, Activity, } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminStats, activityTimeline } from "@/lib/mock-data";
const statsCards = [
    {
        label: "Total Candidates",
        value: adminStats.totalCandidates,
        icon: Users,
        trend: "+12.5%",
        trendUp: true,
        color: "text-violet-400",
        bgColor: "bg-violet-500/10",
    },
    {
        label: "Active Tests",
        value: adminStats.activeTests,
        icon: FileCode,
        trend: "+3",
        trendUp: true,
        color: "text-blue-400",
        bgColor: "bg-blue-500/10",
    },
    {
        label: "Completed Tests",
        value: adminStats.completedTests,
        icon: CheckCircle,
        trend: "+8.2%",
        trendUp: true,
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10",
    },
    {
        label: "Avg Score",
        value: `${adminStats.avgScore}%`,
        icon: TrendingUp,
        trend: "+2.1%",
        trendUp: true,
        color: "text-amber-400",
        bgColor: "bg-amber-500/10",
    },
    {
        label: "Total Violations",
        value: adminStats.totalViolations,
        icon: AlertTriangle,
        trend: "-5.3%",
        trendUp: false,
        color: "text-red-400",
        bgColor: "bg-red-500/10",
    },
    {
        label: "Pass Rate",
        value: `${adminStats.passRate}%`,
        icon: BarChart3,
        trend: "+1.8%",
        trendUp: true,
        color: "text-indigo-400",
        bgColor: "bg-indigo-500/10",
    },
];
const monthlyData = [
    { month: "Jul", candidates: 18, tests: 8, score: 65 },
    { month: "Aug", candidates: 25, tests: 11, score: 72 },
    { month: "Sep", candidates: 31, tests: 14, score: 78 },
    { month: "Oct", candidates: 28, tests: 12, score: 75 },
    { month: "Nov", candidates: 42, tests: 18, score: 83 },
    { month: "Dec", candidates: 38, tests: 15, score: 85 },
];
const quickActions = [
    { label: "Create Test", icon: Plus, href: "/admin/create-test", color: "from-violet-600 to-indigo-600" },
    { label: "View Reports", icon: BarChart3, href: "/admin/reports", color: "from-emerald-600 to-teal-600" },
    { label: "Manage Candidates", icon: UserCheck, href: "/admin/candidates", color: "from-amber-600 to-orange-600" },
];
const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length)
        return null;
    return (<div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-xl">
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      {payload.map((entry, index) => (<p key={index} className="text-sm font-semibold text-zinc-100">
          {entry.name}: {entry.value}
        </p>))}
    </div>);
};
export default function AdminOverviewPage() {
    const [activityFilter] = useState("all");
    const filteredActivity = activityFilter === "all"
        ? activityTimeline
        : activityTimeline.filter((a) => a.type === activityFilter);
    return (<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Admin Dashboard</h1>
          <p className="text-zinc-400">Platform overview and management controls.</p>
        </div>
        <Badge variant="secondary" className="text-xs">
          <Activity className="mr-1 h-3 w-3"/>
          Live
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statsCards.map((stat) => {
            const Icon = stat.icon;
            return (<Card key={stat.label} className="group relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bgColor}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`}/>
                  </div>
                  <span className={`flex items-center gap-0.5 text-xs font-medium ${stat.trendUp ? "text-emerald-400" : "text-red-400"}`}>
                    {stat.trendUp ? (<ArrowUpRight className="h-3 w-3"/>) : (<ArrowDownRight className="h-3 w-3"/>)}
                    {stat.trend}
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-zinc-100">{stat.value}</p>
                  <p className="text-xs text-zinc-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>);
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Candidate Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a"/>
                <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={{ stroke: "#27272a" }} tickLine={false}/>
                <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false}/>
                <Tooltip content={<CustomTooltip />}/>
                <Area type="monotone" dataKey="candidates" stroke="#8b5cf6" strokeWidth={2} fill="#8b5cf6" fillOpacity={0.1} name="Candidates"/>
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickActions.map((action) => {
            const Icon = action.icon;
            return (<a key={action.label} href={action.href} className={`flex items-center gap-3 rounded-xl bg-gradient-to-r ${action.color} p-3 text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl`}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
                    <Icon className="h-4 w-4"/>
                  </div>
                  <span className="text-sm font-medium">{action.label}</span>
                </a>);
        })}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a"/>
                <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={{ stroke: "#27272a" }} tickLine={false}/>
                <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false}/>
                <Tooltip content={<CustomTooltip />}/>
                <Bar dataKey="score" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} name="Avg Score"/>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <Badge variant="secondary" className="text-xs">Live</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
              {filteredActivity.map((activity) => (<div key={activity.id} className="flex items-center gap-3 rounded-lg border border-zinc-800/50 bg-zinc-800/30 px-3 py-2.5">
                  <div className={`h-2 w-2 shrink-0 rounded-full ${activity.type === "success"
                ? "bg-emerald-400"
                : activity.type === "warning"
                    ? "bg-amber-400"
                    : "bg-blue-400"}`}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 truncate">{activity.action}</p>
                    <p className="text-xs text-zinc-500">{activity.time}</p>
                  </div>
                  <Badge variant={activity.type === "success"
                ? "success"
                : activity.type === "warning"
                    ? "warning"
                    : "info"} className="text-[10px]">
                    {activity.type}
                  </Badge>
                </div>))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>);
}
