import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTestStore } from "@/store/test-store";
import { api } from "@/lib/api";
import { Play, Terminal, Brain, Clock, HardDrive, CheckCircle2, XCircle } from "lucide-react";
export function ConsolePanel() {
    const { output, isRunning, setOutput, setIsRunning, code, language } = useTestStore();
    const [customInput, setCustomInput] = useState("");
    const [executionTime, setExecutionTime] = useState(null);
    const [memoryUsage, setMemoryUsage] = useState(null);
    const [status, setStatus] = useState("idle");
    const [testCaseResults] = useState([]);
    async function handleRun() {
        setIsRunning(true);
        setOutput("");
        setStatus("idle");
        try {
            const result = await api.submissions.run({ code, language, input: customInput });
            setOutput(result.output);
            setExecutionTime(result.executionTime);
            setMemoryUsage(result.memoryUsage);
            setStatus(result.status === "success" ? "success" : "error");
        }
        catch {
            setOutput("Error: Failed to execute code");
            setStatus("error");
        }
        finally {
            setIsRunning(false);
        }
    }
    return (<Tabs defaultValue="testcase" className="flex h-full flex-col">
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
        {!isRunning && status === "success" && (<Badge variant="success" className="text-xs">
            <CheckCircle2 className="mr-1 h-3 w-3"/>
            Success
          </Badge>)}
        {!isRunning && status === "error" && (<Badge variant="destructive" className="text-xs">
            <XCircle className="mr-1 h-3 w-3"/>
            Error
          </Badge>)}
      </div>

      <div className="flex-1 overflow-hidden">
        <TabsContent value="testcase" className="h-full m-0 p-3 data-[state=inactive]:hidden">
          <div className="flex h-full flex-col gap-3">
            <label className="text-xs font-medium text-zinc-400">Custom Input</label>
            <Textarea value={customInput} onChange={(e) => setCustomInput(e.target.value)} placeholder="Enter your test input here..." className="flex-1 font-mono text-sm min-h-0"/>
            <Button onClick={handleRun} disabled={isRunning} variant="glow" size="sm" className="self-end">
              <Play className="h-3 w-3"/>
              Run
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

              {output ? (<pre className="rounded-lg bg-zinc-950 border border-zinc-800 p-4 text-sm font-mono text-zinc-300 whitespace-pre-wrap">
                  {output}
                </pre>) : (<div className="flex h-32 items-center justify-center text-sm text-zinc-600">
                  Run your code to see output
                </div>)}

              {testCaseResults.length > 0 && (<div className="space-y-2">
                  <h4 className="text-xs font-medium text-zinc-400">Test Case Results</h4>
                  <div className="grid gap-1">
                    {testCaseResults.map((tc, i) => (<div key={i} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs">
                        {tc.passed ? (<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400"/>) : (<XCircle className="h-3.5 w-3.5 text-red-400"/>)}
                        <span className="text-zinc-400">Case {i + 1}</span>
                        <Badge variant={tc.passed ? "success" : "destructive"} className="text-[10px] ml-auto">
                          {tc.passed ? "Pass" : "Fail"}
                        </Badge>
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
