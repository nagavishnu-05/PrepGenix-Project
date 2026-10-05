import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTestStore } from "@/store/test-store";
import { api } from "@/lib/api";
import { Play, Terminal, Brain, Clock, HardDrive, CheckCircle2, XCircle } from "lucide-react";

function getPythonTracebackFrame(output) {
    if (!output || !output.includes("Traceback (most recent call last):")) return null;
    const frames = [...output.matchAll(/File "([^"]+)", line (\d+)/g)];
    const lastFrame = frames.at(-1);
    return lastFrame ? { file: lastFrame[1], line: lastFrame[2] } : null;
}

export function ConsolePanel({ question }) {
    const { output, runResult, isRunning, setOutput, setRunResult, setIsRunning, code, language } = useTestStore();
    const [customInput, setCustomInput] = useState("");
    const [activeTab, setActiveTab] = useState("testcase");
    const examples = (question?.examples || []).slice(0, 10);
    const testCaseResults = runResult?.testCases || [];
    const executionTime = runResult?.executionTime ?? runResult?.time;
    const memoryUsage = runResult?.memoryUsage;
    const status = runResult?.status || "idle";
    const tracebackFrame = language === "python" ? getPythonTracebackFrame(output) : null;

    useEffect(() => {
        if (runResult) setActiveTab("output");
    }, [runResult]);

    async function handleRun() {
        setIsRunning(true);
        setOutput("");
        setRunResult(null);
        try {
            const result = await api.judge.run(code, language, customInput);
            setRunResult(result);
            setOutput(result.stdout || result.output || "");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Execution failed";
            setOutput(`Execution failed: ${message}`);
            setRunResult({ status: "error", error: message, testCases: [] });
        }
        finally {
            setIsRunning(false);
        }
    }
    return (<Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4">
        <TabsList className="h-9">
          <TabsTrigger value="testcase" className="text-xs gap-1.5">
            <Terminal className="h-3 w-3"/>
            Testcase
          </TabsTrigger>
          <TabsTrigger value="output" className="text-xs gap-1.5">
            <Play className="h-3 w-3"/>
            Output
          </TabsTrigger>
          <TabsTrigger value="ai-review" className="text-xs gap-1.5">
            <Brain className="h-3 w-3"/>
            AI Review
          </TabsTrigger>
        </TabsList>
        {isRunning && (<Badge variant="info" className="text-xs animate-pulse">
            Running...
          </Badge>)}
        {!isRunning && status === "success" && testCaseResults.length > 0 && (<Badge variant="success" className="text-xs">
            <CheckCircle2 className="mr-1 h-3 w-3"/>
            {runResult.passed}/{runResult.total} passed
          </Badge>)}
        {!isRunning && ["wrong_answer", "error", "timeout", "compilation_error", "runtime_error"].includes(status) && (<Badge variant="destructive" className="text-xs">
            <XCircle className="mr-1 h-3 w-3"/>
            {status === "wrong_answer" ? `${runResult.passed}/${runResult.total} passed` : status.replaceAll("_", " ")}
          </Badge>)}
      </div>

      <div className="flex-1 overflow-hidden">
        <TabsContent value="testcase" className="h-full m-0 p-3 data-[state=inactive]:hidden">
          <div className="flex h-full flex-col gap-3">
            {examples.length > 0 && (
              <div className="max-h-20 space-y-1 overflow-y-auto">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Example inputs · click to load</p>
                <div className="flex flex-wrap gap-1.5">
                  {examples.map((example, index) => (
                    <Button key={index} type="button" variant="outline" size="sm" className="h-6 max-w-full truncate border-zinc-700 px-2 text-[10px] text-zinc-300" onClick={() => setCustomInput(String(example.input ?? ""))}>
                      Case {index + 1}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <label className="text-xs font-medium text-zinc-400">Custom input</label>
            <Textarea value={customInput} onChange={(e) => setCustomInput(e.target.value)} placeholder="Enter custom stdin here..." className="flex-1 font-mono text-sm min-h-0 border-zinc-800 bg-zinc-950/80 focus-visible:ring-violet-500/50"/>
            <Button onClick={handleRun} disabled={isRunning || !code.trim()} variant="glow" size="sm" className="self-end">
              <Play className="h-3 w-3"/>
              Run custom input
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="output" className="h-full m-0 data-[state=inactive]:hidden">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                {executionTime !== null && (<div className="flex items-center gap-1">
                    <Clock className="h-3 w-3"/>
                    <span>{executionTime}ms</span>
                  </div>)}
                {memoryUsage !== null && (<div className="flex items-center gap-1">
                    <HardDrive className="h-3 w-3"/>
                    <span>{memoryUsage}MB</span>
                  </div>)}
              </div>

              {tracebackFrame && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                  <p className="font-semibold">Python traceback</p>
                  <p className="mt-1 text-amber-100/80">
                    Error location: {tracebackFrame.file}, line {tracebackFrame.line}. The file path may belong to the temporary code runner; use the line number to find the location in your editor.
                  </p>
                </div>
              )}
              {output ? (<pre className={`rounded-lg bg-zinc-950 border border-zinc-800 p-4 text-sm font-mono whitespace-pre-wrap ${tracebackFrame ? "text-amber-200" : "text-zinc-300"}`}>
                  {output}
                </pre>) : (<div className="flex h-32 items-center justify-center text-sm text-zinc-600">
                  Run your code to see output
                </div>)}

              {testCaseResults.length > 0 && (<div className="space-y-2">
                  <h4 className="text-xs font-medium text-zinc-300">Visible test cases · {runResult.passed}/{runResult.total} passed</h4>
                  <div className="grid gap-2">
                    {testCaseResults.map((tc, i) => (<div key={i} className={`rounded-lg border px-3 py-2.5 text-xs ${tc.passed ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                        <div className="flex items-center gap-2">
                        {tc.passed ? (<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400"/>) : (<XCircle className="h-3.5 w-3.5 text-red-400"/>)}
                        <span className="font-medium text-zinc-300">Case {(tc.index ?? i) + 1}</span>
                        <Badge variant={tc.passed ? "success" : "destructive"} className="ml-auto text-[10px]">
                          {tc.passed ? "Pass" : "Fail"}
                        </Badge>
                        </div>
                        <div className="mt-2 grid gap-1 text-zinc-500 sm:grid-cols-2">
                          <p className="min-w-0 break-words"><span className="text-zinc-400">Expected: </span><code className="whitespace-pre-wrap">{tc.expected || "(empty)"}</code></p>
                          <p className="min-w-0 break-words"><span className="text-zinc-400">Output: </span><code className="whitespace-pre-wrap">{tc.stdout || tc.error || "(empty)"}</code></p>
                        </div>
                      </div>))}
                  </div>
                </div>)}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="ai-review" className="h-full m-0 data-[state=inactive]:hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-violet-400"/>
                <h4 className="text-sm font-semibold text-zinc-200">AI Analysis</h4>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <span className="text-xs text-zinc-500">Time Complexity</span>
                  <p className="mt-1 font-mono text-sm text-emerald-400">O(n)</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <span className="text-xs text-zinc-500">Space Complexity</span>
                  <p className="mt-1 font-mono text-sm text-emerald-400">O(n)</p>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Code Quality Score</span>
                  <span className="text-sm font-bold text-emerald-400">85/100</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full w-[85%] rounded-full bg-gradient-to-r from-violet-600 to-indigo-600"/>
                </div>
              </div>

              <div className="space-y-2">
                <h5 className="text-xs font-medium text-zinc-400">Suggestions</h5>
                <div className="space-y-2">
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-zinc-400">
                    Consider using early returns to reduce nesting and improve readability.
                  </div>
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-zinc-400">
                    Your solution handles edge cases well. Nice work on the null checks.
                  </div>
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-zinc-400">
                    Variable naming is clear and descriptive. Consider adding brief comments for complex logic.
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </div>
    </Tabs>);
}
