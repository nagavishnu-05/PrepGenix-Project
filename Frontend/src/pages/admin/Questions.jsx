import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Edit3, Trash2, ChevronDown, ChevronUp, Sparkles, Loader2, } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/store/auth-store";
const DIFFICULTY_COLORS = {
    Easy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    Hard: "bg-red-500/10 text-red-400 border-red-500/20",
};
const QUESTION_TYPES = [
    { label: "Easy", value: "easy" },
    { label: "Medium", value: "medium" },
    { label: "Hard", value: "hard" },
    { label: "SQL", value: "sql" },
    { label: "Debugging", value: "debugging" },
];
export default function AdminQuestionsPage() {
    const { user } = useAuthStore();
    const [questions, setQuestions] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [difficultyFilter, setDifficultyFilter] = useState("all");
    const [expandedId, setExpandedId] = useState(null);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        title: "",
        description: "",
        type: "easy",
        difficulty: "Easy",
        points: 100,
        timeLimit: 30,
        constraints: "",
        hints: "",
        tags: "",
        starterCode: "",
        examples: [{ input: "", output: "", explanation: "" }],
        testCases: [{ input: "", expectedOutput: "", isHidden: false, points: 25 }],
    });
    const loadQuestions = useCallback(async () => {
        setIsLoading(true);
        try {
            const { api } = await import("@/lib/api");
            const data = await api.questions.listBank();
            setQuestions(data);
        }
        catch {
            setQuestions([]);
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    useEffect(() => {
        loadQuestions();
    }, [loadQuestions]);
    const filteredQuestions = questions.filter((q) => {
        if (difficultyFilter !== "all" && q.difficulty !== difficultyFilter)
            return false;
        if (searchQuery) {
            const qs = searchQuery.toLowerCase();
            return q.title.toLowerCase().includes(qs) || q.tags.some((t) => t.toLowerCase().includes(qs));
        }
        return true;
    });
    const resetForm = () => {
        setForm({
            title: "",
            description: "",
            type: "easy",
            difficulty: "Easy",
            points: 100,
            timeLimit: 30,
            constraints: "",
            hints: "",
            tags: "",
            starterCode: "",
            examples: [{ input: "", output: "", explanation: "" }],
            testCases: [{ input: "", expectedOutput: "", isHidden: false, points: 25 }],
        });
        setEditingId(null);
    };
    const openEdit = async (id) => {
        try {
            const { api } = await import("@/lib/api");
            const q = await api.questions.get(id);
            setForm({
                title: q.title,
                description: q.description,
                type: q.type,
                difficulty: q.difficulty,
                points: q.points,
                timeLimit: q.timeLimit,
                constraints: q.constraints.join("\n"),
                hints: (q.hints || []).join("\n"),
                tags: (q.tags || []).join(", "),
                starterCode: q.starterCode ? JSON.stringify(q.starterCode, null, 2) : "",
                examples: q.examples.length > 0 ? q.examples.map((e) => ({ input: e.input, output: e.output, explanation: e.explanation || "" })) : [{ input: "", output: "", explanation: "" }],
                testCases: q.testCases.length > 0
                    ? q.testCases.map((tc) => ({ input: tc.input, expectedOutput: tc.expectedOutput, isHidden: tc.isHidden, points: tc.points }))
                    : [{ input: "", expectedOutput: "", isHidden: false, points: 25 }],
            });
            setEditingId(id);
            setShowCreateDialog(true);
        }
        catch {
            // ignore
        }
    };
    const handleSave = async () => {
        setSaving(true);
        try {
            const { api } = await import("@/lib/api");
            const data = {
                title: form.title,
                description: form.description,
                type: form.type,
                difficulty: form.difficulty,
                points: form.points,
                timeLimit: form.timeLimit,
                constraints: form.constraints.split("\n").filter(Boolean),
                hints: form.hints.split("\n").filter(Boolean),
                tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
                starterCode: form.starterCode ? JSON.parse(form.starterCode) : undefined,
                examples: form.examples.filter((e) => e.input && e.output),
                testCases: form.testCases.filter((tc) => tc.input && tc.expectedOutput),
            };
            if (editingId) {
                await api.questions.update(editingId, data);
            }
            else {
                await api.questions.create(data);
            }
            setShowCreateDialog(false);
            resetForm();
            loadQuestions();
        }
        catch (e) {
            alert("Failed to save question: " + (e instanceof Error ? e.message : "Unknown error"));
        }
        finally {
            setSaving(false);
        }
    };
    const handleDelete = async (id) => {
        if (!confirm("Delete this question? This cannot be undone."))
            return;
        try {
            const { api } = await import("@/lib/api");
            await api.questions.delete(id);
            loadQuestions();
        }
        catch {
            alert("Failed to delete question");
        }
    };
    return (<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Question Bank</h1>
          <p className="text-zinc-400">Create and manage coding assessment questions.</p>
        </div>
        <Button variant="gradient" onClick={() => { resetForm(); setShowCreateDialog(true); }}>
          <Plus className="h-4 w-4 mr-1"/>
          New Question
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/>
              <Input placeholder="Search questions..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9"/>
            </div>
            <div className="flex gap-1">
              {["all", "Easy", "Medium", "Hard"].map((d) => (<button key={d} onClick={() => setDifficultyFilter(d)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${difficultyFilter === d ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>
                  {d === "all" ? "All" : d}
                </button>))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (<div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-500"/>
            </div>) : (<Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuestions.length === 0 ? (<TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <p className="text-sm text-zinc-500">No questions found</p>
                      <Button variant="link" onClick={() => { resetForm(); setShowCreateDialog(true); }}>Create your first question</Button>
                    </TableCell>
                  </TableRow>) : (filteredQuestions.map((q) => {
                const isExpanded = expandedId === q.id;
                return (<>
                        <TableRow key={q.id} className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : q.id)}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-zinc-100">{q.title}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={DIFFICULTY_COLORS[q.difficulty]}>
                              {q.difficulty}
                            </Badge>
                          </TableCell>
                          <TableCell><span className="text-sm text-zinc-300">{q.points}</span></TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(q.tags || []).slice(0, 3).map((t) => (<Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>))}
                              {(q.tags || []).length > 3 && (<Badge variant="secondary" className="text-[10px]">+{q.tags.length - 3}</Badge>)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(q.id); }}>
                                <Edit3 className="h-4 w-4"/>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={(e) => { e.stopPropagation(); handleDelete(q.id); }}>
                                <Trash2 className="h-4 w-4"/>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : q.id); }}>
                                {isExpanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (<TableRow key={`${q.id}-expanded`}>
                            <TableCell colSpan={5} className="bg-zinc-800/20 p-4">
                              <div className="space-y-3">
                                <p className="text-sm text-zinc-400 leading-relaxed line-clamp-3">{q.description}</p>
                                <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
                                  <span>Time: {q.timeLimit}m</span>
                                  <span>Examples: {q.examples?.length || 0}</span>
                                  <span>Test Cases: {q.testCases?.length || 0}</span>
                                  <span>Hints: {q.hints?.length || 0}</span>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>)}
                      </>);
            }))}
              </TableBody>
            </Table>)}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) {
        setShowCreateDialog(false);
        resetForm();
    } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">{editingId ? "Edit Question" : "Create New Question"}</DialogTitle>
            <DialogDescription>Fill in the details for the coding question.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-400">Title</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Two Sum"/>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100">
                    {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Difficulty</label>
                  <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100">
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Points</label>
                  <Input type="number" value={form.points} onChange={(e) => setForm({ ...form, points: parseInt(e.target.value) || 0 })}/>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Description (Markdown)</label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-[120px]" placeholder="Given an array of integers nums and an integer target..."/>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-400">Tags (comma separated)</label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Array, Hash Table"/>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-400">Time Limit (minutes)</label>
                <Input type="number" value={form.timeLimit} onChange={(e) => setForm({ ...form, timeLimit: parseInt(e.target.value) || 30 })}/>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Constraints (one per line)</label>
              <Textarea value={form.constraints} onChange={(e) => setForm({ ...form, constraints: e.target.value })} className="min-h-[60px]" placeholder="2 <= nums.length <= 10^4"/>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Starter Code (JSON, e.g. {`{"javascript": "function twoSum(nums, target) { ... }"}`})</label>
              <Textarea value={form.starterCode} onChange={(e) => setForm({ ...form, starterCode: e.target.value })} className="min-h-[80px] font-mono text-xs"/>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Hints (one per line)</label>
              <Textarea value={form.hints} onChange={(e) => setForm({ ...form, hints: e.target.value })} className="min-h-[60px]" placeholder="Use a hash map for O(n) solution"/>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400">Examples</label>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setForm({ ...form, examples: [...form.examples, { input: "", output: "", explanation: "" }] })}>
                  + Add Example
                </Button>
              </div>
              {form.examples.map((ex, i) => (<div key={i} className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-800/50 p-2">
                  <Input size={1} value={ex.input} onChange={(e) => { const exs = [...form.examples]; exs[i].input = e.target.value; setForm({ ...form, examples: exs }); }} placeholder="Input" className="text-xs"/>
                  <Input size={1} value={ex.output} onChange={(e) => { const exs = [...form.examples]; exs[i].output = e.target.value; setForm({ ...form, examples: exs }); }} placeholder="Output" className="text-xs"/>
                  <div className="flex gap-1">
                    <Input size={1} value={ex.explanation || ""} onChange={(e) => { const exs = [...form.examples]; exs[i].explanation = e.target.value; setForm({ ...form, examples: exs }); }} placeholder="Explanation" className="text-xs flex-1"/>
                    {form.examples.length > 1 && (<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-400" onClick={() => setForm({ ...form, examples: form.examples.filter((_, j) => j !== i) })}>
                        <Trash2 className="h-3 w-3"/>
                      </Button>)}
                  </div>
                </div>))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400">Test Cases</label>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setForm({ ...form, testCases: [...form.testCases, { input: "", expectedOutput: "", isHidden: false, points: 25 }] })}>
                  + Add Test Case
                </Button>
              </div>
              {form.testCases.map((tc, i) => (<div key={i} className="grid grid-cols-4 gap-2 rounded-lg bg-zinc-800/50 p-2">
                  <Input size={1} value={tc.input} onChange={(e) => { const tcs = [...form.testCases]; tcs[i].input = e.target.value; setForm({ ...form, testCases: tcs }); }} placeholder="Input" className="text-xs"/>
                  <Input size={1} value={tc.expectedOutput} onChange={(e) => { const tcs = [...form.testCases]; tcs[i].expectedOutput = e.target.value; setForm({ ...form, testCases: tcs }); }} placeholder="Expected Output" className="text-xs"/>
                  <Input type="number" size={1} value={tc.points} onChange={(e) => { const tcs = [...form.testCases]; tcs[i].points = parseInt(e.target.value) || 0; setForm({ ...form, testCases: tcs }); }} placeholder="Points" className="text-xs"/>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-zinc-400">
                      <input type="checkbox" checked={tc.isHidden} onChange={(e) => { const tcs = [...form.testCases]; tcs[i].isHidden = e.target.checked; setForm({ ...form, testCases: tcs }); }}/>
                      Hidden
                    </label>
                    {form.testCases.length > 1 && (<Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => setForm({ ...form, testCases: form.testCases.filter((_, j) => j !== i) })}>
                        <Trash2 className="h-3 w-3"/>
                      </Button>)}
                  </div>
                </div>))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>Cancel</Button>
            <Button variant="gradient" onClick={handleSave} disabled={saving || !form.title}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1"/> : <Sparkles className="h-4 w-4 mr-1"/>}
              {editingId ? "Update" : "Create"} Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);
}
