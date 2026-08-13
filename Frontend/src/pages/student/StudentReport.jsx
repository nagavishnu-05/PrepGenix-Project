import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, BrainCircuit, FileCode, Video } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, EmptyState, SimpleProgress } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/lib/api";

function AttemptBlocks({ title, icon: Icon, list }) {
    return (
        <Card className="border-zinc-800/80 bg-zinc-900/40">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-zinc-400"><Icon className="h-4 w-4" /> {title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {!list?.length ? (
                    <p className="text-sm text-zinc-500">No {title.toLowerCase()} yet.</p>
                ) : (
                    (list || []).slice().reverse().map((a, i) => (
                        <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-zinc-200">{a.testTitle}</p>
                                <StatusBadge value={a.result} />
                            </div>
                            <div className="mt-2 flex items-center gap-3">
                                <SimpleProgress value={a.percentage ?? 0} className="flex-1" />
                                <span className="text-xs text-zinc-400">{a.score}/{a.total}</span>
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
    const [searchParams] = useSearchParams();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const regNo = searchParams.get("regNo") || user?.username;

    useEffect(() => {
        if (!regNo) return;
        api.reports.perStudent(regNo).then(setReport).catch(() => {}).finally(() => setLoading(false));
    }, [regNo]);

    if (loading) return <p className="text-sm text-zinc-500">Loading...</p>;
    if (!report) return <EmptyState icon={BarChart3} title="Report not available" />;

    const perf = report.performance || {};
    const aptitude = perf.aptitude || [];
    const coding = perf.coding || [];
    const interviews = perf.interview || [];
    const avgPct = (arr) => (arr.length ? Math.round(arr.reduce((s, x) => s + (x.percentage ?? 0), 0) / arr.length) : 0);

    return (
        <div>
            <PageHeader title="My Report" description={`${report.name} • ${report.regNo}${report.batch ? ` • ${report.batch}` : ""}`} />

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="border-zinc-800/80 bg-zinc-900/40">
                    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-zinc-400"><BrainCircuit className="h-4 w-4" /> Aptitude Average</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-white">{avgPct(aptitude)}%</p>
                        <SimpleProgress value={avgPct(aptitude)} className="mt-2" />
                    </CardContent>
                </Card>
                <Card className="border-zinc-800/80 bg-zinc-900/40">
                    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-zinc-400"><FileCode className="h-4 w-4" /> Coding Average</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-white">{avgPct(coding)}%</p>
                        <SimpleProgress value={avgPct(coding)} className="mt-2" />
                    </CardContent>
                </Card>
                <Card className="border-zinc-800/80 bg-zinc-900/40">
                    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-zinc-400"><Video className="h-4 w-4" /> Interviews</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-white">{interviews.length}</p>
                        <p className="text-xs text-zinc-500">completed rounds</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <AttemptBlocks title="Aptitude Attempts" icon={BrainCircuit} list={aptitude} />
                <AttemptBlocks title="Coding Attempts" icon={FileCode} list={coding} />
            </div>

            {interviews.length > 0 && (
                <Card className="mt-6 border-zinc-800/80 bg-zinc-900/40">
                    <CardHeader><CardTitle className="text-sm text-zinc-400">Interview Performance</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {interviews.slice().reverse().map((iv, i) => (
                            <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-medium text-zinc-200">{iv.type} <span className="text-xs text-zinc-500">• {new Date(iv.date).toLocaleDateString()}</span></p>
                                        {iv.strengths && <p className="mt-1 text-xs text-emerald-400">Strengths: {iv.strengths}</p>}
                                        {iv.weaknesses && <p className="mt-0.5 text-xs text-orange-400">Weaknesses: {iv.weaknesses}</p>}
                                        {iv.notes && <p className="mt-0.5 text-xs text-zinc-400">{iv.notes}</p>}
                                    </div>
                                    <p className="text-2xl font-bold text-amber-400">{iv.rating != null ? iv.rating : "—"}<span className="text-sm text-zinc-500">/5</span></p>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
