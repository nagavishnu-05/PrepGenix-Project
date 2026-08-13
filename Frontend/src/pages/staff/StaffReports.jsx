import { useState, useEffect, Fragment } from "react";
import { Search, Users, FileCode, BrainCircuit, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { api } from "@/lib/api";

export default function StaffReports() {
    const [rows, setRows] = useState([]);
    const [tests, setTests] = useState([]);
    const [testReport, setTestReport] = useState(null);
    const [selectedTest, setSelectedTest] = useState("");
    const [loading, setLoading] = useState(true);
    const [batch, setBatch] = useState("");
    const [search, setSearch] = useState("");
    const [tab, setTab] = useState("students");
    const [openV, setOpenV] = useState({});

    useEffect(() => {
        api.tests.list().then(setTests).catch(() => {});
    }, []);

    useEffect(() => {
        if (tab !== "students") return;
        setLoading(true);
        api.reports.students({ batch: batch || undefined, search: search || undefined })
            .then(setRows)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [tab, batch, search]);

    useEffect(() => {
        if (tab !== "test" || !selectedTest) return;
        setLoading(true);
        api.reports.perTest(selectedTest)
            .then(setTestReport)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [tab, selectedTest]);

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
                    onClick={() => setTab("students")}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "students" ? "bg-violet-600 text-white" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"}`}
                >
                    Student Report
                </button>
                <button
                    onClick={() => setTab("test")}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "test" ? "bg-violet-600 text-white" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"}`}
                >
                    Per Test
                </button>
            </div>

            {tab === "students" && (
                <Card className="border-zinc-800/80 bg-zinc-900/40">
                    <CardHeader className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-48">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                                <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                            </div>
                            <Select value={batch} onValueChange={setBatch}>
                                <SelectTrigger className="w-40"><SelectValue placeholder="All batches" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">All batches</SelectItem>
                                    {[...new Set(rows.map((r) => r.batch).filter(Boolean))].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <p className="py-10 text-center text-sm text-zinc-500">Loading...</p>
                        ) : rows.length === 0 ? (
                            <EmptyState icon={Users} title="No data" description="No student performance data matches the filters." />
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Student</TableHead>
                                        <TableHead>Aptitude</TableHead>
                                        <TableHead>Coding</TableHead>
                                        <TableHead>Interviews</TableHead>
                                        <TableHead>Top Category</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((s) => (
                                        <TableRow key={s.regNo}>
                                            <TableCell>
                                                <p className="font-medium text-zinc-100">{s.name}</p>
                                                <p className="text-xs text-zinc-500">{s.regNo}</p>
                                            </TableCell>
                                            <TableCell>
                                                <p className="text-sm text-zinc-200">{s.aptitudeCount ? `${s.aptitudeAverage}% avg` : "—"}</p>
                                                {s.lastAptitude && <p className={`text-xs ${resultColor(s.lastAptitude.result)}`}>{s.lastAptitude.result} · {s.lastAptitude.percentage}%</p>}
                                            </TableCell>
                                            <TableCell>
                                                <p className="text-sm text-zinc-200">{s.codingCount ? `${s.codingAverage}% avg` : "—"}</p>
                                                {s.lastCoding && <p className={`text-xs ${resultColor(s.lastCoding.result)}`}>{s.lastCoding.result} · {s.lastCoding.percentage}%</p>}
                                            </TableCell>
                                            <TableCell>
                                                <p className="text-sm text-zinc-200">{s.interviewCount || "—"}</p>
                                                {s.lastInterview && <p className="text-xs text-zinc-400">rating {s.lastInterview.rating}/5</p>}
                                            </TableCell>
                                            <TableCell className="text-sm text-zinc-300">{s.topCategory || "—"}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}

            {tab === "test" && (
                <Card className="border-zinc-800/80 bg-zinc-900/40">
                    <CardHeader>
                        <Select value={selectedTest} onValueChange={setSelectedTest}>
                            <SelectTrigger className="w-80"><SelectValue placeholder="Select a test" /></SelectTrigger>
                            <SelectContent>
                                {tests.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </CardHeader>
                    <CardContent>
                        {!selectedTest ? (
                            <EmptyState icon={FileCode} title="Pick a test" description="Select a test to see its performance breakdown." />
                        ) : loading ? (
                            <p className="py-10 text-center text-sm text-zinc-500">Loading...</p>
                        ) : testReport ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                    <Stat label="Attempts" value={testReport._count?.attempts} />
                                    <Stat label="Average" value={`${testReport.stats?.averageScore}%`} />
                                    <Stat label="Best" value={`${testReport.stats?.bestScore}%`} />
                                    <Stat label="Total score" value={`${testReport.stats?.totalScore}`} />
                                </div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Student</TableHead>
                                            <TableHead>Score</TableHead>
                                            <TableHead>Result</TableHead>
                                            <TableHead>Correct</TableHead>
                                            <TableHead>Violations</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {testReport.attempts.map((a) => (
                                            <Fragment key={a.id}>
                                                <TableRow className="cursor-pointer" onClick={() => setOpenV((o) => ({ ...o, [a.id]: !o[a.id] }))}>
                                                    <TableCell>
                                                        <p className="font-medium text-zinc-100">{a.studentName}</p>
                                                        <p className="text-xs text-zinc-500">{a.studentRegNo}</p>
                                                    </TableCell>
                                                    <TableCell className="text-sm text-zinc-200">{a.score}/{a.totalScore}</TableCell>
                                                    <TableCell className={`text-sm capitalize ${resultColor(a.result)}`}>{a.result}</TableCell>
                                                    <TableCell className="text-sm text-zinc-300">{a.correct}/{a.totalQuestions}</TableCell>
                                                    <TableCell>
                                                        <span className={`flex items-center gap-1 text-sm ${a.violationCount > 0 ? "text-amber-400" : "text-zinc-600"}`}>
                                                            {a.violationCount > 0 && <AlertTriangle className="h-3.5 w-3.5" />}
                                                            {a.violationCount}
                                                            {openV[a.id] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                        </span>
                                                    </TableCell>
                                                </TableRow>
                                                {openV[a.id] && (
                                                    <TableRow className="bg-zinc-950/40">
                                                        <TableCell colSpan={5} className="bg-zinc-950/40">
                                                            <div className="space-y-2 py-1">
                                                                {(a.violations || []).length === 0 && <p className="text-xs text-zinc-500">No proctoring violations.</p>}
                                                                {(a.violations || []).map((v) => (
                                                                    <div key={v.id} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
                                                                        <div className="min-w-0">
                                                                            <p className="text-xs font-medium capitalize text-zinc-200">{v.type.replace(/_/g, " ")}</p>
                                                                            <p className="mt-0.5 text-xs text-zinc-400">{v.description}</p>
                                                                        </div>
                                                                        <div className="flex shrink-0 items-center gap-3">
                                                                            <span className="text-xs text-zinc-500">{new Date(v.timestamp).toLocaleString()}</span>
                                                                            {v.cameraFrame && (
                                                                                <img src={`data:image/jpeg;base64,${v.cameraFrame}`} alt="frame" className="h-16 rounded border border-zinc-800" />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </Fragment>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <EmptyState icon={BrainCircuit} title="No data" description="No completed attempts for this test yet." />
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-zinc-100">{value ?? "—"}</p>
        </div>
    );
}
