import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Trash2, Edit3, Upload, Sparkles, BrainCircuit, FileCode } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader, EmptyState, DifficultyBadge } from "@/components/portal/primitives";
import { api } from "@/lib/api";
import QuestionForm from "@/components/staff/question-form";

export default function StaffQuestions() {
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [type, setType] = useState("");
    const [difficulty, setDifficulty] = useState("");
    const [search, setSearch] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [importOpen, setImportOpen] = useState(false);
    const [importKind, setImportKind] = useState("aptitude");
    const [importFile, setImportFile] = useState(null);
    const [aimlOpen, setAimlOpen] = useState(false);
    const [aimlFiles, setAimlFiles] = useState([]);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");

    const load = useCallback(() => {
        setLoading(true);
        api.questions.list({ type: type || undefined, difficulty: difficulty || undefined, search: search || undefined })
            .then(setQuestions)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [type, difficulty, search]);

    useEffect(() => {
        const t = setTimeout(load, search ? 400 : 0);
        return () => clearTimeout(t);
    }, [load, search]);

    useEffect(() => {
        api.questions.aimlFiles().then(setAimlFiles).catch(() => {});
    }, []);

    const openCreate = () => { setEditing(null); setFormOpen(true); };
    const openEdit = (q) => { setEditing(q); setFormOpen(true); };

    const save = async (payload) => {
        setBusy(true);
        try {
            if (editing) await api.questions.update(editing.id, payload);
            else await api.questions.create(payload);
            setFormOpen(false);
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (q) => {
        if (!confirm(`Delete "${q.title}"?`)) return;
        await api.questions.remove(q.id).catch((e) => alert(e.message));
        load();
    };

    const doImport = async () => {
        if (!importFile) return;
        setBusy(true);
        try {
            const r = await api.questions.importExcel(importFile, importKind);
            setMsg(`Imported ${r.count} ${importKind} questions.`);
            setImportOpen(false);
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const doAimlImport = async (file) => {
        setBusy(true);
        try {
            const r = await api.questions.aimlImport(file);
            setMsg(`Imported ${r.count} questions from ${file}.`);
            setAimlOpen(false);
            load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <PageHeader
                title="Question Bank"
                description="Manage aptitude and coding questions for your tests"
                action={
                    <>
                        <Button variant="outline" onClick={() => setAimlOpen(true)}><Sparkles className="h-4 w-4" /> AIML Auto-fill</Button>
                        <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import Excel</Button>
                        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Question</Button>
                    </>
                }
            />

            {msg && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">{msg}</div>}

            <Card className="border-zinc-800/80 bg-zinc-900/40">
                <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-48">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                            <Input placeholder="Search questions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                        </div>
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger className="w-36"><SelectValue placeholder="All types" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">All types</SelectItem>
                                <SelectItem value="aptitude">Aptitude</SelectItem>
                                <SelectItem value="coding">Coding</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={difficulty} onValueChange={setDifficulty}>
                            <SelectTrigger className="w-36"><SelectValue placeholder="Difficulty" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">All</SelectItem>
                                <SelectItem value="easy">Easy</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="hard">Hard</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="py-10 text-center text-sm text-zinc-500">Loading...</p>
                    ) : questions.length === 0 ? (
                        <EmptyState icon={type === "coding" ? FileCode : BrainCircuit} title="No questions found" description="Create a question manually or import from Excel / AIML." />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Question</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Format</TableHead>
                                    <TableHead>Difficulty</TableHead>
                                    <TableHead>Points</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {questions.map((q) => (
                                    <TableRow key={q.id}>
                                        <TableCell>
                                            <p className="font-medium text-zinc-100">{q.title}</p>
                                            <p className="max-w-xs truncate text-xs text-zinc-500">{q.description}</p>
                                        </TableCell>
                                        <TableCell>
                                            <span className="flex items-center gap-1.5 text-sm text-zinc-300">
                                                {q.type === "coding" ? <FileCode className="h-3.5 w-3.5 text-violet-400" /> : <BrainCircuit className="h-3.5 w-3.5 text-emerald-400" />}
                                                {q.type}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-300">{q.format}</TableCell>
                                        <TableCell><DifficultyBadge difficulty={q.difficulty} /></TableCell>
                                        <TableCell className="text-sm text-zinc-300">{q.points}</TableCell>
                                        <TableCell className="text-sm text-zinc-400">{q.source || (q.sourceFile ? "AIML" : "manual")}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(q)}><Edit3 className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => remove(q)}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit Question" : "Add Question"}</DialogTitle>
                        <DialogDescription>Create a question for the bank. Coding questions need at least one test case.</DialogDescription>
                    </DialogHeader>
                    <QuestionForm initial={editing} onSave={save} onCancel={() => setFormOpen(false)} saving={busy} />
                </DialogContent>
            </Dialog>

            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Import Questions from Excel</DialogTitle>
                        <DialogDescription>Upload an .xlsx or .csv file with the standard question columns.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Select value={importKind} onValueChange={setImportKind}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="aptitude">Aptitude questions</SelectItem>
                                <SelectItem value="coding">Coding questions</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                            <Button onClick={doImport} disabled={!importFile || busy}>{busy ? "Importing..." : "Import"}</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={aimlOpen} onOpenChange={setAimlOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>AIML Question Auto-fill</DialogTitle>
                        <DialogDescription>Import a question set that was generated/curated in the AIML pipeline.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        {aimlFiles.length === 0 && <p className="text-sm text-zinc-500">No AIML files found in AIML/data.</p>}
                        {aimlFiles.map((f) => (
                            <div key={f} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                <span className="text-sm text-zinc-300">{f}</span>
                                <Button size="sm" onClick={() => doAimlImport(f)} disabled={busy}>Import</Button>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
