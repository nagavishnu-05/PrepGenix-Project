import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, FileCode, BrainCircuit, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { api } from "@/lib/api";

export default function StudentTests() {
    const navigate = useNavigate();
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.tests.list().then(setTests).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const act = (t) => {
        if (t.attempt?.status === "in_progress") navigate(`/student/take/${t.attempt.id}`);
        else if (!t.attempt) navigate(`/student/take/${t.id}?new=1`);
        else navigate("/student/report");
    };

    return (
        <div>
            <PageHeader title="My Tests" description="Tests assigned to you by the Staff Coordinator" />
            {loading ? (
                <p className="text-sm text-zinc-500">Loading...</p>
            ) : tests.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No tests assigned yet" description="Once a test is assigned to your batch it will appear here." />
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {tests.map((t) => (
                        <Card key={t.id} className="border-zinc-800/80 bg-zinc-900/40 transition-colors hover:border-zinc-700">
                            <CardContent className="p-5">
                                <div className="mb-3 flex items-start justify-between gap-2">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
                                        {t.type === "coding" ? <FileCode className="h-5 w-5 text-violet-400" /> : <BrainCircuit className="h-5 w-5 text-emerald-400" />}
                                    </div>
                                    {t.attempt && <StatusBadge value={t.attempt.status} />}
                                </div>
                                <h3 className="text-base font-semibold text-white">{t.title}</h3>
                                <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{t.description}</p>
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                                    <span className="rounded-md bg-zinc-800/70 px-2 py-1">{t.type === "coding" ? "Coding" : "Aptitude"}</span>
                                    <span className="rounded-md bg-zinc-800/70 px-2 py-1">{t.mode === "adaptive" ? "Adaptive" : "Fixed"}</span>
                                    <span className="rounded-md bg-zinc-800/70 px-2 py-1">{t._count?.questions ?? 0} questions</span>
                                    <span className="flex items-center gap-1 rounded-md bg-zinc-800/70 px-2 py-1"><Clock className="h-3 w-3" />{t.durationMin} min</span>
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
        </div>
    );
}
