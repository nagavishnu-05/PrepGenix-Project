import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, BrainCircuit, FileCode, Video } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, EmptyState, SimpleProgress } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";
import { api } from "@/lib/api";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

function AttemptBlocks({ title, icon: Icon, list }) {
    return (
        <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-400"><Icon className="h-4 w-4" /> {title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {!list?.length ? (
                    <p className="text-sm text-slate-500 dark:text-zinc-500">No {title.toLowerCase()} yet.</p>
                ) : (
                    (list || []).slice().reverse().map((a, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">{a.testTitle}</p>
                                <StatusBadge value={a.result} />
                            </div>
                            <div className="mt-2 flex items-center gap-3">
                                <SimpleProgress value={a.percentage ?? 0} className="flex-1" />
                                <span className="text-xs text-slate-500 dark:text-zinc-400">{a.score}/{a.total}</span>
                            </div>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}

export default function StudentReport() {
    const user = useAuthStore((s) => s.user);
    const { theme } = useUIStore();
    const [searchParams] = useSearchParams();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const regNo = searchParams.get("regNo") || user?.username;

    useEffect(() => {
        if (!regNo) return;
        api.reports.perStudent(regNo).then(setReport).catch(() => {}).finally(() => setLoading(false));
    }, [regNo]);

    if (loading) return <p className="text-sm text-slate-500 dark:text-zinc-500">Loading...</p>;
    if (!report) return <EmptyState icon={BarChart3} title="Report not available" />;

    const perf = report.performance || {};
    const aptitude = perf.aptitude || [];
    const coding = perf.coding || [];
    const interviews = perf.interview || [];
    const avgPct = (arr) => (arr.length ? Math.round(arr.reduce((s, x) => s + (x.percentage ?? 0), 0) / arr.length) : 0);

    const chartData = [
        ...aptitude.map((a, idx) => ({ ...a, category: "Aptitude", date: a.completedAt ? new Date(a.completedAt).getTime() : idx })),
        ...coding.map((a, idx) => ({ ...a, category: "Coding", date: a.completedAt ? new Date(a.completedAt).getTime() : idx }))
    ].sort((a, b) => a.date - b.date).map((a, idx) => ({
        index: idx + 1,
        title: a.testTitle,
        percentage: a.percentage ?? 0,
        category: a.category
    }));

    return (
        <div>
            <PageHeader title="My Report" description={`${report.name} • ${report.regNo}${report.batch ? ` • ${report.batch}` : ""}`} />

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-400"><BrainCircuit className="h-4 w-4" /> Aptitude Average</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-slate-900 dark:text-white">{avgPct(aptitude)}%</p>
                        <SimpleProgress value={avgPct(aptitude)} className="mt-2" />
                    </CardContent>
                </Card>
                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-400"><FileCode className="h-4 w-4" /> Coding Average</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-slate-900 dark:text-white">{avgPct(coding)}%</p>
                        <SimpleProgress value={avgPct(coding)} className="mt-2" />
                    </CardContent>
                </Card>
                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-400"><Video className="h-4 w-4" /> Interviews</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-slate-900 dark:text-white">{interviews.length}</p>
                        <p className="text-xs text-slate-500 dark:text-zinc-500">completed rounds</p>
                    </CardContent>
                </Card>
            </div>

            {chartData.length > 0 && (
                <Card className="mb-6 border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Overall Performance Trend</CardTitle>
                    </CardHeader>
                    <CardContent className="h-64 pr-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorPercent" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-zinc-800/40" />
                                <XAxis dataKey="index" tick={{ fill: 'currentColor', opacity: 0.6 }} className="text-xs text-slate-500 dark:text-zinc-500" />
                                <YAxis domain={[0, 100]} tick={{ fill: 'currentColor', opacity: 0.6 }} className="text-xs text-slate-500 dark:text-zinc-500" />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: theme === "dark" ? "#18181b" : "#ffffff", 
                                        borderColor: theme === "dark" ? "#27272a" : "#e2e8f0",
                                        borderRadius: "8px",
                                        color: theme === "dark" ? "#f4f4f5" : "#0f172a"
                                    }} 
                                />
                                <Area type="monotone" dataKey="percentage" name="Score %" stroke="#8b5cf6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPercent)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <AttemptBlocks title="Aptitude Attempts" icon={BrainCircuit} list={aptitude} />
                <AttemptBlocks title="Coding Attempts" icon={FileCode} list={coding} />
            </div>

            {interviews.length > 0 && (
                <Card className="mt-6 border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardHeader><CardTitle className="text-sm text-slate-500 dark:text-zinc-400">Interview Performance</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {interviews.slice().reverse().map((iv, i) => (
                            <div key={i} className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">{iv.type} <span className="text-xs text-slate-500 dark:text-zinc-500">• {new Date(iv.date).toLocaleDateString()}</span></p>
                                        {iv.strengths && <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">Strengths: {iv.strengths}</p>}
                                        {iv.weaknesses && <p className="mt-0.5 text-xs text-orange-700 dark:text-orange-400">Weaknesses: {iv.weaknesses}</p>}
                                        {iv.notes && <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">{iv.notes}</p>}
                                    </div>
                                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{iv.rating != null ? iv.rating : "—"}<span className="text-sm text-slate-500 dark:text-zinc-500">/5</span></p>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
