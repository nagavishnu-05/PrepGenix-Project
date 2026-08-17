import { useState, useEffect, useCallback } from "react";
import { Upload, RefreshCw, Trash2, FileText, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { api } from "@/lib/api";

export default function PlacementResumes() {
    const [resumes, setResumes] = useState([]);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [regNo, setRegNo] = useState("");
    const [file, setFile] = useState(null);
    const [catOpen, setCatOpen] = useState(false);
    const [catTarget, setCatTarget] = useState(null);
    const [catInput, setCatInput] = useState("");
    const [top, setTop] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([api.resumes.list({}), api.students.list({})])
            .then(([r, s]) => {
                setResumes(r);
                setStudents(s);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const doUpload = async () => {
        if (!regNo || !file) return;
        setBusy(true);
        try {
            await api.resumes.upload(regNo, file);
            setUploadOpen(false);
            setFile(null);
            setRegNo("");
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const reparse = async (r) => {
        setBusy(true);
        try {
            await api.resumes.parse(r.regNo);
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const openCats = (r) => {
        setCatTarget(r);
        setCatInput((r.categories || []).map((c) => (typeof c === "string" ? c : c.name)).join(", "));
        setTop(r.topCategory || "");
        setCatOpen(true);
    };

    const saveCats = async () => {
        if (!catTarget) return;
        setBusy(true);
        try {
            await api.resumes.updateCategories(catTarget.regNo, catInput.split(",").map((c) => c.trim()).filter(Boolean), top || null);
            setCatOpen(false);
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (r) => {
        if (!confirm(`Delete resume for ${r.studentName}?`)) return;
        await api.resumes.remove(r.regNo).catch((e) => alert(e.message));
        load();
    };

    return (
        <div>
            <PageHeader
                title="Resumes"
                description="Upload and categorize student resumes for shortlisting"
                action={<Button onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload Resume</Button>}
            />

            <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                <CardContent className="p-0">
                    {loading ? (
                        <p className="py-10 text-center text-sm text-slate-500 dark:text-zinc-500">Loading...</p>
                    ) : resumes.length === 0 ? (
                        <div className="p-10">
                            <EmptyState icon={FileText} title="No resumes" description="Upload a student resume — it will be parsed automatically for skills and categories." />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>File</TableHead>
                                    <TableHead>Skills</TableHead>
                                    <TableHead>Categories</TableHead>
                                    <TableHead>Top</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {resumes.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell>
                                            <p className="font-medium text-slate-800 dark:text-zinc-100">{r.studentName}</p>
                                            <p className="text-xs text-slate-500 dark:text-zinc-500">{r.regNo}</p>
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-500 dark:text-zinc-400">{r.fileName}</TableCell>
                                        <TableCell>
                                            <div className="flex max-w-xs flex-wrap gap-1">
                                                {(r.skills || []).slice(0, 4).map((s) => (
                                                    <span key={s} className="rounded bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 text-xs text-slate-700 dark:text-zinc-300">{s}</span>
                                                ))}
                                                {(r.skills || []).length > 4 && <span className="text-xs text-slate-500 dark:text-zinc-500">+{(r.skills || []).length - 4}</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">{(r.categories || []).map((c) => (typeof c === "string" ? c : c.name)).join(", ") || "—"}</TableCell>
                                        <TableCell className="text-sm text-violet-600 dark:text-violet-400">{r.topCategory || "—"}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="sm" onClick={() => openCats(r)}><Tag className="h-4 w-4" /> Categories</Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => reparse(r)} title="Re-parse"><RefreshCw className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-650 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Upload Resume</DialogTitle>
                        <DialogDescription>Select a student and upload a PDF / DOCX / TXT resume.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Student</Label>
                            <Select value={regNo} onValueChange={setRegNo}>
                                <SelectTrigger><SelectValue placeholder="Select a student" /></SelectTrigger>
                                <SelectContent>
                                    {students.map((s) => <SelectItem key={s.regNo} value={s.regNo}>{s.regNo} — {s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <FileInput accept=".pdf,.docx,.txt" placeholder="Select resume (PDF, DOCX, TXT)" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
                            <Button onClick={doUpload} disabled={!regNo || !file || busy}>{busy ? "Uploading & parsing..." : "Upload"}</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={catOpen} onOpenChange={setCatOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Resume Categories</DialogTitle>
                        <DialogDescription>{catTarget?.studentName} — used for AI-based shortlisting.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Categories (comma separated)</Label>
                            <Input value={catInput} onChange={(e) => setCatInput(e.target.value)} placeholder="web, python, testing" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Top category</Label>
                            <Input value={top} onChange={(e) => setTop(e.target.value)} placeholder="e.g. web" />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setCatOpen(false)}>Cancel</Button>
                            <Button onClick={saveCats} disabled={busy}>Save</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
