import { useEffect, useState } from "react";
import { Video, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState, LoadingState } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { api } from "@/lib/api";

export default function StudentInterviews() {
    const [interviews, setInterviews] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.interviews.list().then(setInterviews).catch(() => {}).finally(() => setLoading(false));
    }, []);

    return (
        <div>
            <PageHeader title="My Interviews" description="Resume-based interviews scheduled by the Placement Coordinator" />
            {loading ? (
                <LoadingState label="Loading interviews" className="min-h-48" />
            ) : interviews.length === 0 ? (
                <EmptyState icon={Video} title="No interviews scheduled" description="Scheduled interviews will appear here with their results." />
            ) : (
                <div className="space-y-3">
                    {interviews.map((i) => {
                        const ready = Boolean(i.plan?.questions?.length);
                        const completed = i.status === "completed";
                        return (
                            <Card key={i.id} className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{i.type}</h3>
                                            <StatusBadge value={i.status} />
                                        </div>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">{new Date(i.scheduledAt).toLocaleString()}</p>
                                        {i.interviewer && <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-500">Interviewer: {i.interviewer}</p>}
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            {i.rating != null ? (
                                                <div>
                                                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{i.rating}<span className="text-sm text-slate-500 dark:text-zinc-500">/5</span></p>
                                                    {i.notes && <p className="mt-1 max-w-xs text-xs text-slate-600 dark:text-zinc-400">{i.notes}</p>}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-slate-500 dark:text-zinc-500">Result pending</p>
                                            )}
                                        </div>
                                        {!completed && (
                                            ready ? (
                                                <Button asChild>
                                                    <Link to={`/student/interview/${i.id}`}>
                                                        {i.session?.status === "in_progress" ? <>Resume <ArrowRight className="h-4 w-4" /></> : <>Join interview <ArrowRight className="h-4 w-4" /></>}
                                                    </Link>
                                                </Button>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-zinc-600">
                                                    <Clock className="h-3.5 w-3.5" /> Awaiting questions
                                                </span>
                                            )
                                        )}
                                        {completed && (
                                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                                                <CheckCircle2 className="h-4 w-4" /> Submitted
                                            </span>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
