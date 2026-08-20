import { useState, useEffect, useCallback, Fragment } from "react";
import { Plus, Trash2, Users, ClipboardList, Code2, BrainCircuit, CheckCircle2, ChevronDown, ChevronUp, BarChart3, Clock, TrendingUp, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from "recharts";

function AssignmentBadge({ t }) {
    if (t.assignedToAll) return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">All batches</span>;
    if (t.assignedBatch) return <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">Batch {t.assignedBatch}</span>;
    if (t.assignedStudents?.length) return <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400">{t.assignedStudents.length} students</span>;
    return <span className="rounded-full bg-slate-100 dark:bg-zinc-500/10 px-2 py-0.5 text-xs text-slate-500 dark:text-zinc-400">Not assigned</span>;
}

export default function StaffTests() {
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [assignOpen, setAssignOpen] = useState(false);
    const [assignTarget, setAssignTarget] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [batches, setBatches] = useState([]);
    const [busy, setBusy] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);

    // Grouping & Analytics popup state
    const [expandedTestId, setExpandedTestId] = useState(null);
    const [testAnalytics, setTestAnalytics] = useState(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);

    const [f, setF] = useState(() => emptyForm());
    const [assignF, setAssignF] = useState({ batch: "", all: false, regNos: "" });

    const load = useCallback(() => {
        setLoading(true);
        api.tests.list().then(setTests).catch(() => {}).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
        api.questions.list({}).then(setQuestions).catch(() => {});
        api.students.batches().then(setBatches).catch(() => {});
    }, [load]);

    const set = (patch) => setF((x) => ({ ...x, ...patch }));

    const openAnalytics = async (t) => {
        setAnalyticsLoading(true);
        try {
            const data = await api.reports.perTest(t.id);
            setTestAnalytics(data);
        } catch (e) {
            alert("Failed to load test report: " + e.message);
        } finally {
            setAnalyticsLoading(false);
        }
    };

    const handleResetAttempt = async (attemptId, testObj) => {
        if (!confirm("Are you sure you want to reset this student's attempt? They will be able to take the test again from scratch.")) return;
        try {
            await api.tests.resetAttempt(attemptId);
            alert("Attempt reset successfully.");
            // Refresh popup analytics report
            if (testObj && testObj.id) {
                const data = await api.reports.perTest(testObj.id);
                setTestAnalytics(data);
            }
            load();
        } catch (e) {
            alert("Failed to reset attempt: " + e.message);
        }
    };

    const create = async () => {
        if (!f.title.trim()) return;
        
        const testType = f.testTypeSelection === "aptitude_mcq" ? "aptitude" : "coding";
        const manualType = f.testTypeSelection === "coding_programming" ? "programming" : "mcq";
        setBusy(true);
        try {
            let fixedQuestionIds = [];
            
            if (f.mode === "fixed") {
                if (!selectedFile) {
                    alert("Please upload the questions Excel file.");
                    setBusy(false);
                    return;
                }
                
                const importRes = await api.tests.importQuestions(selectedFile, {
                    testType,
                    manualType,
                    questionLimit: Number(f.questionLimit) || 0
                });
                
                fixedQuestionIds = importRes.questionIds;
            }

            const payload = {
                title: f.title,
                description: f.description,
                type: testType,
                mode: f.mode,
                durationMin: Number(f.durationMin) || 30,
                passingScore: Number(f.passingScore) || 50,
                proctoring: {
                    enabled: f.proctoringEnabled,
                    maxViolations: Number(f.proctoringMax) || 1,
                    autoSubmit: f.proctoringAuto,
                    snapshotIntervalSec: Number(f.proctoringInterval) || 20,
                },
                adaptive: f.mode === "adaptive" ? { totalQuestions: Number(f.adaptiveCount) || 10, questionFilter: null } : undefined,
                fixedQuestionIds,
                allowedLanguages: testType === "coding" ? ["c", "cpp", "java", "python"] : undefined,
                assignedToAll: f.assignedToAll,
                assignedBatch: f.assignedToAll ? null : f.assignedBatch || null,
                assignedStudents: f.assignedToAll ? [] : f.assignedRegNos.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
            };
            
            await api.tests.create(payload);
            setCreateOpen(false);
            setF(emptyForm());
            setSelectedFile(null);
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const openAssign = (t) => {
        setAssignTarget(t);
        setAssignF({ batch: t.assignedBatch || "", all: t.assignedToAll, regNos: (t.assignedStudents || []).join(", ") });
        setAssignOpen(true);
    };

    const doAssign = async () => {
        if (!assignTarget) return;
        setBusy(true);
        try {
            const regNos = assignF.regNos.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
            await api.tests.assign(assignTarget.id, {
                regNos: assignF.all ? undefined : regNos,
                batch: assignF.all ? undefined : assignF.batch || undefined,
                all: assignF.all,
            });
            setAssignOpen(false);
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (t) => {
        if (!confirm(`Delete test "${t.title}" and all its attempts?`)) return;
        await api.tests.remove(t.id).catch((e) => alert(e.message));
        load();
    };

    return (
        <div>
            <PageHeader
                title="Tests"
                description="Create and assign assessment tests"
                action={
                    <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create Test</Button>
                }
            />

            <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                <CardContent className="p-0">
                    {loading ? (
                        <p className="py-10 text-center text-sm text-slate-500 dark:text-zinc-500">Loading...</p>
                    ) : tests.length === 0 ? (
                        <div className="p-10">
                            <EmptyState icon={ClipboardList} title="No tests yet" description="Create your first test to assign it to students." />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Test</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Mode</TableHead>
                                    <TableHead>Duration</TableHead>
                                    <TableHead>Questions</TableHead>
                                    <TableHead>Attempts</TableHead>
                                    <TableHead>Assignment</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tests.map((t) => (
                                    <TableRow key={t.id} className="hover:bg-slate-50/40 dark:hover:bg-zinc-800/10 transition-colors">
                                        <TableCell>
                                            <div className="min-w-0">
                                                <p onClick={() => openAnalytics(t)} className="font-semibold text-slate-805 dark:text-zinc-100 cursor-pointer hover:text-violet-650 dark:hover:text-violet-400 hover:underline">
                                                    {t.title}
                                                </p>
                                                <p className="max-w-[200px] sm:max-w-[240px] truncate text-xs text-slate-500 dark:text-zinc-500">{t.description}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-zinc-300 capitalize">
                                                {t.type === "coding" ? <Code2 className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400" /> : <BrainCircuit className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />}
                                                {t.type}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-700 dark:text-zinc-300 capitalize">
                                            {t.mode}
                                            {t.proctoring?.enabled !== false && <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500 dark:text-amber-400">Proctored</span>}
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-700 dark:text-zinc-300">{t.durationMin} min</TableCell>
                                        <TableCell className="text-sm text-slate-700 dark:text-zinc-300">
                                            {t.mode === "fixed" ? (t.fixedQuestionIds || []).length : t.adaptive?.totalQuestions ?? "adaptive"}
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-700 dark:text-zinc-300">
                                            <button onClick={() => openAnalytics(t)} className="cursor-pointer font-bold text-violet-650 dark:text-violet-400 hover:underline">
                                                {t._count?.attempts ?? 0}
                                            </button>
                                        </TableCell>
                                        <TableCell><AssignmentBadge t={t} /></TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => openAnalytics(t)}><BarChart3 className="h-4 w-4" /> Analytics</Button>
                                                <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => openAssign(t)}><Users className="h-4 w-4" /> Assign</Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-650 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300 cursor-pointer" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Create Test dialog */}
            <Dialog open={createOpen} onOpenChange={(open) => {
                setCreateOpen(open);
                if (!open) {
                    setF(emptyForm());
                    setSelectedFile(null);
                }
            }}>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Create Test</DialogTitle>
                        <DialogDescription>Configure the test and import questions.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5 col-span-2">
                                <Label className="text-xs text-zinc-400">Test title</Label>
                                <Input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Aptitude Round 1" />
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <Label className="text-xs text-zinc-400">Description</Label>
                                <Textarea rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="What does this test cover?" />
                            </div>
                            
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">What test is it?</Label>
                                <Select value={f.testTypeSelection} onValueChange={(v) => set({ testTypeSelection: v, mode: "fixed", manualType: v === "coding_programming" ? "programming" : "mcq" })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="aptitude_mcq">Aptitude MCQ</SelectItem>
                                        <SelectItem value="coding_mcq">Coding MCQ</SelectItem>
                                        <SelectItem value="coding_programming">Coding Programming</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">Mode</Label>
                                <Select value={f.mode} onValueChange={(v) => set({ mode: v })} disabled={f.testTypeSelection === "coding_mcq"}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="fixed">Manual (Upload Excel)</SelectItem>
                                        <SelectItem value="adaptive">Adaptive</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">Duration (minutes)</Label>
                                <Input type="number" value={f.durationMin} onChange={(e) => set({ durationMin: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">Passing score (%)</Label>
                                <Input type="number" value={f.passingScore} onChange={(e) => set({ passingScore: e.target.value })} />
                            </div>
                        </div>

                        {f.mode === "fixed" ? (
                            <div className="space-y-4 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-4">
                                <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">Manual Setup (Excel Upload)</p>
                                
                                {f.testTypeSelection === "aptitude_mcq" && (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-slate-500 dark:text-zinc-400">Question Format</Label>
                                        <Select value={f.manualType} onValueChange={(v) => set({ manualType: v })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="mcq">MCQ</SelectItem>
                                                <SelectItem value="fillup">Fill up</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-500 dark:text-zinc-400">Questions Excel File (.xlsx, .xls, .csv)</Label>
                                    <FileInput accept=".xlsx, .xls, .csv" placeholder="Select Excel or CSV file" onChange={(e) => setSelectedFile(e.target.files[0])} className="text-slate-900 dark:text-zinc-200" />
                                    <p className="text-[11px] text-slate-500 dark:text-zinc-500 leading-normal">
                                        <strong>Required columns:</strong><br />
                                        {f.testTypeSelection === "coding_programming" ? (
                                            <code>Ques | Description | Input Format | Output Format | Constraints | Test Case 1 | Test Case 2 | Test Case 3 | Test Case 4 | Test Case 5 | Edge Case 1 | Edge Case 2 | Tags</code>
                                        ) : f.manualType === "fillup" && f.testTypeSelection === "aptitude_mcq" ? (
                                            <code>Ques | Corr Ans</code>
                                        ) : (
                                            <code>Ques | Opt A | Opt B | Opt C | Opt D | Corr Ans</code>
                                        )}
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-500 dark:text-zinc-400">Number of questions to select</Label>
                                    <Input type="number" min={1} value={f.questionLimit} onChange={(e) => set({ questionLimit: Number(e.target.value) || 0 })} />
                                    <p className="text-[11px] text-slate-500 dark:text-zinc-500">If Excel has more lines, only the first N questions will be imported & evaluated.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-4">
                                <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">Adaptive Setup</p>
                                
                                {f.testTypeSelection === "coding_test" ? (
                                    <p className="text-xs text-amber-600 dark:text-amber-400">
                                        💡 Questions will be automatically synced and loaded from the <code>AIML</code> folder.
                                    </p>
                                ) : (
                                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                                        Question difficulty adapts dynamically based on candidate performance.
                                    </p>
                                )}

                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-500 dark:text-zinc-400">Adaptive question count</Label>
                                    <Input type="number" value={f.adaptiveCount} onChange={(e) => set({ adaptiveCount: e.target.value })} />
                                </div>
                            </div>
                        )}

                        <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3">
                            <p className="mb-2 text-sm font-medium text-slate-800 dark:text-zinc-200">Assign to</p>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-zinc-300">
                                    <Checkbox checked={f.assignedToAll} onCheckedChange={(v) => set({ assignedToAll: !!v })} />
                                    All students (all batches)
                                </label>
                                {!f.assignedToAll && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-slate-500 dark:text-zinc-500">Batch</Label>
                                            <Select value={f.assignedBatch || "__all__"} onValueChange={(v) => set({ assignedBatch: v === "__all__" ? "" : v })}>
                                                <SelectTrigger><SelectValue placeholder="Any batch" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__all__">Any batch</SelectItem>
                                                    {batches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-slate-500 dark:text-zinc-500">Or specific reg numbers (comma separated)</Label>
                                            <Input value={f.assignedRegNos} onChange={(e) => set({ assignedRegNos: e.target.value })} placeholder="23CS001, 23CS002" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3">
                            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-zinc-200"><ShieldCheck className="h-4 w-4 text-amber-500 dark:text-amber-400" /> Proctoring</p>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-zinc-300">
                                    <Checkbox checked={f.proctoringEnabled} onCheckedChange={(v) => set({ proctoringEnabled: !!v })} />
                                    Enable proctoring (camera + mic + fullscreen + AI face/voice analysis)
                                </label>
                                {f.proctoringEnabled && (
                                    <div className="grid grid-cols-3 gap-3 pt-1">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-zinc-500">Max violations</Label>
                                            <Input type="number" value={f.proctoringMax} onChange={(e) => set({ proctoringMax: e.target.value })} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-zinc-500">Snapshot every (sec)</Label>
                                            <Input type="number" value={f.proctoringInterval} onChange={(e) => set({ proctoringInterval: e.target.value })} />
                                        </div>
                                        <div className="flex items-end pb-1">
                                            <label className="flex items-center gap-2 text-sm text-zinc-300">
                                                <Checkbox checked={f.proctoringAuto} onCheckedChange={(v) => set({ proctoringAuto: !!v })} />
                                                Auto-submit at limit
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                            <Button onClick={create} disabled={busy || !f.title.trim()}>{busy ? "Creating..." : "Create Test"}</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Assign dialog */}
            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Assign Test</DialogTitle>
                        <DialogDescription>{assignTarget?.title}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <label className="flex items-center gap-2 text-sm text-zinc-300">
                            <Checkbox checked={assignF.all} onCheckedChange={(v) => setAssignF({ ...assignF, all: !!v })} />
                            Assign to all students
                        </label>
                        {!assignF.all && (
                            <>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Batch</Label>
                                    <Select value={assignF.batch || "__all__"} onValueChange={(v) => setAssignF({ ...assignF, batch: v === "__all__" ? "" : v })}>
                                        <SelectTrigger><SelectValue placeholder="Any batch" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__all__">Any batch</SelectItem>
                                            {batches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Reg no. or roll no. (comma separated)</Label>
                                    <Input value={assignF.regNos} onChange={(e) => setAssignF({ ...assignF, regNos: e.target.value })} placeholder="2023001, 23CS002" />
                                </div>
                            </>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
                            <Button onClick={doAssign} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Save Assignment</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Test Analytics popup dialog */}
            <Dialog open={testAnalytics !== null} onOpenChange={(open) => { if (!open) setTestAnalytics(null); }}>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Test Performance Analytics</DialogTitle>
                        <DialogDescription>
                            Overall metrics and student completions for: <strong className="text-slate-800 dark:text-zinc-100">{testAnalytics?.test?.title}</strong>
                        </DialogDescription>
                    </DialogHeader>

                    {testAnalytics && (
                        <div className="space-y-6 pt-4">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3 text-center">
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{testAnalytics.stats?.averageScore}%</p>
                                    <p className="text-[10px] text-slate-500 dark:text-zinc-500 uppercase font-semibold">Average Score</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3 text-center">
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{testAnalytics.stats?.bestScore}%</p>
                                    <p className="text-[10px] text-slate-500 dark:text-zinc-500 uppercase font-semibold">Best Score</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3 text-center">
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{testAnalytics._count?.attempts ?? 0}</p>
                                    <p className="text-[10px] text-slate-500 dark:text-zinc-500 uppercase font-semibold">Total Completed</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3 text-center">
                                    <p className="text-2xl font-bold text-emerald-650 dark:text-emerald-400">
                                        {Math.round(((testAnalytics.results?.passed || 0) / (testAnalytics._count?.attempts || 1)) * 100)}%
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-zinc-500 uppercase font-semibold">Pass Rate</p>
                                </div>
                            </div>

                            {/* Chart representation */}
                            {testAnalytics.attempts?.length > 0 && (
                                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4">
                                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-zinc-400 flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-violet-500" /> Score Distribution Chart</p>
                                    <div className="h-48 pr-4">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={testAnalytics.attempts.slice(0, 15).map(a => ({ name: a.studentName || a.studentRegNo, score: a.score }))}>
                                                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-zinc-800/40" />
                                                <XAxis dataKey="name" tick={{ fill: 'currentColor', opacity: 0.6 }} className="text-[10px] text-slate-500 dark:text-zinc-500" />
                                                <YAxis tick={{ fill: 'currentColor', opacity: 0.6 }} className="text-[10px] text-slate-500" />
                                                <RechartsTooltip />
                                                <Bar dataKey="score" fill="#8b5cf6" name="Score" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* Student Attempts Table */}
                            <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-zinc-400">Student Attempts Listing</p>
                                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Student</TableHead>
                                                <TableHead>Score</TableHead>
                                                <TableHead>Outcome</TableHead>
                                                <TableHead>Violations</TableHead>
                                                <TableHead>Completed Date</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(testAnalytics.attempts || []).map((a) => (
                                                <TableRow key={a.id} className="hover:bg-slate-50/40 dark:hover:bg-zinc-800/10">
                                                    <TableCell>
                                                        <p className="font-semibold text-slate-800 dark:text-zinc-200">{a.studentName}</p>
                                                        <p className="text-xs text-slate-500">{a.studentRegNo}</p>
                                                    </TableCell>
                                                    <TableCell className="text-slate-800 dark:text-zinc-200 font-medium">
                                                        {a.score} / {a.totalScore}
                                                    </TableCell>
                                                    <TableCell className="capitalize">
                                                        <span className={cn(
                                                            "rounded-full px-2 py-0.5 text-xs font-bold",
                                                            a.result === "passed" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                                                            a.result === "failed" ? "bg-red-50 dark:bg-red-500/10 text-red-650 dark:text-red-400" :
                                                            "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300"
                                                        )}>
                                                            {a.result || "completed"}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={cn(
                                                            "font-medium",
                                                            a.violationCount > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-slate-500 dark:text-zinc-500"
                                                        )}>
                                                            {a.violationCount}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-slate-500">
                                                        {a.completedAt ? new Date(a.completedAt).toLocaleString() : "—"}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            className="text-red-500 font-semibold cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/20"
                                                            onClick={() => handleResetAttempt(a.id, testAnalytics.test)}
                                                        >
                                                            Reset Attempt
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {!(testAnalytics.attempts || []).length && (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="py-6 text-center text-sm text-slate-500">No attempts completed yet.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function emptyForm() {
    return {
        title: "",
        description: "",
        testTypeSelection: "aptitude_mcq",
        mode: "fixed",
        manualType: "mcq",
        questionLimit: 50,
        durationMin: 30,
        passingScore: 50,
        assignedToAll: true,
        assignedBatch: "",
        assignedRegNos: "",
        proctoringEnabled: true,
        proctoringMax: 5,
        proctoringAuto: true,
        proctoringInterval: 20,
        adaptiveCount: 10,
    };
}
