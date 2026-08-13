import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Users, ClipboardList, Code2, BrainCircuit, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

function AssignmentBadge({ t }) {
    if (t.assignedToAll) return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">All batches</span>;
    if (t.assignedBatch) return <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">Batch {t.assignedBatch}</span>;
    if (t.assignedStudents?.length) return <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400">{t.assignedStudents.length} students</span>;
    return <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs text-zinc-400">Not assigned</span>;
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

    const create = async () => {
        if (!f.title.trim()) return;
        
        const testType = f.testTypeSelection === "coding_test" ? "coding" : "aptitude";
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
                    manualType: testType === "aptitude" ? f.manualType : undefined,
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
                    maxViolations: Number(f.proctoringMax) || 5,
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

            <Card className="border-zinc-800/80 bg-zinc-900/40">
                <CardContent className="p-0">
                    {loading ? (
                        <p className="py-10 text-center text-sm text-zinc-500">Loading...</p>
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
                                    <TableRow key={t.id}>
                                        <TableCell>
                                            <p className="font-medium text-zinc-100">{t.title}</p>
                                            <p className="max-w-[240px] truncate text-xs text-zinc-500">{t.description}</p>
                                        </TableCell>
                                        <TableCell>
                                            <span className="flex items-center gap-1.5 text-sm text-zinc-300">
                                                {t.type === "coding" ? <Code2 className="h-3.5 w-3.5 text-violet-400" /> : <BrainCircuit className="h-3.5 w-3.5 text-emerald-400" />}
                                                {t.type}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-300 capitalize">{t.mode}{t.proctoring?.enabled !== false && <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">Proctored</span>}</TableCell>
                                        <TableCell className="text-sm text-zinc-300">{t.durationMin} min</TableCell>
                                        <TableCell className="text-sm text-zinc-300">
                                            {t.mode === "fixed" ? (t.fixedQuestionIds || []).length : t.adaptive?.totalQuestions ?? "adaptive"}
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-300">{t._count?.attempts ?? 0}</TableCell>
                                        <TableCell><AssignmentBadge t={t} /></TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="sm" onClick={() => openAssign(t)}><Users className="h-4 w-4" /> Assign</Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
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
                                <Select value={f.testTypeSelection} onValueChange={(v) => set({ testTypeSelection: v, mode: "fixed" })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="mcq_test">Aptitude / Coding MCQ</SelectItem>
                                        <SelectItem value="coding_test">Coding Test</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">Mode</Label>
                                <Select value={f.mode} onValueChange={(v) => set({ mode: v })}>
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
                            <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                                <p className="text-sm font-medium text-zinc-200">Manual Setup (Excel Upload)</p>
                                
                                {f.testTypeSelection === "mcq_test" && (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-zinc-400">Question Format</Label>
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
                                    <Label className="text-xs text-zinc-400">Questions Excel File (.xlsx, .xls, .csv)</Label>
                                    <Input type="file" accept=".xlsx, .xls, .csv" onChange={(e) => setSelectedFile(e.target.files[0])} className="text-zinc-200 border-zinc-700 bg-zinc-800" />
                                    <p className="text-[11px] text-zinc-500 leading-normal">
                                        <strong>Required columns:</strong><br />
                                        {f.testTypeSelection === "coding_test" ? (
                                            <code>Ques | Description | Input Format | Output Format | Constraints | Test Case 1 | Test Case 2 | Test Case 3 | Test Case 4 | Test Case 5 | Edge Case 1 | Edge Case 2 | Tags</code>
                                        ) : f.manualType === "fillup" ? (
                                            <code>Ques | Corr Ans</code>
                                        ) : (
                                            <code>Ques | Opt A | Opt B | Opt C | Opt D | Corr Ans</code>
                                        )}
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Number of questions to select</Label>
                                    <Input type="number" min={1} value={f.questionLimit} onChange={(e) => set({ questionLimit: Number(e.target.value) || 0 })} />
                                    <p className="text-[11px] text-zinc-500">If Excel has more lines, only the first N questions will be imported & evaluated.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                                <p className="text-sm font-medium text-zinc-200">Adaptive Setup</p>
                                
                                {f.testTypeSelection === "coding_test" ? (
                                    <p className="text-xs text-amber-400">
                                        💡 Questions will be automatically synced and loaded from the <code>AIML</code> folder.
                                    </p>
                                ) : (
                                    <p className="text-xs text-zinc-400">
                                        Question difficulty adapts dynamically based on candidate performance.
                                    </p>
                                )}

                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Adaptive question count</Label>
                                    <Input type="number" value={f.adaptiveCount} onChange={(e) => set({ adaptiveCount: e.target.value })} />
                                </div>
                            </div>
                        )}

                        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                            <p className="mb-2 text-sm font-medium text-zinc-200">Assign to</p>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-zinc-300">
                                    <Checkbox checked={f.assignedToAll} onCheckedChange={(v) => set({ assignedToAll: !!v })} />
                                    All students (all batches)
                                </label>
                                {!f.assignedToAll && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-zinc-500">Batch</Label>
                                            <Select value={f.assignedBatch} onValueChange={(v) => set({ assignedBatch: v })}>
                                                <SelectTrigger><SelectValue placeholder="Any batch" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="">Any batch</SelectItem>
                                                    {batches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-zinc-500">Or specific reg numbers (comma separated)</Label>
                                            <Input value={f.assignedRegNos} onChange={(e) => set({ assignedRegNos: e.target.value })} placeholder="23CS001, 23CS002" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-zinc-200"><ShieldCheck className="h-4 w-4 text-amber-400" /> Proctoring</p>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-zinc-300">
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
                                    <Select value={assignF.batch} onValueChange={(v) => setAssignF({ ...assignF, batch: v })}>
                                        <SelectTrigger><SelectValue placeholder="Any batch" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">Any batch</SelectItem>
                                            {batches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Reg numbers (comma separated)</Label>
                                    <Input value={assignF.regNos} onChange={(e) => setAssignF({ ...assignF, regNos: e.target.value })} placeholder="23CS001, 23CS002" />
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
        </div>
    );
}

function emptyForm() {
    return {
        title: "",
        description: "",
        testTypeSelection: "mcq_test",
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
