import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InlineSelect } from "@/components/ui/inline-select";

const EMPTY = {
    title: "",
    type: "aptitude",
    format: "mcq",
    subject: "quantitative",
    difficulty: "easy",
    description: "",
    codeSnippet: "",
    options: ["", "", "", ""],
    correctOption: 0,
    answer: "",
    language: "python",
    constraints: "",
    inputFormat: "",
    outputFormat: "",
    examples: [{ input: "", output: "" }],
    testCases: [{ input: "", expectedOutput: "" }],
    points: 1,
    tags: "",
};

function Field({ label, children, className = "" }) {
    return (
        <div className={`space-y-1.5 ${className}`}>
            <Label className="text-xs text-zinc-400">{label}</Label>
            {children}
        </div>
    );
}

function TcList({ items, setItems, hard }) {
    return (
        <div className="space-y-2">
            {items.map((tc, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                    <Input placeholder="Input" value={tc.input} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))} />
                    <Input placeholder="Expected output" value={tc.expectedOutput} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, expectedOutput: e.target.value } : x)))} />
                </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { input: "", expectedOutput: "" }])}>
                + Add {hard ? "hard test case" : "test case"}
            </Button>
        </div>
    );
}

function ExList({ items, setItems }) {
    return (
        <div className="space-y-2">
            {items.map((ex, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                    <Input placeholder="Example input" value={ex.input} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))} />
                    <Input placeholder="Example output" value={ex.output} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, output: e.target.value } : x)))} />
                </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { input: "", output: "" }])}>+ Add example</Button>
        </div>
    );
}

export default function QuestionForm({ initial, onSave, onCancel, saving }) {
    const [f, setF] = useState(() => (initial ? fromDoc(initial) : { ...EMPTY }));
    const set = (patch) => setF((x) => ({ ...x, ...patch }));

    useEffect(() => {
        if (f.type === "coding") {
            set({ format: "programming", ...(f.points === 1 ? { points: 10 } : {}) });
        } else if (f.format === "programming") {
            set({ format: "mcq" });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [f.type]);

    const payload = () => {
        const isCoding = f.type === "coding";
        const soft = f.testCases.filter((t) => t.input || t.expectedOutput);
        const hard = f.hardTestCases?.filter((t) => t.input || t.expectedOutput) || [];
        return {
            title: f.title,
            type: f.type,
            format: isCoding ? "programming" : f.format,
            subject: f.subject,
            difficulty: f.difficulty,
            description: f.description,
            codeSnippet: f.codeSnippet,
            options: !isCoding && f.format === "mcq" ? f.options.filter((o) => o.trim() !== "") : [],
            correctOption: !isCoding && f.format === "mcq" ? f.correctOption : null,
            answer: !isCoding && f.format !== "mcq" ? f.answer : null,
            language: isCoding ? f.language : "javascript",
            constraints: isCoding ? f.constraints.split("\n").map((s) => s.trim()).filter(Boolean) : [],
            inputFormat: isCoding ? f.inputFormat : "",
            outputFormat: isCoding ? f.outputFormat : "",
            examples: isCoding ? f.examples.filter((e) => e.input || e.output) : [],
            testCases: isCoding
                ? [...soft, ...hard].map((tc, i) => ({ input: tc.input, expectedOutput: tc.expectedOutput, isHard: i >= soft.length }))
                : [],
            points: Number(f.points) || (isCoding ? 10 : 1),
            tags: f.tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean),
        };
    };

    const submit = () => {
        if (!f.title.trim()) return;
        if (f.type === "coding" && !f.testCases.some((t) => t.input || t.expectedOutput) && !(f.hardTestCases || []).some((t) => t.input || t.expectedOutput)) {
            alert("Add at least one test case for a coding question.");
            return;
        }
        onSave(payload());
    };

    return (
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-4">
                <Field label="Type">
                    <InlineSelect
                        ariaLabel="Question type"
                        value={f.type}
                        onValueChange={(v) => set({ type: v })}
                        options={[
                            { value: "aptitude", label: "Aptitude" },
                            { value: "coding", label: "Coding" },
                        ]}
                    />
                </Field>
                <Field label="Difficulty">
                    <InlineSelect
                        ariaLabel="Question difficulty"
                        value={f.difficulty}
                        onValueChange={(v) => set({ difficulty: v })}
                        options={[
                            { value: "easy", label: "Easy" },
                            { value: "medium", label: "Medium" },
                            { value: "hard", label: "Hard" },
                        ]}
                    />
                </Field>
                {f.type === "aptitude" && (
                    <Field label="Format">
                        <InlineSelect
                            ariaLabel="Question format"
                            value={f.format}
                            onValueChange={(v) => set({ format: v })}
                            options={[
                                { value: "mcq", label: "MCQ" },
                                { value: "fillup", label: "Fill in the blank" },
                                { value: "code_snippet", label: "Code Snippet" },
                            ]}
                        />
                    </Field>
                )}
                {f.type === "coding" && (
                    <Field label="Language">
                        <InlineSelect
                            ariaLabel="Programming language"
                            value={f.language}
                            onValueChange={(v) => set({ language: v })}
                            options={[
                                { value: "python", label: "Python" },
                                { value: "javascript", label: "JavaScript" },
                            ]}
                        />
                    </Field>
                )}
                <Field label="Subject / Tag group">
                    <Input value={f.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="quantitative, verbal, coding..." />
                </Field>
                <Field label="Points">
                    <Input type="number" value={f.points} onChange={(e) => set({ points: e.target.value })} />
                </Field>
            </div>

            <Field label="Title / Question">
                <Input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Enter question title" />
            </Field>
            <Field label={f.type === "coding" ? "Problem statement" : "Question text"}>
                <Textarea rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Full question / problem description" />
            </Field>

            {f.type === "aptitude" && (
                <Field label="Code snippet (for code snippet questions)">
                    <Textarea rows={4} className="font-mono text-xs" value={f.codeSnippet} onChange={(e) => set({ codeSnippet: e.target.value })} placeholder="// Indentation is preserved exactly as typed" />
                </Field>
            )}

            {f.type === "aptitude" && f.format === "mcq" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {f.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input type="radio" checked={f.correctOption === i} onChange={() => set({ correctOption: i })} className="accent-violet-500" />
                            <Input placeholder={`Option ${String.fromCharCode(65 + i)}`} value={opt} onChange={(e) => set({ options: f.options.map((o, j) => (j === i ? e.target.value : o)) })} />
                        </div>
                    ))}
                </div>
            )}

            {f.type === "aptitude" && f.format !== "mcq" && (
                <Field label="Correct answer (fill up)">
                    <Input value={f.answer} onChange={(e) => set({ answer: e.target.value })} placeholder="Expected text answer" />
                </Field>
            )}

            {f.type === "coding" && (
                <>
                    <Field label="Input format">
                        <Input value={f.inputFormat} onChange={(e) => set({ inputFormat: e.target.value })} placeholder="e.g. First line N, second line N integers" />
                    </Field>
                    <Field label="Output format">
                        <Input value={f.outputFormat} onChange={(e) => set({ outputFormat: e.target.value })} placeholder="e.g. Print the result" />
                    </Field>
                    <Field label="Constraints (one per line)">
                        <Textarea rows={2} value={f.constraints} onChange={(e) => set({ constraints: e.target.value })} placeholder={"1 <= N <= 1000"} />
                    </Field>
                    <Field label="Examples">
                        <ExList items={f.examples} setItems={(v) => set({ examples: v })} />
                    </Field>
                    <Field label="Test cases (judged against student code)">
                        <TcList items={f.testCases} setItems={(v) => set({ testCases: v })} />
                    </Field>
                    <Field label="Hard test cases">
                        <TcList items={f.hardTestCases || [{ input: "", expectedOutput: "" }]} setItems={(v) => set({ hardTestCases: v })} hard />
                    </Field>
                </>
            )}

            <Field label="Tags (comma separated)">
                <Input value={f.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="arrays, dp, strings" />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onCancel}>Cancel</Button>
                <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : initial ? "Save changes" : "Create question"}</Button>
            </div>
        </div>
    );
}

function fromDoc(q) {
    return {
        title: q.title || "",
        type: q.type || "aptitude",
        format: q.type === "coding" ? "programming" : q.format || "mcq",
        subject: q.subject || "quantitative",
        difficulty: q.difficulty || "easy",
        description: q.description || "",
        codeSnippet: q.codeSnippet || "",
        options: q.options && q.options.length ? [...q.options] : ["", "", "", ""],
        correctOption: q.correctOption ?? 0,
        answer: q.answer ?? "",
        language: q.language || "python",
        constraints: (q.constraints || []).join("\n"),
        inputFormat: q.inputFormat || "",
        outputFormat: q.outputFormat || "",
        examples: q.examples?.length ? q.examples : [{ input: "", output: "" }],
        testCases: (q.testCases || []).filter((t) => !t.isHard),
        hardTestCases: (q.testCases || []).filter((t) => t.isHard),
        points: q.points ?? 1,
        tags: (q.tags || []).join(", "),
    };
}
