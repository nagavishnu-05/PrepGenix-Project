import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Loader2, RefreshCw, ScanFace, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { getProctoringApiBase } from "@/lib/proctoring-config";
import { cn } from "@/lib/utils";

const REQUIRED_FRAMES = 5;
const CAPTURE_INTERVAL_MS = 900;
const IDENTITY_BACKENDS = new Set(["insightface", "onnx_arcface"]);

const PHASE = {
    INITIALIZING: "initializing",
    CAPTURING: "capturing",
    VERIFYING: "verifying",
    VERIFIED: "verified",
    ERROR: "error",
};

const IDENTITY_UNAVAILABLE_MESSAGE =
    "Identity verification is unavailable on this server. A face-recognition model (ArcFace/InsightFace) must be installed before a proctored interview can start.";

export function InterviewFaceCapture({
    interviewId,
    attemptId,
    stream,
    onVerified,
    onRegisterReference,
    onContinue,
    onExit,
    continueLabel = "Start interview",
    exitLabel = "Exit",
    busy = false,
}) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const timerRef = useRef(null);
    const inFlightRef = useRef(false);
    const onVerifiedRef = useRef(onVerified);
    const onRegisterReferenceRef = useRef(onRegisterReference);
    const [attempt, setAttempt] = useState(0);
    const [phase, setPhase] = useState(PHASE.INITIALIZING);
    const [captured, setCaptured] = useState(0);
    const [box, setBox] = useState(null);
    const [message, setMessage] = useState("Preparing the camera for identity verification…");
    const [error, setError] = useState("");
    const [attestation, setAttestation] = useState(null);

    useEffect(() => {
        onVerifiedRef.current = onVerified;
    }, [onVerified]);

    useEffect(() => {
        onRegisterReferenceRef.current = onRegisterReference;
    }, [onRegisterReference]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !stream) return;
        video.srcObject = stream;
        video.play().catch(() => {});
    }, [stream]);

    const retry = useCallback(() => {
        setAttempt((value) => value + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;
        let timer = null;

        const fail = (reason) => {
            if (cancelled) return;
            setError(reason);
            setPhase(PHASE.ERROR);
        };

        const enrollFrame = async () => {
            if (cancelled) return;
            if (inFlightRef.current) {
                // A previous effect (StrictMode remount) may still have a request
                // in flight; wait for it instead of stalling the capture loop.
                timer = window.setTimeout(enrollFrame, 200);
                return;
            }
            const video = videoRef.current;
            if (!video || !video.videoWidth || !stream) {
                timer = window.setTimeout(enrollFrame, 300);
                return;
            }
            inFlightRef.current = true;
            try {
                const canvas = canvasRef.current || (canvasRef.current = document.createElement("canvas"));
                canvas.width = 320;
                canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * canvas.width));
                canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
                const image = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

                let proctorBase;
                try {
                    proctorBase = getProctoringApiBase();
                } catch (err) {
                    throw new Error(err?.message || "Proctoring service URL is not configured.");
                }
                const response = await fetch(`${proctorBase}/enroll-frame`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ image, attemptId, requireIdentity: true }),
                });
                const result = await response.json().catch(() => ({}));

                if (cancelled) return;
                if (!response.ok) {
                    if (result.error === "identity_backend_unavailable") {
                        fail(IDENTITY_UNAVAILABLE_MESSAGE);
                        return;
                    }
                    throw new Error(result.message || result.error || `Identity service returned HTTP ${response.status}`);
                }

                setCaptured(Number(result.captured || 0));
                setBox(result.box || null);

                if (result.status === "ready") {
                    const provider = result.backend || "insightface";
                    if (!IDENTITY_BACKENDS.has(provider)) {
                        fail(IDENTITY_UNAVAILABLE_MESSAGE);
                        return;
                    }
                    setPhase(PHASE.VERIFYING);
                    setMessage("Face captured. Verifying your identity…");
                    const registerReference = onRegisterReferenceRef.current;
                    const saved = registerReference
                        ? await registerReference(image)
                        : await api.interviews.registerReferenceFace(interviewId, {
                            provider,
                            capturedFrames: Number(result.captured || REQUIRED_FRAMES),
                            threshold: result.threshold,
                        });
                    if (cancelled) return;
                    const reference = saved?.faceReference || saved || null;
                    setAttestation(reference);
                    setPhase(PHASE.VERIFIED);
                    setMessage(saved?.warning
                        ? `Identity verified. ${saved.warning}`
                        : "Identity verified. Your face is registered for continuous verification during the assessment.");
                    onVerifiedRef.current?.(reference);
                    return;
                }

                if (result.status === "error") {
                    throw new Error(result.message || "Face enrollment failed.");
                }

                setMessage(result.message || `Capturing reference frames… (${result.captured || 0}/${REQUIRED_FRAMES})`);
                timer = window.setTimeout(enrollFrame, CAPTURE_INTERVAL_MS);
            } catch (e) {
                fail(e?.message || "Could not reach the identity service.");
            } finally {
                inFlightRef.current = false;
            }
        };

        const begin = async () => {
            try {
                setPhase(PHASE.INITIALIZING);
                setCaptured(0);
                setBox(null);
                setError("");
                setAttestation(null);
                setMessage("Preparing the camera for identity verification…");
                let proctorBaseReset;
                try {
                    proctorBaseReset = getProctoringApiBase();
                } catch (err) {
                    throw new Error(err?.message || "Proctoring service URL is not configured.");
                }
                const response = await fetch(`${proctorBaseReset}/enroll-reset`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ attemptId }),
                });
                if (!response.ok) {
                    throw new Error(`Identity service returned HTTP ${response.status}`);
                }
                if (cancelled) return;
                setPhase(PHASE.CAPTURING);
                setMessage("Position your face inside the frame. Capturing reference frames…");
                timer = window.setTimeout(enrollFrame, 300);
            } catch (e) {
                fail(`Identity service is unavailable: ${e.message}`);
            }
        };

        void begin();
        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
        // `attempt` restarts enrollment after an error or a retake.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attemptId, interviewId, stream, attempt]);

    const progressPct = Math.min(100, Math.round((captured / REQUIRED_FRAMES) * 100));
    const isVerified = phase === PHASE.VERIFIED;
    const isError = phase === PHASE.ERROR;
    const working = phase === PHASE.INITIALIZING || phase === PHASE.CAPTURING || phase === PHASE.VERIFYING;

    return (
        <div className="mx-auto w-full max-w-3xl space-y-4">
            <Card className="border-slate-200/80 bg-white/70 dark:border-zinc-800/80 dark:bg-zinc-900/40">
                <CardContent className="space-y-5 p-6">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Identity verification</h1>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-zinc-400">
                        Before the interview starts, we capture a few frames of your face. These are used only to confirm that
                        the same candidate stays in front of the camera for the whole session.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-900 dark:border-zinc-800">
                            {stream ? (
                                <>
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        muted
                                        playsInline
                                        className="block w-full object-cover"
                                        style={{ aspectRatio: "4 / 3" }}
                                    />
                                    {box && (
                                        <div
                                            className={cn(
                                                "pointer-events-none absolute rounded border-2",
                                                isVerified ? "border-emerald-400" : "border-violet-400",
                                            )}
                                            style={{
                                                left: `${(box.x1 / 320) * 100}%`,
                                                top: `${(box.y1 / 240) * 100}%`,
                                                width: `${((box.x2 - box.x1) / 320) * 100}%`,
                                                height: `${((box.y2 - box.y1) / 240) * 100}%`,
                                            }}
                                        />
                                    )}
                                </>
                            ) : (
                                <div className="flex items-center justify-center text-slate-500" style={{ aspectRatio: "4 / 3" }}>
                                    <Camera className="h-8 w-8" />
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-500">
                                    <span>Reference frames</span>
                                    <span>{captured} / {REQUIRED_FRAMES}</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all",
                                            isVerified
                                                ? "bg-gradient-to-r from-emerald-500 to-green-600"
                                                : "bg-gradient-to-r from-violet-600 to-indigo-500",
                                        )}
                                        style={{ width: `${isVerified ? 100 : progressPct}%` }}
                                    />
                                </div>
                            </div>

                            <div
                                className={cn(
                                    "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                                    isError
                                        ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300"
                                        : isVerified
                                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                            : "border-slate-200 bg-slate-50 text-slate-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300",
                                )}
                            >
                                {isError ? (
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                ) : isVerified ? (
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                ) : (
                                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                                )}
                                <span>{isError ? error : message}</span>
                            </div>

                            {isVerified && attestation && (
                                <p className="text-xs text-slate-500 dark:text-zinc-500">
                                    Registered {Number(attestation.capturedFrames) || REQUIRED_FRAMES} reference frames. Continuous
                                    identity checks will run while the interview is in progress.
                                </p>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {isVerified ? (
                                    <Button onClick={onContinue} disabled={busy} type="button">
                                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
                                        {continueLabel}
                                    </Button>
                                ) : (
                                    <Button variant="outline" onClick={retry} disabled={working} type="button">
                                        <RefreshCw className="h-4 w-4" /> Retry
                                    </Button>
                                )}
                                <Button variant="outline" onClick={onExit} disabled={busy} type="button">
                                    {exitLabel}
                                </Button>
                            </div>

                            {!stream && (
                                <p className="text-xs text-amber-700 dark:text-amber-300">
                                    The camera feed is unavailable. Re-enable the camera to continue.
                                </p>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
