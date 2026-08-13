import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, FileText, CalendarClock, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/portal/stats-card";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { api } from "@/lib/api";

export default function PlacementDashboard() {
    const [stats, setStats] = useState(null);
    const [interviews, setInterviews] = useState([]);
    const [resumes, setResumes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([api.reports.overview(), api.interviews.list(), api.resumes.list({})])
            .then(([s, i, r]) => {
                setStats(s);
                setInterviews(i);
                setResumes(r);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <p className="text-sm text-zinc-500">Loading...</p>;

    const upcoming = interviews.filter((i) => i.status === "scheduled").slice(0, 5);

    return (
        <div>
            <PageHeader
                title="Placement Dashboard"
                description="Shortlist candidates, manage resumes, and track interviews"
                action={
                    <Link to="/placement/interviews" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">
                        Schedule Interview
                    </Link>
                }
            />

            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatsCard title="Students" value={stats?.students ?? 0} sub="total students" icon={Users} accent="emerald" />
                <StatsCard title="Resumes" value={stats?.resumes ?? 0} sub="uploaded & parsed" icon={FileText} accent="violet" />
                <StatsCard title="Completed Interviews" value={stats?.completedInterviews ?? 0} sub="interviews done" icon={CalendarClock} accent="blue" />
                <StatsCard title="Completed Tests" value={stats?.completedAttempts ?? 0} sub="tests finished" icon={Activity} accent="amber" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="border-zinc-800/80 bg-zinc-900/40">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium text-zinc-400">Upcoming Interviews</CardTitle>
                        <Link to="/placement/interviews" className="text-xs text-emerald-400 hover:underline">View all</Link>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {upcoming.length === 0 ? (
                            <EmptyState icon={CalendarClock} title="No scheduled interviews" description="Schedule interviews for shortlisted candidates." />
                        ) : (
                            upcoming.map((i) => (
                                <div key={i.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-zinc-200">{i.studentName}</p>
                                        <p className="text-xs text-zinc-500">{i.type} • {new Date(i.scheduledAt).toLocaleString()}</p>
                                    </div>
                                    <StatusBadge value={i.status} />
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card className="border-zinc-800/80 bg-zinc-900/40">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium text-zinc-400">Latest Resumes</CardTitle>
                        <Link to="/placement/resumes" className="text-xs text-emerald-400 hover:underline">View all</Link>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {resumes.length === 0 ? (
                            <EmptyState icon={FileText} title="No resumes uploaded" description="Upload student resumes to extract skills and categories." />
                        ) : (
                            resumes.slice(0, 5).map((r) => (
                                <div key={r.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-zinc-200">{r.studentName}</p>
                                        <p className="text-xs text-zinc-500">{r.topCategory || "Not categorized"}</p>
                                    </div>
                                    <span className="text-xs text-zinc-400">{(r.skills || []).length} skills</span>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
