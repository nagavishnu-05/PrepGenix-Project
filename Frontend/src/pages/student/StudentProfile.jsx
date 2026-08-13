import { useEffect, useState } from "react";
import { User, Phone, Mail, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/lib/api";

function PerfRow({ label, list }) {
    if (!list?.length) return <p className="text-sm text-zinc-500">No {label.toLowerCase()} yet.</p>;
    return (
        <div className="space-y-2">
            {(list || []).slice().reverse().map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                    <div>
                        <p className="text-sm font-medium text-zinc-200">{item.testTitle || item.type}</p>
                        <p className="text-xs text-zinc-500">{new Date(item.date).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {item.rating != null && <span className="text-sm font-semibold text-amber-400">{item.rating}/5</span>}
                        {item.score != null && <span className="text-sm text-zinc-400">{item.score}/{item.total}</span>}
                        <StatusBadge value={item.result || item.status || "completed"} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function StudentProfile() {
    const user = useAuthStore((s) => s.user);
    const [student, setStudent] = useState(null);
    const [loading, setLoading] = useState(true);
    const regNo = user?.username;

    useEffect(() => {
        if (!regNo) return;
        api.students.get(regNo).then(setStudent).catch(() => {}).finally(() => setLoading(false));
    }, [regNo]);

    if (loading) return <p className="text-sm text-zinc-500">Loading...</p>;
    if (!student) return <PageHeader title="My Profile" description="Profile unavailable." />;

    const p = student;
    const perf = p.performance || {};

    return (
        <div>
            <PageHeader title="My Profile" description="Your student record and performance summary" />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="border-zinc-800/80 bg-zinc-900/40">
                    <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-2xl font-bold text-white">
                            {(p.name || "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">{p.name}</h2>
                            <p className="text-sm text-zinc-500">{p.regNo}{p.rollNo ? ` • ${p.rollNo}` : ""}</p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2 text-xs text-zinc-400">
                            <span className="rounded-md bg-zinc-800 px-2 py-1">{p.department || "—"}</span>
                            <span className="rounded-md bg-zinc-800 px-2 py-1">{p.batch || "—"}</span>
                            <span className="rounded-md bg-zinc-800 px-2 py-1">CGPA {p.cgpa || "—"}</span>
                        </div>
                        <div className="mt-2 w-full space-y-2 text-sm text-zinc-400">
                            <p className="flex items-center justify-center gap-2"><Mail className="h-4 w-4" />{p.email || "—"}</p>
                            <p className="flex items-center justify-center gap-2"><Phone className="h-4 w-4" />{p.mobile || "—"}</p>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid gap-6 lg:col-span-2">
                    <Card className="border-zinc-800/80 bg-zinc-900/40">
                        <CardHeader><CardTitle className="text-sm font-medium text-zinc-400">Academic Record</CardTitle></CardHeader>
                        <CardContent className="grid grid-cols-3 gap-4">
                            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-center"><p className="text-2xl font-bold text-white">{p.tenth || "—"}%</p><p className="text-xs text-zinc-500">10th</p></div>
                            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-center"><p className="text-2xl font-bold text-white">{p.twelfth || "—"}%</p><p className="text-xs text-zinc-500">12th</p></div>
                            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-center"><p className="text-2xl font-bold text-white">{p.cgpa || "—"}</p><p className="text-xs text-zinc-500">CGPA</p></div>
                        </CardContent>
                    </Card>

                    <Card className="border-zinc-800/80 bg-zinc-900/40">
                        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-400"><FileText className="h-4 w-4" /> Resume Classification</CardTitle></CardHeader>
                        <CardContent>
                            {p.resumeCategories?.length ? (
                                <div className="flex flex-wrap gap-2">
                                    {p.resumeCategories.map((c, i) => <span key={i} className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-300">{typeof c === "string" ? c : c.name}</span>)}
                                </div>
                            ) : (
                                <p className="text-sm text-zinc-500">No resume classified yet. The Placement Coordinator will upload and categorize your resume.</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-zinc-800/80 bg-zinc-900/40">
                        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-400"><User className="h-4 w-4" /> Performance History</CardTitle></CardHeader>
                        <CardContent className="space-y-5">
                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Aptitude</p>
                                <PerfRow label="Aptitude" list={perf.aptitude} />
                            </div>
                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Coding</p>
                                <PerfRow label="Coding" list={perf.coding} />
                            </div>
                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Interviews</p>
                                <PerfRow label="Interviews" list={perf.interview} />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
