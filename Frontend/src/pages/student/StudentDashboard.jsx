import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Video, Award, User, BrainCircuit, FileCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/portal/stats-card";
import { PageHeader, SimpleProgress } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/lib/api";

export default function StudentDashboard() {
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();
    const [tests, setTests] = useState([]);
    const [interviews, setInterviews] = useState([]);
    const [loading, setLoading] = useState(true);

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

    const act = (t) => {
        if (t.attempt?.status === "in_progress") navigate(`/student/take/${t.attempt.id}`);
        else if (!t.attempt) navigate(`/student/take/${t.id}?new=1`);
        else navigate("/student/report");
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
                <Card className="mb-8 border-zinc-800/80 bg-zinc-900/40">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium text-zinc-400">Academic Snapshot</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                        <div><p className="text-xs text-zinc-500">10th</p><p className="text-lg font-semibold text-white">{profile.tenth || "—"}%</p></div>
                        <div><p className="text-xs text-zinc-500">12th</p><p className="text-lg font-semibold text-white">{profile.twelfth || "—"}%</p></div>
                        <div><p className="text-xs text-zinc-500">Department</p><p className="text-lg font-semibold text-white">{profile.department || "—"}</p></div>
                        <div><p className="text-xs text-zinc-500">Batch</p><p className="text-lg font-semibold text-white">{profile.batch || "—"}</p></div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="border-zinc-800/80 bg-zinc-900/40">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium text-zinc-400">Assigned Tests</CardTitle>
                        <Link to="/student/tests" className="text-xs text-violet-400 hover:underline">View all</Link>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {loading ? (
                            <p className="py-6 text-center text-sm text-zinc-500">Loading...</p>
                        ) : tests.length === 0 ? (
                            <p className="py-6 text-center text-sm text-zinc-500">No tests assigned yet.</p>
                        ) : (
                            tests.slice(0, 4).map((t) => (
                                <div key={t.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-zinc-200">{t.title}</p>
                                        <p className="mt-0.5 text-xs text-zinc-500">
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

                <Card className="border-zinc-800/80 bg-zinc-900/40">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium text-zinc-400">Upcoming Interviews</CardTitle>
                        <Link to="/student/interviews" className="text-xs text-violet-400 hover:underline">View all</Link>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {loading ? (
                            <p className="py-6 text-center text-sm text-zinc-500">Loading...</p>
                        ) : upcoming.length === 0 ? (
                            <p className="py-6 text-center text-sm text-zinc-500">No interviews scheduled.</p>
                        ) : (
                            upcoming.slice(0, 4).map((i) => (
                                <div key={i.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                    <div>
                                        <p className="text-sm font-medium text-zinc-200">{i.type}</p>
                                        <p className="text-xs text-zinc-500">{new Date(i.scheduledAt).toLocaleString()}</p>
                                    </div>
                                    <StatusBadge value={i.status} />
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
