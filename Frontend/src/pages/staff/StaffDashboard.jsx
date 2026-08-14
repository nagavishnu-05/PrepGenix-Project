import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, ClipboardList, FileCode, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/portal/stats-card";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { api } from "@/lib/api";

export default function StaffDashboard() {
    const [stats, setStats] = useState(null);
    const [tests, setTests] = useState([]);
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([api.reports.overview(), api.tests.list(), api.questions.list({})])
            .then(([s, t, q]) => {
                setStats(s);
                setTests(t);
                setQuestions(q);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <p className="text-sm text-slate-500 dark:text-zinc-500">Loading...</p>;

    return (
        <div>
            <PageHeader
                title="Staff Dashboard"
                description="Manage questions, assign tests, and monitor student performance"
                action={
                    <Link to="/staff/tests" className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
                        + Create Test
                    </Link>
                }
            />

            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatsCard title="Students" value={stats?.students ?? 0} sub="total students" icon={Users} accent="violet" />
                <StatsCard title="Tests" value={stats?.tests ?? 0} sub="created tests" icon={ClipboardList} accent="blue" />
                <StatsCard title="Questions" value={questions.length} sub="question bank" icon={FileCode} accent="emerald" />
                <StatsCard title="Completed Attempts" value={stats?.completedAttempts ?? 0} sub="tests finished by students" icon={Activity} accent="amber" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium text-slate-500 dark:text-zinc-400">Recent Tests</CardTitle>
                        <Link to="/staff/tests" className="text-xs text-violet-600 dark:text-violet-400 hover:underline">View all</Link>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {tests.length === 0 ? (
                            <EmptyState icon={ClipboardList} title="No tests yet" description="Create your first test to get started." />
                        ) : (
                            tests.slice(0, 5).map((t) => (
                                <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-800 dark:text-zinc-200">{t.title}</p>
                                        <p className="text-xs text-slate-500 dark:text-zinc-500">
                                            {t.type === "coding" ? "Coding" : "Aptitude"} • {t.mode === "adaptive" ? "Adaptive" : "Fixed"} • {t.durationMin} min
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500 dark:text-zinc-500">{t._count?.attempts ?? 0} attempts</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium text-slate-500 dark:text-zinc-400">Question Bank</CardTitle>
                        <Link to="/staff/questions" className="text-xs text-violet-600 dark:text-violet-400 hover:underline">View all</Link>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {questions.length === 0 ? (
                            <EmptyState icon={FileCode} title="No questions yet" description="Add questions manually or import from Excel / AIML." />
                        ) : (
                            questions.slice(0, 5).map((q) => (
                                <div key={q.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-800 dark:text-zinc-200">{q.title}</p>
                                        <p className="text-xs text-slate-500 dark:text-zinc-500">{q.type === "coding" ? "Coding" : "Aptitude"} • {q.format} • {q.difficulty}</p>
                                    </div>
                                    <span className="text-xs text-slate-500 dark:text-zinc-400">{q.points} pts</span>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
