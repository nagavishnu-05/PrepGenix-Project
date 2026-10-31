import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, FileCode, BrainCircuit, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState, LoadingState } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TestAttemptReport } from "@/components/assessment/test-attempt-report";
import { api } from "@/lib/api";

export default function StudentTests() {
    const navigate = useNavigate();
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState(Date.now());

    // Popup result state
    const [selectedAttempt, setSelectedAttempt] = useState(null);
    const [attemptLoading, setAttemptLoading] = useState(false);

    useEffect(() => {
        api.tests.list().then(setTests).catch(() => {}).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 10_000);
        return () => window.clearInterval(timer);
    }, []);

    const act = async (t) => {
        const status = t.attempt?.status;
        if (status === "in_progress" || status === "flagged" || status === "disqualified") {
            // In-progress resumes; flagged/disqualified open the locked /
            // terminated screen, which explains that staff must reset it.
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
                <LoadingState label="Loading tests" className="min-h-48" />
            ) : tests.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No tests assigned yet" description="Once a test is assigned to your batch it will appear here." />
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {tests.map((t) => {
                        const availability = t.startsAt && now < new Date(t.startsAt).getTime()
                            ? "upcoming"
                            : t.endsAt && now >= new Date(t.endsAt).getTime()
                                ? "ended"
                                : "available";
                        return (
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
                                {(t.topics || []).length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {t.topics.map((topic) => <span key={topic} className="rounded bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-700 dark:text-violet-300">{topic}</span>)}
                                    </div>
                                )}
                                {t.startsAt && t.endsAt && (
                                    <p className="mt-2 text-xs text-slate-500 dark:text-zinc-500">
                                        {availability === "upcoming"
                                            ? `Available from ${new Date(t.startsAt).toLocaleString()}`
                                            : availability === "ended"
                                                ? `Availability ended ${new Date(t.endsAt).toLocaleString()}`
                                                : `Available until ${new Date(t.endsAt).toLocaleString()}`}
                                    </p>
                                )}
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                                    <span className="rounded-md bg-slate-100 dark:bg-zinc-800/70 px-2 py-1">{t.type === "coding" ? "Coding" : "Aptitude"}</span>
                                    <span className="rounded-md bg-slate-100 dark:bg-zinc-800/70 px-2 py-1">{t.mode === "adaptive" ? "Adaptive" : "Fixed"}</span>
                                    <span className="rounded-md bg-slate-100 dark:bg-zinc-800/70 px-2 py-1">{t._count?.questions ?? 0} questions</span>
                                    <span className="flex items-center gap-1 rounded-md bg-slate-100 dark:bg-zinc-800/70 px-2 py-1"><Clock className="h-3 w-3" />{t.durationMin} min</span>
                                </div>
                                <div className="mt-5">
                                    <Button
                                        className="w-full"
                                    variant={(t.attempt?.status === "in_progress" && availability !== "ended") || !t.attempt ? "default" : "outline"}
                                        disabled={attemptLoading || (!t.attempt && availability !== "available")}
                                        onClick={() => act(t)}
                                    >
                                        {!t.attempt
                                            ? availability === "upcoming"
                                                ? "Not available yet"
                                                : availability === "ended"
                                                    ? "Test window ended"
                                                    : "Start Test"
                                            : t.attempt.status === "in_progress"
                                                ? availability === "ended" ? "View Result" : "Resume Test"
                                                : t.attempt.status === "flagged"
                                                    ? "Locked — Awaiting Staff Reset"
                                                    : t.attempt.status === "disqualified"
                                                        ? "Terminated — View Details"
                                                        : "View Result"}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                        );
                    })}
                </div>
            )}

            <Dialog open={selectedAttempt !== null} onOpenChange={(open) => { if (!open) setSelectedAttempt(null); }}>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedAttempt?.testTitle || "Test Results"}</DialogTitle>
                        <DialogDescription>Full test report with score, timing, topics, and response breakdown.</DialogDescription>
                    </DialogHeader>
                    {selectedAttempt && (
                        <TestAttemptReport attempt={selectedAttempt} />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
