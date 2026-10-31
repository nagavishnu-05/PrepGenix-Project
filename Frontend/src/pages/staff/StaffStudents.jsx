import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Upload, Trash2, FileText, Users, ChevronDown, ChevronRight, AlertTriangle, GraduationCap, Mail, Phone, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader, EmptyState, LoadingState } from "@/components/portal/primitives";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { downloadExcel } from "@/lib/excel-export";
import { getStudentSection } from "@/lib/student-section";

export default function StaffStudents() {
    const [rows, setRows] = useState([]);
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [batch, setBatch] = useState("");
    const [search, setSearch] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
    const [batchToDelete, setBatchToDelete] = useState("");
    const [batchDeleteConfirmation, setBatchDeleteConfirmation] = useState("");
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [newStudent, setNewStudent] = useState({ regNo: "", rollNo: "", name: "", email: "", mobile: "", cgpa: "", batch: "" });

    // Grouping & individual detail popup state
    const [expandedBatches, setExpandedBatches] = useState({});
    const [selectedStudentReport, setSelectedStudentReport] = useState(null);
    const [reportLoading, setReportLoading] = useState(false);

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
        api.students.batches().then((bList) => {
            setBatches(bList);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (batch) setExpandedBatches({ [batch]: true });
    }, [batch]);

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

    const toggleBatch = (b) => {
        setExpandedBatches(x => ({ ...x, [b]: !x[b] }));
    };

    const exportStudents = async () => {
        try {
            const exportBatch = batch ? `-${batch.replace(/[^a-z0-9-]+/gi, "-")}` : "";
            await downloadExcel(`Student-Records${exportBatch}`, rows.map((student) => ({
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
        } catch (error) {
            alert(`Failed to export students: ${error.message}`);
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
            if (batch === batchToDelete) setBatch("");
            else load();
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
                        <Button variant="outline" onClick={exportStudents} disabled={loading || rows.length === 0}>
                            <Download className="h-4 w-4" /> Export Excel
                        </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2" aria-label="Filter students by batch">
                        <Button type="button" size="sm" variant={batch === "" ? "default" : "outline"} aria-pressed={batch === ""} onClick={() => setBatch("")}>
                            All batches
                        </Button>
                        {batches.map((item) => (
                            <Button
                                key={item}
                                type="button"
                                size="sm"
                                variant={batch === item ? "default" : "outline"}
                                aria-pressed={batch === item}
                                onClick={() => setBatch(item)}
                            >
                                {item}
                            </Button>
                        ))}
                        {Object.keys(grouped).length > 1 && (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="ml-auto"
                                onClick={() => {
                                    const expandAll = !Object.keys(grouped).every((key) => expandedBatches[key]);
                                    setExpandedBatches(Object.fromEntries(Object.keys(grouped).map((key) => [key, expandAll])));
                                }}
                            >
                                {Object.keys(grouped).every((key) => expandedBatches[key]) ? "Collapse all" : "Expand all"}
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {loading ? (
                        <LoadingState label="Loading students" className="py-10" />
                    ) : rows.length === 0 ? (
                        <EmptyState icon={Users} title="No students found" description="Add students manually or import them from an Excel file." />
                    ) : (
                        Object.keys(grouped).map((batchKey) => {
                            const isExpanded = !!expandedBatches[batchKey];
                            const studentList = grouped[batchKey];

                            return (
                                <div key={batchKey} className="rounded-xl border border-slate-200 dark:border-zinc-800/60 bg-white/50 dark:bg-zinc-900/10 overflow-hidden shadow-sm">
                                    {/* Collapsible header section */}
                                    <button
                                        type="button"
                                        aria-expanded={isExpanded}
                                        onClick={() => toggleBatch(batchKey)}
                                        className="flex w-full items-center justify-between px-4 py-3 bg-slate-50 text-left transition-colors hover:bg-slate-100 dark:bg-zinc-950/60 dark:hover:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-800"
                                    >
                                        <div className="flex items-center gap-2">
                                            {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                                            <span className="font-bold text-sm text-slate-800 dark:text-zinc-200">
                                                {batchKey === "No Batch" ? "Unassigned Batch" : `Batch ${batchKey}`}
                                            </span>
                                            <span className="rounded-full bg-slate-200/60 dark:bg-zinc-800 px-2.5 py-0.5 text-xs text-slate-650 dark:text-zinc-400 font-semibold">
                                                {studentList.length} student{studentList.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </button>

                                    {/* Expanded table */}
                                    {isExpanded && (
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
                                                {studentList.map((s) => (
                                                    <TableRow key={s.regNo} className="hover:bg-slate-50/40 dark:hover:bg-zinc-800/10 transition-colors">
                                                        <TableCell>
                                                            <p onClick={() => openStudentReport(s)} className="font-semibold text-slate-800 dark:text-zinc-150 cursor-pointer hover:text-violet-650 dark:hover:text-violet-400 hover:underline">
                                                                {s.name}
                                                            </p>
                                                            <p className="text-xs text-slate-500">{s.regNo}{s.rollNo ? ` · Roll ${s.rollNo}` : ""}</p>
                                                        </TableCell>
                                                        <TableCell className="text-sm text-slate-700 dark:text-zinc-300 font-medium">{s.cgpa ?? "—"}</TableCell>
                                                        <TableCell>
                                                            {s.hasResume ? (
                                                                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold"><FileText className="h-3.5 w-3.5" /> {s.topCategory || "Parsed"}</span>
                                                            ) : (
                                                                <span className="text-xs text-slate-500 dark:text-zinc-550">None</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-slate-700 dark:text-zinc-300">
                                                            {s.aptitudeCount ? `${s.lastAptitude?.percentage ?? s.aptitudeAverage}% (${s.aptitudeCount})` : "—"}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-slate-700 dark:text-zinc-300">
                                                            {s.codingCount ? `${s.lastCoding?.percentage ?? s.codingAverage}% (${s.codingCount})` : "—"}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-slate-700 dark:text-zinc-300">{s.interviewCount || "—"}</TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <Button variant="ghost" size="sm" onClick={() => openStudentReport(s)}><Users className="h-4 w-4" /> Monitor</Button>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-650 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300" onClick={() => remove(s.regNo)}><Trash2 className="h-4 w-4" /></Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </CardContent>
            </Card>

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
                        <div className="space-y-1.5">
                            <Label htmlFor="delete-student-batch">Batch to delete</Label>
                            <Select value={batchToDelete} onValueChange={(value) => { setBatchToDelete(value); setBatchDeleteConfirmation(""); }}>
                                <SelectTrigger id="delete-student-batch"><SelectValue placeholder="Select a batch" /></SelectTrigger>
                                <SelectContent>
                                    {batches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                </SelectContent>
                            </Select>
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
