import { useEffect, useState } from "react";
import { Video } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
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
            <PageHeader title="My Interviews" description="Technical interviews scheduled by the Placement Coordinator" />
            {loading ? (
                <p className="text-sm text-slate-500 dark:text-zinc-500">Loading...</p>
            ) : interviews.length === 0 ? (
                <EmptyState icon={Video} title="No interviews scheduled" description="Scheduled technical interviews will appear here with their results." />
            ) : (
                <div className="space-y-3">
                    {interviews.map((i) => (
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
                                <div className="text-right">
                                    {i.rating != null ? (
                                        <div>
                                            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{i.rating}<span className="text-sm text-slate-500 dark:text-zinc-500">/5</span></p>
                                            {i.notes && <p className="mt-1 max-w-xs text-xs text-slate-600 dark:text-zinc-400">{i.notes}</p>}
                                            {i.strengths && <p className="mt-0.5 max-w-xs text-xs text-emerald-700 dark:text-emerald-400">Strengths: {i.strengths}</p>}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500 dark:text-zinc-500">Result pending</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
