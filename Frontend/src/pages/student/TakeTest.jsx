import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Clock, Send, Play, CheckCircle2, XCircle, Camera, Mic, Maximize2, ShieldAlert, Video, VideoOff, MicOff, ScanFace, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { CodeEditor } from "@/components/assessment/code-editor";
import { DifficultyBadge, SimpleProgress } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import useProctoring from "@/hooks/use-proctoring";

function CodeBlock({ code }) {
    if (!code) return null;
    return (
        <pre className="mt-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-200">
            <code>{code}</code>
        </pre>
    );
}

const STARTER = {
    python: "# Write your Python solution here\nimport sys\n\ndef solve():\n    # read input from sys.stdin and print the answer\n    pass\n\nif __name__ == '__main__':\n    solve()",
    javascript: "// Write your JavaScript solution here\nconst readline = require('readline');\n",
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
    const [runOutput, setRunOutput] = useState("");
    const [timeLeft, setTimeLeft] = useState(null);
    const [error, setError] = useState("");
    const [cheatingReasonState, setCheatingReasonState] = useState(null);
    const [faceCaptureState, setFaceCaptureState] = useState("pending");
    const [faceCaptureError, setFaceCaptureError] = useState("");
    const [enrollProgress, setEnrollProgress] = useState({ captured: 0, required: 5 });
    const startAtRef = useRef(Date.now());
    const durationRef = useRef(30 * 60);
    const previewRef = useRef(null);
    const faceCanvasRef = useRef(null);
    const enrollIntervalRef = useRef(null);

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

    useEffect(() => {
        if (faceCaptureState !== "pending") return;
        let cancelled = false;
        fetch(`${proctoringApiBase}/health`, { method: "GET", signal: AbortSignal.timeout(3000) })
            .then((r) => { if (r.ok && !cancelled) setFaceCaptureState("pending"); })
            .catch(() => { if (!cancelled) setFaceCaptureState("done"); });
        return () => { cancelled = true; };
    }, [faceCaptureState, proctoringApiBase]);

    useEffect(() => {
        if (faceCaptureState !== "pending" || !proctored) return;
        proctoring.reattachStream();
    }, [faceCaptureState, proctored, proctoring]);

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
                await api.proctoring.registerFace(attempt.id, imageBase64);
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
        setRunOutput("");
        if (qr.question?.type === "coding") {
            const lang = qr.question.language || "python";
            setLanguage(lang);
            setCode((prev) => (prev ? prev : STARTER[lang] || STARTER.python));
        } else {
            setAnswer(qr.question?.format === "mcq" ? undefined : "");
        }
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
        (async () => {
            try {
                let att;
                if (isNew || !attemptId) {
                    att = await api.tests.start(attemptId);
                } else {
                    att = await api.tests.attempt(attemptId);
                    if (att.status === "completed" || att.status === "cheated") {
                        setFinished(true);
                        setResult(att.result);
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
            const left = Math.round(durationRef.current - (Date.now() - startAtRef.current) / 1000);
            setTimeLeft(Math.max(0, left));
            if (left <= 0) {
                clearInterval(iv);
                proctoring.stop();
                api.tests.finish(attempt.id).then((f) => {
                    setFinished(true);
                    setResult(f.result);
                }).catch(() => {});
            }
        }, 1000);
        return () => clearInterval(iv);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt, finished]);

    const handleSubmit = async () => {
        if (!question || feedback || submitting) return;
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
        setRunOutput("Running...");
        try {
            const r = await api.judge.run(code, language, question?.examples?.[0]?.input || "");
            setRunOutput(r.stdout || r.stderr || "(no output)");
        } catch (e) {
            setRunOutput("Error: " + e.message);
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

    // ---------- Result / error / loading states (always full width) ----------
    if (error && !attempt) {
        return (
            <div className="mx-auto max-w-xl">
                <Card className="border-zinc-800 bg-zinc-900/40">
                    <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                        <XCircle className="h-10 w-10 text-red-400" />
                        <p className="text-sm text-zinc-300">{error}</p>
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
                <Card className={cn("border-zinc-800 bg-zinc-900/40", isCheated && "border-red-500/30")}>
                    <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
                        <div className={cn("flex h-16 w-16 items-center justify-center rounded-full", isCheated ? "bg-red-500/20 text-red-400 border border-red-500/30" : isDisqualified ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-gradient-to-br from-violet-600 to-indigo-600 text-white")}>
                            {isCheated || isDisqualified ? <ShieldAlert className="h-8 w-8" /> : <CheckCircle2 className="h-8 w-8" />}
                        </div>
                        <h2 className="text-2xl font-bold text-white">
                            {isCheated ? "Exam Automatically Submitted" : isDisqualified ? "Test Terminated & Disqualified" : "Test completed"}
                        </h2>
                        {isCheated && (
                            <div className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300 space-y-3">
                                <p className="font-semibold">Your examination has been terminated due to a proctoring violation.</p>
                                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-red-400">Reason</p>
                                    <p className="mt-1 text-sm text-red-300">{cheatingLabel}</p>
                                </div>
                                {cheatingReason && (
                                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-red-400">Violation Code</p>
                                        <p className="mt-1 font-mono text-xs text-red-300">{cheatingReason}</p>
                                    </div>
                                )}
                                {attempt?.cheatingTimestamp && (
                                    <p className="text-xs text-red-300/70">Detected at: {new Date(attempt.cheatingTimestamp).toLocaleString()}</p>
                                )}
                                <p className="text-xs text-red-300/70">Status: <span className="font-semibold text-red-400">CHEATED</span></p>
                            </div>
                        )}
                        {isDisqualified && !isCheated && (
                            <div className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                                <p className="font-semibold">Full Screen Violation</p>
                                <p className="mt-1 text-xs text-red-300/80">
                                    You exited fullscreen mode during the test. Per proctoring policies, your test attempt was immediately terminated and removed.
                                </p>
                            </div>
                        )}
                        {result && <StatusBadge value={isCheated ? "cheated" : result} className="px-4 py-1 text-base" />}
                        {attempt?.violations > 0 && !isDisqualified && !isCheated && (
                            <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-400">
                                <AlertTriangle className="h-4 w-4" /> {attempt.violations} proctoring violation{attempt.violations === 1 ? "" : "s"} recorded
                            </p>
                        )}
                        <div className="mt-2 grid w-full max-w-sm grid-cols-3 gap-3">
                            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                <p className="text-2xl font-bold text-white">{isCheated || isDisqualified ? 0 : attempt?.score ?? 0}</p>
                                <p className="text-xs text-zinc-500">Score</p>
                            </div>
                            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                <p className="text-2xl font-bold text-white">{attempt?.totalScore ?? 0}</p>
                                <p className="text-xs text-zinc-500">Total</p>
                            </div>
                            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                <p className="text-2xl font-bold text-white">{isCheated || isDisqualified ? 0 : correctCount}</p>
                                <p className="text-xs text-zinc-500">Correct</p>
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
                        <h2 className="text-2xl font-bold text-white">Attempt Paused for Staff Review</h2>
                        <p className="text-sm text-zinc-300">
                            A proctoring violation was detected on this attempt. The test is locked until the staff coordinator reviews and resets it.
                        </p>
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
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
                <Card className="border-zinc-800 bg-zinc-900/40">
                    <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-red-600">
                            <ShieldAlert className="h-8 w-8 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Proctored test</h2>
                        <p className="text-sm text-zinc-400">
                            {attempt.testTitle} is monitored. You must enable your <span className="font-medium text-zinc-200">camera</span>,{" "}
                            <span className="font-medium text-zinc-200">microphone</span>, and <span className="font-medium text-zinc-200">fullscreen</span> to continue.
                            Any violation of the proctoring rules will result in immediate test submission and disqualification.
                        </p>

                        {proctoring.status === "ready" && (
                            <div className="w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                                <video ref={previewRef} autoPlay playsInline muted className="h-52 w-full object-cover" />
                                <div className="flex items-center justify-between px-3 py-2 text-xs text-zinc-400">
                                    <span className="flex items-center gap-1.5"><Camera className="h-3.5 w-3.5 text-emerald-400" /> Camera on</span>
                                    <span className="flex items-center gap-1.5"><Mic className="h-3.5 w-3.5 text-emerald-400" /> Mic on</span>
                                </div>
                            </div>
                        )}

                        {proctoring.status === "denied" && (
                            <div className="w-full space-y-2">
                                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
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
                <Card className="border-zinc-800 bg-zinc-900/40">
                    <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600">
                            <ScanFace className="h-8 w-8 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Face Enrollment</h2>
                        <p className="text-sm text-zinc-400">
                            Position your face inside the camera frame. We'll capture multiple frames to create a reliable identity reference.
                        </p>

                        <div className="w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                            <video ref={previewRef} autoPlay playsInline muted className="h-52 w-full object-cover" />
                            <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-zinc-400">
                                <Camera className="h-3.5 w-3.5 text-emerald-400" /> Camera active
                            </div>
                        </div>

                        {faceCaptureState !== "pending" && faceCaptureState !== "error" && (
                            <div className="w-full space-y-2">
                                <div className="flex justify-between text-xs text-zinc-400">
                                    <span>Capturing face...</span>
                                    <span>{enrollProgress.captured} / {enrollProgress.required}</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300"
                                        style={{ width: `${capturePct}%` }}
                                    />
                                </div>
                                <p className="text-center text-xs text-zinc-500">Keep your face visible and steady</p>
                            </div>
                        )}

                        {faceCaptureState === "error" && faceCaptureError && (
                            <div className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                                {faceCaptureError}
                            </div>
                        )}

                        {faceCaptureState === "pending" && faceCaptureError && (
                            <div className="w-full rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
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
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
            {/* Top bar */}
            <div className="flex items-center gap-4 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-100">{attempt.testTitle}</p>
                    <p className="text-xs text-zinc-500">Question {questionIndex + 1}{attempt.totalQuestions ? ` of ${attempt.totalQuestions}` : ""}</p>
                </div>

                {proctored && (
                    <div className="flex items-center gap-3">
                        <span className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", proctoring.cameraActive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400")}>
                            {proctoring.cameraActive ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
                            Cam
                        </span>
                        <span className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs",
                            proctoring.faceMonitor?.match === true ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                            proctoring.faceMonitor?.match === false ? "border-red-500/30 bg-red-500/10 text-red-400" :
                            "border-zinc-700 bg-zinc-800 text-zinc-300"
                        )}>
                            <ScanFace className="h-3.5 w-3.5" />
                            {proctoring.faceMonitor?.match === true ? "Verified" : proctoring.faceMonitor?.match === false ? "Mismatch" : "Face"}
                        </span>
                        <span className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", proctoring.micActive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400")}>
                            {proctoring.micActive ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                            Mic
                        </span>
                        <span className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", proctoring.fullscreenActive ? "border-zinc-700 bg-zinc-800 text-zinc-300" : "border-red-500/30 bg-red-500/10 text-red-400")}>
                            <Maximize2 className="h-3.5 w-3.5" />
                            {proctoring.fullscreenActive ? "Fullscreen" : "Not fullscreen"}
                        </span>
                    </div>
                )}

                <span className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1 text-sm font-medium text-zinc-100">
                    <Clock className="h-4 w-4 text-violet-400" /> {fmt(timeLeft)}
                </span>

                <Button variant="outline" size="sm" onClick={handleFinish}>Finish</Button>
            </div>

            {/* Main content */}
            <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 xl:grid-cols-3">
                <div className="xl:col-span-2">
                    <Card className="border-zinc-800 bg-zinc-900/40">
                        <CardContent className="p-5">
                            <div className="mb-4 flex flex-wrap items-center gap-3">
                                <span className="rounded-lg bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300">Question {questionIndex + 1}</span>
                                <DifficultyBadge difficulty={question.difficulty} />
                                <span className="rounded-lg bg-zinc-800/70 px-3 py-1 text-xs text-zinc-400">
                                    {question.type === "coding" ? `Coding • ${question.language}` : question.format === "mcq" ? "MCQ" : question.format === "fillup" ? "Fill in the blank" : "Code Snippet"}
                                </span>
                                {adaptive && (
                                    <span className="ml-auto rounded-lg bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
                                        Adaptive level: {adaptive.level} ({Math.min(adaptive.askedCount, attempt?.totalQuestions || adaptive.askedCount)}/{attempt?.totalQuestions || "?"})
                                    </span>
                                )}
                            </div>

                            <h2 className="text-lg font-semibold text-white">{question.title}</h2>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{question.description}</p>

                            {question.format === "code_snippet" && <CodeBlock code={question.codeSnippet} />}

                            {question.type === "coding" && (
                                <div className="mt-4 space-y-3">
                                    {question.constraints?.length > 0 && (
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Constraints</p>
                                            <ul className="mt-1 list-inside list-disc text-sm text-zinc-300">
                                                {question.constraints.map((c, i) => <li key={i}>{c}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {question.inputFormat && <p className="text-sm text-zinc-300"><span className="font-semibold text-zinc-400">Input: </span>{question.inputFormat}</p>}
                                    {question.outputFormat && <p className="text-sm text-zinc-300"><span className="font-semibold text-zinc-400">Output: </span>{question.outputFormat}</p>}
                                    {(question.examples || []).map((ex, i) => (
                                        <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                                            <p className="text-xs font-semibold text-zinc-400">Example {i + 1}</p>
                                            <pre className="mt-1 text-sm text-zinc-200">
                                                <span className="text-zinc-500">Input:</span> {ex.input}
                                                {"\n"}
                                                <span className="text-zinc-500">Output:</span> {ex.output}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {feedback && (
                                <div
                                    className={cn(
                                        "mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm",
                                        feedback.correct ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"
                                    )}
                                >
                                    {feedback.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                                    <div>
                                        <p className="font-medium">
                                            {feedback.correct ? "Correct!" : feedback.passed !== undefined ? `Passed ${feedback.passed}/${feedback.total} test cases` : "Incorrect"}
                                        </p>
                                        {!feedback.correct && feedback.correctAnswer !== undefined && feedback.correctAnswer !== null && (
                                            <p className="mt-1 text-xs opacity-80">Correct answer: {String(feedback.correctAnswer)}</p>
                                        )}
                                        {feedback.judge?.failedCases?.length > 0 && (
                                            <div className="mt-2 space-y-1 text-xs opacity-80">
                                                {feedback.judge.failedCases.map((fc, i) => (
                                                    <p key={i}>
                                                        <span className="font-medium">Expected:</span> {fc.expected} <span className="font-medium">Got:</span> {fc.stdout || fc.error || "(empty)"}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {error && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
                        </CardContent>
                    </Card>
                </div>

                <div className="flex flex-col gap-5 pb-20">
                    <Card className="border-zinc-800 bg-zinc-900/40">
                        <CardContent className="p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <p className="text-sm font-medium text-zinc-400">
                                    {question.format === "mcq" ? "Choose one option" : question.type === "coding" ? "Write your code" : "Type your answer"}
                                </p>
                            </div>

                            {question.type === "coding" ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <select
                                            value={language}
                                            onChange={(e) => setLanguage(e.target.value)}
                                            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        >
                                            <option value="python">Python</option>
                                            <option value="javascript">JavaScript</option>
                                        </select>
                                        <Button size="sm" variant="outline" onClick={handleRun} disabled={running}>
                                            <Play className="h-3.5 w-3.5" /> {running ? "Running..." : "Run sample"}
                                        </Button>
                                    </div>
                                    <div className="h-72 overflow-hidden rounded-lg border border-zinc-800">
                                        <CodeEditor language={language} value={code} onChange={setCode} />
                                    </div>
                                    {runOutput && <pre className="max-h-32 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">{runOutput}</pre>}
                                </div>
                            ) : question.format === "mcq" ? (
                                <div className="space-y-2">
                                    {(question.options || []).map((opt, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setAnswer(i)}
                                            className={cn(
                                                "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all",
                                                answer === i ? "border-violet-500 bg-violet-600/10 text-violet-200" : "border-zinc-800 bg-zinc-950/40 text-zinc-300 hover:border-zinc-700"
                                            )}
                                        >
                                            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", answer === i ? "border-violet-400 bg-violet-500 text-white" : "border-zinc-700 text-zinc-400")}>
                                                {String.fromCharCode(65 + i)}
                                            </span>
                                            <span className="whitespace-pre-wrap">{opt}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer here..." rows={4} />
                            )}

                            {question.format === "code_snippet" && (
                                <Textarea className="mt-3" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="What is the output?" rows={3} />
                            )}

                            <div className="mt-5 flex gap-3">
                                <Button className="flex-1" onClick={handleSubmit} disabled={submitting || !!feedback || (question.type !== "coding" && answer === undefined)}>
                                    <Send className="h-4 w-4" />
                                    {submitting ? "Submitting..." : feedback ? "Next question loading..." : "Submit Answer"}
                                </Button>
                                <Button variant="outline" onClick={handleFinish}>Finish</Button>
                            </div>

                            {feedback && attempt?.totalScore > 0 && (
                                <div className="mt-4">
                                    <div className="mb-1 flex justify-between text-xs text-zinc-500">
                                        <span>Score</span>
                                        <span>{attempt.score}/{attempt.totalScore}</span>
                                    </div>
                                    <SimpleProgress value={(attempt.score / attempt.totalScore) * 100} />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Camera PIP */}
            {proctored && proctoring.status === "active" && (
                <div className="absolute bottom-4 right-4 z-10 w-44 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
                    <video ref={previewRef} autoPlay playsInline muted className="h-28 w-full object-cover" />
                    <div className="flex items-center justify-between px-2 py-1 text-[10px] text-zinc-400">
                        <span className="flex items-center gap-1">
                            <span className={cn("h-1.5 w-1.5 rounded-full", proctoring.cameraActive ? "bg-emerald-400" : "bg-red-500")} />
                            {proctoring.faceMonitor?.match === true && <span className="text-emerald-400">Verified</span>}
                            {proctoring.faceMonitor?.match === false && <span className="text-red-400">Mismatch</span>}
                            {proctoring.faceMonitor?.match === null && proctoring.faceMonitor?.faceCount > 0 && <span>Face OK</span>}
                            {(!proctoring.faceMonitor || proctoring.faceMonitor?.faceCount === 0) && <span className="text-amber-400">No face</span>}
                        </span>
                        <span className="truncate">
                            {proctoring.faceMonitor?.faceCount > 0 ? `${proctoring.faceMonitor.faceCount} face${proctoring.faceMonitor.faceCount === 1 ? "" : "s"}` : "no face"}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
