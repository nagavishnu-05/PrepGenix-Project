import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    CalendarDays,
    CheckCircle2,
    Clock3,
    ListChecks,
    UserRound,
    Video,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, EmptyState, LoadingState } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { api } from "@/lib/api";

function interviewCanStart(interview) {
    return ["scheduled", "in_progress"].includes(interview.status) &&
        interview.session?.status !== "terminated";
}

export default function StudentInterviews() {
    const [interviews, setInterviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedInterview, setSelectedInterview] = useState(null);

    const loadInterviews = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setInterviews(await api.interviews.list());
        } catch (loadError) {
            setError(loadError.message || "Failed to load interviews.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadInterviews();
    }, [loadInterviews]);

    const joinAction = (interview) => {
        if (!interview.plan?.questions?.length || !interviewCanStart(interview)) return null;
        const isResuming = interview.session?.status === "in_progress";
        return (
            <Button asChild variant={isResuming ? "default" : "outline"} onClick={(event) => event.stopPropagation()}>
                <Link to={`/student/interview/${interview.id}`}>
                    {isResuming ? "Resume interview" : "Start interview"}
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </Button>
        );
    };

    return (
        <div>
            <PageHeader title="My Interviews" description="Review your scheduled interviews, preparation, and results." />
            {loading ? (
                <LoadingState label="Loading interviews" className="min-h-48" />
            ) : error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    <p>{error}</p>
                    <Button className="mt-3" variant="outline" onClick={loadInterviews}>Try again</Button>
                </div>
            ) : interviews.length === 0 ? (
                <EmptyState icon={Video} title="No interviews scheduled" description="Scheduled interviews will appear here with their preparation details and results." />
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {interviews.map((interview) => {
                        const ready = Boolean(interview.plan?.questions?.length);
                        const completed = interview.status === "completed";
                        const resumable = interview.session?.status === "in_progress";
                        return (
                            <Card
                                key={interview.id}
                                role="button"
                                tabIndex={0}
                                aria-haspopup="dialog"
                                onClick={() => setSelectedInterview(interview)}
                                onKeyDown={(event) => {
                                    if (event.target !== event.currentTarget) return;
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        setSelectedInterview(interview);
                                    }
                                }}
                                className="cursor-pointer border-slate-200/80 bg-white/70 transition-colors hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-zinc-800/80 dark:bg-zinc-900/40 dark:hover:border-violet-500/50"
                            >
                                <CardContent className="p-5">
                                    <div className="mb-4 flex items-start justify-between gap-3">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-500/10">
                                            <Video className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                                        </div>
                                        <StatusBadge value={interview.status} />
                                    </div>
                                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                                        {interview.type} interview
                                    </h2>
                                    <div className="mt-3 space-y-2 text-sm text-slate-500 dark:text-zinc-400">
                                        <p className="flex items-center gap-2">
                                            <CalendarDays className="h-4 w-4 shrink-0" />
                                            {new Date(interview.scheduledAt).toLocaleString()}
                                        </p>
                                        {interview.interviewer && (
                                            <p className="flex items-center gap-2">
                                                <UserRound className="h-4 w-4 shrink-0" />
                                                {interview.interviewer}
                                            </p>
                                        )}
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-zinc-300">
                                        <span className="rounded-md bg-slate-100 px-2 py-1 dark:bg-zinc-800">
                                            {ready ? `${interview.plan.questions.length} questions` : "Preparing questions"}
                                        </span>
                                        {interview.plan?.topics?.slice(0, 3).map((topic) => (
                                            <span key={topic} className="rounded-md bg-violet-50 px-2 py-1 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                                                {topic}
                                            </span>
                                        ))}
                                        {resumable && (
                                            <span className="rounded-md bg-slate-100 px-2 py-1 dark:bg-zinc-800">
                                                {interview.session.answeredCount || 0}/{interview.plan?.questions?.length || 0} answered
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-zinc-800">
                                        <span className="text-xs font-medium text-violet-700 dark:text-violet-300">View details</span>
                                        {completed ? (
                                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                                                <CheckCircle2 className="h-4 w-4" /> Result ready
                                            </span>
                                        ) : resumable ? (
                                            <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                                                <Clock3 className="h-4 w-4" /> In progress
                                            </span>
                                        ) : (
                                            <ListChecks className="h-4 w-4 text-slate-400" />
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Dialog open={selectedInterview !== null} onOpenChange={(open) => { if (!open) setSelectedInterview(null); }}>
                <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedInterview?.type} interview</DialogTitle>
                        <DialogDescription>
                            Interview details, preparation status, and outcome.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedInterview && (
                        <div className="space-y-5 pt-2">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                                    <p className="text-xs text-slate-500 dark:text-zinc-500">Scheduled</p>
                                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                                        {new Date(selectedInterview.scheduledAt).toLocaleString()}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                                    <p className="text-xs text-slate-500 dark:text-zinc-500">Interviewer</p>
                                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                                        {selectedInterview.interviewer || "Not specified"}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                                    <p className="text-xs text-slate-500 dark:text-zinc-500">Interview status</p>
                                    <div className="mt-2"><StatusBadge value={selectedInterview.status} /></div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                                    <p className="text-xs text-slate-500 dark:text-zinc-500">Questions</p>
                                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                                        {selectedInterview.plan?.questions?.length || 0} prepared
                                        {selectedInterview.session?.answeredCount ? ` · ${selectedInterview.session.answeredCount} answered` : ""}
                                    </p>
                                </div>
                            </div>

                            {!!selectedInterview.plan?.topics?.length && (
                                <section>
                                    <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-zinc-200">Topics from your resume</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedInterview.plan.topics.map((topic) => (
                                            <span key={topic} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                                                {topic}
                                            </span>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {selectedInterview.status === "completed" ? (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                                        Interview submitted
                                        {selectedInterview.rating != null && ` · Rating ${selectedInterview.rating}/5`}
                                    </p>
                                    {selectedInterview.notes && (
                                        <p className="mt-2 text-sm text-emerald-900/80 dark:text-emerald-200/80">{selectedInterview.notes}</p>
                                    )}
                                </div>
                            ) : selectedInterview.status === "disqualified" ? (
                                <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                                    This interview is locked. Contact the Placement Coordinator if you think it needs to be reset.
                                </p>
                            ) : selectedInterview.status === "cancelled" ? (
                                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
                                    This interview was cancelled by the Placement Coordinator.
                                </p>
                            ) : !selectedInterview.plan?.questions?.length ? (
                                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                    Your interview questions are being prepared. Check back soon.
                                </p>
                            ) : null}

                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setSelectedInterview(null)}>Close</Button>
                                {joinAction(selectedInterview)}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
