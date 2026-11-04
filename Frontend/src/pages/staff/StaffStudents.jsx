import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Upload, Trash2, FileText, Users, AlertTriangle, GraduationCap, Mail, Phone, Download, Pencil, Layers3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { InlineSelect } from "@/components/ui/inline-select";
import { PageHeader, EmptyState, LoadingState } from "@/components/portal/primitives";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { downloadExcel } from "@/lib/excel-export";
import { getStudentSection } from "@/lib/student-section";
import { StudentEditDialog } from "@/components/portal/StudentEditDialog";

export default function StaffStudents() {
    const [rows, setRows] = useState([]);
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [exportBatch, setExportBatch] = useState("");
    const [exporting, setExporting] = useState(false);
    const [batchToDelete, setBatchToDelete] = useState("");
    const [batchDeleteConfirmation, setBatchDeleteConfirmation] = useState("");
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [newStudent, setNewStudent] = useState({ regNo: "", rollNo: "", name: "", email: "", mobile: "", cgpa: "", batch: "" });

    // Grouping & individual detail popup state
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [batchStudentSearch, setBatchStudentSearch] = useState("");
    const [selectedStudentReport, setSelectedStudentReport] = useState(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [studentToEdit, setStudentToEdit] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        api.reports.students({ search: search || undefined })
            .then(setRows)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [search]);

    useEffect(() => {
        const t = setTimeout(load, search ? 400 : 0);
        return () => clearTimeout(t);
    }, [load]);

    useEffect(() => {
        api.students.batches().then((bList) => {
            setBatches(bList);
        }).catch(() => {});
    }, []);

    const openStudentReport = async (s) => {
        setReportLoading(true);
        try {
            const data = await api.reports.perStudent(s.regNo);
            setSelectedStudentReport(data);
        } catch (e) {
            alert("Failed to load student report: " + e.message);
        } finally {
            setReportLoading(false);
        }
    };

    const exportStudents = async () => {
        if (!exportBatch) {
            alert("Select a batch to export.");
            return;
        }
        setExporting(true);
        try {
            const students = await api.reports.students({ batch: exportBatch });
            await downloadExcel(`Student-Records-${exportBatch.replace(/[^a-z0-9]+/gi, "-")}`, students.map((student) => ({
                Name: student.name || "",
                "Registration Number": student.regNo || "",
                "Roll Number": student.rollNo || "",
                Section: getStudentSection(student.regNo, student.rollNo) || "",
                Batch: student.batch || "",
                CGPA: student.cgpa ?? "",
                Email: student.email || "",
                Mobile: student.mobile || "",
                Resume: student.hasResume ? "Yes" : "No",
                "Resume Category": student.topCategory || "",
                "Aptitude Average (%)": student.aptitudeAverage ?? "",
                "Coding Average (%)": student.codingAverage ?? "",
                Interviews: student.interviewCount ?? 0,
            })), "Students");
            setExportOpen(false);
        } catch (error) {
            alert(`Failed to export students: ${error.message}`);
        } finally {
            setExporting(false);
        }
    };

    const addStudent = async () => {
        if (!newStudent.regNo.trim() || !newStudent.name.trim()) {
            alert("Reg number and name are required.");
            return;
        }
        setBusy(true);
        try {
            await api.students.create(newStudent);
            setAddOpen(false);
            setNewStudent({ regNo: "", rollNo: "", name: "", email: "", mobile: "", cgpa: "", batch: "" });
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const doImport = async () => {
        if (!file) return;
        setBusy(true);
        try {
            const r = await api.students.importExcel(file);
            alert(`Import complete: ${r.total} students processed (${r.created} new, ${r.updated} updated).`);
            setImportOpen(false);
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (regNo) => {
        if (!confirm(`Delete student ${regNo}? This removes their account, performance and resume. Test and interview history will remain.`)) return;
        await api.students.remove(regNo).catch((e) => alert(e.message));
        load();
    };

    const deleteBatch = async () => {
        if (!batchToDelete || batchDeleteConfirmation !== batchToDelete) return;
        setBusy(true);
        try {
            const result = await api.students.removeBatch(batchToDelete);
            alert(`Deleted ${result.studentsDeleted} student records from batch ${batchToDelete}.`);
            setBatchDeleteOpen(false);
            setBatchDeleteConfirmation("");
            const remainingBatches = await api.students.batches();
            setBatches(remainingBatches);
            if (selectedBatch === batchToDelete) setSelectedBatch(null);
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    // Grouping rows locally
    const grouped = {};
    rows.forEach(s => {
        const b = s.batch || "No Batch";
        if (!grouped[b]) grouped[b] = [];
        grouped[b].push(s);
    });
    const selectedBatchStudents = (grouped[selectedBatch] || []).filter((student) => {
        const query = batchStudentSearch.trim().toLowerCase();
        return !query || [student.name, student.regNo, student.rollNo]
            .some((value) => String(value || "").toLowerCase().includes(query));
    });

    return (
        <div>
            <PageHeader
                title="Students"
                description="Manage student records and track their performance"
                action={
                    <>
                        <Button variant="outline" onClick={() => setImportOpen(true)} className="cursor-pointer"><Upload className="h-4 w-4" /> Import Excel</Button>
                        <Button
                            variant="outline"
                            onClick={() => { setBatchToDelete(""); setBatchDeleteConfirmation(""); setBatchDeleteOpen(true); }}
                            disabled={!batches.length}
                            className="cursor-pointer border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                            <Trash2 className="h-4 w-4" /> Delete Batch
                        </Button>
                        <Button onClick={() => setAddOpen(true)} className="cursor-pointer"><Plus className="h-4 w-4" /> Add Student</Button>
                    </>
                }
            />

            <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40 mb-6">
                <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-48">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                            <Input placeholder="Search by name or reg number..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                        </div>
                        <Button variant="outline" onClick={() => { setExportBatch(""); setExportOpen(true); }} disabled={!batches.length || loading}>
                            <Download className="h-4 w-4" /> Export Excel
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <LoadingState label="Loading students" className="py-10" />
                    ) : rows.length === 0 ? (
                        <EmptyState icon={Users} title="No students found" description="Add students manually or import them from an Excel file." />
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {Object.entries(grouped).map(([batchKey, studentList]) => {
                                const studentsWithCgpa = studentList.filter((student) =>
                                    student.cgpa !== null
                                    && student.cgpa !== undefined
                                    && student.cgpa !== ""
                                    && Number.isFinite(Number(student.cgpa))
                                );
                                const averageCgpa = studentsWithCgpa.length
                                    ? (studentsWithCgpa.reduce((total, student) => total + Number(student.cgpa), 0) / studentsWithCgpa.length).toFixed(2)
                                    : "—";
                                const aptitudeAttempts = studentList.reduce((total, student) => total + (Number(student.aptitudeCount) || 0), 0);
                                const codingAttempts = studentList.reduce((total, student) => total + (Number(student.codingCount) || 0), 0);
                                const resumeCount = studentList.filter((student) => student.hasResume).length;
                                const sectionCount = new Set(studentList.map((student) => getStudentSection(student.regNo, student.rollNo)).filter(Boolean)).size;
                                return (
                                    <button
                                        key={batchKey}
                                        type="button"
                                        onClick={() => { setBatchStudentSearch(""); setSelectedBatch(batchKey); }}
                                        className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-violet-300 hover:bg-violet-50/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-violet-800 dark:hover:bg-violet-950/20"
                                    >
                                        <span className="flex flex-wrap items-center justify-between gap-4">
                                            <span className="flex min-w-0 items-center gap-3">
                                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                                                    <Layers3 className="h-5 w-5" />
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block truncate text-base font-semibold text-slate-900 dark:text-zinc-100">
                                                        {batchKey === "No Batch" ? "Unassigned Batch" : batchKey}
                                                    </span>
                                                    <span className="mt-1 block text-sm text-slate-500 dark:text-zinc-400">
                                                        {studentList.length} student{studentList.length !== 1 ? "s" : ""} in this batch
                                                    </span>
                                                </span>
                                            </span>
                                            <span className="shrink-0 rounded-lg bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 group-hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:group-hover:bg-violet-500/20">View students</span>
                                        </span>
                                        <span className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                                            {[
                                                { label: "Average CGPA", value: averageCgpa },
                                                { label: "Aptitude attempts", value: aptitudeAttempts },
                                                { label: "Coding attempts", value: codingAttempts },
                                                { label: "Resume uploaded", value: `${resumeCount} / ${studentList.length}` },
                                                { label: "Sections", value: sectionCount || "—" },
                                            ].map((stat) => (
                                                <span key={stat.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/40">
                                                    <span className="block text-xs text-slate-500 dark:text-zinc-400">{stat.label}</span>
                                                    <span className="mt-0.5 block text-sm font-semibold text-slate-800 dark:text-zinc-100">{stat.value}</span>
                                                </span>
                                            ))}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={selectedBatch !== null} onOpenChange={(open) => {
                if (!open) {
                    setSelectedBatch(null);
                    setBatchStudentSearch("");
                }
            }}>
                <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedBatch === "No Batch" ? "Unassigned Batch" : `Batch ${selectedBatch}`}</DialogTitle>
                        <DialogDescription>
                            {selectedBatchStudents.length} student{selectedBatchStudents.length === 1 ? "" : "s"}{batchStudentSearch ? " match your search" : " in this batch"}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                        <Input
                            placeholder="Search by name, registration number, or roll number..."
                            value={batchStudentSearch}
                            onChange={(event) => setBatchStudentSearch(event.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>CGPA</TableHead>
                                    <TableHead>Resume</TableHead>
                                    <TableHead>Aptitude</TableHead>
                                    <TableHead>Coding</TableHead>
                                    <TableHead>Interviews</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedBatchStudents.map((s) => (
                                    <TableRow key={s.regNo}>
                                        <TableCell>
                                            <p className="font-semibold text-slate-800 dark:text-zinc-100">{s.name}</p>
                                            <p className="text-xs text-slate-500">{s.regNo}{s.rollNo ? ` · Roll ${s.rollNo}` : ""}</p>
                                        </TableCell>
                                        <TableCell>{s.cgpa ?? "—"}</TableCell>
                                        <TableCell>{s.hasResume ? s.topCategory || "Parsed" : "None"}</TableCell>
                                        <TableCell>{s.aptitudeCount ? `${s.lastAptitude?.percentage ?? s.aptitudeAverage}% (${s.aptitudeCount})` : "—"}</TableCell>
                                        <TableCell>{s.codingCount ? `${s.lastCoding?.percentage ?? s.codingAverage}% (${s.codingCount})` : "—"}</TableCell>
                                        <TableCell>{s.interviewCount || "—"}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="sm" onClick={() => setStudentToEdit(s)}><Pencil className="h-4 w-4" /> Edit</Button>
                                                <Button variant="ghost" size="sm" onClick={() => openStudentReport(s)}><Users className="h-4 w-4" /> Monitor</Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-500 dark:text-red-400" onClick={() => remove(s.regNo)} aria-label={`Delete ${s.name}`}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {selectedBatchStudents.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500 dark:text-zinc-400">
                                            No students match your search.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
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

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Student</DialogTitle>
                        <DialogDescription>A login account is created for the student using their reg number.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Reg number *</Label>
                            <Input value={newStudent.regNo} onChange={(e) => setNewStudent({ ...newStudent, regNo: e.target.value })} placeholder="23CS001" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Roll no</Label>
                            <Input value={newStudent.rollNo} onChange={(e) => setNewStudent({ ...newStudent, rollNo: e.target.value })} placeholder="23CS001" />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <Label className="text-xs text-zinc-400">Name *</Label>
                            <Input value={newStudent.name} onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })} placeholder="Student name" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Email</Label>
                            <Input value={newStudent.email} onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })} placeholder="student@college.edu" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Mobile</Label>
                            <Input value={newStudent.mobile} onChange={(e) => setNewStudent({ ...newStudent, mobile: e.target.value })} placeholder="9876543210" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">CGPA</Label>
                            <Input value={newStudent.cgpa} onChange={(e) => setNewStudent({ ...newStudent, cgpa: e.target.value })} placeholder="8.5" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Batch</Label>
                            <Input value={newStudent.batch} onChange={(e) => setNewStudent({ ...newStudent, batch: e.target.value })} placeholder="2027" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button onClick={addStudent} disabled={busy}>{busy ? "Saving..." : "Add Student"}</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Import Students</DialogTitle>
                        <DialogDescription>Upload an .xlsx or .csv file with columns: RegNo, RollNo, Name, Email, Mobile, Tenth, Twelfth, CGPA, Batch.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <FileInput accept=".xlsx,.xls,.csv" placeholder="Select Excel or CSV file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                            <Button onClick={doImport} disabled={!file || busy}>{busy ? "Importing..." : "Import"}</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={exportOpen} onOpenChange={setExportOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Export Student Records</DialogTitle>
                        <DialogDescription>Select one batch to include in the Excel workbook.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>Batch</Label>
                            <InlineSelect
                                ariaLabel="Select batch to export"
                                value={exportBatch || "__select_batch__"}
                                onValueChange={(value) => setExportBatch(value === "__select_batch__" ? "" : value)}
                                options={[
                                    { value: "__select_batch__", label: "Select one batch" },
                                    ...batches.map((batch) => ({ value: batch, label: batch })),
                                ]}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setExportOpen(false)} disabled={exporting}>Cancel</Button>
                            <Button onClick={exportStudents} disabled={!exportBatch || exporting}>
                                <Download className="h-4 w-4" /> {exporting ? "Exporting..." : "Download Excel"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                            <AlertTriangle className="h-5 w-5" /> Delete an entire batch?
                        </DialogTitle>
                        <DialogDescription>
                            This permanently deletes the selected batch&apos;s student records, performance records, and resumes. Test attempts, interviews, and violation history are preserved. Back up your database before continuing.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label>Batch to delete</Label>
                            <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                                {batches.map((item) => (
                                    <Button
                                        key={item}
                                        type="button"
                                        variant={batchToDelete === item ? "default" : "outline"}
                                        aria-pressed={batchToDelete === item}
                                        onClick={() => { setBatchToDelete(item); setBatchDeleteConfirmation(""); }}
                                        className="justify-start"
                                    >
                                        {item}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        {batchToDelete && (
                            <div className="space-y-1.5">
                                <Label htmlFor="confirm-student-batch">Type <span className="font-bold">{batchToDelete}</span> to confirm</Label>
                                <Input
                                    id="confirm-student-batch"
                                    value={batchDeleteConfirmation}
                                    onChange={(event) => setBatchDeleteConfirmation(event.target.value)}
                                    autoComplete="off"
                                />
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setBatchDeleteOpen(false)} disabled={busy}>Cancel</Button>
                        <Button
                            onClick={deleteBatch}
                            disabled={busy || !batchToDelete || batchDeleteConfirmation !== batchToDelete}
                            className="bg-red-600 text-white hover:bg-red-700"
                        >
                            {busy ? "Deleting..." : "Delete batch"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={selectedStudentReport !== null} onOpenChange={(open) => { if (!open) setSelectedStudentReport(null); }}>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-violet-600 dark:text-violet-400" /> Student Profile &amp; Performance Monitor</DialogTitle>
                        <DialogDescription>Detailed tracking metrics, test histories, and proctoring logs.</DialogDescription>
                    </DialogHeader>

                    {selectedStudentReport && (
                        <div className="space-y-6 pt-4">
                            {/* Profile Info Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-slate-200 dark:border-zinc-800 pb-4">
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase">Student Details</p>
                                    <p className="text-lg font-bold text-slate-800 dark:text-zinc-200">{selectedStudentReport.name}</p>
                                    <p className="text-sm font-semibold text-violet-650 dark:text-violet-400">{selectedStudentReport.regNo}</p>
                                </div>
                                <div className="space-y-1.5 text-xs text-slate-600 dark:text-zinc-400">
                                    <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase">Contact Information</p>
                                    {selectedStudentReport.email && <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {selectedStudentReport.email}</p>}
                                    {selectedStudentReport.mobile && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {selectedStudentReport.mobile}</p>}
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase">Academics</p>
                                    <p className="text-sm font-bold text-slate-800 dark:text-zinc-300">CGPA: {selectedStudentReport.cgpa || "—"}</p>
                                    <p className="text-xs text-slate-500 font-semibold">Batch: {selectedStudentReport.batch || "—"}</p>
                                </div>
                            </div>

                            {/* Resume category badge details */}
                            {selectedStudentReport.resume && (
                                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3.5 space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5"><FileText className="h-4 w-4" /> Parsed Resume Metrics</p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded bg-violet-500/10 px-2 py-0.5 text-xs font-semibold text-violet-600 dark:text-violet-400">Top Match: {selectedStudentReport.resume.topCategory || "Uncategorized"}</span>
                                        {selectedStudentReport.resume.skills && (selectedStudentReport.resume.skills || []).slice(0, 8).map((s, idx) => (
                                            <span key={idx} className="rounded bg-slate-200/50 dark:bg-zinc-800/80 px-2 py-0.5 text-xs text-slate-700 dark:text-zinc-300">{s}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Test history records */}
                            <div className="space-y-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-zinc-400">Test Attempt Histories</p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Aptitude Section */}
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">Aptitude Tests</p>
                                        <div className="rounded-lg border border-slate-200 dark:border-zinc-800 overflow-hidden text-xs">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Test Name</TableHead>
                                                        <TableHead>Score</TableHead>
                                                        <TableHead>Violations</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {(selectedStudentReport.performance?.aptitude || []).map((a, idx) => (
                                                        <TableRow key={idx}>
                                                            <TableCell className="font-semibold">{a.testTitle}</TableCell>
                                                            <TableCell>{a.score} / {a.totalScore} ({a.percentage}%)</TableCell>
                                                            <TableCell className={a.violations > 0 ? "text-amber-650 dark:text-amber-400 font-bold" : "text-slate-400"}>{a.violations ?? 0}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {!(selectedStudentReport.performance?.aptitude || []).length && (
                                                        <TableRow>
                                                            <TableCell colSpan={3} className="py-4 text-center text-slate-500">No attempts registered.</TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>

                                    {/* Coding Section */}
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">Coding Tests</p>
                                        <div className="rounded-lg border border-slate-200 dark:border-zinc-800 overflow-hidden text-xs">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Test Name</TableHead>
                                                        <TableHead>Score</TableHead>
                                                        <TableHead>Violations</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {(selectedStudentReport.performance?.coding || []).map((a, idx) => (
                                                        <TableRow key={idx}>
                                                            <TableCell className="font-semibold">{a.testTitle}</TableCell>
                                                            <TableCell>{a.score} / {a.totalScore} ({a.percentage}%)</TableCell>
                                                            <TableCell className={a.violations > 0 ? "text-amber-650 dark:text-amber-400 font-bold" : "text-slate-400"}>{a.violations ?? 0}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {!(selectedStudentReport.performance?.coding || []).length && (
                                                        <TableRow>
                                                            <TableCell colSpan={3} className="py-4 text-center text-slate-500">No attempts registered.</TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
