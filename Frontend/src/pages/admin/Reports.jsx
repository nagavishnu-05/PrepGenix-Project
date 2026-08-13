import { useState } from "react";
import { BarChart3, TrendingUp, AlertTriangle, Download, FileText, FileJson, TableIcon, ArrowUpRight, Users, CheckCircle, } from "lucide-react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { adminStats, performanceChartData, violationTimeline, leaderboardData, } from "@/lib/mock-data";
const passFailData = [
    { name: "Pass", value: adminStats.passRate },
    { name: "Fail", value: 100 - adminStats.passRate },
];
const pieColors = ["#22c55e", "#ef4444"];
const monthlyPerformance = [
    { month: "Jul", avgScore: 65, topScore: 92, submissions: 42 },
    { month: "Aug", avgScore: 72, topScore: 95, submissions: 56 },
    { month: "Sep", avgScore: 78, topScore: 98, submissions: 68 },
    { month: "Oct", avgScore: 75, topScore: 94, submissions: 52 },
    { month: "Nov", avgScore: 83, topScore: 99, submissions: 78 },
    { month: "Dec", avgScore: 85, topScore: 100, submissions: 82 },
];
const violationTypes = [
    { type: "Tab Switch", count: 34, color: "#f59e0b" },
    { type: "Face Events", count: 28, color: "#ef4444" },
    { type: "Audio Events", count: 12, color: "#3b82f6" },
    { type: "Copy/Paste", count: 15, color: "#8b5cf6" },
];
const violationTypeData = violationTypes.map((v) => ({
    name: v.type,
    value: v.count,
}));
const violationTypeColors = ["#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];
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
export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState("overview");
    return (<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Reports & Analytics</h1>
          <p className="text-zinc-400">Comprehensive platform performance insights.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5"/>
            Overview
          </TabsTrigger>
          <TabsTrigger value="performance">
            <TrendingUp className="mr-1.5 h-3.5 w-3.5"/>
            Performance
          </TabsTrigger>
          <TabsTrigger value="violations">
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5"/>
            Violations
          </TabsTrigger>
          <TabsTrigger value="export">
            <Download className="mr-1.5 h-3.5 w-3.5"/>
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">Total Candidates</p>
                    <p className="text-2xl font-bold text-zinc-100">{adminStats.totalCandidates}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
                    <Users className="h-5 w-5 text-violet-400"/>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
                  <ArrowUpRight className="h-3 w-3"/>
                  +12.5% from last month
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">Avg Score</p>
                    <p className="text-2xl font-bold text-zinc-100">{adminStats.avgScore}%</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                    <TrendingUp className="h-5 w-5 text-amber-400"/>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
                  <ArrowUpRight className="h-3 w-3"/>
                  +2.1% improvement
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">Pass Rate</p>
                    <p className="text-2xl font-bold text-zinc-100">{adminStats.passRate}%</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                    <CheckCircle className="h-5 w-5 text-emerald-400"/>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
                  <ArrowUpRight className="h-3 w-3"/>
                  +1.8% improvement
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">Violations</p>
                    <p className="text-2xl font-bold text-zinc-100">{adminStats.totalViolations}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                    <AlertTriangle className="h-5 w-5 text-red-400"/>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
                  <ArrowUpRight className="h-3 w-3 rotate-90"/>
                  -5.3% from last month
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Score Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={monthlyPerformance} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a"/>
                    <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={{ stroke: "#27272a" }} tickLine={false}/>
                    <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false}/>
                    <Tooltip content={<CustomTooltip />}/>
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", color: "#a1a1aa" }}/>
                    <Area type="monotone" dataKey="avgScore" stroke="#8b5cf6" strokeWidth={2} fill="#8b5cf6" fillOpacity={0.1} name="Avg Score"/>
                    <Area type="monotone" dataKey="topScore" stroke="#22c55e" strokeWidth={2} fill="#22c55e" fillOpacity={0.05} name="Top Score"/>
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pass Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={passFailData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" strokeWidth={0}>
                      {passFailData.map((_, index) => (<Cell key={`cell-${index}`} fill={pieColors[index]}/>))}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length)
                return null;
            return (<div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-xl">
                            <p className="text-sm font-semibold text-zinc-100">
                              {payload[0].name}: {payload[0].value}%
                            </p>
                          </div>);
        }}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-emerald-500"/>
                    <span className="text-xs text-zinc-400">Pass ({adminStats.passRate}%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500"/>
                    <span className="text-xs text-zinc-400">
                      Fail ({(100 - adminStats.passRate).toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Score Trends Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={performanceChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a"/>
                  <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={{ stroke: "#27272a" }} tickLine={false}/>
                  <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false}/>
                  <Tooltip content={<CustomTooltip />}/>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", color: "#a1a1aa" }}/>
                  <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: "#8b5cf6", strokeWidth: 0, r: 4 }} activeDot={{ r: 6 }} name="Score"/>
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Submissions Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={performanceChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a"/>
                    <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={{ stroke: "#27272a" }} tickLine={false}/>
                    <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false}/>
                    <Tooltip content={<CustomTooltip />}/>
                    <Bar dataKey="submissions" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} name="Submissions"/>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Performers</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Tests</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboardData.slice(0, 5).map((entry) => (<TableRow key={entry.rank}>
                        <TableCell>
                          <Badge variant={entry.rank <= 3 ? "success" : "secondary"} className="text-[10px]">
                            #{entry.rank}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-zinc-200">
                          {entry.name}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium text-zinc-300">
                            {entry.score}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-zinc-400">{entry.testCount}</span>
                        </TableCell>
                      </TableRow>))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="violations" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Violation Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={violationTimeline} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a"/>
                  <XAxis dataKey="time" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={{ stroke: "#27272a" }} tickLine={false}/>
                  <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false}/>
                  <Tooltip content={<CustomTooltip />}/>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", color: "#a1a1aa" }}/>
                  <Area type="monotone" dataKey="tabSwitch" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} name="Tab Switches"/>
                  <Area type="monotone" dataKey="faceDetected" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} name="Face Events"/>
                  <Area type="monotone" dataKey="audioEvents" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} name="Audio Events"/>
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Violation Types Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={violationTypeData} cx="50%" cy="50%" outerRadius={80} dataKey="value" strokeWidth={0}>
                      {violationTypeData.map((_, index) => (<Cell key={`cell-${index}`} fill={violationTypeColors[index]}/>))}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length)
                return null;
            return (<div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-xl">
                            <p className="text-sm font-semibold text-zinc-100">
                              {payload[0].name}: {payload[0].value}
                            </p>
                          </div>);
        }}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
                  {violationTypes.map((v, i) => (<div key={v.type} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: violationTypeColors[i] }}/>
                      <span className="text-xs text-zinc-400">
                        {v.type} ({v.count})
                      </span>
                    </div>))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Violators</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Violations</TableHead>
                      <TableHead>Risk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboardData
            .slice()
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((entry, i) => (<TableRow key={entry.rank}>
                          <TableCell className="font-medium text-zinc-200">
                            {entry.name}
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${i === 0
                ? "text-red-400"
                : i < 3
                    ? "text-amber-400"
                    : "text-zinc-400"}`}>
                              {5 - i}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={i === 0
                ? "destructive"
                : i < 3
                    ? "warning"
                    : "secondary"} className="text-[10px]">
                              {i === 0 ? "High" : i < 3 ? "Medium" : "Low"}
                            </Badge>
                          </TableCell>
                        </TableRow>))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="export" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="group cursor-pointer transition-all hover:border-zinc-700">
              <CardContent className="p-6">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
                    <FileText className="h-8 w-8 text-red-400"/>
                  </div>
                  <div>
                    <h3 className="font-medium text-zinc-100">PDF Report</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Comprehensive analytics report with charts and insights
                    </p>
                  </div>
                  <Button variant="outline" className="w-full">
                    <Download className="h-4 w-4"/>
                    Download PDF
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer transition-all hover:border-zinc-700">
              <CardContent className="p-6">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
                    <TableIcon className="h-8 w-8 text-emerald-400"/>
                  </div>
                  <div>
                    <h3 className="font-medium text-zinc-100">CSV Export</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Raw data export for candidates, tests, and submissions
                    </p>
                  </div>
                  <Button variant="outline" className="w-full">
                    <Download className="h-4 w-4"/>
                    Download CSV
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer transition-all hover:border-zinc-700">
              <CardContent className="p-6">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10">
                    <FileJson className="h-8 w-8 text-blue-400"/>
                  </div>
                  <div>
                    <h3 className="font-medium text-zinc-100">JSON Data</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Structured JSON data for programmatic analysis
                    </p>
                  </div>
                  <Button variant="outline" className="w-full">
                    <Download className="h-4 w-4"/>
                    Download JSON
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>);
}
