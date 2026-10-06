import { useState, useEffect, useMemo, useCallback } from "react";
import { Download, FileSpreadsheet, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, EmptyState, LoadingState } from "@/components/portal/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { downloadExcel } from "@/lib/excel-export";
import { getSectionsForBatch, getStudentSection } from "@/lib/student-section";

export default function PlacementReports() {
    const [rows, setRows] = useState([]);
    const [students, setStudents] = useState([]);
    const [tests, setTests] = useState([]);
    const [testReport, setTestReport] = useState(null);
    const [selectedTest, setSelectedTest] = useState("");
    const [testType, setTestType] = useState("");
    const [testsLoading, setTestsLoading] = useState(true);
    const [testsError, setTestsError] = useState("");
    const [testLoading, setTestLoading] = useState(false);
    const [testError, setTestError] = useState("");
    const [testReloadKey, setTestReloadKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [exportError, setExportError] = useState("");
    const [batch, setBatch] = useState("all");
    const [section, setSection] = useState("all");

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            const [reportRows, studentRows] = await Promise.all([api.reports.students({}), api.students.list({})]);
            setRows(reportRows);
            setStudents(studentRows);
        } catch (error) {
            setLoadError(error.message || "Could not load placement reports.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const loadTests = useCallback(async () => {
        setTestsLoading(true);
        setTestsError("");
        try {
            setTests(await api.reports.tests());
        } catch (error) {
            setTestsError(error.message || "Could not load tests.");
        } finally {
            setTestsLoading(false);
        }
    }, []);

    useEffect(() => { loadTests(); }, [loadTests]);

    const testsForType = useMemo(
        () => tests.filter((test) => test.type === testType),
        [testType, tests]
    );
    const visibleAttempts = useMemo(() => {
        const studentByRegNo = new Map(students.map((student) => [student.regNo, student]));
        return (testReport?.attempts || []).filter((attempt) => {
            const student = studentByRegNo.get(attempt.studentRegNo);
            if (batch !== "all" && student?.batch !== batch) return false;
            return section === "all" || getStudentSection(attempt.studentRegNo) === section;
        });
    }, [batch, section, students, testReport]);

    useEffect(() => {
        if (!selectedTest) {
            setTestReport(null);
            setTestLoading(false);
            return;
        }
        let cancelled = false;
        setTestLoading(true);
        setTestError("");
        api.reports.perTest(selectedTest)
            .then((report) => {
                if (!cancelled) setTestReport(report);
            })
            .catch((error) => {
                if (!cancelled) {
                    setTestReport(null);
                    setTestError(error.message || "Could not load this test report.");
                }
            })
            .finally(() => {
                if (!cancelled) setTestLoading(false);
            });
        return () => { cancelled = true; };
    }, [selectedTest, testReloadKey]);

    const changeTestType = (value) => {
        setTestType(value);
        setSelectedTest("");
        setTestReport(null);
        setTestError("");
    };

    const batches = useMemo(
        () => [...new Set(students.map((student) => student.batch).filter(Boolean))].sort(),
        [students]
    );
    const sections = useMemo(() => getSectionsForBatch(batch, students), [batch, students]);
    const visibleRows = useMemo(
        () => rows.filter((row) => {
            if (batch !== "all" && row.batch !== batch) return false;
            return section === "all" || getStudentSection(row.regNo) === section;
        }),
        [batch, rows, section]
    );

    const changeBatch = (value) => {
        setBatch(value);
        setSection("all");
    };

    const testCategoryLabel = (test) => {
        if (test.type !== "coding") return "Aptitude";
        const formats = test.formats || [];
        if (formats.includes("mcq") && formats.includes("programming")) return "Coding MCQ + Programming";
        return formats.includes("mcq") ? "Coding MCQ" : "Coding Programming";
    };

    const exportFilename = (reportName) => {
        const clean = (value) => value
            .trim()
            .replace(/[^a-z0-9]+/gi, "-")
            .replace(/^-|-$/g, "");
        const batchLabel = batch === "all"
            ? "Overall"
            : batch.replace(/(?:19|20)?(\d{2})\s*[-–/]\s*(?:19|20)?(\d{2})/, "$1-$2");
        const reportLabel = clean(reportName) || "Report";
        const scopeLabel = section === "all" ? "Overall" : `Section${clean(section)}`;
        const filename = batch === "all" && section === "all"
            ? `Overall-Status-${reportLabel}`
            : `${clean(batchLabel)}-${reportLabel}-${scopeLabel}`;
        return `${filename}.xlsx`;
    };

    const exportReports = async () => {
        setExportError("");
        try {
            if (!testType) {
                await downloadExcel(exportFilename("Student-Summary"), visibleRows.map((student) => ({
                    Name: student.name || "",
                    "Registration Number": student.regNo || "",
                    Batch: student.batch || "",
                    Department: student.department || "",
                    CGPA: student.cgpa ?? "",
                    "Aptitude Tests": student.aptitudeCount ?? 0,
                    "Aptitude Average (%)": student.aptitudeAverage ?? "",
                    "Latest Aptitude Result": student.lastAptitude?.result || "",
                    "Coding Tests": student.codingCount ?? 0,
                    "Coding Average (%)": student.codingAverage ?? "",
                    "Latest Coding Result": student.lastCoding?.result || "",
                    Interviews: student.interviewCount ?? 0,
                    "Latest Interview Rating": student.lastInterview?.rating ?? "",
                    Violations: student.violationCount ?? 0,
                    "Resume Categories": (student.categories || []).join(", "),
                })), "Student Summary");
                return;
            }

            const selectedTestInfo = testsForType.find((test) => test.id === selectedTest);
            if (!selectedTestInfo) throw new Error("Select a test before exporting its report.");
            const formatLabel = testCategoryLabel(selectedTestInfo);
            const batchByRegNo = new Map(students.map((student) => [student.regNo, student.batch]));
            await downloadExcel(exportFilename(`${formatLabel}-${selectedTestInfo.title}`), visibleAttempts.map((attempt) => ({
                Test: selectedTestInfo.title || "",
                Format: formatLabel,
                Name: attempt.studentName || "",
                "Registration Number": attempt.studentRegNo || "",
                Batch: batchByRegNo.get(attempt.studentRegNo) || "",
                Section: getStudentSection(attempt.studentRegNo) || "",
                Score: attempt.score ?? 0,
                "Total Score": attempt.totalScore ?? "",
                Result: attempt.result || "",
                Correct: attempt.correct ?? 0,
                "Total Questions": attempt.totalQuestions ?? "",
                "Completed At": attempt.completedAt ? new Date(attempt.completedAt).toLocaleString() : "",
            })), "Test Results");
        } catch (error) {
            setExportError(error.message || "Could not export the report.");
        }
    };

    const testLabel = (test) => {
        return test.type === "coding" ? `${testCategoryLabel(test)} - ${test.title}` : test.title;
    };

    const resultColor = (r) => {
        if (r === "selected") return "text-emerald-600 dark:text-emerald-400";
        if (r === "passed") return "text-blue-600 dark:text-blue-400";
        if (r === "failed") return "text-red-650 dark:text-red-400";
        return "text-slate-500 dark:text-zinc-400";
    };

    return (
        <div>
            <PageHeader title="Reports" description="Placement readiness across all candidates" />

            <div className="mb-5 flex flex-wrap items-center gap-2">
                {[
                    { value: "", label: "Student Summary" },
                    { value: "aptitude", label: "Aptitude Tests" },
                    { value: "coding", label: "Coding Tests" },
                ].map((tab) => (
                    <button
                        key={tab.value || "students"}
                        type="button"
                        onClick={() => changeTestType(tab.value)}
                        aria-pressed={testType === tab.value}
                        className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                            testType === tab.value
                                ? "bg-violet-600 text-white shadow-sm"
                                : "border border-slate-200 bg-white/70 text-slate-600 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <Select value={batch} onValueChange={changeBatch}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Select batch" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All batches</SelectItem>
                        {batches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={section} onValueChange={setSection}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Select section" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All sections</SelectItem>
                        {sections.map((item) => <SelectItem key={item} value={item}>Section {item}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button
                    type="button"
                    variant="outline"
                    className="ml-auto"
                    onClick={exportReports}
                    disabled={testType
                        ? testsLoading || !selectedTest || testLoading || visibleAttempts.length === 0
                        : loading || visibleRows.length === 0}
                >
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>Export Excel</span>
                    <Download className="h-3.5 w-3.5" />
                </Button>
            </div>
            {exportError && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{exportError}</p>}

            {testType && (
                <Card className="mb-4 border-slate-200/80 bg-white/70 dark:border-zinc-800/80 dark:bg-zinc-900/40">
                    <CardContent className="pt-6">
                        <div className="mb-5 flex flex-wrap items-center gap-3">
                            <Select value={selectedTest} onValueChange={setSelectedTest}>
                                <SelectTrigger className="w-full sm:w-80" disabled={testsLoading || Boolean(testsError)}>
                                    <SelectValue placeholder={`Select an ${testType} test`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {testsForType.map((test) => (
                                        <SelectItem key={test.id} value={test.id}>{testLabel(test)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {testsLoading && <LoadingState label="Loading tests" className="mb-3 justify-start" />}
                        {testsError && (
                            <div className="mb-3 flex flex-wrap items-center gap-3">
                                <p role="alert" className="text-sm text-red-600 dark:text-red-400">{testsError}</p>
                                <button type="button" onClick={loadTests} className="text-sm font-medium text-violet-600 hover:underline dark:text-violet-400">Retry loading tests</button>
                            </div>
                        )}
                        {testError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{testError}</p>}
                        {testLoading ? (
                            <div role="status" aria-label="Loading test report" className="space-y-4 py-3">
                                <div className="flex items-center gap-3">
                                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600 dark:border-violet-950 dark:border-t-violet-400" />
                                    <span className="sr-only">Loading test report</span>
                                    <Skeleton className="h-4 w-36 bg-slate-200 dark:bg-zinc-700" />
                                </div>
                                {[0, 1, 2, 3].map((row) => (
                                    <div key={row} className="grid grid-cols-4 gap-4">
                                        {[0, 1, 2, 3].map((cell) => (
                                            <Skeleton key={cell} className="h-9 bg-slate-100 dark:bg-zinc-800" />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        ) : testsError ? (
                            <EmptyState icon={Users} title="Tests unavailable" description="Retry loading the tests to view their results." />
                        ) : testsForType.length === 0 ? (
                            <EmptyState icon={Users} title="No tests available" description={`There are no ${testType} tests to report yet.`} />
                        ) : !selectedTest ? (
                            <EmptyState icon={Users} title="Choose a test" description={`Select an ${testType} test to view its student results.`} />
                        ) : testError ? (
                            <button type="button" onClick={() => setTestReloadKey((key) => key + 1)} className="text-sm font-medium text-violet-600 hover:underline dark:text-violet-400">
                                Retry loading this report
                            </button>
                        ) : visibleAttempts.length === 0 ? (
                            <EmptyState icon={Users} title="No matching attempts" description="No test attempts match the selected batch and section." />
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Student</TableHead>
                                            <TableHead>Score</TableHead>
                                            <TableHead>Result</TableHead>
                                            <TableHead>Correct</TableHead>
                                            <TableHead>Completed</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {visibleAttempts.map((attempt) => (
                                            <TableRow key={attempt.id}>
                                                <TableCell>
                                                    <p className="font-medium text-slate-800 dark:text-zinc-100">{attempt.studentName || "Student"}</p>
                                                    <p className="text-xs text-slate-500 dark:text-zinc-400">{attempt.studentRegNo}</p>
                                                </TableCell>
                                                <TableCell className="text-sm text-slate-700 dark:text-zinc-200">
                                                    {attempt.score ?? 0}/{attempt.totalScore ?? "—"}
                                                </TableCell>
                                                <TableCell className={`text-sm capitalize ${resultColor(attempt.result)}`}>{attempt.result || "—"}</TableCell>
                                                <TableCell className="text-sm text-slate-600 dark:text-zinc-300">
                                                    {attempt.correct ?? 0}/{attempt.totalQuestions ?? "—"}
                                                </TableCell>
                                                <TableCell className="text-sm text-slate-600 dark:text-zinc-300">
                                                    {attempt.completedAt ? new Date(attempt.completedAt).toLocaleString() : "—"}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {!testType && (
                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                <CardContent>
                    {loading ? (
                        <div role="status" aria-label="Loading reports" className="space-y-4 p-5">
                            <div className="flex items-center gap-3">
                                <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600 dark:border-violet-950 dark:border-t-violet-400" />
                                <span className="sr-only">Loading reports</span>
                                <Skeleton className="h-4 w-36 bg-slate-200 dark:bg-zinc-700" />
                            </div>
                            {[0, 1, 2, 3, 4].map((row) => (
                                <div key={row} className="grid grid-cols-5 gap-4">
                                    {[0, 1, 2, 3, 4].map((cell) => (
                                        <Skeleton key={cell} className={`h-8 bg-slate-100 dark:bg-zinc-800 ${cell === 0 ? "col-span-1" : ""}`} />
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : loadError ? (
                        <div className="flex flex-col items-center gap-3 p-10 text-center">
                            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
                            <button type="button" onClick={load} className="text-sm font-medium text-violet-600 hover:underline dark:text-violet-400">Try again</button>
                        </div>
                    ) : visibleRows.length === 0 ? (
                        <EmptyState icon={Users} title="No data" description="No student performance data yet." />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Candidate</TableHead>
                                    <TableHead>Aptitude</TableHead>
                                    <TableHead>Coding</TableHead>
                                    <TableHead>Interview</TableHead>
                                    <TableHead>Violations</TableHead>
                                    <TableHead>Category</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleRows.map((s) => (
                                    <TableRow key={s.regNo}>
                                        <TableCell>
                                            <p className="font-medium text-slate-800 dark:text-zinc-100">{s.name}</p>
                                            <p className="text-xs text-slate-500 dark:text-zinc-500">{s.regNo} • {s.batch || ""}</p>
                                        </TableCell>
                                        <TableCell>
                                            <p className="text-sm text-slate-700 dark:text-zinc-200">{s.aptitudeCount ? `${s.aptitudeAverage}% avg` : "—"}</p>
                                            {s.lastAptitude && <p className={`text-xs ${resultColor(s.lastAptitude.result)}`}>{s.lastAptitude.result} · {s.lastAptitude.percentage}%</p>}
                                        </TableCell>
                                        <TableCell>
                                            <p className="text-sm text-slate-700 dark:text-zinc-200">{s.codingCount ? `${s.codingAverage}% avg` : "—"}</p>
                                            {s.lastCoding && <p className={`text-xs ${resultColor(s.lastCoding.result)}`}>{s.lastCoding.result} · {s.lastCoding.percentage}%</p>}
                                        </TableCell>
                                        <TableCell>
                                            <p className="text-sm text-slate-700 dark:text-zinc-200">{s.interviewCount || "—"}</p>
                                            {s.lastInterview && <p className="text-xs text-amber-600 dark:text-amber-400">★ {s.lastInterview.rating}/5</p>}
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-700 dark:text-zinc-200">{s.violationCount ?? 0}</TableCell>
                                        <TableCell className="text-sm text-violet-600 dark:text-violet-400">{s.topCategory || "—"}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
                </Card>
            )}
        </div>
    );
}
