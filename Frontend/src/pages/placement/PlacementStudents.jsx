import { useState, useEffect, useCallback } from "react";
import { Search, Users, FileText, BrainCircuit, Download, Pencil, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, EmptyState, LoadingState } from "@/components/portal/primitives";
import { api } from "@/lib/api";
import { downloadExcel } from "@/lib/excel-export";
import { getSectionsForBatch, getStudentSection } from "@/lib/student-section";
import { InlineSelect } from "@/components/ui/inline-select";
import { StudentEditDialog } from "@/components/portal/StudentEditDialog";

export default function PlacementStudents() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [batch, setBatch] = useState("");
    const [search, setSearch] = useState("");
    const [resumeFilter, setResumeFilter] = useState("all");
    const [section, setSection] = useState("all");
    const [batches, setBatches] = useState([]);
    const [studentToEdit, setStudentToEdit] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        api.reports.students({ batch: batch || undefined, search: search || undefined })
            .then(setRows)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [batch, search]);

    useEffect(() => {
        const t = setTimeout(load, search ? 400 : 0);
        return () => clearTimeout(t);
    }, [load]);

    useEffect(() => {
        api.students.batches()
            .then(setBatches)
            .catch((error) => alert(`Failed to load batches: ${error.message}`));
    }, []);

    const sections = getSectionsForBatch(batch || "all", rows);
    const visibleRows = rows.filter((student) => {
        if (section !== "all" && getStudentSection(student.regNo, student.rollNo) !== section) return false;
        if (resumeFilter === "with_resume" && !student.hasResume) return false;
        if (resumeFilter === "without_resume" && student.hasResume) return false;
        return true;
    });

    const exportStudents = async () => {
        try {
            await downloadExcel("Placement-Students", visibleRows.map((student) => ({
                Name: student.name || "",
                "Registration Number": student.regNo || "",
                "Roll Number": student.rollNo || "",
                Section: getStudentSection(student.regNo, student.rollNo) || "",
                Batch: student.batch || "",
                CGPA: student.cgpa ?? "",
                "Tests Taken": (student.aptitudeCount || 0) + (student.codingCount || 0),
                "Aptitude Average (%)": student.aptitudeAverage ?? "",
                "Coding Average (%)": student.codingAverage ?? "",
                "Interview Rating": student.lastInterview?.rating ?? "",
                "Resume Category": student.topCategory || "",
            })), "Students");
        } catch (error) {
            alert(`Failed to export students: ${error.message}`);
        }
    };

    return (
        <div>
            <PageHeader title="Students" description="Browse candidates and their assessment profiles" />

            <Card className="border-slate-200/80 bg-white/80 dark:border-zinc-800/80 dark:bg-zinc-900/50">
                <CardHeader className="p-4 sm:p-5">
                    <div className="flex w-full flex-col gap-3 xl:flex-row xl:flex-nowrap xl:items-end">
                        <div className="relative min-w-0 xl:flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                            <Input
                                placeholder="Search by name or registration number..."
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                className="h-10 bg-white pl-9 dark:bg-zinc-900"
                            />
                        </div>
                        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-3">
                            <div className="min-w-0 space-y-1.5">
                                <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Batch</label>
                                <InlineSelect
                                    ariaLabel="Filter by batch"
                                    value={batch || "all"}
                                    onValueChange={(value) => {
                                        setBatch(value === "all" ? "" : value);
                                        setSection("all");
                                    }}
                                    options={[{ value: "all", label: "All batches" }, ...batches.map((item) => ({ value: item, label: item }))]}
                                />
                            </div>
                            <div className="min-w-0 space-y-1.5">
                                <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Section</label>
                                <InlineSelect
                                    ariaLabel="Filter by section"
                                    value={section}
                                    onValueChange={setSection}
                                    options={[{ value: "all", label: "All sections" }, ...sections.map((item) => ({ value: item, label: `Section ${item}` }))]}
                                />
                            </div>
                            <div className="min-w-0 space-y-1.5">
                                <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Resume</label>
                                <InlineSelect
                                    ariaLabel="Filter by resume"
                                    value={resumeFilter}
                                    onValueChange={setResumeFilter}
                                    options={[
                                        { value: "all", label: "All resumes" },
                                        { value: "with_resume", label: "Has resume" },
                                        { value: "without_resume", label: "No resume" },
                                    ]}
                                />
                            </div>
                        </div>
                        <Button variant="outline" onClick={exportStudents} disabled={loading || visibleRows.length === 0} className="h-10 shrink-0">
                            <Download className="h-4 w-4" /> Export Excel
                        </Button>
                        {(batch || section !== "all" || resumeFilter !== "all" || search) && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setBatch("");
                                    setSection("all");
                                    setResumeFilter("all");
                                    setSearch("");
                                }}
                                className="h-10 shrink-0 px-2 text-slate-500 dark:text-zinc-400"
                            >
                                <RotateCcw className="h-3.5 w-3.5" /> Clear
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <LoadingState label="Loading students" className="py-10" />
                    ) : visibleRows.length === 0 ? (
                        <EmptyState icon={Users} title="No students" description="No student records match the filters." />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Candidate</TableHead>
                                    <TableHead>Batch</TableHead>
                                    <TableHead>CGPA</TableHead>
                                    <TableHead>Tests</TableHead>
                                    <TableHead>Aptitude</TableHead>
                                    <TableHead>Coding</TableHead>
                                    <TableHead>Interview</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleRows.map((s) => (
                                    <TableRow key={s.regNo}>
                                        <TableCell>
                                            <p className="font-medium text-slate-800 dark:text-zinc-100">{s.name}</p>
                                            <p className="text-xs text-slate-500 dark:text-zinc-500">{s.regNo}</p>
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">{s.batch || "—"}</TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">{s.cgpa ?? "—"}</TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">{s.aptitudeCount + s.codingCount}</TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">{s.aptitudeCount ? `${s.aptitudeAverage}%` : "—"}</TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">{s.codingCount ? `${s.codingAverage}%` : "—"}</TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">
                                            {s.lastInterview ? <span className="text-amber-600 dark:text-amber-400">★ {s.lastInterview.rating}/5</span> : "—"}
                                        </TableCell>
                                        <TableCell>
                                            {s.hasResume ? (
                                                <span className="flex items-center gap-1 text-xs text-violet-650 dark:text-violet-400"><FileText className="h-3.5 w-3.5" /> {s.topCategory || s.categories[0] || "Parsed"}</span>
                                            ) : (
                                                <BrainCircuit className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-650" />
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" onClick={() => setStudentToEdit(s)}>
                                                <Pencil className="h-4 w-4" /> Edit
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <StudentEditDialog
                student={studentToEdit}
                onClose={() => setStudentToEdit(null)}
                onSaved={(updatedStudent) => {
                    setRows((current) => current.map((row) => row.regNo === updatedStudent.regNo ? { ...row, ...updatedStudent } : row));
                }}
            />
        </div>
    );
}
