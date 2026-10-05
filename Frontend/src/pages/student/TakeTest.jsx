import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Clock, Send, Play, CheckCircle2, XCircle, Camera, Mic, Maximize2, ShieldAlert, Video, VideoOff, MicOff, ScanFace, AlertTriangle, Terminal, Loader2, RotateCcw, Braces, ChevronDown, Move } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { CodeEditor } from "@/components/assessment/code-editor";
import FaceAttentionOverlay from "@/components/assessment/face-attention-overlay";
import { DifficultyBadge } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import useProctoring from "@/hooks/use-proctoring";

function CodeBlock({ code }) {
    if (!code) return null;
    return (
        <pre className="mt-3 overflow-x-auto whitespace-pre rounded-lg border border-slate-200 bg-slate-100 p-4 text-sm text-slate-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            <code>{code}</code>
        </pre>
    );
}

function formatPythonRuntimeError(stderr) {
    const output = String(stderr || "");
    if (!output.includes("Traceback (most recent call last):")) return output;

    const frames = [...output.matchAll(/File ["'].*?["'], line (\d+)(?:, in ([^\n]+))?/g)];
    const line = frames.at(-1)?.[1];
    const error = output.trim().split(/\r?\n/).at(-1)?.trim();
    const location = line ? `Runtime error on line ${line} of your code` : "Python runtime error";

    return [location, error, line ? `Check line ${line} in the editor. The path shown by Python belongs to the temporary runner.` : null]
        .filter(Boolean)
        .join("\n\n");
}

const LANGUAGES = [
    { key: "c", label: "C", monaco: "c" },
    { key: "cpp", label: "C++", monaco: "cpp" },
    { key: "java", label: "Java", monaco: "java" },
    { key: "python", label: "Python", monaco: "python" },
    { key: "javascript", label: "JavaScript", monaco: "javascript" },
];

const MONACO_LANGUAGE = Object.fromEntries(LANGUAGES.map((l) => [l.key, l.monaco]));

const LANGUAGE_KEY = Object.fromEntries(LANGUAGES.map((l) => [l.key, l.key]));
LANGUAGE_KEY["c++"] = "cpp";
LANGUAGE_KEY["cplusplus"] = "cpp";
LANGUAGE_KEY["py"] = "python";
LANGUAGE_KEY["js"] = "javascript";
LANGUAGE_KEY["node"] = "javascript";
LANGUAGE_KEY["nodejs"] = "javascript";

// Judge0 requires the Java entry class to be named `Main`.
const STARTER = {
    c: `#include <stdio.h>

int main(void) {
    /* Read from stdin and print the answer. */
    int n;
    if (scanf("%d", &n) != 1) return 0;

    long long sum = 0;
    for (int i = 0; i < n; i++) {
        long long x;
        if (scanf("%lld", &x) != 1) break;
        sum += x;
    }

    printf("%lld\\n", sum);
    return 0;
}`,
    cpp: `#include <iostream>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    /* Read from stdin and print the answer. */
    int n;
    if (!(cin >> n)) return 0;

    long long sum = 0;
    for (int i = 0; i < n; i++) {
        long long x;
        if (!(cin >> x)) break;
        sum += x;
    }

    cout << sum << "\\n";
    return 0;
}`,
    java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        /* Read from stdin and print the answer. */
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;

        int n = sc.nextInt();
        long sum = 0;
        for (int i = 0; i < n; i++) {
            if (!sc.hasNextLong()) break;
            sum += sc.nextLong();
        }

        System.out.println(sum);
    }
}`,
    python: `# Read input from stdin and print the answer
import sys


def solve():
    data = sys.stdin.read().split()
    if not data:
        return

    n = int(data[0])
    values = list(map(int, data[1:1 + n]))
    print(sum(values))


if __name__ == "__main__":
    solve()
`,
    javascript: `// Read input from stdin and print the answer
const fs = require("fs");

const tokens = fs.readFileSync(0, "utf8").trim().split(/\\s+/).filter(Boolean);

if (tokens.length) {
    const n = Number(tokens[0]);
    let sum = 0;
    for (let i = 1; i <= n; i++) sum += Number(tokens[i]);
    console.log(sum);
}
`,
};

export default function TakeTest() {
    const { attemptId } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const isNew = searchParams.get("new") === "1";

    const [attempt, setAttempt] = useState(null);
    const [question, setQuestion] = useState(null);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [adaptive, setAdaptive] = useState(null);
    const [answer, setAnswer] = useState(undefined);
    const [code, setCode] = useState("");
    const [language, setLanguage] = useState("python");
    const [feedback, setFeedback] = useState(null);
    const [finished, setFinished] = useState(false);
    const [result, setResult] = useState(null);
    const [submitting, setSubmitting] = useState(false);
const [running, setRunning] = useState(false);
const [runResult, setRunResult] = useState(null);
const [runError, setRunError] = useState("");
const [codingView, setCodingView] = useState("problem");
const [cameraPosition, setCameraPosition] = useState(null);
    const [timeLeft, setTimeLeft] = useState(null);
    const [error, setError] = useState("");
    const [cheatingReasonState, setCheatingReasonState] = useState(null);
    const [faceCaptureState, setFaceCaptureState] = useState("pending");
    const [faceCaptureError, setFaceCaptureError] = useState("");
    const [enrollProgress, setEnrollProgress] = useState({ captured: 0, required: 5 });
    const startAtRef = useRef(Date.now());
const codeBuffersRef = useRef({});
    const durationRef = useRef(30 * 60);
    const pausedTotalRef = useRef(0);
    const pausedSinceRef = useRef(null);
    const previewRef = useRef(null);
    const faceCanvasRef = useRef(null);
    const cameraPipRef = useRef(null);
    const cameraDragRef = useRef(null);
    const enrollIntervalRef = useRef(null);
    const didInitRef = useRef(null);

    const proctored = attempt?.proctoring?.enabled !== false;

    const finishWithResult = useCallback((res) => {
        setFinished(true);
        if (res) setResult(res);
    }, []);

    const proctoring = useProctoring({
        attemptId: attempt?.id,
        config: attempt?.proctoring,
        previewRef,
        onAutoSubmit: (res, reason) => {
            setFinished(true);
            if (res) setResult(res);
            if (reason) setCheatingReasonState(reason);
        },
    });

    const proctoringApiBase = import.meta.env.VITE_PROCTORING_API || "http://localhost:5050";

    // While the registered candidate is not verified (different person, extra
    // person, or no face), the assessment is blocked and the clock is paused.
    // As soon as the enrolled face returns, the gate lifts automatically.
    const identityBlocked = proctored && !proctoring.simulated && !!proctoring.faceMonitor?.identityBlocked;

    // Keep one face-verification verdict in the assessment header.
    const faceMonitor = proctoring.faceMonitor;
    const faceStatus = !faceMonitor?.known
        ? { label: "Starting", tone: "border-slate-300 bg-slate-100 text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" }
        : (faceMonitor.faceCount ?? 0) === 0
            ? { label: "No face", tone: "border-amber-500/30 bg-amber-500/10 text-amber-500" }
            : faceMonitor.match === false
                ? { label: "Mismatch", tone: "border-red-500/30 bg-red-500/10 text-red-400" }
                : faceMonitor.match === true
                    ? { label: "Verified", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" }
                    : { label: "Face OK", tone: "border-slate-300 bg-slate-100 text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" };

    useEffect(() => {
        if (identityBlocked) {
            if (pausedSinceRef.current == null) pausedSinceRef.current = Date.now();
        } else if (pausedSinceRef.current != null) {
            pausedTotalRef.current += Date.now() - pausedSinceRef.current;
            pausedSinceRef.current = null;
        }
    }, [identityBlocked]);

    useEffect(() => {
        if (faceCaptureState !== "pending") return;
        let cancelled = false;
        fetch(`${proctoringApiBase}/health`, { method: "GET", signal: AbortSignal.timeout(3000) })
            .then((r) => { if (r.ok && !cancelled) setFaceCaptureState("pending"); })
            .catch(() => { if (!cancelled) setFaceCaptureError("Face verification service is unavailable. Start the AIML proctoring API before continuing."); });
        return () => { cancelled = true; };
    }, [faceCaptureState, proctoringApiBase]);

    useEffect(() => {
        if (faceCaptureState !== "pending" || !proctored) return;
        proctoring.reattachStream();
    }, [faceCaptureState, proctored, proctoring.reattachStream]);

    // Start a clean enrollment batch once per attempt. This must NOT run
    // between captures: wiping the batch after each frame pinned the
    // progress counter at 1/5 and enrollment never finished.
    const enrollSessionKey = `${attempt?.id || "none"}:${attempt?.studentId || "none"}`;
    useEffect(() => {
        if (!proctored || !attempt?.id) return;
        let cancelled = false;
        setEnrollProgress({ captured: 0, required: 5 });
        fetch(`${proctoringApiBase}/enroll-reset`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attemptId: attempt.id }),
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [enrollSessionKey, proctored]);

    // Reattach camera stream when transitioning from enrollment to test view.
    // The video element changes between screens, so the stream must be re-bound.
    // Depends on `reattachStream` directly rather than the whole `proctoring`
    // object, which used to re-fire on every render.
    useEffect(() => {
        if (faceCaptureState !== "done" || !proctored) return;
        const timer = setTimeout(() => {
            proctoring.reattachStream();
        }, 300);
        return () => clearTimeout(timer);
    }, [faceCaptureState, proctored, proctoring.reattachStream]);

    const captureFace = useCallback(async () => {
        if (faceCaptureState === "capturing") return;
        setFaceCaptureState("capturing");
        setFaceCaptureError("");
        try {
            const video = previewRef.current;
            if (!video || !video.videoWidth) {
                setFaceCaptureState("error");
                setFaceCaptureError("Camera not ready. Please wait a moment and try again.");
                return;
            }
            const canvas = faceCanvasRef.current || (faceCanvasRef.current = document.createElement("canvas"));
            canvas.width = 320;
            const h = video.videoHeight && video.videoWidth ? Math.round((video.videoHeight / video.videoWidth) * 320) : 240;
            canvas.height = h;
            canvas.getContext("2d").drawImage(video, 0, 0, 320, h);
            const imageBase64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

            const proctoringApiBase = import.meta.env.VITE_PROCTORING_API || "http://localhost:5050";

            const enrollResult = await fetch(`${proctoringApiBase}/enroll-frame`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: imageBase64, attemptId: attempt?.id }),
            }).then((r) => r.json());

            setEnrollProgress({ captured: enrollResult.captured || 0, required: enrollResult.required_frames || 5 });

            if (enrollResult.status === "ready") {
                // Archiving the reference image is best-effort. The identity
                // reference is already registered in the proctoring service, so
                // a storage failure must not block the student from starting.
                try {
                    const registered = await api.proctoring.registerFace(attempt.id, imageBase64);
                    if (registered?.warning) console.warn(registered.warning);
                } catch (regErr) {
                    console.warn("Reference face archival failed (non-fatal):", regErr.message);
                }
                setFaceCaptureState("done");
                return;
            }

            if (enrollResult.status === "error") {
                setFaceCaptureState("error");
                setFaceCaptureError(enrollResult.message || "Face enrollment failed.");
                return;
            }

            if (enrollResult.status === "capturing" && enrollResult.captured < (enrollResult.required_frames || 5)) {
                setFaceCaptureError(enrollResult.message || "Keep your face visible.");
                enrollIntervalRef.current = setTimeout(() => {
                    setFaceCaptureState("pending");
                }, 300);
            }
        } catch (e) {
            setFaceCaptureState("error");
            setFaceCaptureError("Face registration failed: " + e.message);
        }
    }, [attempt, faceCaptureState]);

    const applyQuestion = (qr) => {
        if (qr.finished) {
            setFinished(true);
            setResult(qr.result);
            return;
        }
        setQuestion(qr.question);
        setQuestionIndex(qr.questionIndex || 0);
        setAdaptive(qr.adaptive);
        setFeedback(null);
        setRunResult(null);
        setRunError("");
        setCodingView("problem");
        if (qr.question?.type === "coding") {
            const lang = LANGUAGE_KEY[String(qr.question.language || "python").toLowerCase()] || "python";
            codeBuffersRef.current = {};
            setLanguage(lang);
            setCode(STARTER[lang] || STARTER.python);
        } else {
            setAnswer(qr.question?.format === "mcq" ? undefined : "");
        }
    };

    // Each language keeps its own buffer so switching C -> Java -> C does not
    // throw away work in progress.
    const handleLanguageChange = (next) => {
        const lang = LANGUAGE_KEY[String(next).toLowerCase()] || next;
        codeBuffersRef.current[language] = code;
        setLanguage(lang);
        setCode(codeBuffersRef.current[lang] ?? STARTER[lang] ?? "");
    };

    const loadNext = useCallback(async (realId) => {
        try {
            const qr = await api.tests.nextQuestion(realId);
            applyQuestion(qr);
            if (qr.finished) {
                const full = await api.tests.result(realId);
                setAttempt(full);
            }
        } catch (e) {
            setError(e.message);
        }
    }, []);

    useEffect(() => {
        // React StrictMode double-invokes effects in development. Starting the
        // attempt twice created duplicate attempt documents (one orphaned
        // in_progress + one completed), which then blocked retakes with
        // "already completed". Guard by URL key so a real navigation still runs.
        const initKey = `${attemptId}|${isNew}`;
        if (didInitRef.current === initKey) return;
        didInitRef.current = initKey;
        (async () => {
            try {
                let att;
                if (isNew || !attemptId) {
                    att = await api.tests.start(attemptId);
                } else {
                    att = await api.tests.attempt(attemptId);
                    if (att.status === "completed" || att.status === "cheated" || att.status === "disqualified") {
                        setFinished(true);
                        setResult(att.result || att.status);
                        setAttempt(att);
                        return;
                    }
                    if (att.status === "flagged" || att.reviewRequired) {
                        setAttempt(att);
                        return;
                    }
                    if (att.pendingQuestionId) {
                        setAttempt(att);
                        if (att.durationMin) durationRef.current = att.durationMin * 60;
                        if (att.startedAt) startAtRef.current = new Date(att.startedAt).getTime();
                        const qr = await api.tests.nextQuestion(att.id);
                        applyQuestion(qr);
                        return;
                    }
                }
                setAttempt(att);
                if (att.durationMin) durationRef.current = att.durationMin * 60;
                if (att.startedAt) startAtRef.current = new Date(att.startedAt).getTime();
                await loadNext(att.id);
            } catch (e) {
                setError(e.message);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attemptId, isNew]);

    useEffect(() => {
        if (!attempt || finished) return;
        const iv = setInterval(() => {
            const now = Date.now();
            const paused = pausedTotalRef.current + (pausedSinceRef.current != null ? now - pausedSinceRef.current : 0);
            const left = Math.round(durationRef.current - (now - startAtRef.current - paused) / 1000);
            setTimeLeft(Math.max(0, left));
            if (left <= 0) {
                clearInterval(iv);
                proctoring.stop();
                api.tests.finish(attempt.id).then((f) => {
                    setFinished(true);
                    setResult(f.result);
                    if (f.attempt) setAttempt(f.attempt);
                }).catch(() => {});
            }
        }, 1000);
        return () => clearInterval(iv);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt, finished]);

    const handleSubmit = async () => {
        if (identityBlocked || !question || feedback || submitting) return;
        setSubmitting(true);
        setError("");
        try {
            const body = { questionId: question.id, timeTakenMs: Date.now() - startAtRef.current };
            if (question.type === "coding") {
                body.code = code;
                body.language = language;
            } else {
                body.answer = answer;
            }
            const fb = await api.tests.answer(attempt.id, body);
            setFeedback(fb);
            if (fb.finished) {
                setFinished(true);
                setResult(fb.result);
                proctoring.stop();
                const full = await api.tests.result(attempt.id);
                setAttempt(full);
                return;
            }
            setTimeout(() => loadNext(attempt.id), 1200);
        } catch (e) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleFinish = async () => {
        if (identityBlocked) return;
        if (!confirm("Submit the test now?")) return;
        proctoring.stop();
        try {
            const f = await api.tests.finish(attempt.id);
            setFinished(true);
            setResult(f.result);
        } catch (e) {
            setError(e.message);
        }
    };

    const handleRun = async () => {
        setRunning(true);
        setRunResult(null);
        setRunError("");
        try {
            const testCases = (question?.examples || []).slice(0, 10).map((example) => ({
                input: String(example.input ?? ""),
                expectedOutput: String(example.output ?? ""),
            }));
            const r = testCases.length
                ? await api.judge.runTests(code, language, testCases)
                : await api.judge.run(code, language, "");
            setRunResult(r);
        } catch (e) {
            setRunError(e.message);
        } finally {
            setRunning(false);
        }
    };

    const fmt = (s) => {
        if (s == null) return "00:00";
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    };

    const isCoding = question?.type === "coding";

    const startCameraDrag = (event) => {
        if (event.button !== 0 || !cameraPipRef.current) return;
        const rect = cameraPipRef.current.getBoundingClientRect();
        cameraDragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            left: rect.left,
            top: rect.top,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const moveCameraPip = (event) => {
        const drag = cameraDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !cameraPipRef.current) return;
        const { width, height } = cameraPipRef.current.getBoundingClientRect();
        setCameraPosition({
            left: Math.max(0, Math.min(window.innerWidth - width, drag.left + event.clientX - drag.startX)),
            top: Math.max(0, Math.min(window.innerHeight - height, drag.top + event.clientY - drag.startY)),
        });
    };

    const stopCameraDrag = (event) => {
        if (cameraDragRef.current?.pointerId === event.pointerId) cameraDragRef.current = null;
    };

    const nudgeCameraPip = (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || !cameraPipRef.current) return;
        event.preventDefault();
        const rect = cameraPipRef.current.getBoundingClientRect();
        const delta = event.shiftKey ? 24 : 8;
        const left = rect.left + (event.key === "ArrowRight" ? delta : event.key === "ArrowLeft" ? -delta : 0);
        const top = rect.top + (event.key === "ArrowDown" ? delta : event.key === "ArrowUp" ? -delta : 0);
        setCameraPosition({
            left: Math.max(0, Math.min(window.innerWidth - rect.width, left)),
            top: Math.max(0, Math.min(window.innerHeight - rect.height, top)),
        });
    };

    const renderBadges = () => (
        <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
                Question {questionIndex + 1}
            </span>
            <DifficultyBadge difficulty={question.difficulty} />
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-zinc-800/70 dark:text-zinc-400">
                {isCoding ? "Coding" : question.format === "mcq" ? "MCQ" : question.format === "fillup" ? "Fill in the blank" : "Code Snippet"}
            </span>
            {adaptive && (
                <span className="ml-auto rounded-lg bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-300">
                    Adaptive level: {adaptive.level} ({Math.min(adaptive.askedCount, attempt?.totalQuestions || adaptive.askedCount)}/{attempt?.totalQuestions || "?"})
                </span>
            )}
        </div>
    );

    const renderVerdict = () => (
        <>
            {feedback && isCoding && (
                <div
                    className={cn(
                        "mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm",
                        feedback.passed === feedback.total ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                    )}
                >
                    {feedback.passed === feedback.total ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                    <div className="min-w-0">
                        <p className="font-medium">Passed {feedback.passed}/{feedback.total} test cases</p>
                        {feedback.judge?.failedCases?.length > 0 && (
                            <div className="mt-2 space-y-1 text-xs opacity-80">
                                {feedback.judge.failedCases.map((fc, i) => (
                                    <p key={i} className="whitespace-pre-wrap break-words">
                                        <span className="font-medium">Expected:</span> {fc.expected} <span className="font-medium">Got:</span> {fc.stdout || fc.error || "(empty)"}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {feedback && !isCoding && (
                <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
                    Answer submitted. Loading the next question...
                </p>
            )}
            {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
        </>
    );

    // Problem statement: top section of the coding layout, left column of the
    // non-coding layout.
    const renderStatement = () => (
        <>
            {renderBadges()}
            <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere] dark:text-zinc-300">{question.description}</p>
            {question.format === "code_snippet" && <CodeBlock code={question.codeSnippet} />}
            {isCoding && (
                <div className="mt-3 space-y-3">
                    {question.constraints?.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">Constraints</p>
                            <ul className="mt-1 list-inside list-disc text-sm text-slate-700 dark:text-zinc-300">
                                {question.constraints.map((c, i) => <li key={i}>{c}</li>)}
                            </ul>
                        </div>
                    )}
                    {question.inputFormat && <p className="text-sm text-slate-700 dark:text-zinc-300"><span className="font-semibold text-slate-500 dark:text-zinc-400">Input: </span>{question.inputFormat}</p>}
                    {question.outputFormat && <p className="text-sm text-slate-700 dark:text-zinc-300"><span className="font-semibold text-slate-500 dark:text-zinc-400">Output: </span>{question.outputFormat}</p>}
                    {(question.examples || []).map((ex, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">Example {i + 1}</p>
                            <pre className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-zinc-200">
                                <span className="text-slate-400 dark:text-zinc-500">Input:</span> {ex.input}
                                {"\n"}
                                <span className="text-slate-400 dark:text-zinc-500">Output:</span> {ex.output}
                            </pre>
                        </div>
                    ))}
                </div>
            )}
            {renderVerdict()}
        </>
    );

    const renderNonCodingInput = () => (
        <>
            {question.format === "mcq" ? (
                <div className="space-y-2">
                    {(question.options || []).map((opt, i) => (
                        <button
                            key={i}
                            onClick={() => setAnswer(i)}
                            className={cn(
                                "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all",
                                answer === i ? "border-violet-500 bg-violet-600/10 text-violet-800 dark:text-violet-200" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300 dark:hover:border-zinc-700"
                            )}
                        >
                            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", answer === i ? "border-violet-400 bg-violet-500 text-white" : "border-slate-300 text-slate-500 dark:border-zinc-700 dark:text-zinc-400")}>
                                {String.fromCharCode(65 + i)}
                            </span>
                            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{opt}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer here..." rows={4} />
            )}
            {question.format === "code_snippet" && (
                <Textarea className="mt-3" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="What is the output?" rows={3} />
            )}
        </>
    );

    const renderSubmitRow = () => (
        <div className="mt-4 flex gap-3">
            <Button className="flex-1" onClick={handleSubmit} disabled={submitting || !!feedback || !isCoding && answer === undefined}>
                <Send className="h-4 w-4" />
                {submitting ? "Submitting..." : feedback ? "Next question loading..." : "Submit Answer"}
            </Button>
        </div>
    );

    // Output / error panel shown under the editor.
    const renderOutputPanel = () => {
        const r = runResult;
        const failed = r && (r.status !== "success");
        const tone = runError
            ? "text-red-300"
            : !r
                ? "text-zinc-500"
                : failed
                    ? "text-red-300"
                    : "text-emerald-300";
        const rawBody = runError
            ? runError
            : !r
                ? "Run your code to see output, compiler errors and runtime errors here."
                : r.compileOutput || r.stderr || r.message
                    ? r.compileOutput || r.stderr || r.message
                    : r.output || r.stdout || "(no output)";
        const body = language === "python" ? formatPythonRuntimeError(rawBody) : rawBody;
        return (
            <div className="flex h-52 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 dark:border-zinc-800">
                    <Terminal className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Output</span>
                    {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />}
                    {r && !running && (
                        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", failed ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400")}>
                            {r.testCases?.length
                                ? `${r.passed}/${r.total} test cases passed`
                                : r.statusText || (failed ? "Failed" : "Executed")}
                        </span>
                    )}
                    <div className="ml-auto flex items-center gap-3 text-[11px] text-zinc-500">
                        {r?.engine && <span className="uppercase">{r.engine}</span>}
                        {r?.time != null && r.time !== "" && <span>{Number(r.time).toFixed(2)}s</span>}
                        {r?.memoryKb ? <span>{Math.round(Number(r.memoryKb) / 1024)} MB</span> : null}
                    </div>
                </div>
                <pre className={cn("min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-xs", tone)}>{body}</pre>
                {r?.testCases?.length > 0 && (
                    <div className="max-h-28 shrink-0 space-y-1 overflow-auto border-t border-slate-200 px-3 py-2 dark:border-zinc-800">
                        {r.testCases.map((testCase, index) => (
                            <div key={testCase.index ?? index} className={cn("grid grid-cols-[auto_1fr_1fr] gap-2 rounded px-2 py-1.5 text-[11px]", testCase.passed ? "bg-emerald-500/5" : "bg-red-500/5")}>
                                <span className={testCase.passed ? "text-emerald-400" : "text-red-400"}>
                                    {testCase.passed ? "✓" : "×"} Case {index + 1}
                                </span>
                                <span className="min-w-0 break-words text-zinc-500"><span className="text-zinc-400">Expected:</span> {testCase.expected || "(empty)"}</span>
                                <span className="min-w-0 break-words text-zinc-500"><span className="text-zinc-400">Output:</span> {testCase.stdout || (language === "python" ? formatPythonRuntimeError(testCase.error) : testCase.error) || "(empty)"}</span>
                            </div>
                        ))}
                    </div>
                )}
                {r?.warning && (
                    <p className="border-t border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-300">{r.warning}</p>
                )}
            </div>
        );
    };

    // ---------- Result / error / loading states (always full width) ----------
    if (error && !attempt) {
        return (
            <div className="mx-auto max-w-xl">
                <Card className="border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
                    <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                        <XCircle className="h-10 w-10 text-red-400" />
                        <p className="text-sm text-slate-700 dark:text-zinc-300">{error}</p>
                        <Button variant="outline" onClick={() => navigate("/student/tests")}>Back to tests</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (finished) {
        const answers = attempt?.answers || [];
        const correctCount = answers.filter((a) => a.correct).length;
        const isDisqualified = result === "disqualified" || attempt?.disqualified;
        const isCheated = result === "cheated" || attempt?.status === "cheated";
        const isTimedOut = !!attempt?.timedOut && !isCheated && !isDisqualified;

        const cheatingReasonLabels = {
            FULLSCREEN_EXIT: "You exited fullscreen mode during the test.",
            MULTIPLE_FACES: "Multiple persons were detected in the camera feed.",
            PHONE_DETECTED: "A mobile phone or prohibited device was detected.",
            DEV_TOOLS: "Developer tools or prohibited keyboard shortcut was detected.",
            SCREEN_CAPTURE: "A screen capture attempt was detected.",
            MAX_VIOLATIONS_EXCEEDED: `You exceeded the maximum allowed proctoring violations (${attempt?.proctoring?.maxViolations ?? 1}).`,
            TAB_SWITCH: "Tab or window switching was detected multiple times.",
            WINDOW_FOCUS_LOST: "The exam window lost focus multiple times.",
            RIGHT_CLICK: "Right-click was detected during the test.",
            COPY_ATTEMPT: "Copy shortcut was detected during the test.",
            PASTE_ATTEMPT: "Paste shortcut was detected during the test.",
            IMPOSTER_DETECTED: "A different person was detected taking the exam.",
            IDENTITY_MISMATCH: "Identity mismatch detected. A different person may be present.",
            ELECTRONIC_DEVICE: "An electronic device (phone/laptop) was detected.",
            MULTIPLE_PERSONS: "Multiple persons were detected in the camera feed.",
            CANDIDATE_NOT_VISIBLE: "The candidate is no longer visible in the camera.",
            NO_FACE: "No face was detected in the camera feed.",
            CAMERA_LOST: "Camera was disconnected during the test.",
            CAMERA_DISABLED: "Camera was disconnected or disabled during the test.",
            CAMERA_ERROR: "A camera error occurred during the test.",
            MIC_LOST: "Microphone was disconnected during the test.",
            LOW_FACE_CONFIDENCE: "Face quality was too low during the assessment.",
            F5_REFRESH: "Page refresh (F5) was attempted during the test.",
            ESCAPE_PRESSED: "Escape key was pressed during the test.",
        };

        const cheatingReason = attempt?.cheatingReason || cheatingReasonState;
        const cheatingLabel = cheatingReasonLabels[cheatingReason] || cheatingReason?.replace(/_/g, " ").toLowerCase() || "A proctoring violation was detected.";

        return (
            <div className="mx-auto max-w-2xl">
                <Card className={cn("border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40", isCheated && "border-red-500/30")}>
                    <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
                        <div className={cn("flex h-16 w-16 items-center justify-center rounded-full", isCheated || isDisqualified ? "bg-red-500/20 text-red-400 border border-red-500/30" : isTimedOut ? "bg-amber-500/20 text-amber-500 border border-amber-500/30" : "bg-gradient-to-br from-violet-600 to-indigo-600 text-white")}>
                            {isCheated || isDisqualified ? <ShieldAlert className="h-8 w-8" /> : isTimedOut ? <Clock className="h-8 w-8" /> : <CheckCircle2 className="h-8 w-8" />}
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                            {isCheated ? "Exam Automatically Submitted" : isDisqualified ? "Test Terminated & Disqualified" : isTimedOut ? "Time Expired" : "Test completed"}
                        </h2>
                        {isTimedOut && (
                            <div className="max-w-md rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
                                <p className="font-semibold">The time limit for this test was reached.</p>
                                <p className="mt-1 text-xs text-amber-600/80 dark:text-amber-300/80">
                                    Your saved answers were submitted automatically when the timer expired.
                                </p>
                            </div>
                        )}
                        {isCheated && (
                            <div className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-700 dark:text-red-300 space-y-3">
                                <p className="font-semibold">Your examination has been terminated due to a proctoring violation.</p>
                                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Reason</p>
                                    <p className="mt-1 text-sm text-red-700 dark:text-red-300">{cheatingLabel}</p>
                                </div>
                                {cheatingReason && (
                                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Violation Code</p>
                                        <p className="mt-1 font-mono text-xs text-red-700 dark:text-red-300">{cheatingReason}</p>
                                    </div>
                                )}
                                {attempt?.cheatingTimestamp && (
                                    <p className="text-xs text-red-600/80 dark:text-red-300/70">Detected at: {new Date(attempt.cheatingTimestamp).toLocaleString()}</p>
                                )}
                                <p className="text-xs text-red-600/80 dark:text-red-300/70">Status: <span className="font-semibold text-red-400">CHEATED</span></p>
                            </div>
                        )}
                        {isDisqualified && !isCheated && (
                            <div className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
                                <p className="font-semibold">Full Screen Violation</p>
                                <p className="mt-1 text-xs text-red-600/80 dark:text-red-300/80">
                                    You exited fullscreen mode during the test. Per proctoring policies, your test attempt was immediately terminated and removed.
                                </p>
                            </div>
                        )}
                        {result && <StatusBadge value={isCheated ? "cheated" : result} className="px-4 py-1 text-base" />}
                        {attempt?.violations > 0 && !isDisqualified && !isCheated && (
                            <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="h-4 w-4" /> {attempt.violations} proctoring violation{attempt.violations === 1 ? "" : "s"} recorded
                            </p>
                        )}
                        <div className="mt-2 grid w-full max-w-sm grid-cols-3 gap-3">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950/40 p-3">
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">{isCheated || isDisqualified ? 0 : attempt?.score ?? 0}</p>
                                <p className="text-xs text-slate-500 dark:text-zinc-500">Score</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950/40 p-3">
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">{attempt?.totalScore ?? 0}</p>
                                <p className="text-xs text-slate-500 dark:text-zinc-500">Total</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950/40 p-3">
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">{isCheated || isDisqualified ? 0 : correctCount}</p>
                                <p className="text-xs text-slate-500 dark:text-zinc-500">Correct</p>
                            </div>
                        </div>
                        <div className="mt-4 flex gap-3">
                            <Button onClick={() => navigate("/student/tests")}>My Tests</Button>
                            <Button variant="outline" onClick={() => navigate("/student/report")}>Full Report</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!attempt) {
        return (
            <div className="flex h-64 items-center justify-center">
                <p className="text-sm text-zinc-500">Loading test...</p>
            </div>
        );
    }

    // ---------- Proctoring gate screen ----------
    if (attempt?.status === "flagged" || attempt?.reviewRequired) {
        return (
            <div className="mx-auto max-w-xl">
                <Card className="border-red-500/30 bg-red-500/5">
                    <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-red-400">
                            <ShieldAlert className="h-8 w-8" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Attempt Paused for Staff Review</h2>
                        <p className="text-sm text-slate-600 dark:text-zinc-300">
                            A proctoring violation was detected on this attempt. The test is locked until the staff coordinator reviews and resets it.
                        </p>
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-700 dark:text-red-300">
                            {attempt?.violations || 0} violation{(attempt?.violations || 0) === 1 ? "" : "s"} recorded.
                        </div>
                        <Button variant="outline" onClick={() => navigate("/student/tests")}>Back to tests</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (proctored && proctoring.status !== "active") {
        return (
            <div className="mx-auto max-w-lg">
                <Card className="border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
                    <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-red-600">
                            <ShieldAlert className="h-8 w-8 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Proctored test</h2>
                        <p className="text-sm text-slate-600 dark:text-zinc-400">
                            {attempt.testTitle} is monitored. You must enable your <span className="font-medium text-slate-800 dark:text-zinc-200">camera</span>,{" "}
                            <span className="font-medium text-slate-800 dark:text-zinc-200">microphone</span>, and <span className="font-medium text-slate-800 dark:text-zinc-200">fullscreen</span> to continue.
                            Any violation of the proctoring rules will result in immediate test submission and disqualification.
                        </p>

                        {proctoring.status === "ready" && (
                            <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-zinc-800 dark:bg-zinc-950">
                                <video ref={previewRef} autoPlay playsInline muted className="h-52 w-full object-cover" />
                                <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500 dark:text-zinc-400">
                                    <span className="flex items-center gap-1.5"><Camera className="h-3.5 w-3.5 text-emerald-400" /> Camera on</span>
                                    <span className="flex items-center gap-1.5"><Mic className="h-3.5 w-3.5 text-emerald-400" /> Mic on</span>
                                </div>
                            </div>
                        )}

                        {proctoring.status === "denied" && (
                            <div className="w-full space-y-2">
                                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                    Hardware camera or microphone permission was denied or unavailable on this device.
                                </p>
                            </div>
                        )}

                        <div className="mt-2 flex flex-wrap justify-center gap-3">
                            {proctoring.status === "idle" ? (
                                <Button onClick={() => proctoring.enable()}>
                                    <Maximize2 className="h-4 w-4" /> Enable camera, mic &amp; fullscreen
                                </Button>
                            ) : proctoring.status === "denied" ? (
                                <>
                                    <Button onClick={() => proctoring.enable(false)}>
                                        <Maximize2 className="h-4 w-4" /> Retry camera &amp; mic
                                    </Button>
                                    <Button variant="outline" onClick={() => proctoring.enable(true)}>
                                        <Video className="h-4 w-4" /> Continue in Dev / Local Stream Mode
                                    </Button>
                                </>
                            ) : (
                                <Button onClick={() => proctoring.start()}>
                                    <Video className="h-4 w-4" /> Begin test
                                </Button>
                            )}
                            <Button variant="outline" onClick={() => navigate("/student/tests")}>Cancel</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (proctored && faceCaptureState !== "done") {
        const capturePct = enrollProgress.required > 0 ? Math.round((enrollProgress.captured / enrollProgress.required) * 100) : 0;
        return (
            <div className="mx-auto max-w-lg">
                <Card className="border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
                    <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600">
                            <ScanFace className="h-8 w-8 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Face Enrollment</h2>
                        <p className="text-sm text-slate-600 dark:text-zinc-400">
                            Position your face inside the camera frame. We'll capture multiple frames to create a reliable identity reference.
                        </p>

                        <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-zinc-800 dark:bg-zinc-950">
                            <video ref={previewRef} autoPlay playsInline muted className="h-52 w-full object-cover" />
                            <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-slate-500 dark:text-zinc-400">
                                <Camera className="h-3.5 w-3.5 text-emerald-400" /> Camera active
                            </div>
                        </div>

                        {faceCaptureState !== "pending" && faceCaptureState !== "error" && (
                            <div className="w-full space-y-2">
                                <div className="flex justify-between text-xs text-slate-500 dark:text-zinc-400">
                                    <span>Capturing face...</span>
                                    <span>{enrollProgress.captured} / {enrollProgress.required}</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300"
                                        style={{ width: `${capturePct}%` }}
                                    />
                                </div>
                                <p className="text-center text-xs text-slate-500 dark:text-zinc-400">Keep your face visible and steady</p>
                            </div>
                        )}

                        {faceCaptureState === "error" && faceCaptureError && (
                            <div className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                                {faceCaptureError}
                            </div>
                        )}

                        {faceCaptureState === "pending" && faceCaptureError && (
                            <div className="w-full rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                                {faceCaptureError}
                            </div>
                        )}

                        <div className="mt-2 flex flex-wrap justify-center gap-3">
                            <Button onClick={captureFace} disabled={faceCaptureState === "capturing"}>
                                <ScanFace className="h-4 w-4" />
                                {faceCaptureState === "capturing" ? "Capturing..." : enrollProgress.captured > 0 ? "Capture Next Frame" : "Capture Face"}
                            </Button>
                            <Button variant="outline" onClick={() => navigate("/student/tests")}>Cancel</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!question) {
        return (
            <div className="flex h-64 items-center justify-center">
                <p className="text-sm text-zinc-500">Loading question...</p>
            </div>
        );
    }

    // ---------- Full-screen test shell ----------
    return (
        <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100">
            {/* Top bar */}
            <div className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">{attempt.testTitle}</p>
                    <p className="text-xs text-slate-500 dark:text-zinc-500">Question {questionIndex + 1}{attempt.totalQuestions ? ` of ${attempt.totalQuestions}` : ""}</p>
                </div>

                {proctored && (
                    <div className="flex items-center gap-3">
                        <span className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", proctoring.cameraActive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400")}>
                            {proctoring.cameraActive ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
                            Cam
                        </span>
                        <span className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", faceStatus.tone)}>
                            <ScanFace className="h-3.5 w-3.5" />
                            {faceStatus.label}
                        </span>
                        <span className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", proctoring.micActive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400")}>
                            {proctoring.micActive ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                            Mic
                        </span>
                        <span className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", proctoring.fullscreenActive ? "border-slate-300 bg-slate-100 text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" : "border-red-500/30 bg-red-500/10 text-red-400")}>
                            <Maximize2 className="h-3.5 w-3.5" />
                            {proctoring.fullscreenActive ? "Fullscreen" : "Not fullscreen"}
                        </span>
                    </div>
                )}

                <span className="flex items-center gap-1.5 rounded-lg bg-slate-200 px-2.5 py-1 text-sm font-medium text-slate-800 dark:bg-zinc-800 dark:text-zinc-100">
                    <Clock className="h-4 w-4 text-violet-400" /> {fmt(timeLeft)}
                </span>

                <Button variant="outline" size="sm" onClick={handleFinish}>Finish</Button>
            </div>

            {/* Keep the problem and coding workspace as separate full-height views. */}
            {isCoding ? (
                <div className="flex min-h-0 flex-1 flex-col p-4">
                    <div className="mb-3 flex shrink-0 items-center gap-1 self-start rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-zinc-800 dark:bg-zinc-950">
                        <Button size="sm" variant={codingView === "problem" ? "default" : "ghost"} aria-pressed={codingView === "problem"} onClick={() => setCodingView("problem")}>
                            Problem statement
                        </Button>
                        <Button size="sm" variant={codingView === "editor" ? "default" : "ghost"} aria-pressed={codingView === "editor"} onClick={() => setCodingView("editor")}>
                            <Braces className="h-4 w-4" /> Code editor
                        </Button>
                    </div>
                    {codingView === "problem" ? (
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
                            {renderStatement()}
                            <Button className="mt-6" onClick={() => setCodingView("editor")}>
                                <Braces className="h-4 w-4" /> Open code editor
                            </Button>
                        </div>
                    ) : (
                        <div className="flex min-h-0 flex-1 flex-col gap-3">
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
                                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-zinc-800">
                                    <div className="relative">
                                        <Braces className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400" />
                                        <select
                                            aria-label="Programming language"
                                            value={language}
                                            onChange={(e) => handleLanguageChange(e.target.value)}
                                            className="h-9 min-w-40 appearance-none rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-9 text-sm font-medium text-slate-700 shadow-sm transition hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-violet-500"
                                        >
                                            {LANGUAGES.map((l) => (
                                                <option key={l.key} value={l.key}>{l.label}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-zinc-400" />
                                    </div>
                                    <Button size="sm" variant="outline" onClick={handleRun} disabled={running}>
                                        <Play className="h-3.5 w-3.5" /> {running ? "Running..." : "Run code"}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setCode(STARTER[language] || "")} disabled={running} title="Restore the starter template">
                                        <RotateCcw className="h-3.5 w-3.5" /> Reset
                                    </Button>
                                    <span className="ml-auto hidden text-xs text-slate-500 dark:text-zinc-500 lg:block">
                                        {question?.examples?.[0] ? "Runs with the Example 1 input" : "No sample input for this question"}
                                    </span>
                                </div>
                                <div className="min-h-0 flex-1">
                                    <CodeEditor language={MONACO_LANGUAGE[language] || "python"} value={code} onChange={setCode} />
                                </div>
                                <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-3 py-2 dark:border-zinc-800">
                                    <Button onClick={handleSubmit} disabled={submitting || !!feedback}>
                                        <Send className="h-4 w-4" />
                                        {submitting ? "Submitting..." : feedback ? "Next question loading..." : "Submit Answer"}
                                    </Button>
                                </div>
                            </div>
                            {renderOutputPanel()}
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 xl:grid-cols-3">
                    <div className="min-w-0 xl:col-span-2">
                        <Card className="border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
                            <CardContent className="p-5">
                                {renderStatement()}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="flex flex-col gap-5 pb-20">
                        <Card className="border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
                            <CardContent className="p-5">
                                <div className="mb-4 flex items-center justify-between">
                                    <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">
                                        {question.format === "mcq" ? "Choose one option" : "Type your answer"}
                                    </p>
                                </div>

                                {renderNonCodingInput()}
                                {renderSubmitRow()}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Camera PIP */}
            {proctored && proctoring.status === "active" && (
                <div
                    ref={cameraPipRef}
                    style={cameraPosition ? { left: cameraPosition.left, top: cameraPosition.top, right: "auto", bottom: "auto" } : undefined}
                    className="absolute bottom-4 right-4 z-10 w-44 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
                >
                    <div className="relative">
                        <video ref={previewRef} autoPlay playsInline muted className="h-28 w-full object-cover" />
                        <FaceAttentionOverlay metrics={proctoring.faceMonitor?.metrics} width={176} height={112} />
                    </div>
                    <button
                        type="button"
                        aria-label="Move camera preview. Use arrow keys to reposition."
                        title="Drag to move; use arrow keys to reposition"
                        onPointerDown={startCameraDrag}
                        onPointerMove={moveCameraPip}
                        onPointerUp={stopCameraDrag}
                        onPointerCancel={stopCameraDrag}
                        onKeyDown={nudgeCameraPip}
                        className="flex w-full touch-none cursor-move items-center justify-between px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
                    >
                        <span className="flex items-center gap-1">
                            <span className={cn("h-1.5 w-1.5 rounded-full", proctoring.cameraActive ? "bg-emerald-400" : "bg-red-500")} />
                            <span>{proctoring.cameraActive ? "Camera active" : "Camera reconnecting"}</span>
                        </span>
                        <Move className="h-3 w-3" />
                    </button>
                </div>
            )}

            {/* Identity gate: blocks the test until the enrolled face is verified */}
            {identityBlocked && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
                    <Card className="w-full max-w-md border-amber-500/40 bg-white dark:bg-zinc-900">
                        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
                                <ScanFace className="h-8 w-8" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                Identity verification required
                            </h2>
                            <p className="text-sm text-slate-600 dark:text-zinc-300">
                                {proctoring.faceMonitor?.identityBlockReason ||
                                    "The registered candidate is not verified on camera."}
                            </p>
                            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                Answering is blocked and the timer is paused until verification succeeds.
                            </div>
                            <p className="text-xs text-slate-400 dark:text-zinc-500">
                                Waiting for the registered candidate to return to the camera...
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
