import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Trash2, Edit3, Upload, Sparkles, BrainCircuit, FileCode, Layers, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader, EmptyState, DifficultyBadge, LoadingState } from "@/components/portal/primitives";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { downloadExcel } from "@/lib/excel-export";
import QuestionForm from "@/components/staff/question-form";

export default function StaffQuestions() {
    const [questions, setQuestions] = useState([]);
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [type, setType] = useState("");
    const [difficulty, setDifficulty] = useState("");
    const [search, setSearch] = useState("");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [importOpen, setImportOpen] = useState(false);
    const [importKind, setImportKind] = useState("aptitude");
    const [importFile, setImportFile] = useState(null);
    const [aimlOpen, setAimlOpen] = useState(false);
    const [aimlForm, setAimlForm] = useState({ testFormat: "aptitude_mcq", topics: "", count: 10, difficulty: "mixed" });
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    const [selectedIds, setSelectedIds] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            api.questions.list({ type: type || undefined, difficulty: difficulty || undefined, search: search || undefined }),
            api.tests.list()
        ])
            .then(([qList, tList]) => {
                setQuestions(qList);
                setTests(tList);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [type, difficulty, search]);

    useEffect(() => {
        const t = setTimeout(load, search ? 400 : 0);
        return () => clearTimeout(t);
    }, [load, search]);

    const openCreate = () => { setEditing(null); setFormOpen(true); };
    const openEdit = (q) => {
        setSelectedGroup(null);
        setEditing(q);
        setFormOpen(true);
    };

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
        try {
            await api.questions.remove(q.id);
            setSelectedIds((ids) => ids.filter((id) => id !== q.id));
            setSelectedGroup((group) => group
                ? { ...group, questions: group.questions.filter((question) => question.id !== q.id) }
                : group);
            load();
        } catch (error) {
            alert(`Failed to delete question: ${error.message}`);
        }
    };

    const removeSelected = async (questionIds) => {
        if (!questionIds.length || !confirm(`Delete ${questionIds.length} selected question${questionIds.length === 1 ? "" : "s"}?`)) return;
        setBusy(true);
        try {
            await Promise.all(questionIds.map((id) => api.questions.remove(id)));
            setSelectedIds((ids) => ids.filter((id) => !questionIds.includes(id)));
            setSelectedGroup((group) => group
                ? { ...group, questions: group.questions.filter((question) => !questionIds.includes(question.id)) }
                : group);
            load();
        } catch (e) {
            alert(`Failed to delete selected questions: ${e.message}`);
        } finally {
            setBusy(false);
        }
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

    const doAimlGenerate = async (action) => {
        const topics = aimlForm.topics.split(/[,;]/).map((topic) => topic.trim()).filter(Boolean);
        if (!topics.length) {
            alert("Enter at least one topic.");
            return;
        }
        setBusy(true);
        try {
            const result = await api.questions.aimlGenerate({
                ...aimlForm,
                topics,
                count: Number(aimlForm.count),
                action,
            });
            if (action !== "save") {
                try {
                    await downloadExcel(
                        `Questions-${aimlForm.testFormat}-${topics.join("-").replace(/[^a-z0-9-]/gi, "-")}`,
                        result.questions.map((question) => toQuestionWorkbookRow(question, aimlForm.testFormat)),
                        "Questions",
                    );
                } catch (downloadError) {
                    if (!result.savedCount) throw downloadError;
                    setMsg(`${result.savedCount} questions were saved, but Excel download failed: ${downloadError.message}`);
                    setAimlOpen(false);
                    load();
                    return;
                }
            }
            const downloaded = action !== "save" ? " Workbook downloaded." : "";
            const saved = result.savedCount ? `${result.savedCount} questions saved to the question bank.` : "Questions were not saved.";
            setMsg(`${saved}${downloaded}`);
            setAimlOpen(false);
            load();
        } catch (e) {
            alert(`AI question generation failed: ${e.message}`);
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

            {msg && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">{msg}</div>}

            <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-48">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                            <Input placeholder="Search questions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                        </div>
                        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
                            <SlidersHorizontal className="h-4 w-4" />
                            Filters{type || difficulty ? " (active)" : ""}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {loading ? (
                        <LoadingState label="Loading questions" className="py-10" />
                    ) : questions.length === 0 ? (
                        <EmptyState icon={type === "coding" ? FileCode : BrainCircuit} title="No questions found" description="Create a question manually or import from Excel / AIML." />
                    ) : (() => {
                        // Calculate groupings
                        const groups = [];
                        tests.forEach(t => {
                            const qList = (t.fixedQuestionIds || []).map(qid => questions.find(q => q.id === qid)).filter(Boolean);
                            const filteredList = qList.filter(q => {
                                if (type && q.type !== type) return false;
                                if (difficulty && q.difficulty !== difficulty) return false;
                                if (search && !q.title.toLowerCase().includes(search.toLowerCase())) return false;
                                return true;
                            });
                            if (filteredList.length > 0 || (!search && !type && !difficulty)) {
                                groups.push({
                                    id: t.id,
                                    name: t.title,
                                    questions: filteredList
                                });
                            }
                        });

                        return (
                            groups.length === 0 ? (
                                <EmptyState icon={Layers} title="No test groups found" description="Create a test and assign questions to see question groups here." />
                            ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {groups.map((g) => {
                                    const aptitudeCount = g.questions.filter((question) => question.type === "aptitude").length;
                                    const codingCount = g.questions.filter((question) => question.type === "coding").length;
                                    const totalPoints = g.questions.reduce((total, question) => total + (Number(question.points) || 0), 0);
                                    const difficultyCounts = ["easy", "medium", "hard"]
                                        .map((level) => ({
                                            level,
                                            count: g.questions.filter((question) => question.difficulty === level).length,
                                        }))
                                        .filter(({ count }) => count > 0);
                                    return (
                                        <div
                                            key={g.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setSelectedGroup(g)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    setSelectedGroup(g);
                                                }
                                            }}
                                            className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-violet-300 hover:bg-violet-50/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-violet-800 dark:hover:bg-violet-950/20"
                                        >
                                            <span className="flex flex-wrap items-center justify-between gap-4">
                                                <span className="flex min-w-0 items-center gap-3">
                                                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                                                        <Layers className="h-5 w-5" />
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-base font-semibold text-slate-900 dark:text-zinc-100">{g.name}</span>
                                                        <span className="mt-1 block text-sm text-slate-500 dark:text-zinc-400">
                                                            {g.questions.length} question{g.questions.length === 1 ? "" : "s"} assigned
                                                        </span>
                                                    </span>
                                                </span>
                                                <span className="shrink-0 rounded-lg bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 group-hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:group-hover:bg-violet-500/20">View questions</span>
                                            </span>
                                            <span className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                {[
                                                    { label: "Aptitude", value: aptitudeCount },
                                                    { label: "Coding", value: codingCount },
                                                    { label: "Total points", value: totalPoints },
                                                    { label: "Difficulty levels", value: difficultyCounts.length },
                                                ].map((stat) => (
                                                    <span key={stat.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/40">
                                                        <span className="block text-xs text-slate-500 dark:text-zinc-400">{stat.label}</span>
                                                        <span className="mt-0.5 block text-sm font-semibold text-slate-800 dark:text-zinc-100">{stat.value}</span>
                                                    </span>
                                                ))}
                                            </span>
                                            {difficultyCounts.length > 0 && (
                                                <span className="mt-3 flex flex-wrap gap-2">
                                                    {difficultyCounts.map(({ level, count }) => (
                                                        <span key={level} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs capitalize text-slate-600 dark:border-zinc-700 dark:text-zinc-300">
                                                            {level}: {count}
                                                        </span>
                                                    ))}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            )
                        );
                    })()}
                </CardContent>
            </Card>

            <Dialog open={selectedGroup !== null} onOpenChange={(open) => { if (!open) setSelectedGroup(null); }}>
                <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedGroup?.name || "Questions"}</DialogTitle>
                        <DialogDescription>
                            {selectedGroup?.questions.length || 0} question{selectedGroup?.questions.length === 1 ? "" : "s"} in this group.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedGroup && selectedIds.some((id) => selectedGroup.questions.some((question) => question.id === id)) && (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/60 dark:bg-red-950/30">
                            <p className="text-sm text-red-700 dark:text-red-300">
                                {selectedGroup.questions.filter((question) => selectedIds.includes(question.id)).length} question(s) selected
                            </p>
                            <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                disabled={busy}
                                onClick={() => removeSelected(selectedGroup.questions
                                    .filter((question) => selectedIds.includes(question.id))
                                    .map((question) => question.id))}
                            >
                                <Trash2 className="h-4 w-4" /> Delete selected
                            </Button>
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10">
                                        <Checkbox
                                            checked={Boolean(selectedGroup?.questions.length) && selectedGroup.questions.every((question) => selectedIds.includes(question.id))}
                                            onCheckedChange={(checked) => setSelectedIds((ids) => checked
                                                ? [...new Set([...ids, ...selectedGroup.questions.map((question) => question.id)])]
                                                : ids.filter((id) => !selectedGroup.questions.some((question) => question.id === id)))}
                                            aria-label={`Select all questions in ${selectedGroup?.name || "group"}`}
                                        />
                                    </TableHead>
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
                                {(selectedGroup?.questions || []).map((question) => (
                                    <TableRow key={question.id}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedIds.includes(question.id)}
                                                onCheckedChange={(checked) => setSelectedIds((ids) => checked
                                                    ? [...new Set([...ids, question.id])]
                                                    : ids.filter((id) => id !== question.id))}
                                                aria-label={`Select ${question.title}`}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <p className="font-semibold text-slate-800 dark:text-zinc-200">{question.title}</p>
                                            <p className="max-w-xs truncate text-xs text-slate-500 dark:text-zinc-500">{question.description}</p>
                                        </TableCell>
                                        <TableCell>
                                            <span className="flex items-center gap-1.5 text-sm capitalize text-slate-700 dark:text-zinc-300">
                                                {question.type === "coding" ? <FileCode className="h-3.5 w-3.5 text-violet-500" /> : <BrainCircuit className="h-3.5 w-3.5 text-emerald-500" />}
                                                {question.type}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm capitalize text-slate-700 dark:text-zinc-300">{question.format}</TableCell>
                                        <TableCell><DifficultyBadge difficulty={question.difficulty} /></TableCell>
                                        <TableCell className="text-sm font-medium text-slate-700 dark:text-zinc-300">{question.points}</TableCell>
                                        <TableCell className="text-sm capitalize text-slate-500 dark:text-zinc-400">{question.source || (question.sourceFile ? "AIML" : "manual")}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(question)} aria-label={`Edit ${question.title}`}>
                                                    <Edit3 className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-500 dark:text-red-400" onClick={() => remove(question)} aria-label={`Delete ${question.title}`}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {selectedGroup?.questions.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} className="py-4 text-center text-slate-500">No questions match filters.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Filter questions</DialogTitle>
                        <DialogDescription>Choose the question types and difficulty levels to show.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5">
                        <section className="space-y-2">
                            <h3 className="text-sm font-medium">Type</h3>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { value: "", label: "All types" },
                                    { value: "aptitude", label: "Aptitude" },
                                    { value: "coding", label: "Coding" },
                                ].map((option) => (
                                    <Button
                                        key={option.value || "all"}
                                        type="button"
                                        variant={type === option.value ? "default" : "outline"}
                                        aria-pressed={type === option.value}
                                        onClick={() => setType(option.value)}
                                    >
                                        {option.label}
                                    </Button>
                                ))}
                            </div>
                        </section>
                        <section className="space-y-2">
                            <h3 className="text-sm font-medium">Difficulty</h3>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { value: "", label: "All" },
                                    { value: "easy", label: "Easy" },
                                    { value: "medium", label: "Medium" },
                                    { value: "hard", label: "Hard" },
                                ].map((option) => (
                                    <Button
                                        key={option.value || "all"}
                                        type="button"
                                        variant={difficulty === option.value ? "default" : "outline"}
                                        aria-pressed={difficulty === option.value}
                                        onClick={() => setDifficulty(option.value)}
                                    >
                                        {option.label}
                                    </Button>
                                ))}
                            </div>
                        </section>
                        <div className="flex justify-end">
                            <Button onClick={() => setFiltersOpen(false)}>Done</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

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
                        <DialogDescription>
                            ChatGPT-generated question sets can be uploaded as .xlsx or .csv. Use one question per row and these columns:
                            {importKind === "aptitude"
                                ? " Question, OptionA, OptionB, OptionC, OptionD, CorrectAnswer, Difficulty, Subject, Points, Tags."
                                : " Title, Description, Difficulty, Language, Points, Constraints, InputFormat, OutputFormat, ExampleInput1, ExampleOutput1, TestCase1Input, TestCase1Output."}
                            {" "}For multiple-choice questions, set CorrectAnswer to A, B, C, or D (or the exact option text).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Select value={importKind} onValueChange={setImportKind}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="aptitude">Aptitude questions</SelectItem>
                                <SelectItem value="coding">Coding questions</SelectItem>
                            </SelectContent>
                        </Select>
                        <FileInput accept=".xlsx,.xls,.csv" placeholder="Select Excel or CSV file" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
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
                        <DialogDescription>
                            Generate original questions by format, topic, count, and difficulty. An LLM provider must be configured on the backend. The role-recognition skills.json file is not needed here.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>Question format</Label>
                            <Select value={aimlForm.testFormat} onValueChange={(testFormat) => setAimlForm((form) => ({ ...form, testFormat }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="aptitude_mcq">Aptitude MCQ</SelectItem>
                                    <SelectItem value="aptitude_fillup">Aptitude Fill-up</SelectItem>
                                    <SelectItem value="coding_mcq">Coding MCQ</SelectItem>
                                    <SelectItem value="coding_programming">Coding Programming</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="aiml-topics">Topics</Label>
                            <Input id="aiml-topics" value={aimlForm.topics} onChange={(event) => setAimlForm((form) => ({ ...form, topics: event.target.value }))} placeholder="e.g. React hooks, SQL joins, Percentages" />
                            <p className="text-xs text-slate-500 dark:text-zinc-400">Separate topics with commas or semicolons.</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="aiml-count">Number of questions (1-30)</Label>
                                <Input id="aiml-count" type="number" min={1} max={30} value={aimlForm.count} onChange={(event) => setAimlForm((form) => ({ ...form, count: event.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Difficulty</Label>
                                <Select value={aimlForm.difficulty} onValueChange={(difficulty) => setAimlForm((form) => ({ ...form, difficulty }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="mixed">Mixed (Easy / Medium / Hard)</SelectItem>
                                        <SelectItem value="easy">Easy</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="hard">Hard</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-zinc-800">
                            <Button variant="outline" onClick={() => setAimlOpen(false)} disabled={busy}>Cancel</Button>
                            <Button variant="outline" onClick={() => doAimlGenerate("download")} disabled={busy}>{busy ? "Generating..." : "Generate & Download"}</Button>
                            <Button variant="outline" onClick={() => doAimlGenerate("both")} disabled={busy}>{busy ? "Generating..." : "Generate, Save & Download"}</Button>
                            <Button onClick={() => doAimlGenerate("save")} disabled={busy}>{busy ? "Generating..." : "Generate & Save"}</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function toQuestionWorkbookRow(question, testFormat) {
    const common = {
        Question: question.title,
        Topic: question.topic || question.tags?.[0] || "",
        Difficulty: question.difficulty,
        Points: question.points,
        Explanation: question.explanation || "",
    };
    if (testFormat.endsWith("_mcq")) {
        return {
            ...common,
            "Option A": question.options?.[0] || "",
            "Option B": question.options?.[1] || "",
            "Option C": question.options?.[2] || "",
            "Option D": question.options?.[3] || "",
            "Correct Answer": String.fromCharCode(65 + question.correctOption),
            "Code Snippet": question.codeSnippet || "",
        };
    }
    if (testFormat === "aptitude_fillup") {
        return {
            ...common,
            "Correct Answer": question.answer,
            "Accepted Answers": (question.acceptedAnswers || []).join("; "),
        };
    }
    return {
        ...common,
        "Problem Statement": question.description,
        "Input Format": question.inputFormat || "",
        "Output Format": question.outputFormat || "",
        Constraints: (question.constraints || []).join("\n"),
        Language: question.language || "",
        "Starter Code": question.codeSnippet || "",
        "Example 1 Input": question.examples?.[0]?.input || "",
        "Example 1 Output": question.examples?.[0]?.output || "",
        "Test Case 1": question.testCases?.[0] ? `${question.testCases[0].input} => ${question.testCases[0].expectedOutput}` : "",
        "Test Case 2": question.testCases?.[1] ? `${question.testCases[1].input} => ${question.testCases[1].expectedOutput}` : "",
        "Edge Case 1": question.testCases?.find((testCase) => testCase.isHard)
            ? `${question.testCases.find((testCase) => testCase.isHard).input} => ${question.testCases.find((testCase) => testCase.isHard).expectedOutput}`
            : "",
    };
}
