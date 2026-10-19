import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    ShieldCheck,
    Video,
    VideoOff,
    Mic,
    MicOff,
    Wifi,
    WifiOff,
    CheckCircle2,
    AlertTriangle,
    Loader2,
    Send,
    Circle,
    ArrowLeft,
    ListChecks,
    Maximize,
    ScanFace,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/portal/primitives";
import { api } from "@/lib/api";

const SpeechRecognition =
    typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function StatusPill({ ok, onLabel, offLabel, onIcon: OnIcon, offIcon: OffIcon }) {
    const Icon = ok ? OnIcon : OffIcon;
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
            }`}
        >
            <Icon className="h-3.5 w-3.5" /> {ok ? onLabel : offLabel}
        </span>
    );
}

export default function InterviewRoom() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [interview, setInterview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [step, setStep] = useState("loading");

    const [consent, setConsent] = useState({ camera: true, microphone: true, transcript: true, recording: false });
    const [consented, setConsented] = useState(false);

    const [stream, setStream] = useState(null);
    const [mediaError, setMediaError] = useState("");
    const [micLevel, setMicLevel] = useState(0);
    const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

    const [transcript, setTranscript] = useState([]);
    const [question, setQuestion] = useState(null);
    const [index, setIndex] = useState(0);
    const [total, setTotal] = useState(0);
    const [answer, setAnswer] = useState("");
    const [busy, setBusy] = useState(false);
    const [listening, setListening] = useState(false);
    const [done, setDone] = useState(false);
    const [proctorSignal, setProctorSignal] = useState({
        connected: false,
        facePresent: false,
        faceCount: 0,
        deviceDetected: false,
        devices: [],
        attention: "unknown",
        headDirection: "unknown",
        gazeDirection: "unknown",
        checkedAt: 0,
    });
    const [proctorError, setProctorError] = useState("");
    const [pausedReason, setPausedReason] = useState("");
    const [violationCount, setViolationCount] = useState(0);
    const [fullscreenActive, setFullscreenActive] = useState(false);

    const videoRef = useRef(null);
    const recognitionRef = useRef(null);
    const speechBaseRef = useRef("");
    const speechFinalRef = useRef("");
    const speechManuallyEditedRef = useRef(false);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const audioCtxRef = useRef(null);
    const rafRef = useRef(null);
    const monitorIntervalRef = useRef(null);
    const monitorRunningRef = useRef(false);
    const proctorHealthyRef = useRef(false);

    const refConsent = interview?.consent;

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await api.interviews.get(id);
            setInterview(data);
            setTranscript(data.transcript || []);
            setTotal(data.plan?.questions?.length || 0);
            setViolationCount(data.proctoringViolationCount || 0);
            if (data.status === "disqualified") {
                setStep("terminated");
            } else if (!data.plan?.questions?.length) {
                setStep("blocked");
            } else if (!data.consent?.consentedAt) {
                setStep("consent");
            } else if (data.status === "completed") {
                setDone(true);
                setStep("done");
            } else {
                setStep("check");
            }
        } catch (e) {
            setError(e.message || "Failed to load interview");
            setStep("blocked");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
        }
    }, [stream, step]);

    useEffect(() => () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        audioCtxRef.current?.close?.().catch(() => {});
        recognitionRef.current?.stop?.();
        if (recorderRef.current && recorderRef.current.state === "recording") recorderRef.current.stop();
        stream?.getTracks?.().forEach((track) => track.stop());
    }, [stream]);

    const recordProctoringEvent = useCallback(async (event) => {
        setPausedReason(event.description || "A proctoring event needs attention.");
        setProctorError("");
        try {
            const result = await api.interviews.proctoringEvent(id, event);
            setViolationCount(result.violationCount);
            if (result.terminated) {
                recognitionRef.current?.stop?.();
                if (recorderRef.current?.state === "recording") recorderRef.current.stop();
                stream?.getTracks?.().forEach((track) => track.stop());
                if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                setStep("terminated");
                setInterview((prev) => prev ? {
                    ...prev,
                    status: "disqualified",
                    session: { ...(prev.session || {}), status: "terminated" },
                } : prev);
            }
            return result;
        } catch (e) {
            setProctorError(`Could not save the proctoring event: ${e.message}`);
            return null;
        }
    }, [id, stream]);

    useEffect(() => {
        if (step !== "interview") return undefined;

        const report = (type, description, severity = "medium") => {
            void recordProctoringEvent({ type, description, severity });
        };
        const onVisibilityChange = () => {
            if (document.hidden) report("TAB_SWITCH", "Interview tab became hidden.", "high");
        };
        const onWindowBlur = () => {
            if (!document.hidden) report("WINDOW_BLUR", "Interview window lost focus.");
        };
        const onFullscreenChange = () => {
            const active = Boolean(document.fullscreenElement);
            setFullscreenActive(active);
            if (!active) report("FULLSCREEN_EXIT", "Fullscreen mode was exited.", "high");
        };
        const onContextMenu = (event) => {
            event.preventDefault();
        };

        setFullscreenActive(Boolean(document.fullscreenElement));
        document.addEventListener("visibilitychange", onVisibilityChange);
        document.addEventListener("fullscreenchange", onFullscreenChange);
        document.addEventListener("contextmenu", onContextMenu);
        window.addEventListener("blur", onWindowBlur);

        const monitor = async () => {
            if (monitorRunningRef.current) return;
            const video = videoRef.current;
            if (!video?.videoWidth || !stream?.getVideoTracks?.().some((track) => track.readyState === "live")) {
                proctorHealthyRef.current = false;
                setProctorSignal((prev) => ({ ...prev, connected: false, facePresent: false, faceCount: 0 }));
                setProctorError("Camera feed is unavailable. Re-enable the camera before continuing.");
                return;
            }

            monitorRunningRef.current = true;
            try {
                const canvas = document.createElement("canvas");
                canvas.width = 320;
                canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * canvas.width));
                canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
                const image = canvas.toDataURL("image/jpeg", 0.65).split(",")[1];
                const base = import.meta.env.VITE_PROCTORING_API || "http://localhost:5050";
                const response = await fetch(`${base}/monitor`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ image, attemptId: `interview_${id}`, cameraActive: true }),
                });
                if (!response.ok) throw new Error(`Proctoring service returned HTTP ${response.status}`);
                const result = await response.json();
                const metrics = result.metrics || {};
                const signal = {
                    connected: true,
                    facePresent: result.face_present === true,
                    faceCount: Number(result.face_count || 0),
                    deviceDetected: result.device_detected === true,
                    devices: Array.isArray(result.devices) ? result.devices : [],
                    attention: metrics.attention_state || "unknown",
                    headDirection: metrics.head_direction || "unknown",
                    gazeDirection: metrics.gaze_direction || "unknown",
                    checkedAt: Date.now(),
                };
                setProctorSignal(signal);
                setProctorError("");
                proctorHealthyRef.current = signal.facePresent
                    && signal.faceCount === 1
                    && !signal.deviceDetected
                    && signal.attention !== "distracted";
                if (!proctorHealthyRef.current) {
                    const reason = !signal.facePresent || signal.faceCount === 0
                        ? "Keep your face visible to the camera."
                        : signal.faceCount > 1
                            ? "Only the interview candidate may be visible in the camera."
                            : signal.deviceDetected
                                ? "Remove the detected device from the camera view."
                                : "Look toward the screen before continuing.";
                    setPausedReason((current) => current || reason);
                }

                for (const violation of result.violations || []) {
                    const type = String(violation.type || "").toUpperCase();
                    if (!type) continue;
                    void recordProctoringEvent({
                        type,
                        description: violation.description || type.replace(/_/g, " ").toLowerCase(),
                        severity: violation.severity || "medium",
                        metadata: {
                            faceCount: signal.faceCount,
                            devices: signal.devices.slice(0, 5),
                            attention: signal.attention,
                            headDirection: signal.headDirection,
                            gazeDirection: signal.gazeDirection,
                        },
                    });
                }
            } catch (e) {
                proctorHealthyRef.current = false;
                setProctorSignal((prev) => ({ ...prev, connected: false }));
                setProctorError(`AI camera monitoring is unavailable: ${e.message}`);
            } finally {
                monitorRunningRef.current = false;
            }
        };

        void monitor();
        monitorIntervalRef.current = window.setInterval(monitor, 2000);
        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
            document.removeEventListener("fullscreenchange", onFullscreenChange);
            document.removeEventListener("contextmenu", onContextMenu);
            window.removeEventListener("blur", onWindowBlur);
            if (monitorIntervalRef.current) window.clearInterval(monitorIntervalRef.current);
            monitorIntervalRef.current = null;
        };
    }, [id, recordProctoringEvent, step, stream]);

    useEffect(() => {
        if (step !== "interview" || !stream) return undefined;
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        const onCameraEnded = () => {
            proctorHealthyRef.current = false;
            setProctorSignal((prev) => ({ ...prev, connected: false, facePresent: false, faceCount: 0 }));
            void recordProctoringEvent({ type: "CAMERA_LOST", description: "Camera feed stopped during the interview.", severity: "high" });
        };
        const onMicEnded = () => {
            void recordProctoringEvent({ type: "MIC_LOST", description: "Microphone stopped during the interview.", severity: "high" });
        };
        videoTrack?.addEventListener("ended", onCameraEnded);
        audioTrack?.addEventListener("ended", onMicEnded);
        return () => {
            videoTrack?.removeEventListener("ended", onCameraEnded);
            audioTrack?.removeEventListener("ended", onMicEnded);
        };
    }, [recordProctoringEvent, step, stream]);

    const enableDevices = async (withCamera = true) => {
        setMediaError("");
        try {
            const media = await navigator.mediaDevices.getUserMedia({
                video: withCamera ? { width: 640, height: 480 } : false,
                audio: true,
            });
            setStream(media);
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx();
                audioCtxRef.current = ctx;
                const source = ctx.createMediaStreamSource(media);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 512;
                source.connect(analyser);
                const data = new Uint8Array(analyser.frequencyBinCount);
                const tick = () => {
                    analyser.getByteFrequencyData(data);
                    const avg = data.reduce((sum, value) => sum + value, 0) / data.length;
                    setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
                    rafRef.current = requestAnimationFrame(tick);
                };
                tick();
            }
            return media;
        } catch (e) {
            setMediaError("Camera/microphone access was blocked. Please allow access in your browser and try again.");
            return null;
        }
    };

    const startRecording = (media) => {
        if (!refConsent?.recording || !media || typeof MediaRecorder === "undefined") return;
        try {
            chunksRef.current = [];
            const recorder = new MediaRecorder(media, { mimeType: MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "" });
            recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunksRef.current.push(event.data); };
            recorder.start(5000);
            recorderRef.current = recorder;
        } catch {
            recorderRef.current = null;
        }
    };

    const stopRecordingAndUpload = async () => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") return;
        await new Promise((resolve) => {
            recorder.onstop = resolve;
            recorder.stop();
        });
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        if (!blob.size) return;
        try {
            const data = await blobToBase64(blob);
            await api.interviews.uploadRecording(id, { data, contentType: "video/webm", ext: "webm" });
        } catch {
            // Recording is best-effort; the transcript is the source of truth.
        }
    };

    const giveConsent = async () => {
        if (!consented) return;
        setBusy(true);
        try {
            const res = await api.interviews.consent(id, consent);
            setInterview((prev) => ({ ...prev, consent: res.consent, session: res.session }));
            setStep("check");
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const beginSession = async () => {
        setBusy(true);
        setError("");
        try {
            if (!consent.camera || !consent.microphone) {
                throw new Error("Camera and microphone access are required for strict proctoring.");
            }
            if (!document.fullscreenElement) {
                if (!document.documentElement.requestFullscreen) {
                    throw new Error("This browser does not support fullscreen, which is required for this interview.");
                }
                await document.documentElement.requestFullscreen();
            }
            if (!document.fullscreenElement) throw new Error("Fullscreen is required to start the interview.");
            setFullscreenActive(true);

            let media = stream;
            if (!media) media = await enableDevices(true);
            if (!media) throw new Error("Camera and microphone must be enabled to start");
            if (!media.getVideoTracks().some((track) => track.readyState === "live")) {
                throw new Error("A live camera is required to start the interview.");
            }
            const res = await api.interviews.startSession(id);
            setQuestion(res.question);
            setIndex(res.index);
            setTotal(res.total);
            setTranscript((prev) => (prev.some((t) => t.role === "bot" && t.questionId === res.question.id) ? prev : [...prev, { role: "bot", questionId: res.question.id, text: res.question.text }]));
            if (consent.recording) startRecording(media);
            setStep("interview");
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const resumeSession = async () => {
        setError("");
        try {
            if (!document.fullscreenElement) {
                if (!document.documentElement.requestFullscreen) {
                    throw new Error("This browser does not support fullscreen, which is required for this interview.");
                }
                await document.documentElement.requestFullscreen();
            }
            if (!document.fullscreenElement) throw new Error("Fullscreen is required to resume the interview.");
        } catch (e) {
            setError(e.message);
            return;
        }
        setFullscreenActive(true);
        // The last bot turn is always the current, unanswered question.
        const botTurns = transcript.filter((t) => t.role === "bot");
        const current = botTurns[botTurns.length - 1] || null;
        setQuestion(current ? { id: current.questionId, text: current.text } : null);
        setIndex(Math.max(0, (interview?.session?.answeredCount || 0)));
        setStep("interview");
        if (consent.recording) startRecording(stream);
    };

    const resumeAfterProctoring = async () => {
        const liveCamera = stream?.getVideoTracks?.().some((track) => track.readyState === "live");
        const liveMicrophone = stream?.getAudioTracks?.().some((track) => track.readyState === "live");
        if (!liveCamera || !liveMicrophone) {
            const media = await enableDevices(true);
            if (!media) return;
        }
        if (!document.fullscreenElement) {
            try {
                await document.documentElement.requestFullscreen();
            } catch (e) {
                setError(`Could not re-enter fullscreen: ${e.message}`);
                return;
            }
        }
        if (!document.fullscreenElement) {
            setError("Fullscreen is required to resume the interview.");
            return;
        }
        setFullscreenActive(true);
        if (!proctorHealthyRef.current) {
            setError("Wait for a clear camera check: one visible face, no detected devices, and eyes toward the screen.");
            return;
        }
        setError("");
        setPausedReason("");
    };

    const toggleListening = () => {
        if (!SpeechRecognition) return;
        if (listening) {
            recognitionRef.current?.stop?.();
            setListening(false);
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        speechBaseRef.current = answer.trimEnd();
        speechFinalRef.current = "";
        speechManuallyEditedRef.current = false;
        recognition.onresult = (event) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const result = event.results[i];
                if (result.isFinal) speechFinalRef.current += `${result[0].transcript} `;
                else interim += result[0].transcript;
            }
            const spoken = `${speechFinalRef.current}${interim}`.trim();
            setAnswer([speechBaseRef.current, spoken].filter(Boolean).join(speechBaseRef.current && spoken ? " " : ""));
        };
        recognition.onend = () => {
            const spoken = speechFinalRef.current.trim();
            if (!speechManuallyEditedRef.current) {
                setAnswer([speechBaseRef.current, spoken].filter(Boolean).join(speechBaseRef.current && spoken ? " " : ""));
            }
            setListening(false);
        };
        recognition.onerror = (event) => {
            setListening(false);
            setError(`Speech recognition failed: ${event.error || "unknown error"}`);
        };
        recognitionRef.current = recognition;
        recognition.start();
        setListening(true);
    };

    const submitAnswer = async () => {
        if (!question || !answer.trim()) return;
        setBusy(true);
        setError("");
        try {
            if (listening) {
                speechManuallyEditedRef.current = true;
                recognitionRef.current?.stop?.();
                setListening(false);
            }
            const res = await api.interviews.answer(id, { questionId: question.id, text: answer.trim() });
            setTranscript((prev) => {
                const next = [...prev, { role: "candidate", questionId: question.id, text: answer.trim() }];
                if (res.question) next.push({ role: "bot", questionId: res.question.id, text: res.question.text });
                return next;
            });
            setAnswer("");
            setIndex(res.index);
            setTotal(res.total);
            if (res.done) {
                await finishInterview();
            } else {
                setQuestion(res.question);
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const finishInterview = async () => {
        setBusy(true);
        try {
            await stopRecordingAndUpload();
            await api.interviews.complete(id);
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            setDone(true);
            setStep("done");
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const candidateTurns = useMemo(() => transcript.filter((t) => t.role === "candidate").length, [transcript]);
    const progress = total ? Math.min(100, Math.round((candidateTurns / total) * 100)) : 0;
    const liveCamera = Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === "live"));
    const liveMicrophone = Boolean(stream?.getAudioTracks?.().some((track) => track.readyState === "live"));
    const cameraHealthy = proctorSignal.connected
        && proctorSignal.facePresent
        && proctorSignal.faceCount === 1
        && !proctorSignal.deviceDetected
        && proctorSignal.attention !== "distracted"
        && Date.now() - proctorSignal.checkedAt < 5000;
    const canResume = cameraHealthy && liveCamera && liveMicrophone;
    const canContinue = canResume && fullscreenActive && online && !pausedReason;

    if (loading) return <LoadingState label="Loading interview" className="min-h-64" />;

    if (step === "blocked") {
        return (
            <div className="mx-auto max-w-2xl">
                <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5">
                    <CardContent className="space-y-4 p-8 text-center">
                        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {error || "This interview is not ready yet"}
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-zinc-400">
                            {!error
                                ? "The coordinator has not prepared your resume-based questions yet. Please check back shortly."
                                : "You can return to your interviews list and try again."}
                        </p>
                        <Button variant="outline" onClick={() => navigate("/student/interviews")}>
                            <ArrowLeft className="h-4 w-4" /> Back to interviews
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (step === "done") {
        return (
            <div className="mx-auto max-w-2xl">
                <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/5">
                    <CardContent className="space-y-4 p-8 text-center">
                        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Interview submitted</h2>
                        <p className="text-sm text-slate-600 dark:text-zinc-400">
                            Your responses were saved. The coordinator can review the interview and its report.
                        </p>
                        <Button onClick={() => navigate("/student/interviews")}>
                            <ArrowLeft className="h-4 w-4" /> Back to interviews
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (step === "terminated") {
        return (
            <div className="mx-auto max-w-2xl">
                <Card className="border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/5">
                    <CardContent className="space-y-4 p-8 text-center">
                        <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Interview stopped</h2>
                        <p className="text-sm text-slate-600 dark:text-zinc-400">
                            The session was terminated after three confirmed proctoring violations. Your saved answers and event log are available to the coordinator for review.
                        </p>
                        <Button onClick={() => navigate("/student/interviews")}>
                            <ArrowLeft className="h-4 w-4" /> Back to interviews
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (step === "consent") {
        return (
            <div className="mx-auto max-w-3xl space-y-4">
                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardContent className="space-y-5 p-6">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Before you begin</h1>
                        </div>
                        <div className="space-y-3 text-sm text-slate-600 dark:text-zinc-400">
                            <p>
                                This is the {interview?.interviewName || `${interview?.type || "General"} interview`}{interview?.type === "Technical" ? ", with questions matched to your resume skills and projects" : ""}. Your{" "}
                                <span className="font-medium text-slate-800 dark:text-zinc-200">camera and microphone are used live</span> during the
                                session for strict proctoring and the Placement Coordinator can review the interview and proctoring events.
                            </p>
                            <p>
                                Your answers are transcribed so a report can be prepared for the coordinator. You choose separately below whether to
                                also record audio/video.
                            </p>
                            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                                The interview pauses when a confirmed proctoring issue is detected. Three distinct confirmed violations terminate the session. Camera-based signals can be imperfect and are available to the coordinator for review.
                            </p>
                        </div>

                        <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-zinc-800">
                            {[
                                ["camera", "Use my camera", "Required for the live interview."],
                                ["microphone", "Use my microphone", "Required to hear your answers."],
                                ["transcript", "Transcribe my answers", "Used to build the interview report."],
                                ["recording", "Record audio/video", "Optional. If enabled, the recording is deleted automatically after the retention period."],
                            ].map(([key, label, hint]) => (
                                <label key={key} className="flex items-start gap-3">
                                    <input
                                        type="checkbox"
                                        className="mt-1 h-4 w-4 accent-violet-600"
                                        checked={consent[key]}
                                        disabled={key === "camera" || key === "microphone"}
                                        onChange={(e) => setConsent((prev) => ({ ...prev, [key]: e.target.checked }))}
                                    />
                                    <span>
                                        <span className="block text-sm font-medium text-slate-800 dark:text-zinc-200">{label}</span>
                                        <span className="block text-xs text-slate-500 dark:text-zinc-500">{hint}</span>
                                    </span>
                                </label>
                            ))}
                        </div>

                        <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-zinc-900/40">
                            <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 accent-violet-600"
                                checked={consented}
                                onChange={(e) => setConsented(e.target.checked)}
                            />
                            <span className="text-slate-700 dark:text-zinc-300">
                                I understand and consent to the camera, microphone, transcription, and proctoring policy described above.
                            </span>
                        </label>

                        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => navigate("/student/interviews")}>Cancel</Button>
                            <Button onClick={giveConsent} disabled={!consented || !consent.camera || !consent.microphone || busy}>
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} I consent
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (step === "check") {
        return (
            <div className="mx-auto max-w-3xl space-y-4">
                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardContent className="space-y-5 p-6">
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Device &amp; connection check</h1>
                        <p className="text-sm text-slate-600 dark:text-zinc-400">
                            Confirm your camera, microphone, and connection before starting. The coordinator can join the live session.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900 dark:border-zinc-800">
                                {stream && consent.camera ? (
                                    <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" />
                                ) : (
                                    <div className="flex aspect-video items-center justify-center text-slate-500">
                                        <VideoOff className="h-8 w-8" />
                                    </div>
                                )}
                            </div>
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-500">
                                        <span>Microphone level</span><span>{micLevel}%</span>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
                                        <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all" style={{ width: `${micLevel}%` }} />
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <StatusPill ok={liveCamera} onLabel="Camera ready" offLabel="No camera" onIcon={Video} offIcon={VideoOff} />
                                    <StatusPill ok={liveMicrophone} onLabel="Mic ready" offLabel="No mic" onIcon={Mic} offIcon={MicOff} />
                                    <StatusPill ok={online} onLabel="Online" offLabel="Offline" onIcon={Wifi} offIcon={WifiOff} />
                                </div>
                                {!stream && (
                                    <Button variant="outline" onClick={() => enableDevices(true)}>
                                        <Video className="h-4 w-4" /> Enable devices
                                    </Button>
                                )}
                                {mediaError && <p className="text-xs text-red-600 dark:text-red-400">{mediaError}</p>}
                            </div>
                        </div>
                        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => navigate("/student/interviews")}>Exit</Button>
                            <Button
                                onClick={interview?.session?.status === "in_progress" && transcript.some((t) => t.role === "bot") ? resumeSession : beginSession}
                                disabled={busy || !stream || !online}
                            >
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Circle className="h-4 w-4" />}
                                {interview?.session?.status === "in_progress" && transcript.some((t) => t.role === "bot") ? "Resume interview" : "Start interview"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Interview
    return (
        <div className="space-y-4">
            {!online && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                    <WifiOff className="h-4 w-4" /> You appear to be offline. Your session is preserved; reconnect to continue submitting answers.
                </div>
            )}
            {(pausedReason || !canContinue) && (
                <Card className="border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10">
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                            <div>
                                <p className="font-semibold text-amber-900 dark:text-amber-200">
                                    Interview paused · {violationCount}/3 confirmed violations
                                </p>
                                <p className="text-sm text-amber-800 dark:text-amber-300">
                                    {pausedReason || (!proctorSignal.connected
                                        ? "Waiting for the AI camera monitor. Answers remain locked until monitoring is available."
                                        : !fullscreenActive
                                            ? "Re-enter fullscreen to continue."
                                            : "Waiting for a clear camera, face, and device check.")}
                                </p>
                                {proctorError && <p className="mt-1 text-sm text-red-700 dark:text-red-300">{proctorError}</p>}
                                {mediaError && <p className="mt-1 text-sm text-red-700 dark:text-red-300">{mediaError}</p>}
                                {error && <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(!liveCamera || !liveMicrophone) && (
                                <Button variant="outline" onClick={() => enableDevices(true)} disabled={busy} type="button">
                                    <Video className="h-4 w-4" /> Re-enable camera &amp; mic
                                </Button>
                            )}
                            <Button onClick={resumeAfterProctoring} disabled={!canResume || busy} type="button">
                                <Maximize className="h-4 w-4" /> Resume when compliant
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
            <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                    <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                        <CardContent className="space-y-4 p-6">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap gap-2">
                                    <StatusPill ok={liveCamera} onLabel="Camera" offLabel="Camera off" onIcon={Video} offIcon={VideoOff} />
                                    <StatusPill ok={liveMicrophone} onLabel="Mic" offLabel="Mic off" onIcon={Mic} offIcon={MicOff} />
                                    <StatusPill ok={online} onLabel="Online" offLabel="Offline" onIcon={Wifi} offIcon={WifiOff} />
                                    <StatusPill ok={proctorSignal.connected} onLabel="AI monitor" offLabel="Monitor unavailable" onIcon={ScanFace} offIcon={AlertTriangle} />
                                </div>
                                <span className="text-xs text-slate-500 dark:text-zinc-500">
                                    {consent.recording ? "Recording (opt-in)" : "Not recording"} · {violationCount}/3 violations
                                </span>
                            </div>

                            <div className="grid gap-2 rounded-lg border border-slate-200 p-3 text-xs text-slate-600 dark:border-zinc-800 dark:text-zinc-400 sm:grid-cols-2">
                                <span>Face: {proctorSignal.connected ? `${proctorSignal.faceCount} detected` : "waiting for monitor"}</span>
                                <span>Attention: {proctorSignal.attention}</span>
                                <span>Head: {proctorSignal.headDirection}</span>
                                <span>Gaze: {proctorSignal.gazeDirection}</span>
                                <span>Detected devices: {proctorSignal.devices.map((device) => device.label || device.class || "device").join(", ") || "none"}</span>
                                <span>Fullscreen: {fullscreenActive ? "active" : "required"}</span>
                            </div>
                            {proctorError && !pausedReason && <p className="text-sm text-red-600 dark:text-red-400">{proctorError}</p>}

                            <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-5 dark:border-violet-500/20 dark:bg-violet-500/5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                                    Question {Math.min(index + 1, total)} of {total}
                                </p>
                                <p className="mt-2 text-lg font-medium text-slate-900 dark:text-white">
                                    {question?.text || "No further questions."}
                                </p>
                                {done && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">All questions answered.</p>}
                            </div>

                            <div className="space-y-2">
                                <Textarea
                                    rows={5}
                                    value={answer}
                                    onChange={(e) => {
                                        if (listening) {
                                            speechManuallyEditedRef.current = true;
                                            recognitionRef.current?.stop?.();
                                            setListening(false);
                                        }
                                        setAnswer(e.target.value);
                                    }}
                                    placeholder="Type your answer, or use the microphone to speak."
                                    disabled={busy || done || !canContinue}
                                />
                                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex gap-2">
                                        {SpeechRecognition && (
                                            <Button variant={listening ? "destructive" : "outline"} onClick={toggleListening} disabled={busy || done || !canContinue} type="button">
                                                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                                                {listening ? "Stop" : "Speak answer"}
                                            </Button>
                                        )}
                                    </div>
                                    <Button onClick={submitAnswer} disabled={busy || done || !answer.trim() || !canContinue} type="button">
                                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        {index + 1 >= total ? "Submit & finish" : "Submit answer"}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {stream && consent.camera && (
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900 dark:border-zinc-800">
                            <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" />
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                        <CardContent className="space-y-3 p-5">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-zinc-200">
                                <ListChecks className="h-4 w-4" /> Progress
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
                                <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all" style={{ width: `${progress}%` }} />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-zinc-500">{candidateTurns} of {total} answered</p>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                        <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto p-5">
                            <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200">Transcript</p>
                            {transcript.length === 0 && <p className="text-xs text-slate-500 dark:text-zinc-500">Your conversation will appear here.</p>}
                            {transcript.map((turn, i) => (
                                <div key={`${turn.questionId || "t"}-${i}`} className={`rounded-lg p-3 text-sm ${turn.role === "bot" ? "bg-slate-100 dark:bg-zinc-800/60" : "bg-violet-50 dark:bg-violet-500/10"}`}>
                                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                                        {turn.role === "bot" ? "Interviewer" : "You"}
                                    </p>
                                    <p className="text-slate-700 dark:text-zinc-300">{turn.text}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {!done && (
                        <Button variant="outline" className="w-full" onClick={finishInterview} disabled={busy} type="button">
                            End interview &amp; submit
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
