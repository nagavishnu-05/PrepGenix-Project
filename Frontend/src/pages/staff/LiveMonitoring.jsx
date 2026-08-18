import { useState, useEffect, useCallback, Fragment } from "react";
import { RadioTower, AlertTriangle, StopCircle, RefreshCw, User, Camera, VideoOff, Search } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

function fmtDuration(startedAt) {
    const sec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function LiveMonitoring() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState(Date.now());
    const [expanded, setExpanded] = useState({});
    const [detail, setDetail] = useState({});
    const [busy, setBusy] = useState({});

    // Filter, search & view states for scaling to 180+ candidates
    const [viewMode, setViewMode] = useState("table"); // "table" or "grid"
    const [filterType, setFilterType] = useState("all"); // "all", "flagged", "violating"
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("violations"); // "violations" (highest first), "name", "started"

    const load = useCallback(async () => {
        try {
            const r = await api.proctoring.live();
            setRows(r);
        } catch {
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const iv = setInterval(load, 4000);
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => { clearInterval(iv); clearInterval(tick); };
    }, [load]);

    const toggleDetail = async (attemptId) => {
        const next = { ...expanded, [attemptId]: !expanded[attemptId] };
        setExpanded(next);
        if (next[attemptId] && !detail[attemptId]) {
            try {
                const v = await api.proctoring.attempt(attemptId);
                setDetail((d) => ({ ...d, [attemptId]: v }));
            } catch {}
        }
    };

    const forceSubmit = async (attemptId) => {
        if (!confirm("Force-submit this attempt now? The student's test will be ended.")) return;
        setBusy((b) => ({ ...b, [attemptId]: true }));
        try {
            await api.tests.finish(attemptId);
            await load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy((b) => ({ ...b, [attemptId]: false }));
        }
    };

    const resetViolations = async (attemptId) => {
        if (!confirm("Reset this student's violation log and allow them to continue?")) return;
        setBusy((b) => ({ ...b, [attemptId]: true }));
        try {
            await api.proctoring.resetAttempt(attemptId);
            await load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy((b) => ({ ...b, [attemptId]: false }));
        }
    };

    // Filter and sort attempts
    const activeRows = rows.filter((r) => r.status === "in_progress" || r.status === "flagged");

    const filteredRows = activeRows.filter(r => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchesName = (r.studentName || "").toLowerCase().includes(q);
            const matchesReg = (r.studentRegNo || "").toLowerCase().includes(q);
            if (!matchesName && !matchesReg) return false;
        }

        if (filterType === "flagged" && r.status !== "flagged") return false;
        if (filterType === "violating" && (r.violations || 0) === 0) return false;

        return true;
    }).sort((a, b) => {
        if (sortBy === "violations") {
            return (b.violations || 0) - (a.violations || 0);
        }
        if (sortBy === "name") {
            return (a.studentName || "").localeCompare(b.studentName || "");
        }
        if (sortBy === "started") {
            return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
        }
        return 0;
    });

    return (
        <div>
            <PageHeader
                title="Live Monitoring"
                description="Watch active proctored tests in real time"
                action={
                    <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
                }
            />

            {/* Scale controls */}
            <Card className="mb-6 border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                            <Input 
                                placeholder="Search student name or register no..." 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)} 
                                className="pl-9" 
                            />
                        </div>
                        <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="All candidates" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Candidates</SelectItem>
                                <SelectItem value="flagged">Flagged Only</SelectItem>
                                <SelectItem value="violating">With Violations</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-44"><SelectValue placeholder="Sort by" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="violations">Highest Violations</SelectItem>
                                <SelectItem value="name">Alphabetical (Name)</SelectItem>
                                <SelectItem value="started">Start Time (Latest)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2 border border-slate-200 dark:border-zinc-800 rounded-lg p-1 bg-slate-50 dark:bg-zinc-950/40">
                        <button 
                            onClick={() => setViewMode("table")} 
                            className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer", viewMode === "table" ? "bg-white dark:bg-zinc-800 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-zinc-400 hover:text-slate-800")}
                        >
                            Compact Table
                        </button>
                        <button 
                            onClick={() => setViewMode("grid")} 
                            className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer", viewMode === "grid" ? "bg-white dark:bg-zinc-800 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-zinc-400 hover:text-slate-800")}
                        >
                            Camera Grid
                        </button>
                    </div>
                </CardContent>
            </Card>

            {loading ? (
                <p className="text-sm text-zinc-500">Loading...</p>
            ) : activeRows.length === 0 ? (
                <EmptyState icon={RadioTower} title="No active tests" description="Students' in-progress tests will appear here with their live camera feed and violation feed." />
            ) : (
                <>
                    {filteredRows.length === 0 ? (
                        <div className="py-12 text-center">
                            <p className="text-sm text-slate-500">No candidates match the selected filters or search query.</p>
                        </div>
                    ) : viewMode === "table" ? (
                        <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                            <CardContent className="p-0 overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="pl-6">Student</TableHead>
                                            <TableHead>Test Title</TableHead>
                                            <TableHead>Elapsed</TableHead>
                                            <TableHead>Violations</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right pr-6">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredRows.map((r) => {
                                            const violations = r.violations || 0;
                                            const maxV = r.proctoring?.maxViolations ?? 1;
                                            const open = expanded[r.id];
                                            const vList = detail[r.id] || [];

                                            return (
                                                <Fragment key={r.id}>
                                                    <TableRow className="hover:bg-slate-50/40 dark:hover:bg-zinc-800/10 transition-colors">
                                                        <TableCell className="pl-6">
                                                            <p className="font-semibold text-slate-805 dark:text-zinc-200">{r.studentName}</p>
                                                            <p className="text-xs text-slate-500">{r.studentRegNo}</p>
                                                        </TableCell>
                                                        <TableCell className="text-sm text-slate-700 dark:text-zinc-300 font-medium">{r.testTitle}</TableCell>
                                                        <TableCell className="text-sm text-slate-700 dark:text-zinc-300">{fmtDuration(r.startedAt)}</TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <span className={cn(
                                                                    "font-bold text-xs",
                                                                    violations > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-slate-500"
                                                                )}>
                                                                    {violations} / {maxV}
                                                                </span>
                                                                <div className="h-1.5 w-16 bg-slate-100 dark:bg-zinc-800/80 rounded overflow-hidden">
                                                                    <div 
                                                                        className={cn("h-full rounded transition-all", violations >= maxV ? "bg-red-500" : violations > 0 ? "bg-amber-500" : "bg-emerald-500")}
                                                                        style={{ width: `${Math.min(100, (violations / maxV) * 100)}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <StatusBadge value={r.status === "flagged" ? "flagged" : r.status} />
                                                        </TableCell>
                                                        <TableCell className="text-right pr-6">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => toggleDetail(r.id)}>
                                                                    {open ? "Hide Camera" : "View Camera & Log"}
                                                                </Button>
                                                                <Button size="sm" variant="ghost" className="text-violet-650 cursor-pointer" onClick={() => resetViolations(r.id)} disabled={busy[r.id]}>
                                                                    Reset
                                                                </Button>
                                                                <Button size="sm" variant="ghost" className="text-red-500 cursor-pointer" onClick={() => forceSubmit(r.id)} disabled={busy[r.id]}>
                                                                    Force Submit
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>

                                                    {open && (
                                                        <TableRow className="bg-slate-50/50 dark:bg-zinc-950/20 border-t-0">
                                                            <TableCell colSpan={6} className="p-4">
                                                                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                                                                    {/* Camera Column */}
                                                                    <div className="flex flex-col items-center justify-center p-2 border-r border-slate-150 dark:border-zinc-800">
                                                                        <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-550 mb-2 uppercase tracking-wide">Live Camera Frame</p>
                                                                        {r.latestFrame ? (
                                                                            <img src={`data:image/jpeg;base64,${r.latestFrame}`} alt="camera" className="h-32 w-48 rounded-lg border border-slate-200 dark:border-zinc-855 bg-slate-100 dark:bg-zinc-950 object-cover shadow-sm" />
                                                                        ) : (
                                                                            <div className="flex h-32 w-48 flex-col items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-650">
                                                                                <VideoOff className="h-5 w-5" />
                                                                                <span className="mt-1 text-[11px]">No frames yet</span>
                                                                            </div>
                                                                        )}
                                                                        <p className="text-[10px] text-slate-405 mt-2">Last seen {r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleTimeString() : "—"}</p>
                                                                    </div>

                                                                    {/* Analysis Column */}
                                                                    <div className="p-2 border-r border-slate-150 dark:border-zinc-800 space-y-3 text-xs">
                                                                        <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-550 uppercase tracking-wide">Analysis Results</p>
                                                                        <div className="space-y-2">
                                                                            {r.latestAnalysis?.image && !r.latestAnalysis.image.error ? (
                                                                                <p className={cn("flex items-center gap-1 font-semibold", r.latestAnalysis.image.multipleFaces ? "text-red-500" : r.latestAnalysis.image.facePresent ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500")}>
                                                                                    <Camera className="h-4 w-4" />
                                                                                    {r.latestAnalysis.image.multipleFaces ? `${r.latestAnalysis.image.faces} faces detected` : r.latestAnalysis.image.facePresent ? "Single face visible" : "No face detected"}
                                                                                </p>
                                                                            ) : (
                                                                                <p className="text-slate-400">No face analysis data yet</p>
                                                                            )}
                                                                            {r.latestAnalysis?.audio && !r.latestAnalysis.audio.error && (
                                                                                <p className={cn("font-semibold", r.latestAnalysis.audio.voiceDetected ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")}>
                                                                                    {r.latestAnalysis.audio.voiceDetected ? "Speech detected" : "Environment quiet"}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Violations Log Column */}
                                                                    <div className="p-2 space-y-3 max-h-48 overflow-y-auto">
                                                                        <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-555 uppercase tracking-wide">Violations Feed</p>
                                                                        <div className="space-y-2">
                                                                            {vList.length === 0 ? (
                                                                                <p className="text-xs text-slate-500">No violations logged.</p>
                                                                            ) : (
                                                                                vList.map((v) => (
                                                                                    <div key={v.id} className="rounded border border-slate-100 dark:border-zinc-800 bg-slate-50/50 p-2 text-[11px]">
                                                                                        <div className="flex justify-between font-bold">
                                                                                            <span className="capitalize text-slate-800 dark:text-zinc-300">{v.type.replace(/_/g, " ")}</span>
                                                                                            <span className="text-slate-400">{new Date(v.timestamp).toLocaleTimeString()}</span>
                                                                                        </div>
                                                                                        <p className="text-slate-550 dark:text-zinc-400 mt-1">{v.description}</p>
                                                                                    </div>
                                                                                ))
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </Fragment>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                            {filteredRows.map((r) => {
                                const violations = r.violations || 0;
                                const maxV = r.proctoring?.maxViolations ?? 1;
                                const open = expanded[r.id];
                                const vList = detail[r.id] || [];
                                return (
                                    <Card key={r.id} className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                                        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                                            <div className="min-w-0">
                                                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-zinc-100">
                                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800 text-xs">
                                                        <User className="h-3.5 w-3.5" />
                                                    </span>
                                                    {r.studentName}
                                                    <span className="text-xs font-normal text-slate-500 dark:text-zinc-500">{r.studentRegNo}</span>
                                                </p>
                                                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-zinc-500">{r.testTitle} • {r.type} • {fmtDuration(r.startedAt)} elapsed</p>
                                            </div>
                                            <StatusBadge value={r.status === "flagged" ? "flagged" : r.status} />
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            <div className="flex items-start gap-3">
                                                {r.latestFrame ? (
                                                    <img src={`data:image/jpeg;base64,${r.latestFrame}`} alt="camera" className="h-32 w-44 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-950 object-cover" />
                                                ) : (
                                                    <div className="flex h-32 w-44 flex-col items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-955 text-slate-500 dark:text-zinc-600">
                                                        <VideoOff className="h-6 w-6" />
                                                        <span className="mt-1 text-[11px]">No frames yet</span>
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                                                    <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Last analysis</p>
                                                    {r.latestAnalysis?.image && !r.latestAnalysis.image.error ? (
                                                        <p className={cn("text-xs", r.latestAnalysis.image.multipleFaces ? "text-red-650 dark:text-red-400" : r.latestAnalysis.image.facePresent ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                                                            <Camera className="mr-1 inline h-3.5 w-3.5" />
                                                            {r.latestAnalysis.image.multipleFaces
                                                                ? `${r.latestAnalysis.image.faces} faces detected`
                                                                : r.latestAnalysis.image.facePresent
                                                                    ? "Single face visible"
                                                                    : "No face detected"}
                                                        </p>
                                                    ) : (
                                                        <p className="text-xs text-slate-400 dark:text-zinc-650">No face analysis yet</p>
                                                    )}
                                                    {r.latestAnalysis?.audio && !r.latestAnalysis.audio.error && (
                                                        <p className={cn("text-xs", r.latestAnalysis.audio.voiceDetected ? "text-red-650 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                                                            {r.latestAnalysis.audio.voiceDetected ? "Speech detected" : "Environment quiet"}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-slate-500 dark:text-zinc-500">Last seen {r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleTimeString() : "—"}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", violations > 0 ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400" : "border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-650 dark:text-zinc-400")}>
                                                    <AlertTriangle className="h-3.5 w-3.5" />
                                                    {violations}/{maxV} violations
                                                </span>
                                                {r.status === "flagged" && (
                                                    <span className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                                                        Awaiting review
                                                    </span>
                                                )}
                                                {r.latestViolation && (
                                                    <span className="truncate rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 px-2.5 py-1 text-xs capitalize text-slate-650 dark:text-zinc-400">
                                                        {r.latestViolation.type.replace(/_/g, " ")} · {new Date(r.latestViolation.timestamp).toLocaleTimeString()}
                                                    </span>
                                                )}
                                                <div className="ml-auto flex gap-2">
                                                    <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => toggleDetail(r.id)}>
                                                        {open ? "Hide" : "Violations"}
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => resetViolations(r.id)} disabled={busy[r.id]}>
                                                        Reset
                                                    </Button>
                                                    <Button size="sm" variant="destructive" className="cursor-pointer" onClick={() => forceSubmit(r.id)} disabled={busy[r.id]}>
                                                        Force submit
                                                    </Button>
                                                </div>
                                            </div>

                                            {open && (
                                                <div className="space-y-2">
                                                    {vList.length === 0 ? (
                                                        <p className="text-xs text-slate-500 dark:text-zinc-500">No violations recorded for this attempt.</p>
                                                    ) : (
                                                        vList.map((v) => (
                                                            <div key={v.id} className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-955 p-2.5">
                                                                <div className="flex items-center justify-between text-xs">
                                                                    <span className="font-medium capitalize text-slate-800 dark:text-zinc-200">{v.type.replace(/_/g, " ")}</span>
                                                                    <span className="text-slate-550 dark:text-zinc-500">{new Date(v.timestamp).toLocaleString()}</span>
                                                                </div>
                                                                <p className="mt-1 text-xs text-slate-605 dark:text-zinc-400">{v.description}</p>
                                                                {v.cameraFrame && (
                                                                    <img src={`data:image/jpeg;base64,${v.cameraFrame}`} alt="violation frame" className="mt-2 h-24 rounded border border-slate-200 dark:border-zinc-800" />
                                                                )}
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
