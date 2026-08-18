import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, FileCode, Settings, Eye, GripVertical, Search, Code2, Clock, Target, AlertCircle, } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { mockQuestions } from "@/lib/mock-data";
const STEPS = [
    { label: "Basic Info", icon: FileCode },
    { label: "Questions", icon: Code2 },
    { label: "Settings", icon: Settings },
    { label: "Review", icon: Eye },
];
const LANGUAGES = [
    { id: "javascript", name: "JavaScript" },
    { id: "typescript", name: "TypeScript" },
    { id: "python", name: "Python" },
    { id: "java", name: "Java" },
    { id: "cpp", name: "C++" },
    { id: "go", name: "Go" },
    { id: "rust", name: "Rust" },
    { id: "sql", name: "SQL" },
];
const emptyQuestion = {
    title: "",
    description: "",
    type: "dsa",
    difficulty: "Easy",
    points: 100,
    timeLimit: 30,
    constraints: "",
    examples: "",
    starterCode: "",
};
export default function CreateTestPage() {
    const [currentStep, setCurrentStep] = useState(0);
    const [basicInfo, setBasicInfo] = useState({
        title: "",
        description: "",
        duration: 90,
        totalPoints: 500,
        passingScore: 300,
    });
    const [selectedQuestions, setSelectedQuestions] = useState([]);
    const [questionBankSearch, setQuestionBankSearch] = useState("");
    const [showNewQuestionForm, setShowNewQuestionForm] = useState(false);
    const [newQuestion, setNewQuestion] = useState(emptyQuestion);
    const [settings, setSettings] = useState({
        allowedLanguages: ["javascript", "python"],
        proctoringEnabled: true,
        maxViolations: 1,
        autoSubmit: true,
    });
    const filteredBank = mockQuestions.filter((q) => !selectedQuestions.find((sq) => sq.id === q.id) &&
        (q.title.toLowerCase().includes(questionBankSearch.toLowerCase()) ||
            q.tags.some((t) => t.toLowerCase().includes(questionBankSearch.toLowerCase()))));
    const addQuestionFromBank = (question) => {
        setSelectedQuestions((prev) => [...prev, question]);
    };
    const removeQuestion = (questionId) => {
        setSelectedQuestions((prev) => prev.filter((q) => q.id !== questionId));
    };
    const addNewQuestion = () => {
        if (!newQuestion.title.trim())
            return;
        const q = {
            id: `new-${Date.now()}`,
            title: newQuestion.title,
            description: newQuestion.description,
            type: newQuestion.type,
            difficulty: newQuestion.difficulty,
            points: newQuestion.points,
            timeLimit: newQuestion.timeLimit,
            constraints: newQuestion.constraints.split("\n").filter(Boolean),
            examples: [],
            testCases: [],
            starterCode: { javascript: newQuestion.starterCode },
            tags: [],
        };
        setSelectedQuestions((prev) => [...prev, q]);
        setNewQuestion(emptyQuestion);
        setShowNewQuestionForm(false);
    };
    const toggleLanguage = (langId) => {
        setSettings((prev) => ({
            ...prev,
            allowedLanguages: prev.allowedLanguages.includes(langId)
                ? prev.allowedLanguages.filter((l) => l !== langId)
                : [...prev.allowedLanguages, langId],
        }));
    };
    const canProceed = () => {
        switch (currentStep) {
            case 0:
                return basicInfo.title.trim().length > 0;
            case 1:
                return selectedQuestions.length > 0;
            case 2:
                return settings.allowedLanguages.length > 0;
            default:
                return true;
        }
    };
    const handleCreate = () => {
        console.log("Creating test:", { basicInfo, selectedQuestions, settings });
    };
    return (<div className="space-y-6">
      <div className="flex items-center gap-4">
        <a href="/admin/tests">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4"/>
          </Button>
        </a>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Create New Assessment</h1>
          <p className="text-zinc-400">Configure a new coding assessment step by step.</p>
        </div>
      </div>

      <div className="flex items-center justify-center">
        <div className="flex items-center gap-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            return (<div key={step.label} className="flex items-center">
                <button onClick={() => index <= currentStep && setCurrentStep(index)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive
                    ? "bg-violet-500/10 text-violet-400"
                    : isCompleted
                        ? "text-emerald-400"
                        : "text-zinc-500"} ${index <= currentStep ? "cursor-pointer" : "cursor-not-allowed"}`}>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${isActive
                    ? "bg-violet-500 text-white"
                    : isCompleted
                        ? "bg-emerald-500 text-white"
                        : "bg-zinc-800 text-zinc-500"}`}>
                    {isCompleted ? <Check className="h-3.5 w-3.5"/> : index + 1}
                  </div>
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
                {index < STEPS.length - 1 && (<div className={`mx-2 h-px w-8 ${index < currentStep ? "bg-emerald-500" : "bg-zinc-700"}`}/>)}
              </div>);
        })}
        </div>
      </div>

      {currentStep === 0 && (<Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
            <CardDescription>Define the core details of your assessment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Test Title *</label>
              <Input placeholder="e.g., Frontend Engineering Assessment" value={basicInfo.title} onChange={(e) => setBasicInfo((p) => ({ ...p, title: e.target.value }))}/>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Description</label>
              <Textarea placeholder="Describe what this assessment covers..." value={basicInfo.description} onChange={(e) => setBasicInfo((p) => ({ ...p, description: e.target.value }))} rows={4}/>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                  <Clock className="h-3.5 w-3.5"/>
                  Duration (minutes)
                </label>
                <Input type="number" min={10} max={300} value={basicInfo.duration} onChange={(e) => setBasicInfo((p) => ({ ...p, duration: Number(e.target.value) }))}/>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                  <Target className="h-3.5 w-3.5"/>
                  Total Points
                </label>
                <Input type="number" min={0} value={basicInfo.totalPoints} onChange={(e) => setBasicInfo((p) => ({ ...p, totalPoints: Number(e.target.value) }))}/>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                  <AlertCircle className="h-3.5 w-3.5"/>
                  Passing Score
                </label>
                <Input type="number" min={0} value={basicInfo.passingScore} onChange={(e) => setBasicInfo((p) => ({ ...p, passingScore: Number(e.target.value) }))}/>
              </div>
            </div>
          </CardContent>
        </Card>)}

      {currentStep === 1 && (<div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Selected Questions ({selectedQuestions.length})</CardTitle>
                <CardDescription>Questions included in this assessment.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowNewQuestionForm(!showNewQuestionForm)}>
                <Plus className="h-3.5 w-3.5"/>
                New Question
              </Button>
            </CardHeader>
            <CardContent>
              {selectedQuestions.length === 0 ? (<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 py-12">
                  <FileCode className="h-10 w-10 text-zinc-600"/>
                  <p className="mt-3 text-sm text-zinc-500">
                    No questions selected. Add from the question bank below.
                  </p>
                </div>) : (<div className="space-y-2">
                  {selectedQuestions.map((q, index) => (<div key={q.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-800/30 px-4 py-3">
                      <GripVertical className="h-4 w-4 text-zinc-600"/>
                      <span className="text-xs font-mono text-zinc-500">#{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200">{q.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className={`text-[10px] ${q.difficulty === "Easy"
                        ? "border-emerald-500/30 text-emerald-400"
                        : q.difficulty === "Medium"
                            ? "border-amber-500/30 text-amber-400"
                            : "border-red-500/30 text-red-400"}`}>
                            {q.difficulty}
                          </Badge>
                          <span className="text-[10px] text-zinc-500">{q.points} pts</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => removeQuestion(q.id)}>
                        <Trash2 className="h-3.5 w-3.5"/>
                      </Button>
                    </div>))}
                </div>)}
            </CardContent>
          </Card>

          {showNewQuestionForm && (<Card className="border-violet-500/20">
              <CardHeader>
                <CardTitle className="text-base">Create New Question</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Title</label>
                    <Input placeholder="Question title" value={newQuestion.title} onChange={(e) => setNewQuestion((p) => ({ ...p, title: e.target.value }))}/>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Type</label>
                    <Select value={newQuestion.type} onValueChange={(v) => setNewQuestion((p) => ({ ...p, type: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dsa">DSA</SelectItem>
                        <SelectItem value="sql">SQL</SelectItem>
                        <SelectItem value="debugging">Debugging</SelectItem>
                        <SelectItem value="mcq">MCQ</SelectItem>
                        <SelectItem value="system_design">System Design</SelectItem>
                        <SelectItem value="frontend">Frontend</SelectItem>
                        <SelectItem value="backend">Backend</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Difficulty</label>
                    <Select value={newQuestion.difficulty} onValueChange={(v) => setNewQuestion((p) => ({ ...p, difficulty: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Description</label>
                  <Textarea placeholder="Describe the problem..." value={newQuestion.description} onChange={(e) => setNewQuestion((p) => ({ ...p, description: e.target.value }))} rows={4}/>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Points</label>
                    <Input type="number" value={newQuestion.points} onChange={(e) => setNewQuestion((p) => ({ ...p, points: Number(e.target.value) }))}/>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Time Limit (min)</label>
                    <Input type="number" value={newQuestion.timeLimit} onChange={(e) => setNewQuestion((p) => ({ ...p, timeLimit: Number(e.target.value) }))}/>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Constraints (one per line)</label>
                  <Textarea placeholder="1 &lt;= n &lt;= 10^4" value={newQuestion.constraints} onChange={(e) => setNewQuestion((p) => ({ ...p, constraints: e.target.value }))} rows={3}/>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Starter Code</label>
                  <Textarea placeholder="function solution() { ... }" value={newQuestion.starterCode} onChange={(e) => setNewQuestion((p) => ({ ...p, starterCode: e.target.value }))} rows={4} className="font-mono text-xs"/>
                </div>
                <div className="flex gap-2">
                  <Button variant="gradient" onClick={addNewQuestion}>
                    <Plus className="h-4 w-4"/>
                    Add Question
                  </Button>
                  <Button variant="outline" onClick={() => setShowNewQuestionForm(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>)}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Question Bank</CardTitle>
              <CardDescription>Select questions from the existing bank.</CardDescription>
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/>
                <Input placeholder="Search questions..." value={questionBankSearch} onChange={(e) => setQuestionBankSearch(e.target.value)} className="pl-9"/>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredBank.map((q) => (<div key={q.id} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-800/20 p-3 transition-colors hover:bg-zinc-800/40">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{q.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{q.description}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${q.difficulty === "Easy"
                    ? "border-emerald-500/30 text-emerald-400"
                    : q.difficulty === "Medium"
                        ? "border-amber-500/30 text-amber-400"
                        : "border-red-500/30 text-red-400"}`}>
                          {q.difficulty}
                        </Badge>
                        <span className="text-[10px] text-zinc-500">{q.points} pts</span>
                        <span className="text-[10px] text-zinc-500">{q.timeLimit}m</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => addQuestionFromBank(q)}>
                      <Plus className="h-3 w-3"/>
                    </Button>
                  </div>))}
                {filteredBank.length === 0 && (<div className="col-span-2 py-8 text-center">
                    <p className="text-sm text-zinc-500">No questions available</p>
                  </div>)}
              </div>
            </CardContent>
          </Card>
        </div>)}

      {currentStep === 2 && (<Card>
          <CardHeader>
            <CardTitle className="text-base">Test Settings</CardTitle>
            <CardDescription>Configure proctoring, languages, and policies.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-zinc-300">Allowed Languages</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {LANGUAGES.map((lang) => (<button key={lang.id} onClick={() => toggleLanguage(lang.id)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${settings.allowedLanguages.includes(lang.id)
                    ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                    : "border-zinc-700 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600"}`}>
                    {settings.allowedLanguages.includes(lang.id) && (<Check className="h-3.5 w-3.5"/>)}
                    {lang.name}
                  </button>))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-zinc-300">Proctoring Settings</h3>
              <div className="space-y-4 rounded-lg border border-zinc-800 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Enable Proctoring</p>
                    <p className="text-xs text-zinc-500">Monitor candidates via camera and browser</p>
                  </div>
                  <Switch checked={settings.proctoringEnabled} onCheckedChange={(checked) => setSettings((p) => ({ ...p, proctoringEnabled: checked }))}/>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Auto Submit</p>
                    <p className="text-xs text-zinc-500">
                      Automatically submit when max violations reached
                    </p>
                  </div>
                  <Switch checked={settings.autoSubmit} onCheckedChange={(checked) => setSettings((p) => ({ ...p, autoSubmit: checked }))}/>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Max Violations</label>
                  <Input type="number" min={1} max={20} value={settings.maxViolations} onChange={(e) => setSettings((p) => ({ ...p, maxViolations: Number(e.target.value) }))} className="max-w-[120px]"/>
                  <p className="text-xs text-zinc-500">
                    Test will auto-submit after this many violations (if enabled)
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>)}

      {currentStep === 3 && (<Card>
          <CardHeader>
            <CardTitle className="text-base">Review Assessment</CardTitle>
            <CardDescription>Review all settings before creating the test.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-zinc-800 p-4">
                <h4 className="text-sm font-medium text-zinc-300">Basic Info</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Title</span>
                    <span className="text-xs font-medium text-zinc-200">
                      {basicInfo.title || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Duration</span>
                    <span className="text-xs font-medium text-zinc-200">{basicInfo.duration}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Total Points</span>
                    <span className="text-xs font-medium text-zinc-200">{basicInfo.totalPoints}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Passing Score</span>
                    <span className="text-xs font-medium text-zinc-200">{basicInfo.passingScore}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3 rounded-lg border border-zinc-800 p-4">
                <h4 className="text-sm font-medium text-zinc-300">Settings</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Languages</span>
                    <span className="text-xs font-medium text-zinc-200">
                      {settings.allowedLanguages.length} selected
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Proctoring</span>
                    <Badge variant={settings.proctoringEnabled ? "success" : "secondary"} className="text-[10px]">
                      {settings.proctoringEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Max Violations</span>
                    <span className="text-xs font-medium text-zinc-200">
                      {settings.maxViolations}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Auto Submit</span>
                    <Badge variant={settings.autoSubmit ? "success" : "secondary"} className="text-[10px]">
                      {settings.autoSubmit ? "Yes" : "No"}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 p-4">
              <h4 className="mb-3 text-sm font-medium text-zinc-300">
                Questions ({selectedQuestions.length})
              </h4>
              <div className="space-y-2">
                {selectedQuestions.map((q, i) => (<div key={q.id} className="flex items-center gap-3 rounded-md bg-zinc-800/30 px-3 py-2">
                    <span className="text-xs font-mono text-zinc-500">#{i + 1}</span>
                    <span className="text-sm text-zinc-300">{q.title}</span>
                    <Badge variant="outline" className={`ml-auto text-[10px] ${q.difficulty === "Easy"
                    ? "border-emerald-500/30 text-emerald-400"
                    : q.difficulty === "Medium"
                        ? "border-amber-500/30 text-amber-400"
                        : "border-red-500/30 text-red-400"}`}>
                      {q.difficulty}
                    </Badge>
                    <span className="text-xs text-zinc-500">{q.points} pts</span>
                  </div>))}
              </div>
            </div>
          </CardContent>
        </Card>)}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setCurrentStep((s) => s - 1)} disabled={currentStep === 0}>
          <ArrowLeft className="h-4 w-4"/>
          Previous
        </Button>
        <div className="flex gap-2">
          {currentStep < STEPS.length - 1 ? (<Button variant="gradient" onClick={() => setCurrentStep((s) => s + 1)} disabled={!canProceed()}>
              Next
              <ArrowRight className="h-4 w-4"/>
            </Button>) : (<Button variant="gradient" onClick={handleCreate}>
              <Check className="h-4 w-4"/>
              Create Assessment
            </Button>)}
        </div>
      </div>
    </div>);
}
