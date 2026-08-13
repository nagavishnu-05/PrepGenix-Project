import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Upload, Trash2, FileText, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { api } from "@/lib/api";

export default function StaffStudents() {
    const [rows, setRows] = useState([]);
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [batch, setBatch] = useState("");
    const [search, setSearch] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [newStudent, setNewStudent] = useState({ regNo: "", rollNo: "", name: "", email: "", mobile: "", cgpa: "", department: "", batch: "" });

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
        api.students.batches().then(setBatches).catch(() => {});
    }, []);

    const addStudent = async () => {
        if (!newStudent.regNo.trim() || !newStudent.name.trim()) {
            alert("Reg number and name are required.");
            return;
        }
        setBusy(true);
        try {
            await api.students.create(newStudent);
            setAddOpen(false);
            setNewStudent({ regNo: "", rollNo: "", name: "", email: "", mobile: "", cgpa: "", department: "", batch: "" });
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
            alert(`Imported ${r.count || 0} students.`);
            setImportOpen(false);
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (regNo) => {
        if (!confirm(`Delete student ${regNo}? This removes their account, attempts and resume.`)) return;
        await api.students.remove(regNo).catch((e) => alert(e.message));
        load();
    };

    return (
        <div>
            <PageHeader
                title="Students"
                description="Manage student records and track their performance"
                action={
                    <>
                        <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import Excel</Button>
                        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Student</Button>
                    </>
                }
            />

            <Card className="border-zinc-800/80 bg-zinc-900/40">
                <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-48">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                            <Input placeholder="Search by name or reg number..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                        </div>
                        <Select value={batch} onValueChange={setBatch}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="All batches" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">All batches</SelectItem>
                                {batches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="py-10 text-center text-sm text-zinc-500">Loading...</p>
                    ) : rows.length === 0 ? (
                        <EmptyState icon={Users} title="No students found" description="Add students manually or import them from an Excel file." />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Batch</TableHead>
                                    <TableHead>CGPA</TableHead>
                                    <TableHead>Resume</TableHead>
                                    <TableHead>Aptitude</TableHead>
                                    <TableHead>Coding</TableHead>
                                    <TableHead>Interviews</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((s) => (
                                    <TableRow key={s.regNo}>
                                        <TableCell>
                                            <p className="font-medium text-zinc-100">{s.name}</p>
                                            <p className="text-xs text-zinc-500">{s.regNo}</p>
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-300">{s.batch || "—"}</TableCell>
                                        <TableCell className="text-sm text-zinc-300">{s.cgpa ?? "—"}</TableCell>
                                        <TableCell>
                                            {s.hasResume ? (
                                                <span className="flex items-center gap-1 text-xs text-emerald-400"><FileText className="h-3.5 w-3.5" /> {s.topCategory || "Parsed"}</span>
                                            ) : (
                                                <span className="text-xs text-zinc-500">None</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-300">
                                            {s.aptitudeCount ? `${s.lastAptitude?.percentage ?? s.aptitudeAverage}% (${s.aptitudeCount})` : "—"}
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-300">
                                            {s.codingCount ? `${s.lastCoding?.percentage ?? s.codingAverage}% (${s.codingCount})` : "—"}
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-300">{s.interviewCount || "—"}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => remove(s.regNo)}><Trash2 className="h-4 w-4" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
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
                            <Label className="text-xs text-zinc-400">Department</Label>
                            <Input value={newStudent.department} onChange={(e) => setNewStudent({ ...newStudent, department: e.target.value })} placeholder="CSE" />
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
                        <DialogDescription>Upload an .xlsx or .csv file with columns: regNo, name, email, batch, department, cgpa...</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                            <Button onClick={doImport} disabled={!file || busy}>{busy ? "Importing..." : "Import"}</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
