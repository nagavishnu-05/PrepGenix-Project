import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Video, Award, User, BrainCircuit, FileCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/portal/stats-card";
import { PageHeader, SimpleProgress } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function StudentDashboard() {
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();
    const [tests, setTests] = useState([]);
    const [interviews, setInterviews] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Result popup state
    const [selectedAttempt, setSelectedAttempt] = useState(null);
    const [attemptLoading, setAttemptLoading] = useState(false);

    useEffect(() => {
        Promise.all([api.tests.list(), api.interviews.list()])
            .then(([t, i]) => {
                setTests(t);
                setInterviews(i);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const profile = user?.profile;
    const completed = tests.filter((t) => t.attempt?.status === "completed").length;
    const pending = tests.filter((t) => !t.attempt || t.attempt.status === "in_progress").length;
    const upcoming = interviews
        .filter((i) => i.status === "scheduled")
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

    const act = async (t) => {
        if (t.attempt?.status === "in_progress") {
            navigate(`/student/take/${t.attempt.id}`);
        } else if (!t.attempt) {
            navigate(`/student/take/${t.id}?new=1`);
        } else {
            setAttemptLoading(true);
            try {
                const res = await api.tests.result(t.attempt.id);
                setSelectedAttempt(res);
            } catch (e) {
                alert("Failed to load attempt result: " + e.message);
            } finally {
                setAttemptLoading(false);
            }
        }
    };

    return (
        <div>
            <PageHeader
                title={`Welcome, ${user?.name || "Student"}`}
                description={`Register No: ${user?.username || "—"}${profile?.batch ? ` • Batch ${profile.batch}` : ""}`}
            />

            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatsCard title="Assigned Tests" value={tests.length} sub={`${pending} pending`} icon={ClipboardList} accent="violet" />
                <StatsCard title="Completed" value={completed} sub="tests finished" icon={Award} accent="emerald" />
                <StatsCard title="Interviews" value={interviews.length} sub={`${upcoming.filter((i) => i.status === "scheduled").length} upcoming`} icon={Video} accent="blue" />
                <StatsCard title="CGPA" value={profile?.cgpa || "—"} sub="latest academic record" icon={User} accent="amber" />
            </div>

            {profile && (
                <Card className="mb-8 border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium text-slate-500 dark:text-zinc-400">Academic Snapshot</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                        <div><p className="text-xs text-slate-500 dark:text-zinc-500">10th</p><p className="text-lg font-semibold text-slate-900 dark:text-white">{profile.tenth || "—"}%</p></div>
                        <div><p className="text-xs text-slate-500 dark:text-zinc-500">12th</p><p className="text-lg font-semibold text-slate-900 dark:text-white">{profile.twelfth || "—"}%</p></div>
                        <div><p className="text-xs text-slate-500 dark:text-zinc-500">Department</p><p className="text-lg font-semibold text-slate-900 dark:text-white">{profile.department || "—"}</p></div>
                        <div><p className="text-xs text-slate-500 dark:text-zinc-500">Batch</p><p className="text-lg font-semibold text-slate-900 dark:text-white">{profile.batch || "—"}</p></div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium text-slate-500 dark:text-zinc-400">Assigned Tests</CardTitle>
                        <Link to="/student/tests" className="text-xs text-violet-500 dark:text-violet-400 hover:underline">View all</Link>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {loading ? (
                            <p className="py-6 text-center text-sm text-slate-500 dark:text-zinc-500">Loading...</p>
                        ) : tests.length === 0 ? (
                            <p className="py-6 text-center text-sm text-slate-500 dark:text-zinc-500">No tests assigned yet.</p>
                        ) : (
                            tests.slice(0, 4).map((t) => (
                                <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-800 dark:text-zinc-200">{t.title}</p>
                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-500">
                                            {t.type === "coding" ? "Coding" : "Aptitude"} • {t.mode === "adaptive" ? "Adaptive" : "Fixed"} • {t._count?.questions ?? 0} questions
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {t.attempt && <StatusBadge value={t.attempt.status} />}
                                        <Button size="sm" onClick={() => act(t)}>
                                            {!t.attempt ? "Start" : t.attempt.status === "in_progress" ? "Resume" : "Result"}
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium text-slate-500 dark:text-zinc-400">Upcoming Interviews</CardTitle>
                        <Link to="/student/interviews" className="text-xs text-violet-500 dark:text-violet-400 hover:underline">View all</Link>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {loading ? (
                            <p className="py-6 text-center text-sm text-slate-500 dark:text-zinc-500">Loading...</p>
                        ) : upcoming.length === 0 ? (
                            <p className="py-6 text-center text-sm text-slate-500 dark:text-zinc-500">No interviews scheduled.</p>
                        ) : (
                            upcoming.slice(0, 4).map((i) => (
                                <div key={i.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3">
                                    <div>
                                        <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">{i.type}</p>
                                        <p className="text-xs text-slate-500 dark:text-zinc-500">{new Date(i.scheduledAt).toLocaleString()}</p>
                                    </div>
                                    <StatusBadge value={i.status} />
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={selectedAttempt !== null} onOpenChange={(open) => { if (!open) setSelectedAttempt(null); }}>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedAttempt?.testTitle || "Test Results"}</DialogTitle>
                        <DialogDescription>Detailed attempt analytics and question breakdown.</DialogDescription>
                    </DialogHeader>
                    {selectedAttempt && (
                        <div className="space-y-6 pt-2">
                            {/* Summary stats */}
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3 text-center">
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                        {selectedAttempt.score}/{selectedAttempt.totalScore}
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-zinc-550 uppercase font-bold tracking-wider mt-1">Score</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3 text-center">
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                        {Math.round((selectedAttempt.score / (selectedAttempt.totalScore || 1)) * 100)}%
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-zinc-550 uppercase font-bold tracking-wider mt-1">Percentage</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3 text-center">
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white capitalize">
                                        {selectedAttempt.result || "Completed"}
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-zinc-550 uppercase font-bold tracking-wider mt-1">Outcome</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3 text-center">
                                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-500">
                                        {selectedAttempt.violations ?? 0}
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-zinc-550 uppercase font-bold tracking-wider mt-1">Violations</p>
                                </div>
                            </div>

                            {/* Details list */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">Question Breakdown</h4>
                                <div className="divide-y divide-slate-100 dark:divide-zinc-900 rounded-lg border border-slate-250 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/10 overflow-hidden">
                                    {(selectedAttempt.answers || []).map((ans, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3.5 text-xs sm:text-sm">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-slate-800 dark:text-zinc-200 truncate">
                                                    Question {idx + 1}
                                                </p>
                                                <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5">
                                                    Time taken: {ans.timeTakenMs ? `${(ans.timeTakenMs / 1000).toFixed(1)}s` : "—"} • Difficulty: {ans.difficulty || "medium"}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                                                    {ans.points ?? 1} pts
                                                </span>
                                                <span className={cn(
                                                    "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                                                    ans.correct 
                                                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                                                        : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
                                                )}>
                                                    {ans.correct ? "Correct" : "Incorrect"}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
