import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Users, ClipboardList, Code2, BrainCircuit, CheckCircle2, BarChart3, Clock, TrendingUp, ShieldCheck, AlertTriangle, Camera, Eye, Download, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { InlineSelect } from "@/components/ui/inline-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader, EmptyState, LoadingState } from "@/components/portal/primitives";
import { TestAttemptReport } from "@/components/assessment/test-attempt-report";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { downloadExcel } from "@/lib/excel-export";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from "recharts";

const VIOLATION_LABELS = {
    PHONE_DETECTED: "Phone detected",
    ELECTRONIC_DEVICE: "Electronic device",
    MULTIPLE_PERSONS: "Multiple people",
    MULTIPLE_FACES: "Multiple faces",
    NO_FACE: "Face not visible",
    CANDIDATE_NOT_VISIBLE: "Candidate not visible",
    IDENTITY_MISMATCH: "Identity mismatch",
    IMPOSTER_DETECTED: "Imposter detected",
    LOOKING_AWAY: "Looking away",
    HEAD_TURNED_AWAY: "Head turned away",
    EYES_CLOSED: "Eyes closed",
    VOICE_DETECTED: "Voice detected",
    TAB_SWITCH: "Tab switch",
    WINDOW_BLUR: "Window focus lost",
    FULLSCREEN_EXIT: "Fullscreen exit",
    ESCAPE_PRESSED: "Escape pressed",
    F5_REFRESH: "Page refresh",
    DEV_TOOLS: "Developer tools",
    RIGHT_CLICK: "Right click",
    COPY_ATTEMPT: "Copy attempt",
    PASTE_ATTEMPT: "Paste attempt",
    SCREEN_CAPTURE: "Screen capture",
    CAMERA_LOST: "Camera lost",
    MIC_LOST: "Microphone lost",
};

function violationLabel(type) {
    if (VIOLATION_LABELS[type]) return VIOLATION_LABELS[type];
    return String(type || "")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function severityClass(severity) {
    if (severity === "high") return "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30";
    if (severity === "low") return "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700";
    return "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30";
}

function toDatetimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function previouslyAssignedBatches(test) {
    return new Set([
        ...(Array.isArray(test?.assignedBatches) ? test.assignedBatches : []),
        test?.assignedBatch,
    ].filter(Boolean).map(String));
}

function batchOptions(batches, test, includePlaceholder = false) {
    const assignedBatches = previouslyAssignedBatches(test);
    return [
        ...(includePlaceholder ? [{ value: "__select_batch__", label: "Select one batch" }] : []),
        ...batches.map((batch) => {
            const alreadyAssigned = assignedBatches.has(String(batch));
            return {
                value: batch,
                label: alreadyAssigned ? `${batch} (Already assigned)` : batch,
                disabled: alreadyAssigned,
            };
        }),
    ];
}

function AssignmentBadge({ t }) {
    if (t.assignedToAll) return <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">Legacy all-student assignment</span>;
    const assignedBatches = previouslyAssignedBatches(t);
    if (assignedBatches.length) {
        return (
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
                {assignedBatches.length === 1 ? `Batch ${assignedBatches[0]}` : `${assignedBatches.length} batches`}
                {t.assignedStudents?.length ? ` · ${t.assignedStudents.length} students` : ""}
            </span>
        );
    }
    if (t.assignedStudents?.length) return <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400">{t.assignedStudents.length} students</span>;
    return <span className="rounded-full bg-slate-100 dark:bg-zinc-500/10 px-2 py-0.5 text-xs text-slate-500 dark:text-zinc-400">Not assigned</span>;
}

export default function StaffTests() {
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [editingTest, setEditingTest] = useState(null);
    const [assignOpen, setAssignOpen] = useState(false);
    const [assignTarget, setAssignTarget] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [batches, setBatches] = useState([]);
    const [audienceStudents, setAudienceStudents] = useState([]);
    const [audienceStudentsLoading, setAudienceStudentsLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportBatchDialogOpen, setExportBatchDialogOpen] = useState(false);
    const [exportBatch, setExportBatch] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);

    // Grouping & Analytics popup state
    const [expandedTestId, setExpandedTestId] = useState(null);
    const [testAnalytics, setTestAnalytics] = useState(null);
    const [testAnalyticsView, setTestAnalyticsView] = useState("overview");
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [violationReportAttempt, setViolationReportAttempt] = useState(null);
    const [scoreReportAttempt, setScoreReportAttempt] = useState(null);
    const [scoreReport, setScoreReport] = useState(null);
    const [scoreReportLoading, setScoreReportLoading] = useState(false);
    const [scoreReportError, setScoreReportError] = useState("");

    const [f, setF] = useState(() => emptyForm());
    const [assignF, setAssignF] = useState({ assignmentMode: "batch", batch: "", audienceBatch: "", assignedStudents: [] });

    const load = useCallback(() => {
        setLoading(true);
        return api.tests.list()
            .then(setTests)
            .catch((error) => {
                setTests([]);
                alert("Failed to load tests: " + error.message);
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
        api.questions.list({}).then(setQuestions).catch(() => {});
        api.students.batches().then(setBatches).catch(() => {});
    }, [load]);

    useEffect(() => {
        const batch = createOpen && f.assignmentMode === "students"
            ? f.audienceBatch
            : assignOpen && assignF.assignmentMode === "students"
                ? assignF.audienceBatch
                : "";
        if (!batch) {
            setAudienceStudents([]);
            return undefined;
        }
        let cancelled = false;
        setAudienceStudentsLoading(true);
        api.students.list({ batch })
            .then((students) => {
                if (!cancelled) setAudienceStudents(students);
            })
            .catch((error) => {
                if (!cancelled) {
                    setAudienceStudents([]);
                    alert("Failed to load students for assignment: " + error.message);
                }
            })
            .finally(() => {
                if (!cancelled) setAudienceStudentsLoading(false);
            });
        return () => { cancelled = true; };
    }, [createOpen, f.assignmentMode, f.audienceBatch, assignOpen, assignF.assignmentMode, assignF.audienceBatch]);

    const set = (patch) => setF((x) => ({ ...x, ...patch }));

    const openEdit = (test) => {
        setEditingTest(test);
        setF({
            ...emptyForm(),
            title: test.title || "",
            description: test.description || "",
            topicsText: (test.topics || []).join(", "),
            startsAt: toDatetimeLocal(test.startsAt),
            endsAt: toDatetimeLocal(test.endsAt),
            testTypeSelection: test.type === "coding" ? "coding_mcq" : "aptitude_mcq",
            mode: test.mode || "fixed",
            durationMin: test.durationMin || 30,
            passingScore: test.passingScore ?? 50,
            assignedBatch: test.assignedBatch || "",
            assignmentMode: test.assignmentMode || (test.assignedBatch ? "batch" : "students"),
            audienceBatch: test.assignedBatch || batches[0] || "",
            assignedStudents: test.assignedStudents || [],
            emailReminderEnabled: test.emailReminderEnabled === true,
            faceVerificationEnabled: test.proctoring?.faceVerification !== false,
            proctoringMax: test.proctoring?.maxViolations || 1,
            proctoringAuto: test.proctoring?.autoSubmit !== false,
            proctoringReviewOnly: test.proctoring?.reviewOnly !== false,
            proctoringInterval: test.proctoring?.snapshotIntervalSec || 20,
            adaptiveCount: test.adaptive?.totalQuestions || 10,
        });
        setSelectedFile(null);
        setCreateOpen(true);
    };

    const openAnalytics = async (t) => {
        setAnalyticsLoading(true);
        setTestAnalyticsView("overview");
        setViolationReportAttempt(null);
        setScoreReportAttempt(null);
        setScoreReport(null);
        setScoreReportError("");
        try {
            const data = await api.reports.perTest(t.id);
            setTestAnalytics(data);
        } catch (e) {
            alert("Failed to load test report: " + e.message);
        } finally {
            setAnalyticsLoading(false);
        }
    };

    const openScoreBreakdown = async (attempt) => {
        setScoreReportAttempt(attempt);
        setScoreReport(null);
        setScoreReportError("");
        setScoreReportLoading(true);
        setTestAnalyticsView("score");
        try {
            setScoreReport(await api.tests.result(attempt.id));
        } catch (error) {
            setScoreReportError(`Failed to load question breakdown: ${error.message}`);
        } finally {
            setScoreReportLoading(false);
        }
    };

    const exportTestAnalytics = async () => {
        if (!testAnalytics) return;
        try {
            const title = testAnalytics.test?.title || "Test";
            const filename = title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
            const scoreHeader = `${title} (Overall score: ${testAnalytics.stats?.totalScore ?? 0})`;
            const violationsHeader = `${title} - Violations`;
            const attemptsByStudent = new Map();
            for (const attempt of testAnalytics.attempts || []) {
                if (!attemptsByStudent.has(attempt.studentRegNo)) {
                    attemptsByStudent.set(attempt.studentRegNo, attempt);
                }
            }
            const rows = (testAnalytics.assignedStudents || []).map((student) => {
                const attempt = attemptsByStudent.get(student.regNo);
                return {
                    "Reg No": student.regNo,
                    "Roll No": student.rollNo || "",
                    Name: student.name || "",
                    [scoreHeader]: attempt ? attempt.score ?? 0 : "-",
                    [violationsHeader]: attempt ? attempt.violationCount ?? 0 : "-",
                };
            });
            await downloadExcel(`${filename || "Test"}-Results`, rows, "Test Results");
        } catch (error) {
            alert(`Failed to export test results: ${error.message}`);
        }
    };

    const testAudienceForBatch = (test, students, batch) => {
        if (test.assignedToAll) return students;
        const selectedIdentifiers = new Set((test.assignedStudents || []).map(String));
        const assignedBatches = previouslyAssignedBatches(test);
        return students.filter((student) => (
            (assignedBatches.includes(batch) && student.batch === batch)
            || selectedIdentifiers.has(String(student.regNo))
            || selectedIdentifiers.has(String(student.rollNo))
        ));
    };

    const exportAllTests = async () => {
        if (!tests.length || !exportBatch) {
            alert("Select a batch before exporting overall test results.");
            return;
        }
        setExportBatchDialogOpen(false);
        setExporting(true);
        try {
            const batchStudents = await api.students.list({ batch: exportBatch });
            const relevantTests = tests.filter((test) => (
                testAudienceForBatch(test, batchStudents, exportBatch).length > 0
            ));
            const reports = await Promise.all(relevantTests.map(async (test) => ({
                test,
                report: await api.reports.perTest(test.id),
            })));
            const rows = batchStudents.map((student) => ({
                "Reg No": student.regNo || "",
                "Roll No": student.rollNo || "",
                Name: student.name || "",
            }));
            const columnCounts = new Map();
            for (const { test, report } of reports) {
                const baseTitle = test.title || "Test";
                const count = (columnCounts.get(baseTitle) || 0) + 1;
                columnCounts.set(baseTitle, count);
                const title = count === 1 ? baseTitle : `${baseTitle} (${count})`;
                const scoreHeader = `${title} (Overall score: ${report.stats?.totalScore ?? 0})`;
                const violationsHeader = `${title} - Violations`;
                const assignedRegNos = new Set((report.assignedStudents || [])
                    .map((assignedStudent) => String(assignedStudent.regNo)));
                const audienceInBatch = testAudienceForBatch(test, batchStudents, exportBatch);
                for (const student of audienceInBatch) assignedRegNos.add(String(student.regNo));
                const attemptsByStudent = new Map();
                for (const attempt of report.attempts || []) {
                    const regNo = String(attempt.studentRegNo);
                    if (!attemptsByStudent.has(regNo)) attemptsByStudent.set(regNo, attempt);
                }
                for (const row of rows) {
                    const regNo = String(row["Reg No"]);
                    if (!assignedRegNos.has(regNo)) {
                        row[scoreHeader] = "";
                        row[violationsHeader] = "";
                        continue;
                    }
                    const attempt = attemptsByStudent.get(regNo);
                    row[scoreHeader] = attempt ? attempt.score ?? 0 : "-";
                    row[violationsHeader] = attempt ? attempt.violationCount ?? 0 : "-";
                }
            }
            const batchFilename = exportBatch.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
            await downloadExcel(`Overall-Test-Results-${batchFilename || "Batch"}`, rows, "Test Results");
        } catch (error) {
            alert(`Failed to export overall test results: ${error.message}`);
        } finally {
            setExporting(false);
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
        if (f.assignmentMode === "batch" && !f.assignedBatch) {
            alert("Select one batch for this test.");
            return;
        }
        if (f.assignmentMode === "students" && !f.assignedStudents.length) {
            alert("Select at least one student for this test.");
            return;
        }
        const topics = f.topicsText.split(/[,;]/).map((topic) => topic.trim()).filter(Boolean);
        if (!topics.length) {
            alert("Add at least one test topic.");
            return;
        }
        if (!f.startsAt || !f.endsAt) {
            alert("Set both the test start and end time.");
            return;
        }
        const startsAt = new Date(f.startsAt);
        const endsAt = new Date(f.endsAt);
        if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) {
            alert("The test end time must be later than its start time.");
            return;
        }
        
        const testType = f.testTypeSelection === "aptitude_mcq" ? "aptitude" : "coding";
        const manualType = f.testTypeSelection === "coding_programming" ? "programming" : "mcq";
        setBusy(true);
        try {
            let fixedQuestionIds = [];
            
            if (f.mode === "fixed") {
                if (editingTest) {
                    fixedQuestionIds = editingTest.fixedQuestionIds || [];
                } else if (!selectedFile) {
                    alert("Please upload the questions Excel file.");
                    setBusy(false);
                    return;
                } else {
                    const importRes = await api.tests.importQuestions(selectedFile, {
                        testType,
                        manualType,
                        questionLimit: Number(f.questionLimit) || 0
                    });
                    fixedQuestionIds = importRes.questionIds;
                }
            }

            const payload = {
                title: f.title,
                description: f.description,
                topics,
                startsAt: startsAt.toISOString(),
                endsAt: endsAt.toISOString(),
                type: testType,
                mode: f.mode,
                durationMin: Number(f.durationMin) || 30,
                passingScore: Number(f.passingScore) || 50,
                proctoring: {
                    enabled: true,
                    faceVerification: f.faceVerificationEnabled,
                    maxViolations: Number(f.proctoringMax) || 1,
                    autoSubmit: f.proctoringAuto,
                    reviewOnly: f.proctoringReviewOnly,
                    snapshotIntervalSec: Number(f.proctoringInterval) || 20,
                },
                adaptive: f.mode === "adaptive" ? { totalQuestions: Number(f.adaptiveCount) || 10, questionFilter: null } : undefined,
                fixedQuestionIds,
                allowedLanguages: testType === "coding" ? ["c", "cpp", "java", "python"] : undefined,
                assignedToAll: false,
                assignmentMode: f.assignmentMode,
                assignedBatch: f.assignedBatch,
                emailReminderEnabled: f.emailReminderEnabled,
                assignedStudents: f.assignedStudents,
            };
            
            if (editingTest) await api.tests.update(editingTest.id, payload);
            else await api.tests.create(payload);
            setCreateOpen(false);
            setEditingTest(null);
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
        setAssignF({
            assignmentMode: "batch",
            batch: "",
            audienceBatch: batches[0] || "",
            assignedStudents: [],
        });
        setAssignOpen(true);
    };

    const doAssign = async () => {
        if (!assignTarget) return;
        if (assignF.assignmentMode === "batch" && !assignF.batch) {
            alert("Select one batch for this test.");
            return;
        }
        if (assignF.assignmentMode === "students" && !assignF.assignedStudents.length) {
            alert("Select at least one student for this test.");
            return;
        }
        if (assignF.assignmentMode === "batch" && previouslyAssignedBatches(assignTarget).has(assignF.batch)) {
            alert("This test was already assigned to that batch. Choose a different batch.");
            return;
        }
        setBusy(true);
        try {
            await api.tests.assign(assignTarget.id, assignF.assignmentMode === "batch"
                ? { assignmentMode: "batch", batch: assignF.batch }
                : { assignmentMode: "students", assignedStudents: assignF.assignedStudents });
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
        setSelectedIds((ids) => ids.filter((id) => id !== t.id));
        load();
    };

    const removeSelected = async () => {
        if (!selectedIds.length || !confirm(`Delete ${selectedIds.length} selected test${selectedIds.length === 1 ? "" : "s"} and all their attempts?`)) return;
        setBusy(true);
        try {
            await Promise.all(selectedIds.map((id) => api.tests.remove(id)));
            setSelectedIds([]);
        } catch (e) {
            alert(e.message);
        } finally {
            load();
            setBusy(false);
        }
    };

    const reportViolations = violationReportAttempt?.violations || [];
    const reportViolationTypes = [...new Set(reportViolations.map((violation) => violation.type || "UNKNOWN"))];
    const reportHighSeverityCount = reportViolations.filter((violation) => violation.severity === "high").length;
    const reportEvidenceCount = reportViolations.filter((violation) => violation.cameraFrameUrl).length;

    return (
        <div>
            <PageHeader
                title="Tests"
                description="Create and assign assessment tests"
                action={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => {
                            setExportBatch(batches[0] || "");
                            setExportBatchDialogOpen(true);
                        }} disabled={loading || exporting || tests.length === 0 || batches.length === 0}>
                            <Download className="h-4 w-4" /> {exporting ? "Exporting..." : "Export Overall Excel"}
                        </Button>
                        {selectedIds.length > 0 && <Button variant="destructive" onClick={removeSelected} disabled={busy}><Trash2 className="h-4 w-4" /> Delete selected ({selectedIds.length})</Button>}
                        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create Test</Button>
                    </div>
                }
            />

            <Dialog open={exportBatchDialogOpen} onOpenChange={setExportBatchDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Export test results</DialogTitle>
                        <DialogDescription>Choose one batch. The spreadsheet includes only students in that batch and tests assigned to them.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-slate-600 dark:text-zinc-300">Batch</Label>
                            <InlineSelect
                                ariaLabel="Batch for overall test results"
                                value={exportBatch || "__select_batch__"}
                                onValueChange={(value) => setExportBatch(value === "__select_batch__" ? "" : value)}
                                options={[
                                    { value: "__select_batch__", label: "Select one batch" },
                                    ...batches.map((batch) => ({ value: batch, label: batch })),
                                ]}
                            />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-zinc-400">
                            Each test has a score column and a violation-count column. Assigned students who did not attend are marked “-”.
                        </p>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setExportBatchDialogOpen(false)}>Cancel</Button>
                            <Button onClick={exportAllTests} disabled={!exportBatch || exporting}>
                                <Download className="h-4 w-4" /> {exporting ? "Exporting..." : "Download Excel"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                <CardContent className="p-0">
                    {loading ? (
                        <LoadingState label="Loading tests" className="py-10" />
                    ) : tests.length === 0 ? (
                        <div className="p-10">
                            <EmptyState icon={ClipboardList} title="No tests yet" description="Create your first test to assign it to students." />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                        <Table className="min-w-[900px]">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10"><Checkbox checked={tests.length > 0 && tests.every((t) => selectedIds.includes(t.id))} onCheckedChange={(checked) => setSelectedIds(checked ? tests.map((t) => t.id) : [])} aria-label="Select all tests" /></TableHead>
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
                                        <TableCell><Checkbox checked={selectedIds.includes(t.id)} onCheckedChange={(checked) => setSelectedIds((ids) => checked ? [...new Set([...ids, t.id])] : ids.filter((id) => id !== t.id))} aria-label={`Select ${t.title}`} /></TableCell>
                                        <TableCell>
                                            <div className="min-w-0">
                                                <p onClick={() => openAnalytics(t)} className="font-semibold text-slate-805 dark:text-zinc-100 cursor-pointer hover:text-violet-650 dark:hover:text-violet-400 hover:underline">
                                                    {t.title}
                                                </p>
                                                <p className="max-w-[200px] sm:max-w-[240px] truncate text-xs text-slate-500 dark:text-zinc-500">{t.description}</p>
                                                <p className="mt-1 max-w-[260px] truncate text-[11px] text-violet-600 dark:text-violet-400">
                                                    {(t.topics || []).join(", ") || "No topics"}
                                                </p>
                                                {t.startsAt && t.endsAt && (
                                                    <p className="mt-1 text-[10px] text-slate-500 dark:text-zinc-500">
                                                        {new Date(t.startsAt).toLocaleString()} – {new Date(t.endsAt).toLocaleString()}
                                                    </p>
                                                )}
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
                                                <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /> Edit</Button>
                                                <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => openAnalytics(t)}><BarChart3 className="h-4 w-4" /> Analytics</Button>
                                                <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => openAssign(t)}><Users className="h-4 w-4" /> Assign</Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-650 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300 cursor-pointer" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Test dialog */}
            <Dialog open={createOpen} onOpenChange={(open) => {
                setCreateOpen(open);
                if (!open) {
                    setEditingTest(null);
                    setF(emptyForm());
                    setSelectedFile(null);
                }
            }}>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingTest ? "Edit Test" : "Create Test"}</DialogTitle>
                        <DialogDescription>{editingTest ? "Update test details, availability, batch, and proctoring settings." : "Configure the test and import questions."}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
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
                                <InlineSelect
                                    ariaLabel="Test type"
                                    value={f.testTypeSelection}
                                    onValueChange={(v) => set({ testTypeSelection: v, mode: "fixed", manualType: v === "coding_programming" ? "programming" : "mcq" })}
                                    options={[
                                        { value: "aptitude_mcq", label: "Aptitude MCQ" },
                                        { value: "coding_mcq", label: "Coding MCQ" },
                                        { value: "coding_programming", label: "Coding Programming" },
                                    ]}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">Mode</Label>
                                <InlineSelect
                                    ariaLabel="Test mode"
                                    value={f.mode}
                                    onValueChange={(v) => set({ mode: v })}
                                    disabled={f.testTypeSelection === "coding_mcq"}
                                    options={[
                                        { value: "fixed", label: "Manual (Upload Excel)" },
                                        { value: "adaptive", label: "Adaptive" },
                                    ]}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">Duration (minutes)</Label>
                                <Input type="number" value={f.durationMin} onChange={(e) => set({ durationMin: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">Passing score (%)</Label>
                                <Input type="number" value={f.passingScore} onChange={(e) => set({ passingScore: e.target.value })} />
                            </div>
                            <div className="col-span-2 space-y-1.5">
                                <Label className="text-xs text-zinc-400">Test topics</Label>
                                <Input
                                    value={f.topicsText}
                                    onChange={(e) => set({ topicsText: e.target.value })}
                                    placeholder="e.g. Percentages, Averages or Mixed"
                                />
                            </div>
                            <div className="col-span-2 grid max-w-2xl grid-cols-2 gap-3">
                                <div className="min-w-0 space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Test available from</Label>
                                    <Input className="h-10 min-w-0 text-sm" type="datetime-local" value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
                                </div>
                                <div className="min-w-0 space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Test available until</Label>
                                    <Input className="h-10 min-w-0 text-sm" type="datetime-local" value={f.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
                                </div>
                            </div>
                            <p className="col-span-2 text-[11px] leading-4 text-slate-500 dark:text-zinc-500">
                                Local time; unfinished attempts are submitted at the end time.
                            </p>
                            <label className="col-span-2 flex items-start gap-2 text-sm text-slate-700 dark:text-zinc-300">
                                <Checkbox checked={f.emailReminderEnabled} onCheckedChange={(checked) => set({ emailReminderEnabled: !!checked })} />
                                <span>
                                    Email students 10 minutes before the test starts
                                </span>
                            </label>
                        </div>

                        {f.mode === "fixed" ? (editingTest ? (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
                                The existing {editingTest.fixedQuestionIds?.length || 0} fixed questions will be retained.
                            </div>
                        ) : (
                            <div className="space-y-4 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-4">
                                <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">Manual Setup (Excel Upload)</p>
                                
                                {f.testTypeSelection === "aptitude_mcq" && (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-slate-500 dark:text-zinc-400">Question Format</Label>
                                        <InlineSelect
                                            ariaLabel="Question format"
                                            value={f.manualType}
                                            onValueChange={(v) => set({ manualType: v })}
                                            options={[
                                                { value: "mcq", label: "MCQ" },
                                                { value: "fillup", label: "Fill up" },
                                            ]}
                                        />
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
                        )) : (
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
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <Label className="text-xs text-slate-500 dark:text-zinc-500">Assignment target</Label>
                                    <InlineSelect
                                        ariaLabel="Assignment target"
                                        value={f.assignmentMode}
                                        onValueChange={(assignmentMode) => set({
                                            assignmentMode,
                                            audienceBatch: f.audienceBatch || f.assignedBatch || batches[0] || "",
                                        })}
                                        options={[
                                            { value: "batch", label: "One batch" },
                                            { value: "students", label: "Selected students" },
                                        ]}
                                    />
                                </div>
                                {f.assignmentMode === "batch" ? (
                                    <div className="space-y-1">
                                        <Label className="text-xs text-slate-500 dark:text-zinc-500">Batch</Label>
                                        <InlineSelect
                                            ariaLabel="Assign to batch"
                                            value={f.assignedBatch || "__select_batch__"}
                                            onValueChange={(value) => set({ assignedBatch: value === "__select_batch__" ? "" : value })}
                                            options={batchOptions(batches, editingTest, true)}
                                        />
                                        {editingTest && <p className="text-xs text-slate-500 dark:text-zinc-500">Previously assigned batches cannot be selected again.</p>}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-slate-500 dark:text-zinc-500">Show students from</Label>
                                            <InlineSelect
                                                ariaLabel="Filter students by batch"
                                                value={f.audienceBatch || "__select_batch__"}
                                                onValueChange={(value) => set({ audienceBatch: value === "__select_batch__" ? "" : value })}
                                                options={[
                                                    { value: "__select_batch__", label: "Select a batch" },
                                                    ...batches.map((batch) => ({ value: batch, label: batch })),
                                                ]}
                                            />
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-zinc-500">{f.assignedStudents.length} selected. Only selected students can access this test.</p>
                                        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
                                            {audienceStudentsLoading ? (
                                                <p className="p-3 text-center text-xs text-slate-500">Loading students...</p>
                                            ) : audienceStudents.map((student) => (
                                                <label key={student.regNo} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800">
                                                    <Checkbox
                                                        checked={f.assignedStudents.includes(student.regNo)}
                                                        onCheckedChange={(checked) => set({
                                                            assignedStudents: checked
                                                                ? [...new Set([...f.assignedStudents, student.regNo])]
                                                                : f.assignedStudents.filter((regNo) => regNo !== student.regNo),
                                                        })}
                                                    />
                                                    <span className="min-w-0">
                                                        <span className="block truncate">{student.name}</span>
                                                        <span className="block text-xs text-slate-500">{student.regNo}</span>
                                                    </span>
                                                </label>
                                            ))}
                                            {!audienceStudentsLoading && audienceStudents.length === 0 && (
                                                <p className="p-3 text-center text-xs text-slate-500">Select a batch to load students.</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3">
                            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-zinc-200"><ShieldCheck className="h-4 w-4 text-amber-500 dark:text-amber-400" /> Proctoring</p>
                            <div className="space-y-2">
                                <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-zinc-300">
                                    <Checkbox checked={f.faceVerificationEnabled} onCheckedChange={(v) => set({ faceVerificationEnabled: !!v })} />
                                    <span>Face identity checks only (fullscreen monitoring stays on)</span>
                                </label>
                                <p className="text-xs text-slate-500 dark:text-zinc-500">
                                    Camera, microphone, fullscreen, and other proctoring checks stay enabled. Only face identity verification can be turned off.
                                </p>
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
                                <label className="flex items-start gap-2 pt-1 text-sm text-slate-700 dark:text-zinc-300">
                                    <Checkbox className="mt-0.5" checked={f.proctoringReviewOnly} onCheckedChange={(v) => set({ proctoringReviewOnly: !!v })} />
                                    <span>Review only &mdash; record violations with snapshots for staff, but never auto-submit or lock the student</span>
                                </label>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                            <Button onClick={create} disabled={busy || !f.title.trim() || (f.assignmentMode === "batch" ? !f.assignedBatch : !f.assignedStudents.length)}>{busy ? "Saving..." : editingTest ? "Save Changes" : "Create Test"}</Button>
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
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">Assignment target</Label>
                                <InlineSelect
                                    ariaLabel="Assignment target"
                                    value={assignF.assignmentMode}
                                    onValueChange={(assignmentMode) => setAssignF((current) => ({
                                        ...current,
                                        assignmentMode,
                                        audienceBatch: current.audienceBatch || batches[0] || "",
                                    }))}
                                    options={[
                                        { value: "batch", label: "One batch" },
                                        { value: "students", label: "Selected students" },
                                    ]}
                                />
                            </div>
                            {assignF.assignmentMode === "batch" ? (
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Batch</Label>
                                    <InlineSelect
                                        ariaLabel="Assign to batch"
                                        value={assignF.batch || "__select_batch__"}
                                        onValueChange={(value) => setAssignF((current) => ({ ...current, batch: value === "__select_batch__" ? "" : value }))}
                                        options={batchOptions(batches, assignTarget, true)}
                                    />
                                    <p className="text-xs text-slate-500 dark:text-zinc-500">Existing batch assignments stay active and cannot be selected again.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-zinc-400">Show students from</Label>
                                        <InlineSelect
                                            ariaLabel="Filter students by batch"
                                            value={assignF.audienceBatch || "__select_batch__"}
                                            onValueChange={(value) => setAssignF((current) => ({ ...current, audienceBatch: value === "__select_batch__" ? "" : value }))}
                                            options={[
                                                { value: "__select_batch__", label: "Select a batch" },
                                                ...batches.map((batch) => ({ value: batch, label: batch })),
                                            ]}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500">
                                        {assignF.assignedStudents.length} selected. Existing assignments are kept when you add students.
                                    </p>
                                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-zinc-800">
                                        {audienceStudentsLoading ? (
                                            <p className="p-3 text-center text-xs text-slate-500">Loading students...</p>
                                        ) : audienceStudents.map((student) => (
                                            <label key={student.regNo} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800">
                                                <Checkbox
                                                    checked={assignF.assignedStudents.includes(student.regNo)}
                                                    onCheckedChange={(checked) => setAssignF((current) => ({
                                                        ...current,
                                                        assignedStudents: checked
                                                            ? [...new Set([...current.assignedStudents, student.regNo])]
                                                            : current.assignedStudents.filter((regNo) => regNo !== student.regNo),
                                                    }))}
                                                />
                                                <span>{student.name} · {student.regNo}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
                            <Button onClick={doAssign} disabled={busy || (assignF.assignmentMode === "batch" ? !assignF.batch : !assignF.assignedStudents.length)}><CheckCircle2 className="h-4 w-4" /> Save Assignment</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Test Analytics popup dialog */}
            <Dialog open={testAnalytics !== null && !["violations", "score"].includes(testAnalyticsView)} onOpenChange={(open) => {
                if (!open) {
                    setTestAnalytics(null);
                    setTestAnalyticsView("overview");
                }
            }}>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{testAnalyticsView === "attempts" ? "Student Attempts" : "Test Performance Analytics"}</DialogTitle>
                        <DialogDescription>
                            {testAnalyticsView === "attempts" ? "Completed attempts for: " : "Overall metrics and student completions for: "}
                            <strong className="text-slate-800 dark:text-zinc-100">{testAnalytics?.test?.title}</strong>
                        </DialogDescription>
                        {testAnalytics && testAnalyticsView === "overview" && (
                            <Button variant="outline" size="sm" onClick={exportTestAnalytics} disabled={!testAnalytics.attempts?.length}>
                                <Download className="h-4 w-4" /> Export results
                            </Button>
                        )}
                    </DialogHeader>

                    {testAnalytics && testAnalyticsView === "overview" && (
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
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                onClick={() => setTestAnalyticsView("attempts")}
                                disabled={!testAnalytics.attempts?.length}
                            >
                                <Users className="h-4 w-4" /> View Student Attempts ({testAnalytics.attempts?.length || 0})
                            </Button>
                        </div>
                    )}
                    {testAnalytics && testAnalyticsView === "attempts" && (
                        <div className="space-y-4 pt-2">
                            <Button type="button" variant="outline" onClick={() => setTestAnalyticsView("overview")}>
                                Back to performance analytics
                            </Button>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-zinc-800">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Student</TableHead>
                                            <TableHead>Score Breakdown</TableHead>
                                            <TableHead>Completed Date / Time</TableHead>
                                            <TableHead>Outcome</TableHead>
                                            <TableHead>View Violations</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(testAnalytics.attempts || []).map((attempt) => (
                                            <TableRow key={attempt.id}>
                                                <TableCell>
                                                    <p className="font-semibold text-slate-800 dark:text-zinc-200">{attempt.studentName || "Student"}</p>
                                                    <p className="text-xs text-slate-500 dark:text-zinc-400">{attempt.studentRegNo}</p>
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={scoreReportLoading || attempt.status === "flagged"}
                                                        onClick={() => openScoreBreakdown(attempt)}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                        {attempt.score ?? 0} / {attempt.totalScore ?? "—"}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="text-xs text-slate-500 dark:text-zinc-400">
                                                    {attempt.completedAt ? new Date(attempt.completedAt).toLocaleString() : "—"}
                                                </TableCell>
                                                <TableCell className="capitalize">{attempt.result || "completed"}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setViolationReportAttempt(attempt);
                                                            setTestAnalyticsView("violations");
                                                        }}
                                                    >
                                                        <Eye className="h-4 w-4" /> View Violations ({attempt.violationCount ?? attempt.violations?.length ?? 0})
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-red-500 font-semibold hover:bg-red-50 dark:hover:bg-red-950/20"
                                                        onClick={() => handleResetAttempt(attempt.id, testAnalytics.test)}
                                                    >
                                                        Reset Attempt
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {!testAnalytics.attempts?.length && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="py-6 text-center text-sm text-slate-500">No attempts completed yet.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Question-by-question score report */}
            <Dialog open={scoreReportAttempt !== null} onOpenChange={(open) => {
                if (!open) {
                    setScoreReportAttempt(null);
                    setScoreReport(null);
                    setScoreReportError("");
                    setTestAnalyticsView("attempts");
                }
            }}>
                <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Score Breakdown</DialogTitle>
                        <DialogDescription>
                            {scoreReportAttempt?.studentName || "Student"}
                            {scoreReportAttempt?.studentRegNo ? ` · ${scoreReportAttempt.studentRegNo}` : ""}
                            {" · "}
                            {testAnalytics?.test?.title || "Test"}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <Button type="button" variant="outline" onClick={() => {
                            setScoreReportAttempt(null);
                            setScoreReport(null);
                            setScoreReportError("");
                            setTestAnalyticsView("attempts");
                        }}>
                            Back to student attempts
                        </Button>
                        {scoreReportLoading ? (
                            <LoadingState label="Loading question breakdown" className="py-8" />
                        ) : scoreReportError ? (
                            <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                                {scoreReportError}
                            </p>
                        ) : scoreReport ? (
                            <TestAttemptReport attempt={scoreReport} />
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Violation report popup */}
            <Dialog open={violationReportAttempt !== null} onOpenChange={(open) => {
                if (!open) {
                    setViolationReportAttempt(null);
                    setTestAnalyticsView("attempts");
                }
            }}>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Attempt Violation Details</DialogTitle>
                        <DialogDescription>
                            {violationReportAttempt?.studentName || "Student"}
                            {violationReportAttempt?.studentRegNo ? ` · ${violationReportAttempt.studentRegNo}` : ""}
                            {" · "}
                            {testAnalytics?.test?.title || "Test"} · {reportViolations.length} recorded event{reportViolations.length === 1 ? "" : "s"}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 pt-2">
                        <Button type="button" variant="outline" onClick={() => {
                            setViolationReportAttempt(null);
                            setTestAnalyticsView("attempts");
                        }}>
                            Back to student attempts
                        </Button>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {[
                                { label: "Score", value: `${violationReportAttempt?.score ?? 0} / ${violationReportAttempt?.totalScore ?? "—"}` },
                                { label: "Total violations", value: reportViolations.length },
                                { label: "Violation types", value: reportViolationTypes.length },
                                { label: "High severity", value: reportHighSeverityCount },
                            ].map((stat) => (
                                <div key={stat.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                                    <p className="text-xs text-slate-500 dark:text-zinc-400">{stat.label}</p>
                                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-zinc-100">{stat.value}</p>
                                </div>
                            ))}
                        </div>
                        {reportViolationTypes.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {reportViolationTypes.map((type) => (
                                    <span key={type} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                                        {violationLabel(type)} · {reportViolations.filter((violation) => (violation.type || "UNKNOWN") === type).length}
                                    </span>
                                ))}
                            </div>
                        )}
                        <p className="text-xs text-slate-500 dark:text-zinc-400">
                            Camera evidence available for {reportEvidenceCount} of {reportViolations.length} recorded events.
                        </p>
                        <div className="grid gap-3 md:grid-cols-2">
                            {reportViolations.map((v, i) => (
                                <div key={i} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                                    {v.cameraFrameUrl ? (
                                        <img
                                            src={v.cameraFrameUrl}
                                            alt={`Violation snapshot: ${violationLabel(v.type)}`}
                                            className="h-24 w-32 shrink-0 rounded-md border border-slate-200 object-cover dark:border-zinc-700"
                                        />
                                    ) : (
                                        <div className="flex h-24 w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 text-slate-400 dark:border-zinc-700 dark:text-zinc-600">
                                            <Camera className="h-5 w-5" />
                                            <span className="text-[10px]">No snapshot</span>
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate text-sm font-semibold text-slate-800 dark:text-zinc-100">{violationLabel(v.type)}</p>
                                            <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize", severityClass(v.severity))}>
                                                {v.severity || "medium"}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-600 dark:text-zinc-400">{v.description}</p>
                                        <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500">
                                            {v.timestamp ? new Date(v.timestamp).toLocaleString() : ""}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {!reportViolations.length && (
                                <p className="text-sm text-slate-500 dark:text-zinc-500">No violations recorded for this attempt.</p>
                            )}
                        </div>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                            Snapshots are stored privately and served as short-lived signed links.
                            Snapshots are automatically removed after four days; a missing image may also mean Supabase Storage is not configured.
                        </p>
                        <div className="flex justify-end gap-2 pt-1">
                            {violationReportAttempt && (
                                <Button
                                    variant="outline"
                                    className="text-red-500 font-semibold cursor-pointer"
                                    onClick={() => {
                                        const target = violationReportAttempt;
                                        setViolationReportAttempt(null);
                                        setTestAnalyticsView("attempts");
                                        handleResetAttempt(target.id, testAnalytics?.test);
                                    }}
                                >
                                    Reset Attempt
                                </Button>
                            )}
                            <Button variant="outline" onClick={() => {
                                setViolationReportAttempt(null);
                                setTestAnalyticsView("attempts");
                            }}>Close</Button>
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
        topicsText: "",
        startsAt: "",
        endsAt: "",
        testTypeSelection: "aptitude_mcq",
        mode: "fixed",
        manualType: "mcq",
        questionLimit: 50,
        durationMin: 30,
        passingScore: 50,
        assignedBatch: "",
        assignmentMode: "batch",
        audienceBatch: "",
        assignedStudents: [],
        emailReminderEnabled: true,
        faceVerificationEnabled: true,
        proctoringMax: 5,
        proctoringAuto: true,
        proctoringReviewOnly: true,
        proctoringInterval: 20,
        adaptiveCount: 10,
    };
}
