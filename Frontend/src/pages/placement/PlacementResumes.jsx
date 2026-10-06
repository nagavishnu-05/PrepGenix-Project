import { useState, useEffect, useCallback, useMemo } from "react";
import { Download, Eye, Upload, RefreshCw, Trash2, FileText, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { getSectionsForBatch, getStudentSection } from "@/lib/student-section";

export default function PlacementResumes() {
    const [resumes, setResumes] = useState([]);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [uploadOpen, setUploadOpen] = useState(false);
    const [regNo, setRegNo] = useState("");
    const [file, setFile] = useState(null);
    const [catOpen, setCatOpen] = useState(false);
    const [catTarget, setCatTarget] = useState(null);
    const [catInput, setCatInput] = useState("");
    const [top, setTop] = useState("");
    const [busy, setBusy] = useState(false);
    const [batch, setBatch] = useState("all");
    const [section, setSection] = useState("all");
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState("");

    useEffect(() => () => {
        if (preview?.url) URL.revokeObjectURL(preview.url);
    }, [preview]);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            const [resumeRows, studentRows] = await Promise.all([api.resumes.list({}), api.students.list({})]);
            setResumes(resumeRows);
            setStudents(studentRows);
        } catch (error) {
            setLoadError(error.message || "Could not load resumes and students.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const batches = useMemo(
        () => [...new Set(students.map((student) => student.batch).filter(Boolean))].sort(),
        [students]
    );
    const batchStudents = useMemo(
        () => students.filter((student) => batch === "all" || student.batch === batch),
        [students, batch]
    );
    const sections = useMemo(() => getSectionsForBatch(batch, students), [batch, students]);
    const visibleResumes = useMemo(() => {
        const byRegNo = new Map(batchStudents.map((student) => [student.regNo, student]));
        return resumes.filter((resume) => {
            if (!byRegNo.has(resume.regNo)) return false;
            return section === "all" || getStudentSection(resume.regNo) === section;
        });
    }, [batchStudents, resumes, section]);

    const changeBatch = (value) => {
        setBatch(value);
        setSection("all");
    };

    const viewResume = async (resume) => {
        setPreviewLoading(resume.regNo);
        try {
            const fileBlob = await api.resumes.file(resume.regNo);
            setPreview({ name: resume.fileName, url: URL.createObjectURL(fileBlob) });
        } catch (error) {
            alert(error.message);
        } finally {
            setPreviewLoading("");
        }
    };

    const downloadResume = async (resume) => {
        setPreviewLoading(resume.regNo);
        try {
            const fileBlob = await api.resumes.file(resume.regNo);
            const url = URL.createObjectURL(fileBlob);
            const link = document.createElement("a");
            link.href = url;
            link.download = resume.fileName || "resume";
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            alert(error.message);
        } finally {
            setPreviewLoading("");
        }
    };

    const doUpload = async () => {
        if (!regNo || !file) return;
        setBusy(true);
        try {
            await api.resumes.upload(regNo, file);
            setUploadOpen(false);
            setFile(null);
            setRegNo("");
            await load();
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
            await load();
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
            await load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (r) => {
        if (!confirm(`Delete resume for ${r.studentName}?`)) return;
        setBusy(true);
        try {
            await api.resumes.remove(r.regNo);
            await load();
        } catch (error) {
            alert(error.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <PageHeader
                title="Resumes"
                description="Upload and categorize student resumes for shortlisting"
                action={<Button onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload Resume</Button>}
            />

            <div className="mb-4 flex flex-wrap gap-3">
                <Select value={batch} onValueChange={changeBatch}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Select batch" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All batches</SelectItem>
                        {batches.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={section} onValueChange={setSection}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Select section" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All sections</SelectItem>
                        {sections.map((item) => <SelectItem key={item} value={item}>Section {item}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                <CardContent className="p-0">
                    {loading ? (
                        <div role="status" aria-label="Loading resumes" className="space-y-4 p-5">
                            <div className="flex items-center gap-3">
                                <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600 dark:border-violet-950 dark:border-t-violet-400" />
                                <span className="sr-only">Loading resumes</span>
                                <Skeleton className="h-4 w-36 bg-slate-200 dark:bg-zinc-700" />
                            </div>
                            {[0, 1, 2, 3, 4].map((row) => (
                                <div key={row} className="grid grid-cols-6 gap-4">
                                    {[0, 1, 2, 3, 4, 5].map((cell) => (
                                        <Skeleton key={cell} className="h-9 bg-slate-100 dark:bg-zinc-800" />
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : loadError ? (
                        <div className="flex flex-col items-center gap-3 p-10 text-center">
                            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
                            <Button variant="outline" onClick={load}>Try again</Button>
                        </div>
                    ) : visibleResumes.length === 0 ? (
                        <div className="p-10">
                            <EmptyState icon={FileText} title="No resumes found" description="No uploaded resumes match the selected batch and roll number." />
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
                                {visibleResumes.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell>
                                            <p className="font-medium text-slate-800 dark:text-zinc-100">{r.studentName}</p>
                                            <p className="text-xs text-slate-500 dark:text-zinc-500">{r.regNo}</p>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <span className="min-w-0 truncate text-sm text-slate-500 dark:text-zinc-400">{r.fileName}</span>
                                                {r.fileName?.toLowerCase().endsWith(".pdf") ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 shrink-0"
                                                        onClick={() => viewResume(r)}
                                                        disabled={previewLoading === r.regNo}
                                                        title="View PDF"
                                                        aria-label={`View ${r.studentName}'s resume`}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 shrink-0"
                                                        onClick={() => downloadResume(r)}
                                                        disabled={previewLoading === r.regNo}
                                                        title="Download resume"
                                                        aria-label={`Download ${r.studentName}'s resume`}
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
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

            <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}>
                <DialogContent className="flex h-[88vh] max-w-5xl flex-col gap-3">
                    <DialogHeader>
                        <DialogTitle>{preview?.name || "Resume preview"}</DialogTitle>
                        <DialogDescription>PDF resume preview</DialogDescription>
                    </DialogHeader>
                    {preview && (
                        <iframe
                            title={`Resume preview: ${preview.name}`}
                            src={preview.url}
                            className="min-h-0 w-full flex-1 rounded-lg border border-slate-200 dark:border-zinc-700"
                        />
                    )}
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
