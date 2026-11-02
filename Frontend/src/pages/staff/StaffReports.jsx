import { useState, useEffect } from "react";
import { Search, Users, FileCode, BrainCircuit, AlertTriangle, TrendingUp, RefreshCw, Download, Eye, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, EmptyState, LoadingState } from "@/components/portal/primitives";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from "recharts";
import { api } from "@/lib/api";
import { downloadExcel } from "@/lib/excel-export";
import { getStudentSection } from "@/lib/student-section";

export default function StaffReports() {
    const [rows, setRows] = useState([]);
    const [tests, setTests] = useState([]);
    const [testListError, setTestListError] = useState("");
    const [testReport, setTestReport] = useState(null);
    const [selectedTest, setSelectedTest] = useState("");
    const [loading, setLoading] = useState(true);
    const [batch, setBatch] = useState("");
    const [search, setSearch] = useState("");
    const [studentSearchInput, setStudentSearchInput] = useState("");
    const [tab, setTab] = useState("students");
    const [studentAnalyticsOpen, setStudentAnalyticsOpen] = useState(false);
    const [testPopup, setTestPopup] = useState(null);
    const [selectedAttempt, setSelectedAttempt] = useState(null);
    const [batches, setBatches] = useState([]);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        api.students.batches().then(setBatches).catch((error) => {
            console.error("Failed to load student batches:", error.message);
        });
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => setSearch(studentSearchInput.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [studentSearchInput]);

    useEffect(() => {
        if (tab !== "test") return;
        let cancelled = false;
        setTests([]);
        setTestReport(null);
        setTestListError("");
        api.tests.list().then((items) => {
            if (cancelled) return;
            setTests(items);
            if (selectedTest && !items.some((test) => test.id === selectedTest)) {
                setSelectedTest("");
                setTestReport(null);
            }
        }).catch((error) => {
            if (cancelled) return;
            setTests([]);
            setTestReport(null);
            setTestListError(error.message || "Failed to load the tests currently in the staff portal.");
        });
        return () => { cancelled = true; };
    }, [tab, reloadKey]);

    useEffect(() => {
        if (tab !== "students") return;
        setLoading(true);
        api.reports.students({ batch: batch || undefined, search: search || undefined })
            .then(setRows)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [tab, batch, search, reloadKey]);

    useEffect(() => {
        if (tab !== "test" || !selectedTest) return;
        setLoading(true);
        api.reports.perTest(selectedTest)
            .then(setTestReport)
            .catch(() => setTestReport(null))
            .finally(() => setLoading(false));
    }, [tab, selectedTest, reloadKey]);

    const handleResetAttempt = async (attemptId) => {
        if (!confirm("Are you sure you want to reset this student's attempt? They will be able to take the test again from scratch.")) return;
        try {
            await api.tests.resetAttempt(attemptId);
            setSelectedAttempt(null);
            alert("Attempt reset successfully.");
            setReloadKey((k) => k + 1);
        } catch (e) {
            alert("Failed to reset attempt: " + e.message);
        }
    };

    const exportStudentReport = async () => {
        try {
            await downloadExcel("Student-Performance-Report", rows.map((student) => ({
                Name: student.name || "",
                "Registration Number": student.regNo || "",
                "Roll Number": student.rollNo || "",
                Batch: student.batch || "",
                Section: getStudentSection(student.regNo, student.rollNo) || "",
                "Aptitude Tests": student.aptitudeCount ?? 0,
                "Aptitude Average (%)": student.aptitudeAverage ?? "",
                "Latest Aptitude Result": student.lastAptitude?.result || "",
                "Coding Tests": student.codingCount ?? 0,
                "Coding Average (%)": student.codingAverage ?? "",
                "Latest Coding Result": student.lastCoding?.result || "",
                Interviews: student.interviewCount ?? 0,
                "Latest Interview Rating": student.lastInterview?.rating ?? "",
                Violations: student.violationCount ?? 0,
                "Resume Category": student.topCategory || "",
            })), "Student Report");
        } catch (error) {
            alert(`Failed to export student report: ${error.message}`);
        }
    };

    const exportTestReport = async () => {
        if (!testReport) return;
        try {
            const testTitle = testReport.test?.title || "Test";
            const filename = testTitle.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
            await downloadExcel(`${filename || "Test"}-Results`, (testReport.attempts || []).map((attempt) => ({
                Test: testTitle,
                Name: attempt.studentName || "",
                "Registration Number": attempt.studentRegNo || "",
                Score: attempt.score ?? 0,
                "Total Score": attempt.totalScore ?? "",
                Result: attempt.result || "",
                Correct: attempt.correct ?? 0,
                "Total Questions": attempt.totalQuestions ?? 0,
                "Completed At": attempt.completedAt ? new Date(attempt.completedAt).toLocaleString() : "",
            })), "Test Results");
        } catch (error) {
            alert(`Failed to export test report: ${error.message}`);
        }
    };

    const openStudentAnalytics = () => {
        setTab("students");
        setStudentAnalyticsOpen(true);
    };

    const resultColor = (r) => {
        if (r === "selected") return "text-emerald-400";
        if (r === "passed") return "text-blue-400";
        if (r === "failed") return "text-red-400";
        return "text-zinc-400";
    };

    return (
        <div>
            <PageHeader title="Reports" description="Performance analytics across students and tests" />

            <div className="mb-4 flex gap-2">
                <button
                    onClick={openStudentAnalytics}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "students" ? "bg-violet-600 text-white" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"}`}
                >
                    Student Analytics
                </button>
                <button
                    onClick={() => setTab("test")}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "test" ? "bg-violet-600 text-white" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"}`}
                >
                    Per Test
                </button>
            </div>

            {tab === "students" && (
                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardHeader className="space-y-3">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">Student analytics</h2>
                            <p className="text-sm text-slate-500 dark:text-zinc-400">Search and review individual student performance in a dedicated popup.</p>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={openStudentAnalytics}>
                            <Users className="h-4 w-4" /> Open student analytics
                        </Button>
                    </CardContent>
                </Card>
            )}

            <Dialog open={studentAnalyticsOpen} onOpenChange={setStudentAnalyticsOpen}>
                <DialogContent className="max-h-[90vh] max-w-7xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Student Analytics</DialogTitle>
                        <DialogDescription>Search students by name or registration number and filter by batch.</DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative min-w-48 flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                            <Input
                                placeholder="Search by student name or registration number..."
                                value={studentSearchInput}
                                onChange={(event) => setStudentSearchInput(event.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select
                            value={batch || "__all_batches__"}
                            onValueChange={(value) => setBatch(value === "__all_batches__" ? "" : value)}
                        >
                            <SelectTrigger className="w-48"><SelectValue placeholder="All batches" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all_batches__">All batches</SelectItem>
                                {batches.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={exportStudentReport} disabled={loading || rows.length === 0}>
                            <Download className="h-4 w-4" /> Export Excel
                        </Button>
                    </div>
                    {loading ? (
                        <LoadingState label="Loading reports" className="py-10" />
                    ) : rows.length === 0 ? (
                        <EmptyState icon={Users} title="No data" description="No student performance data matches the search and batch filters." />
                    ) : (
                        <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200 dark:border-zinc-800">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Student</TableHead>
                                        <TableHead>Aptitude</TableHead>
                                        <TableHead>Coding</TableHead>
                                        <TableHead>Interviews</TableHead>
                                        <TableHead>Violations</TableHead>
                                        <TableHead>Top Category</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((student) => (
                                        <TableRow key={student.regNo}>
                                            <TableCell>
                                                <p className="font-medium text-slate-800 dark:text-zinc-100">{student.name}</p>
                                                <p className="text-xs text-slate-500 dark:text-zinc-500">{student.regNo}</p>
                                            </TableCell>
                                            <TableCell>
                                                <p className="text-sm text-slate-700 dark:text-zinc-200">{student.aptitudeCount ? `${student.aptitudeAverage}% avg` : "—"}</p>
                                                {student.lastAptitude && <p className={`text-xs ${resultColor(student.lastAptitude.result)}`}>{student.lastAptitude.result} · {student.lastAptitude.percentage}%</p>}
                                            </TableCell>
                                            <TableCell>
                                                <p className="text-sm text-slate-700 dark:text-zinc-200">{student.codingCount ? `${student.codingAverage}% avg` : "—"}</p>
                                                {student.lastCoding && <p className={`text-xs ${resultColor(student.lastCoding.result)}`}>{student.lastCoding.result} · {student.lastCoding.percentage}%</p>}
                                            </TableCell>
                                            <TableCell>
                                                <p className="text-sm text-slate-700 dark:text-zinc-200">{student.interviewCount || "—"}</p>
                                                {student.lastInterview && <p className="text-xs text-slate-500 dark:text-zinc-400">rating {student.lastInterview.rating}/5</p>}
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-700 dark:text-zinc-200">{student.violationCount ?? 0}</TableCell>
                                            <TableCell className="text-sm text-slate-600 dark:text-zinc-300">{student.topCategory || "—"}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {tab === "test" && (
                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardHeader>
                        <div className="flex flex-wrap items-center gap-2">
                            <Select value={selectedTest} onValueChange={(value) => {
                                setSelectedTest(value);
                                setTestPopup(null);
                                setSelectedAttempt(null);
                            }}>
                                <SelectTrigger className="w-80"><SelectValue placeholder="Select a test" /></SelectTrigger>
                                <SelectContent>
                                    {tests.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
                                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                                Refresh test list
                            </Button>
                            {testReport && (
                                <Button type="button" variant="outline" size="sm" onClick={exportTestReport} disabled={!testReport.attempts?.length}>
                                    <Download className="mr-2 h-3.5 w-3.5" />
                                    Export Excel
                                </Button>
                            )}
                        </div>
                        {testListError && <p role="alert" className="text-sm text-red-500">{testListError}</p>}
                    </CardHeader>
                    <CardContent>
                        {!selectedTest ? (
                            <EmptyState icon={FileCode} title="Pick a test" description="Select a test to see its performance breakdown." />
                        ) : loading ? (
                            <LoadingState label="Loading test report" className="py-10" />
                        ) : testReport ? (
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                                    <Stat label="Attempts" value={testReport._count?.attempts} />
                                    <Stat label="Average" value={`${testReport.stats?.averageScore}%`} />
                                    <Stat label="Best" value={`${testReport.stats?.bestScore}%`} />
                                    <Stat label="Total score" value={testReport.stats?.totalScore} />
                                </div>
                                <Button onClick={() => setTestPopup("analytics")}>
                                    <TrendingUp className="h-4 w-4" /> View performance analytics
                                </Button>
                            </div>
                        ) : (
                            <EmptyState icon={BrainCircuit} title="No data" description="No completed attempts for this test yet." />
                        )}
                    </CardContent>
                </Card>
            )}

            <Dialog open={testPopup === "analytics"} onOpenChange={(open) => { if (!open) setTestPopup(null); }}>
                <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Test Performance Analytics</DialogTitle>
                        <DialogDescription>
                            Overall metrics and student completions for: <span className="font-semibold">{testReport?.test?.title || "Selected test"}</span>
                        </DialogDescription>
                    </DialogHeader>
                    {testReport && (
                        <div className="space-y-5">
                            <Button variant="outline" className="w-full" onClick={() => setTestPopup("attempts")} disabled={!testReport.attempts?.length}>
                                <ClipboardList className="h-4 w-4" /> Student Attempts ({testReport.attempts?.length || 0})
                            </Button>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <Stat label="Average score" value={`${testReport.stats?.averageScore}%`} />
                                <Stat label="Best score" value={`${testReport.stats?.bestScore}%`} />
                                <Stat label="Total completed" value={testReport._count?.attempts} />
                                <Stat label="Pass rate" value={`${Math.round(((testReport.results?.passed || 0) + (testReport.results?.selected || 0)) / (testReport._count?.attempts || 1) * 100)}%`} />
                            </div>
                            {testReport.attempts?.length ? (
                                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                                    <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                                        <TrendingUp className="h-4 w-4 text-violet-500" /> Score distribution chart
                                    </p>
                                    <div className="h-56 pr-4">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={testReport.attempts.slice(0, 15).map((attempt) => ({
                                                name: attempt.studentName || attempt.studentRegNo,
                                                score: attempt.score,
                                            }))}>
                                                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-zinc-800/40" />
                                                <XAxis dataKey="name" tick={{ fill: "currentColor", opacity: 0.6 }} className="text-[10px] text-slate-500 dark:text-zinc-500" />
                                                <YAxis tick={{ fill: "currentColor", opacity: 0.6 }} className="text-[10px] text-slate-500" />
                                                <RechartsTooltip />
                                                <Bar dataKey="score" fill="#8b5cf6" name="Score" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            ) : (
                                <EmptyState icon={BrainCircuit} title="No completed attempts" description="There are no student attempts to analyze yet." />
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={testPopup === "attempts"} onOpenChange={(open) => { if (!open) setTestPopup(null); }}>
                <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Student Attempts</DialogTitle>
                        <DialogDescription>{testReport?.test?.title || "Selected test"} · {testReport?.attempts?.length || 0} attempts</DialogDescription>
                    </DialogHeader>
                    <Button type="button" variant="outline" className="w-fit" onClick={() => setTestPopup("analytics")}>
                        Back to performance analytics
                    </Button>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-zinc-800">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Score</TableHead>
                                    <TableHead>Completed Date / Time</TableHead>
                                    <TableHead>Outcome</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(testReport?.attempts || []).map((attempt) => (
                                    <TableRow key={attempt.id}>
                                        <TableCell>
                                            <p className="font-medium text-slate-800 dark:text-zinc-100">{attempt.studentName || "Student"}</p>
                                            <p className="text-xs text-slate-500 dark:text-zinc-500">{attempt.studentRegNo}</p>
                                        </TableCell>
                                        <TableCell>{attempt.score ?? 0} / {attempt.totalScore ?? "—"}</TableCell>
                                        <TableCell>{attempt.completedAt ? new Date(attempt.completedAt).toLocaleString() : "—"}</TableCell>
                                        <TableCell className={`capitalize ${resultColor(attempt.result)}`}>{attempt.result || "—"}</TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => {
                                                    setSelectedAttempt(attempt);
                                                    setTestPopup("violations");
                                                }}>
                                                    <Eye className="h-4 w-4" /> View violations ({attempt.violationCount ?? attempt.violations?.length ?? 0})
                                                </Button>
                                                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-500 dark:text-red-400" onClick={() => handleResetAttempt(attempt.id)}>
                                                    Reset attempt
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {!testReport?.attempts?.length && (
                                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-slate-500">No student attempts found.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={testPopup === "violations" && selectedAttempt !== null} onOpenChange={(open) => {
                if (!open) {
                    setTestPopup(null);
                    setSelectedAttempt(null);
                }
            }}>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Attempt violations</DialogTitle>
                        <DialogDescription>
                            {selectedAttempt?.studentName || "Student"} · {selectedAttempt?.studentRegNo} · {selectedAttempt?.completedAt ? new Date(selectedAttempt.completedAt).toLocaleString() : "Completion time unavailable"}
                        </DialogDescription>
                    </DialogHeader>
                    <Button type="button" variant="outline" className="w-fit" onClick={() => setTestPopup("attempts")}>
                        Back to student attempts
                    </Button>
                    {selectedAttempt && (() => {
                        const violations = selectedAttempt.violations || [];
                        const violationTypes = [...new Set(violations.map((violation) => (violation.type || "unknown").replace(/_/g, " ")))];
                        return (
                            <div className="space-y-5">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <Stat label="Score" value={`${selectedAttempt.score ?? 0} / ${selectedAttempt.totalScore ?? "—"}`} />
                                    <Stat label="Outcome" value={selectedAttempt.result || "—"} />
                                    <Stat label="Total violations" value={violations.length} />
                                    <Stat label="Violation types" value={violationTypes.length} />
                                </div>
                                {violationTypes.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {violationTypes.map((type) => (
                                            <span key={type} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium capitalize text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                                                {type} · {violations.filter((violation) => (violation.type || "unknown").replace(/_/g, " ") === type).length}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {violations.length === 0 ? (
                                    <EmptyState icon={AlertTriangle} title="No violations recorded" description="No proctoring events were recorded for this attempt." />
                                ) : (
                                    <div className="space-y-3">
                                        {violations.map((violation) => (
                                            <article key={violation.id} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40 sm:grid-cols-[minmax(0,1fr)_220px]">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <h3 className="font-semibold capitalize text-slate-900 dark:text-zinc-100">{(violation.type || "unknown").replace(/_/g, " ")}</h3>
                                                        <span className="text-xs text-slate-500 dark:text-zinc-400">{violation.timestamp ? new Date(violation.timestamp).toLocaleString() : "Time unavailable"}</span>
                                                    </div>
                                                    <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">{violation.description || "No additional details."}</p>
                                                    {violation.severity && <p className="mt-2 text-xs capitalize text-amber-700 dark:text-amber-300">Severity: {violation.severity}</p>}
                                                </div>
                                                {violation.cameraFrameUrl ? (
                                                    <a href={violation.cameraFrameUrl} target="_blank" rel="noreferrer" className="block">
                                                        <img src={violation.cameraFrameUrl} alt={`Camera evidence for ${(violation.type || "unknown").replace(/_/g, " ")}`} className="max-h-44 w-full rounded-md border border-slate-200 object-cover dark:border-zinc-700" />
                                                        <span className="mt-1 block text-xs text-violet-700 dark:text-violet-300">Open evidence image</span>
                                                    </a>
                                                ) : (
                                                    <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-500 dark:border-zinc-700 dark:text-zinc-500">
                                                        No image evidence
                                                    </div>
                                                )}
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-4">
            <p className="text-xs text-slate-500 dark:text-zinc-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-zinc-100">{value ?? "—"}</p>
        </div>
    );
}
