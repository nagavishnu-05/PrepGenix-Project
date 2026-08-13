import { useState, useEffect, useCallback } from "react";
import { RadioTower, AlertTriangle, StopCircle, RefreshCw, User, Camera, VideoOff } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

    const activeCount = rows.filter((r) => r.status === "in_progress").length;

    return (
        <div>
            <PageHeader
                title="Live Monitoring"
                description="Watch active proctored tests in real time"
                action={
                    <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
                }
            />

            {loading ? (
                <p className="text-sm text-zinc-500">Loading...</p>
            ) : activeCount === 0 ? (
                <EmptyState icon={RadioTower} title="No active tests" description="Students' in-progress tests will appear here with their live camera feed and violation feed." />
            ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    {rows.map((r) => {
                        const violations = r.violations || 0;
                        const maxV = r.proctoring?.maxViolations ?? 5;
                        const open = expanded[r.id];
                        const vList = detail[r.id] || [];
                        return (
                            <Card key={r.id} className="border-zinc-800/80 bg-zinc-900/40">
                                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                                    <div className="min-w-0">
                                        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-xs">
                                                <User className="h-3.5 w-3.5" />
                                            </span>
                                            {r.studentName}
                                            <span className="text-xs font-normal text-zinc-500">{r.studentRegNo}</span>
                                        </p>
                                        <p className="mt-0.5 truncate text-xs text-zinc-500">{r.testTitle} • {r.type} • {fmtDuration(r.startedAt)} elapsed</p>
                                    </div>
                                    <StatusBadge value={r.status} />
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        {r.latestFrame ? (
                                            <img src={`data:image/jpeg;base64,${r.latestFrame}`} alt="camera" className="h-32 w-44 rounded-lg border border-zinc-800 bg-zinc-950 object-cover" />
                                        ) : (
                                            <div className="flex h-32 w-44 flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-600">
                                                <VideoOff className="h-6 w-6" />
                                                <span className="mt-1 text-[11px]">No frames yet</span>
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                                            <p className="text-xs font-medium text-zinc-400">Last analysis</p>
                                            {r.latestAnalysis?.image && !r.latestAnalysis.image.error ? (
                                                <p className={cn("text-xs", r.latestAnalysis.image.multipleFaces ? "text-red-400" : r.latestAnalysis.image.facePresent ? "text-emerald-400" : "text-amber-400")}>
                                                    <Camera className="mr-1 inline h-3.5 w-3.5" />
                                                    {r.latestAnalysis.image.multipleFaces
                                                        ? `${r.latestAnalysis.image.faces} faces detected`
                                                        : r.latestAnalysis.image.facePresent
                                                            ? "Single face visible"
                                                            : "No face detected"}
                                                </p>
                                            ) : (
                                                <p className="text-xs text-zinc-600">No face analysis yet</p>
                                            )}
                                            {r.latestAnalysis?.audio && !r.latestAnalysis.audio.error && (
                                                <p className={cn("text-xs", r.latestAnalysis.audio.voiceDetected ? "text-red-400" : "text-emerald-400")}>
                                                    {r.latestAnalysis.audio.voiceDetected ? "Speech detected" : "Environment quiet"}
                                                </p>
                                            )}
                                            <p className="text-xs text-zinc-500">Last seen {r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleTimeString() : "—"}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", violations > 0 ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-zinc-700 bg-zinc-800 text-zinc-400")}>
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                            {violations}/{maxV} violations
                                        </span>
                                        {r.latestViolation && (
                                            <span className="truncate rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1 text-xs capitalize text-zinc-400">
                                                {r.latestViolation.type.replace(/_/g, " ")} · {new Date(r.latestViolation.timestamp).toLocaleTimeString()}
                                            </span>
                                        )}
                                        <div className="ml-auto flex gap-2">
                                            <Button size="sm" variant="outline" onClick={() => toggleDetail(r.id)}>
                                                {open ? "Hide" : "Violations"}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => resetViolations(r.id)} disabled={busy[r.id]}>
                                                <RefreshCw className="h-4 w-4" /> Reset
                                            </Button>
                                            <Button size="sm" variant="destructive" onClick={() => forceSubmit(r.id)} disabled={busy[r.id]}>
                                                <StopCircle className="h-4 w-4" /> {busy[r.id] ? "Submitting..." : "Force submit"}
                                            </Button>
                                        </div>
                                    </div>

                                    {open && (
                                        <div className="space-y-2">
                                            {vList.length === 0 ? (
                                                <p className="text-xs text-zinc-500">No violations recorded for this attempt.</p>
                                            ) : (
                                                vList.map((v) => (
                                                    <div key={v.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="font-medium capitalize text-zinc-200">{v.type.replace(/_/g, " ")}</span>
                                                            <span className="text-zinc-500">{new Date(v.timestamp).toLocaleString()}</span>
                                                        </div>
                                                        <p className="mt-1 text-xs text-zinc-400">{v.description}</p>
                                                        {v.cameraFrame && (
                                                            <img src={`data:image/jpeg;base64,${v.cameraFrame}`} alt="violation frame" className="mt-2 h-24 rounded border border-zinc-800" />
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
        </div>
    );
}
