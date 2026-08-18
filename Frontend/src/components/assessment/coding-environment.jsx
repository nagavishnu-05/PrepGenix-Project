import { useCallback, useEffect, useMemo, useRef } from "react";
import { AlertTriangle, Send, Maximize, Minimize, RotateCcw, Play, Sparkles, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { useTestStore } from "@/store/test-store";
import { api } from "@/lib/api";
import { SUPPORTED_LANGUAGES } from "@/types";
import { Timer } from "./timer";
import { ProblemPanel } from "./problem-panel";
import { CodeEditor } from "./code-editor";
import { ConsolePanel } from "./console-panel";
import { QuestionTabs } from "./question-tabs";
import { ProctoringPanel } from "./proctoring-panel";
import { FullscreenGuard } from "./fullscreen-guard";
const AUTO_SUBMIT_CRITICAL_THRESHOLD = 2;
export function CodingEnvironment({ testId }) {
    const { currentTest, currentQuestion, currentAttempt, code, language, isRunning, isSubmitting, violations, submissions, fullscreen, setCode, setLanguage, setCurrentQuestion, setIsRunning, setIsSubmitting, setFullscreen, addSubmission, } = useTestStore();
    const consoleHeight = 30;
    const hasAutoSubmitted = useRef(false);
    const questions = useMemo(() => currentTest?.questions ?? [], [currentTest]);
    useEffect(() => {
        if (questions.length > 0 && !currentQuestion) {
            setCurrentQuestion(questions[0]);
        }
    }, [questions, currentQuestion, setCurrentQuestion]);
    useEffect(() => {
        document.documentElement.requestFullscreen().then(() => setFullscreen(true)).catch(() => { });
    }, [setFullscreen]);
    const currentQuestionIndex = useMemo(() => {
        if (!currentQuestion)
            return 0;
        const idx = questions.findIndex((q) => q.id === currentQuestion.id);
        return idx >= 0 ? idx : 0;
    }, [currentQuestion, questions]);
    const criticalViolations = useMemo(() => violations.filter((v) => ["tab_switch", "devtools_open", "fullscreen_exit"].includes(v.type)), [violations]);
    const handleSubmitCode = useCallback(async () => {
        if (!currentQuestion || !code.trim() || isSubmitting)
            return;
        setIsSubmitting(true);
        try {
            const submission = await api.submissions.submit({
                code,
                language,
                questionId: currentQuestion.id,
                attemptId: currentAttempt?.id || "",
            });
            addSubmission(submission);
        }
        catch {
            // silently fail in demo
        }
        finally {
            setIsSubmitting(false);
        }
    }, [currentQuestion, code, language, setIsSubmitting, addSubmission]);
    const autoSubmit = useCallback(async () => {
        if (hasAutoSubmitted.current)
            return;
        hasAutoSubmitted.current = true;
        await handleSubmitCode();
    }, [handleSubmitCode]);
    useEffect(() => {
        if (criticalViolations.length >= AUTO_SUBMIT_CRITICAL_THRESHOLD && !hasAutoSubmitted.current) {
            autoSubmit();
        }
    }, [criticalViolations, autoSubmit]);
    const handleSelectQuestion = useCallback((index) => {
        if (questions[index]) {
            setCurrentQuestion(questions[index]);
        }
    }, [questions, setCurrentQuestion]);
    const handleRunCode = useCallback(async () => {
        if (!currentQuestion || !code.trim())
            return;
        setIsRunning(true);
        try {
            const result = await api.submissions.run({
                code,
                language,
                input: currentQuestion.testCases[0]?.input || "",
            });
            useTestStore.getState().setOutput(result.output);
        }
        catch {
            useTestStore.getState().setOutput("Error: Execution failed");
        }
        finally {
            setIsRunning(false);
        }
    }, [currentQuestion, code, language, setIsRunning]);
    const handleResetCode = useCallback(() => {
        if (currentQuestion) {
            const starterCode = currentQuestion.starterCode?.[language] || "";
            setCode(starterCode);
        }
    }, [currentQuestion, language, setCode]);
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => setFullscreen(true));
        }
        else {
            document.exitFullscreen().then(() => setFullscreen(false));
        }
    }, [setFullscreen]);
    const handleTimeUp = useCallback(() => {
        handleSubmitCode();
    }, [handleSubmitCode]);
    const completedQuestions = submissions.filter((s) => s.status === "accepted").length;
    const progressPercentage = questions.length > 0 ? (completedQuestions / questions.length) * 100 : 0;
    return (<TooltipProvider>
      <FullscreenGuard>
        <div data-testid={testId} className="flex h-screen w-full flex-col bg-zinc-950 text-zinc-100">
          {/* Top Bar */}
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-2">
            <div className="flex items-center gap-4">
              <h1 className="text-sm font-semibold text-zinc-100 truncate max-w-[200px]">
                {currentTest?.title || "Assessment"}
              </h1>
              <Separator orientation="vertical" className="h-5 bg-zinc-700"/>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Progress</span>
                <Progress value={progressPercentage} className="w-24 h-1.5"/>
                <span className="text-xs text-zinc-400">
                  {completedQuestions}/{questions.length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Timer totalSeconds={(currentTest?.duration ?? 60) * 60} onTimeUp={handleTimeUp}/>

              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.filter((lang) => currentTest?.allowedLanguages.includes(lang.id)).map((lang) => (<SelectItem key={lang.id} value={lang.id} className="text-xs">
                      {lang.name} {lang.version}
                    </SelectItem>))}
                </SelectContent>
              </Select>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen}>
                    {fullscreen ? (<Minimize className="h-4 w-4"/>) : (<Maximize className="h-4 w-4"/>)}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{fullscreen ? "Exit Fullscreen" : "Fullscreen"}</TooltipContent>
              </Tooltip>

              {violations.length > 0 && (<Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="destructive" className="gap-1 cursor-pointer">
                      <AlertTriangle className="h-3 w-3"/>
                      {violations.length}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {hasAutoSubmitted.current
                ? "Test auto-submitted due to violations"
                : `${violations.length} violation(s) recorded`}
                  </TooltipContent>
                </Tooltip>)}

              <Button variant="destructive" size="sm" onClick={handleSubmitCode} disabled={isSubmitting}>
                <Send className="h-3 w-3 mr-1"/>
                {isSubmitting ? "Submitting..." : "Submit Test"}
              </Button>
            </div>
          </div>

          {/* Question Tabs */}
          <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-1">
            <QuestionTabs questions={questions} currentIndex={currentQuestionIndex} onSelect={handleSelectQuestion} submissions={submissions}/>
          </div>

          {/* Main Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left Panel - Problem Statement (40%) */}
            <div className="w-[40%] border-r border-zinc-800 bg-zinc-900/30">
              {currentQuestion && <ProblemPanel question={currentQuestion}/>}
            </div>

            {/* Right Side */}
            <div className="flex w-[60%] flex-col overflow-hidden">
              {/* Code Editor (top portion) */}
              <div className="flex flex-1 flex-col overflow-hidden">
                <CodeEditor language={language} value={code} onChange={setCode}/>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900 px-4 py-2">
                  <Button variant="glow" size="sm" onClick={handleRunCode} disabled={isRunning || !code.trim()}>
                    <Play className="h-3 w-3"/>
                    {isRunning ? "Running..." : "Run Code"}
                  </Button>
                  <Button variant="default" size="sm" onClick={handleSubmitCode} disabled={isSubmitting || !code.trim()}>
                    <Send className="h-3 w-3"/>
                    Submit
                  </Button>
                  <Button variant="outline" size="sm" disabled>
                    <Sparkles className="h-3 w-3"/>
                    AI Review
                  </Button>
                  <div className="flex-1"/>
                  <Button variant="ghost" size="sm" onClick={handleResetCode}>
                    <RotateCcw className="h-3 w-3"/>
                    Reset Code
                  </Button>
                </div>
              </div>

              {/* Console Panel (bottom portion) */}
              <div className="border-t border-zinc-800 bg-zinc-900/50 overflow-hidden" style={{ height: `${consoleHeight}%` }}>
                <ConsolePanel />
              </div>
            </div>
          </div>

          {/* Proctoring Panel */}
          {currentTest?.proctoringEnabled && <ProctoringPanel />}
        </div>
      </FullscreenGuard>
    </TooltipProvider>);
}
