import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, FileCode, BrainCircuit, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function StudentTests() {
    const navigate = useNavigate();
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);

    // Popup result state
    const [selectedAttempt, setSelectedAttempt] = useState(null);
    const [attemptLoading, setAttemptLoading] = useState(false);

    useEffect(() => {
        api.tests.list().then(setTests).catch(() => {}).finally(() => setLoading(false));
    }, []);

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
            <PageHeader title="My Tests" description="Tests assigned to you by the Staff Coordinator" />
            {loading ? (
                <p className="text-sm text-slate-500 dark:text-zinc-500">Loading...</p>
            ) : tests.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No tests assigned yet" description="Once a test is assigned to your batch it will appear here." />
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {tests.map((t) => (
                        <Card key={t.id} className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40 transition-colors hover:border-slate-300 dark:hover:border-zinc-700">
                            <CardContent className="p-5">
                                <div className="mb-3 flex items-start justify-between gap-2">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-zinc-800">
                                        {t.type === "coding" ? <FileCode className="h-5 w-5 text-violet-600 dark:text-violet-400" /> : <BrainCircuit className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
                                    </div>
                                    {t.attempt && <StatusBadge value={t.attempt.status} />}
                                </div>
                                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t.title}</h3>
                                <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-zinc-400">{t.description}</p>
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                                    <span className="rounded-md bg-slate-100 dark:bg-zinc-800/70 px-2 py-1">{t.type === "coding" ? "Coding" : "Aptitude"}</span>
                                    <span className="rounded-md bg-slate-100 dark:bg-zinc-800/70 px-2 py-1">{t.mode === "adaptive" ? "Adaptive" : "Fixed"}</span>
                                    <span className="rounded-md bg-slate-100 dark:bg-zinc-800/70 px-2 py-1">{t._count?.questions ?? 0} questions</span>
                                    <span className="flex items-center gap-1 rounded-md bg-slate-100 dark:bg-zinc-800/70 px-2 py-1"><Clock className="h-3 w-3" />{t.durationMin} min</span>
                                </div>
                                <div className="mt-5">
                                    <Button className="w-full" variant={t.attempt?.status === "completed" ? "outline" : "default"} onClick={() => act(t)}>
                                        {!t.attempt ? "Start Test" : t.attempt.status === "in_progress" ? "Resume Test" : "View Result"}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

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
