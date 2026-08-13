import { useState, useEffect } from "react";
import { Plus, Star, CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { api } from "@/lib/api";

export default function PlacementInterviews() {
    const [interviews, setInterviews] = useState([]);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [schedOpen, setSchedOpen] = useState(false);
    const [resultOpen, setResultOpen] = useState(false);
    const [resultTarget, setResultTarget] = useState(null);
    const [busy, setBusy] = useState(false);
    const [sched, setSched] = useState({ regNo: "", type: "Technical", scheduledAt: "", interviewer: "" });
    const [result, setResult] = useState({ rating: 3, notes: "", strengths: "", weaknesses: "", status: "completed" });

    const load = () => {
        setLoading(true);
        Promise.all([api.interviews.list(), api.students.list({})])
            .then(([i, s]) => { setInterviews(i); setStudents(s); })
            .catch(() => {})
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const schedule = async () => {
        if (!sched.regNo || !sched.scheduledAt) {
            alert("Select a student and a date/time.");
            return;
        }
        setBusy(true);
        try {
            await api.interviews.create(sched);
            setSchedOpen(false);
            setSched({ regNo: "", type: "Technical", scheduledAt: "", interviewer: "" });
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const openResult = (iv) => {
        setResultTarget(iv);
        setResult({
            rating: iv.rating ?? 3,
            notes: iv.notes || "",
            strengths: iv.strengths || "",
            weaknesses: iv.weaknesses || "",
            status: "completed",
        });
        setResultOpen(true);
    };

    const saveResult = async () => {
        if (!resultTarget) return;
        setBusy(true);
        try {
            await api.interviews.result(resultTarget.id, result);
            setResultOpen(false);
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const cancel = async (iv) => {
        if (!confirm(`Cancel interview for ${iv.studentName}?`)) return;
        await api.interviews.update(iv.id, { status: "cancelled" }).catch((e) => alert(e.message));
        load();
    };

    return (
        <div>
            <PageHeader
                title="Interviews"
                description="Schedule interviews and record outcomes"
                action={<Button onClick={() => setSchedOpen(true)}><Plus className="h-4 w-4" /> Schedule Interview</Button>}
            />

            <Card className="border-zinc-800/80 bg-zinc-900/40">
                <CardContent className="p-0">
                    {loading ? (
                        <p className="py-10 text-center text-sm text-zinc-500">Loading...</p>
                    ) : interviews.length === 0 ? (
                        <div className="p-10">
                            <EmptyState icon={CalendarClock} title="No interviews" description="Schedule an interview for a shortlisted student." />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Scheduled</TableHead>
                                    <TableHead>Interviewer</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Rating</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {interviews.map((iv) => (
                                    <TableRow key={iv.id}>
                                        <TableCell>
                                            <p className="font-medium text-zinc-100">{iv.studentName}</p>
                                            <p className="text-xs text-zinc-500">{iv.regNo}</p>
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-300">{iv.type}</TableCell>
                                        <TableCell className="text-sm text-zinc-300">{new Date(iv.scheduledAt).toLocaleString()}</TableCell>
                                        <TableCell className="text-sm text-zinc-300">{iv.interviewer}</TableCell>
                                        <TableCell><StatusBadge value={iv.status} /></TableCell>
                                        <TableCell className="text-sm text-zinc-300">{iv.rating ? `${iv.rating}/5` : "—"}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {iv.status === "scheduled" && (
                                                    <>
                                                        <Button variant="ghost" size="sm" onClick={() => openResult(iv)}><Star className="h-4 w-4" /> Record</Button>
                                                        <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => cancel(iv)}>Cancel</Button>
                                                    </>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Schedule Interview</DialogTitle>
                        <DialogDescription>Book a slot for a student.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Student</Label>
                            <Select value={sched.regNo} onValueChange={(v) => setSched({ ...sched, regNo: v })}>
                                <SelectTrigger><SelectValue placeholder="Select a student" /></SelectTrigger>
                                <SelectContent>
                                    {students.map((s) => <SelectItem key={s.regNo} value={s.regNo}>{s.regNo} — {s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">Type</Label>
                                <Select value={sched.type} onValueChange={(v) => setSched({ ...sched, type: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Technical">Technical</SelectItem>
                                        <SelectItem value="HR">HR</SelectItem>
                                        <SelectItem value="Aptitude">Aptitude</SelectItem>
                                        <SelectItem value="Final">Final</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">Interviewer</Label>
                                <Input value={sched.interviewer} onChange={(e) => setSched({ ...sched, interviewer: e.target.value })} placeholder="Panel name" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Date & time</Label>
                            <Input type="datetime-local" value={sched.scheduledAt} onChange={(e) => setSched({ ...sched, scheduledAt: e.target.value })} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setSchedOpen(false)}>Cancel</Button>
                            <Button onClick={schedule} disabled={busy}>{busy ? "Scheduling..." : "Schedule"}</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={resultOpen} onOpenChange={setResultOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Record Interview Result</DialogTitle>
                        <DialogDescription>{resultTarget?.studentName} — {resultTarget?.type} interview.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Rating ({result.rating}/5)</Label>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <button key={n} onClick={() => setResult({ ...result, rating: n })} className={`rounded px-2 py-1 text-lg ${n <= result.rating ? "text-amber-400" : "text-zinc-600"}`}>★</button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Strengths</Label>
                            <Input value={result.strengths} onChange={(e) => setResult({ ...result, strengths: e.target.value })} placeholder="Good problem solving..." />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Weaknesses</Label>
                            <Input value={result.weaknesses} onChange={(e) => setResult({ ...result, weaknesses: e.target.value })} placeholder="Needs work on..." />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Notes</Label>
                            <Textarea rows={3} value={result.notes} onChange={(e) => setResult({ ...result, notes: e.target.value })} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setResultOpen(false)}>Cancel</Button>
                            <Button onClick={saveResult} disabled={busy}>{busy ? "Saving..." : "Save Result"}</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
