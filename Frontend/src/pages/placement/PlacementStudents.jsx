import { useState, useEffect, useCallback } from "react";
import { Search, Users, FileText, BrainCircuit, Download, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, EmptyState, LoadingState } from "@/components/portal/primitives";
import { api } from "@/lib/api";
import { downloadExcel } from "@/lib/excel-export";
import { getStudentSection } from "@/lib/student-section";
import { StudentEditDialog } from "@/components/portal/StudentEditDialog";

export default function PlacementStudents() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [batch, setBatch] = useState("");
    const [search, setSearch] = useState("");
    const [cat, setCat] = useState("");
    const [filterOpen, setFilterOpen] = useState(false);
    const [batches, setBatches] = useState([]);
    const [studentToEdit, setStudentToEdit] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        api.reports.students({ batch: batch || undefined, search: search || undefined, categorized: cat === "categorized" })
            .then(setRows)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [batch, search, cat]);

    useEffect(() => {
        const t = setTimeout(load, search ? 400 : 0);
        return () => clearTimeout(t);
    }, [load]);

    useEffect(() => {
        api.students.batches()
            .then(setBatches)
            .catch((error) => alert(`Failed to load batches: ${error.message}`));
    }, []);

    const exportStudents = async () => {
        try {
            await downloadExcel("Placement-Students", rows.map((student) => ({
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

            <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-48">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                            <Input placeholder="Search by name or reg number..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                        </div>
                        <Button variant="outline" onClick={() => setFilterOpen(true)}>
                            Filters{batch || cat ? " (active)" : ""}
                        </Button>
                        <Button variant="outline" onClick={exportStudents} disabled={loading || rows.length === 0}>
                            <Download className="h-4 w-4" /> Export Excel
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <LoadingState label="Loading students" className="py-10" />
                    ) : rows.length === 0 ? (
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
                                {rows.map((s) => (
                                    <TableRow key={s.regNo}>
                                        <TableCell>
                                            <p className="font-medium text-slate-800 dark:text-zinc-100">{s.name}</p>
                                            <p className="text-xs text-slate-500 dark:text-zinc-500">{s.regNo}{s.rollNo ? ` · Roll ${s.rollNo}` : ""}</p>
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

            <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Filter students</DialogTitle>
                        <DialogDescription>Choose which student records to show.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5">
                        <section className="space-y-2">
                            <h3 className="text-sm font-medium">Batch</h3>
                            <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                                <Button type="button" variant={batch === "" ? "default" : "outline"} onClick={() => setBatch("")}>All batches</Button>
                                {batches.map((item) => (
                                    <Button key={item} type="button" variant={batch === item ? "default" : "outline"} onClick={() => setBatch(item)}>
                                        {item}
                                    </Button>
                                ))}
                            </div>
                        </section>
                        <section className="space-y-2">
                            <h3 className="text-sm font-medium">Resume category</h3>
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant={cat === "" ? "default" : "outline"} onClick={() => setCat("")}>All students</Button>
                                <Button type="button" variant={cat === "categorized" ? "default" : "outline"} onClick={() => setCat("categorized")}>
                                    Categorized (have resume)
                                </Button>
                            </div>
                        </section>
                        <div className="flex justify-end">
                            <Button onClick={() => setFilterOpen(false)}>Done</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

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
