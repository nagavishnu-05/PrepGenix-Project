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
    RefreshCw,
    Sun,
    Languages,
    Square,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/portal/primitives";
import { AssessmentPausedOverlay } from "@/components/assessment/assessment-paused-overlay";
import FaceAttentionOverlay from "@/components/assessment/face-attention-overlay";
import { InterviewFaceCapture } from "@/components/assessment/interview-face-capture";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import {
    getProctoringApiBase,
    getProctoringMonitorIntervalMs,
    resetProctoringMonitor,
} from "@/lib/proctoring-config";

const SpeechRecognition =
    typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// ---- Monitoring / proctoring tuning (frontend) ----
// The AIML service already debounces confirmed PHONE_DETECTED / EYES_CLOSED
// violations temporally. These constants only add a light client-side guard so
// a single transient detection never locks the UI, and so eye-visibility status
// has a short grace period before it flips to an amber warning.
const MONITOR_INTERVAL_MS = getProctoringMonitorIntervalMs();
const PHONE_CONFIRM_TICKS = 1;            // consecutive monitor ticks a confirmed phone must persist
const EYES_INVALID_GRACE_TICKS = 2;       // consecutive invalid ticks before "Eyes not visible"
const MONITOR_STALE_MS = 8000;            // tolerate a delayed hosted response across monitor intervals

// Centralized monitoring state machine. Drives pause/resume/terminate UI and
// guards answer submission so a terminated or paused interview cannot advance.
export const MONITOR_STATE = {
    INITIALIZING: "INITIALIZING",
    READY: "READY",
    RUNNING: "RUNNING",
    PAUSED_CAMERA_UNAVAILABLE: "PAUSED_CAMERA_UNAVAILABLE",
    PAUSED_FACE_NOT_DETECTED: "PAUSED_FACE_NOT_DETECTED",
    PAUSED_MONITORING_UNAVAILABLE: "PAUSED_MONITORING_UNAVAILABLE",
    TERMINATING: "TERMINATING",
    TERMINATED: "TERMINATED",
    COMPLETED: "COMPLETED",
};

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function waitForVideoFrame(video, timeoutMs = 10000) {
    if (video?.videoWidth > 0 && video?.videoHeight > 0) return Promise.resolve();
    if (!video) return Promise.reject(new Error("Camera preview is not available."));

    return new Promise((resolve, reject) => {
        let timeoutId;
        const cleanup = () => {
            ["loadedmetadata", "loadeddata", "canplay"].forEach((eventName) => {
                video.removeEventListener(eventName, checkReady);
            });
            window.clearTimeout(timeoutId);
        };
        const finish = (error) => {
            cleanup();
            if (error) reject(error);
            else resolve();
        };
        const checkReady = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) finish();
        };

        ["loadedmetadata", "loadeddata", "canplay"].forEach((eventName) => {
            video.addEventListener(eventName, checkReady);
        });
        timeoutId = window.setTimeout(
            () => finish(new Error("Camera preview did not produce a frame in time.")),
            timeoutMs,
        );
        checkReady();
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

    const [cameras, setCameras] = useState([]);
    const [selectedCameraId, setSelectedCameraId] = useState("");
    const [checkingReadiness, setCheckingReadiness] = useState(false);
    const [readiness, setReadiness] = useState({
        lighting: "unknown",
        face: "unknown",
        monitor: "unknown",
        checkedAt: 0,
    });
    const [readinessError, setReadinessError] = useState("");
    const [now, setNow] = useState(Date.now());
    const [speechLang, setSpeechLang] = useState("en-US");

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

    // Centralized monitoring state + live preview signals (phone, eyes, face box).
    const [monitorState, setMonitorState] = useState(MONITOR_STATE.INITIALIZING);
    const [phoneWarning, setPhoneWarning] = useState(false);   // "possible device" hint in the preview
    const [phoneConfirmed, setPhoneConfirmed] = useState(false); // confirmed smartphone in frame
    const [phoneBox, setPhoneBox] = useState(null);            // last confirmed phone bbox {x,y,w,h}
    const [eyeStatus, setEyeStatus] = useState("unknown");     // visible | not_visible | unclear | unknown
    const [identityStatus, setIdentityStatus] = useState("checking");
    const [terminatedAt, setTerminatedAt] = useState(null);
    const [terminationReason, setTerminationReason] = useState("");
    const [confirmEndOpen, setConfirmEndOpen] = useState(false);
    const [faceMetrics, setFaceMetrics] = useState(null);      // landmarks + attention for the preview overlay

    const videoRef = useRef(null);
    const videoPipRef = useRef(null);
    const readinessRanRef = useRef(false);
    const recognitionRef = useRef(null);
    const speechBaseRef = useRef("");
    const speechFinalRef = useRef("");
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const audioCtxRef = useRef(null);
    const rafRef = useRef(null);
    const monitorIntervalRef = useRef(null);
    const monitorRunningRef = useRef(false);
    const proctorHealthyRef = useRef(false);
    // Client-side confirmation guards (see constants above).
    const phoneTicksRef = useRef(0);        // consecutive confirmed-phone ticks
    const eyeInvalidTicksRef = useRef(0);   // consecutive eyes-not-visible ticks
    const terminatingRef = useRef(false);   // idempotency latch for termination
    const finalizedRef = useRef(false);     // prevents duplicate completion/cleanup
    const monitorStateRef = useRef(MONITOR_STATE.INITIALIZING);

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
            } else if (data.status === "completed") {
                setDone(true);
                setStep("done");
            } else if (!data.consent?.consentedAt) {
                setStep("consent");
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

    // Keep a ticking clock so the readiness panel can show "checked Xs ago".
    useEffect(() => {
        if (step !== "check") return undefined;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [step]);

    // List available cameras so the candidate can pick one before starting.
    useEffect(() => {
        let cancelled = false;
        const enumerate = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                if (cancelled) return;
                const videoDevices = devices.filter((device) => device.kind === "videoinput");
                setCameras(videoDevices);
                setSelectedCameraId((current) => current || videoDevices[0]?.deviceId || "");
            } catch {
                setCameras([]);
            }
        };
        if (step === "check" && navigator.mediaDevices?.enumerateDevices) void enumerate();
        return () => { cancelled = true; };
    }, [step, stream]);

    // Run the readiness probe once as soon as a preview is available.
    useEffect(() => {
        if (step !== "check" || !stream || readinessRanRef.current) return;
        readinessRanRef.current = true;
        void runReadinessChecks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, stream]);

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
            // Events are posted fire-and-forget, so responses can arrive out of
            // order. Never let a late response drop the displayed count.
            setViolationCount((current) => Math.max(current, Number(result.violationCount) || 0));
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

    // Idempotent smartphone-confirmed termination. Repeated detector ticks call
    // this, but the `terminatingRef` latch ensures the backend event is sent and
    // the interview is finalized exactly once. A backend failure is surfaced but
    // never silently swallowed, and the local lock keeps the UI terminated so a
    // stale response cannot resume a terminated interview.
    const terminateForPhone = useCallback(async (devices) => {
        if (terminatingRef.current || finalizedRef.current) return;
        terminatingRef.current = true;
        const at = new Date();
        setTerminatedAt(at);
        setTerminationReason("A smartphone was detected in the camera view.");
        setMonitorState(MONITOR_STATE.TERMINATING);
        setPausedReason("");
        // Stop input immediately; keep camera for a final evidence frame.
        recognitionRef.current?.stop?.();
        setListening(false);
        setAnswer("");
        const evidence = (Array.isArray(devices) ? devices : [])
            .filter((d) => d && String(d.label || d.class || "").toLowerCase().includes("phone"))
            .slice(0, 5);
        const result = await recordProctoringEvent({
            type: "PHONE_DETECTED",
            description: "Smartphone detected during the interview. Interview terminated per proctoring policy.",
            severity: "high",
            metadata: {
                devices: evidence,
                terminatedAt: at.toISOString(),
                reason: "smartphone_detected",
            },
        });
        // Capture a final frame as evidence, then release all media.
        try {
            stopAllMedia();
        } catch { /* ignore */ }
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        finalizedRef.current = true;
        if (result && (result.terminated || result.recorded)) {
            setMonitorState(MONITOR_STATE.TERMINATED);
            setStep("terminated");
            setInterview((prev) => prev ? {
                ...prev,
                status: "disqualified",
                session: { ...(prev.session || {}), status: "terminated", endedAt: at, terminationReason: "smartphone_detected" },
            } : prev);
        } else {
            // Backend did not confirm; keep the local lock so the candidate
            // cannot continue on a client-only judgement, but show the overlay.
            setMonitorState(MONITOR_STATE.TERMINATED);
            setStep("terminated");
        }
    }, [recordProctoringEvent]);

    // Release camera + mic + recorder in one place so termination, completion,
    // and unmount all share the same cleanup (no duplicate stream stops).
    const stopAllMedia = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        audioCtxRef.current?.close?.().catch(() => {});
        recognitionRef.current?.stop?.();
        if (recorderRef.current && recorderRef.current.state === "recording") {
            try { recorderRef.current.stop(); } catch { /* ignore */ }
        }
        stream?.getTracks?.().forEach((track) => track.stop());
        void resetProctoringMonitor(`interview_${id}`).catch((error) => {
            console.error("Could not clear interview proctoring state:", error.message);
        });
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
            const controller = new AbortController();
            const monitorTimeout = window.setTimeout(() => controller.abort(), 45000);
            try {
                const canvas = document.createElement("canvas");
                canvas.width = 320;
                canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * canvas.width));
                canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
                const image = canvas.toDataURL("image/jpeg", 0.65).split(",")[1];
                const base = getProctoringApiBase();
                const response = await fetch(`${base}/monitor`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ image, attemptId: `interview_${id}`, cameraActive: true }),
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error(`Proctoring service returned HTTP ${response.status}`);
                const result = await response.json();
                const metrics = result.metrics || {};
                // Phone evidence from YOLO scene detection. The AI service owns
                // the confirmation decision: `device_state.level` is its
                // temporally-debounced verdict (and it may confirm a phone on the
                // very first strong frame). Trust that verdict rather than
                // re-deriving one from raw per-detection confidences.
                const deviceState = result.device_state || {};
                const deviceList = Array.isArray(result.devices) ? result.devices : [];
                const deviceStateConfirmed = deviceState.level === "confirmed";
                const confirmedDevices = deviceStateConfirmed
                    ? (Array.isArray(deviceState.devices) && deviceState.devices.length ? deviceState.devices : deviceList)
                    : deviceList.filter((d) => d && (d.level === "confirmed" || Number(d.confidence) >= 0.35));
                const phoneDevice = confirmedDevices.find((d) => String(d.label || d.class || "").toLowerCase().includes("phone")) || null;
                const possiblePhone = !phoneDevice && (
                    deviceState.level === "possible"
                    || deviceList.some((d) => d && d.level !== "confirmed" && String(d.label || d.class || "").toLowerCase().includes("phone"))
                );
                // Eye visibility: the model reports eye landmarks + closure state.
                // "Visible" = a face with eye landmarks is present and eyes are not
                // reported closed/prolonged. Landmark-less or absent face -> unclear.
                const landmarkCount = Number(metrics.landmark_count || 0);
                const eyesClosed = Boolean(metrics.eyes_closed);
                let eyeTick = "unknown";
                if (!result.face_present) eyeTick = "no_face";
                else if (eyesClosed) eyeTick = "not_visible";
                else if (landmarkCount > 0) eyeTick = "visible";
                else eyeTick = "unclear";
                const signal = {
                    connected: true,
                    facePresent: result.face_present === true,
                    faceCount: Number(result.face_count || 0),
                    deviceDetected: result.device_detected === true || deviceStateConfirmed,
                    devices: Array.isArray(result.devices) ? result.devices : [],
                    attention: metrics.attention_state || "unknown",
                    headDirection: metrics.head_direction || "unknown",
                    gazeDirection: metrics.gaze_direction || "unknown",
                    identityStatus: result.identity_status || "checking",
                    identityBlocked: result.identity_blocked === true,
                    metrics,
                    checkedAt: Date.now(),
                };
                setProctorSignal(signal);
                setFaceMetrics(metrics);
                setIdentityStatus(signal.identityStatus);
                setPhoneBox(phoneDevice?.box || null);
                setPhoneWarning(Boolean(phoneDevice) || possiblePhone);
                setPhoneConfirmed(Boolean(phoneDevice));
                setProctorError("");

                // Eye visibility grace period (avoids flicker on blinks/glitches).
                if (eyeTick === "not_visible" || eyeTick === "no_face" || eyeTick === "unclear") {
                    eyeInvalidTicksRef.current += 1;
                } else {
                    eyeInvalidTicksRef.current = 0;
                }
                const eyesInvalid = eyeInvalidTicksRef.current >= EYES_INVALID_GRACE_TICKS;
                setEyeStatus(eyesInvalid ? (eyeTick === "no_face" ? "unclear" : "not_visible") : (eyeTick === "visible" ? "visible" : eyeStatus));

                // Confirmed-phone confirmation across consecutive ticks.
                if (phoneDevice) {
                    phoneTicksRef.current += 1;
                } else {
                    phoneTicksRef.current = 0;
                }
                const phoneConfirmedTick = phoneTicksRef.current >= PHONE_CONFIRM_TICKS;

                // Health is decided by the AIML gate where it has one. "Head
                // turned" and "no face" are confirmed by the service only after
                // its 30s grace window (reported through identity_status), so the
                // client does not pause early on a passing glance or a brief
                // frame drop. Multiple faces and a confirmed phone/mismatch stay
                // immediate.
                const awayStatus = signal.identityStatus === "head_turned" || signal.identityStatus === "no_face";
                proctorHealthyRef.current = signal.connected
                    && !signal.deviceDetected
                    && signal.identityStatus !== "mismatch"
                    && !(signal.faceCount > 1)
                    && !awayStatus;
                if (!proctorHealthyRef.current) {
                    const reason = signal.faceCount > 1
                        ? "Only the interview candidate may be visible in the camera."
                        : signal.deviceDetected
                            ? "Remove the detected device from the camera view."
                            : signal.identityStatus === "mismatch"
                                ? "Identity verification failed. Only the registered candidate may continue this interview."
                                : signal.identityStatus === "head_turned"
                                    ? "You have looked away from the screen for too long. Face the screen to continue."
                                    : signal.identityStatus === "no_face"
                                        ? "Keep your face visible to the camera."
                                        : "Look toward the screen before continuing.";
                    setPausedReason((current) => current || reason);
                }

                // Confirmed smartphone -> terminate (single idempotent call).
                if (phoneConfirmedTick && !terminatingRef.current) {
                    void terminateForPhone(signal.devices);
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
                            identityStatus: signal.identityStatus,
                        },
                    });
                }
            } catch (e) {
                proctorHealthyRef.current = false;
                setProctorSignal((prev) => ({ ...prev, connected: false }));
                setPausedReason((current) => current || "AI camera monitoring is unavailable.");
                setProctorError(e.name === "AbortError"
                    ? "The AI camera monitor did not respond within 45 seconds. It will retry automatically."
                    : `AI camera monitoring is unavailable: ${e.message}`);
            } finally {
                window.clearTimeout(monitorTimeout);
                monitorRunningRef.current = false;
            }
        };

        void monitor();
        monitorIntervalRef.current = window.setInterval(monitor, MONITOR_INTERVAL_MS);
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

    const enableDevices = async (withCamera = true, deviceId = selectedCameraId) => {
        setMediaError("");
        try {
            // Release any previously active camera before requesting a new one.
            stream?.getVideoTracks?.().forEach((track) => track.stop());
            const videoConstraint = withCamera
                ? (deviceId ? { deviceId: { exact: deviceId }, width: 640, height: 480 } : { width: 640, height: 480 })
                : false;
            const media = await navigator.mediaDevices.getUserMedia({
                video: videoConstraint,
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

    const changeCamera = async (deviceId) => {
        setSelectedCameraId(deviceId);
        await enableDevices(true, deviceId);
    };

    // Keep the readiness check local and lightweight. Face enrollment and live
    // proctoring perform server-side inference after the candidate starts.
    const runReadinessChecks = async () => {
        setCheckingReadiness(true);
        setReadinessError("");
        try {
            if (!stream) await enableDevices(true);

            let lighting = "unknown";
            const video = videoRef.current;
            try {
                await waitForVideoFrame(video);
            } catch (error) {
                setReadinessError(error.message);
            }
            if (video?.videoWidth) {
                const canvas = document.createElement("canvas");
                canvas.width = 32;
                canvas.height = 32;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
                let sum = 0;
                for (let i = 0; i < data.length; i += 4) {
                    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                }
                const brightness = sum / (data.length / 4);
                lighting = brightness < 45 ? "too_dark" : brightness > 220 ? "too_bright" : "good";
            }

            setReadiness({ lighting, face: "skipped", monitor: "not_run", checkedAt: Date.now() });
            if (lighting === "too_dark") setReadinessError("It looks dark. Add light facing you so your face is clearly visible.");
            else if (lighting === "too_bright") setReadinessError("It looks too bright. Reduce backlight or move away from a bright window.");
        } finally {
            setCheckingReadiness(false);
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
        } catch (error) {
            console.error("Best-effort interview recording upload failed:", error.message);
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

    // Extracted so the consent/start path and the resume path share the same
    // fullscreen requirement before the interview shell opens.
    const faceVerificationRequired = interview?.proctoring?.faceVerification !== false;
    const requiresFaceCapture = faceVerificationRequired && !interview?.session?.faceReference?.registered;

    const enterFullscreen = async () => {
        if (document.fullscreenElement) return;
        if (!document.documentElement.requestFullscreen) {
            throw new Error("This browser does not support fullscreen, which is required for this interview.");
        }
        await document.documentElement.requestFullscreen();
        if (!document.fullscreenElement) throw new Error("Fullscreen is required to continue the interview.");
    };

    const startSessionNow = async (media) => {
        const res = await api.interviews.startSession(id);
        setQuestion(res.question);
        setIndex(res.index);
        setTotal(res.total);
        setTranscript((prev) => (prev.some((t) => t.role === "bot" && t.questionId === res.question.id) ? prev : [...prev, { role: "bot", questionId: res.question.id, text: res.question.text }]));
        if (consent.recording) startRecording(media);
        setStep("interview");
    };

    // Persist the attestation returned by the backend so a later "Start" click
    // knows the reference face exists and does not re-route to the capture gate.
    const handleFaceVerified = useCallback((faceReference) => {
        setInterview((prev) => (prev ? {
            ...prev,
            session: { ...(prev.session || {}), faceReference },
        } : prev));
    }, []);

    // After the face gate: resume in-place when the session already started,
    // otherwise begin the interview for the first time.
    const continueAfterFaceCapture = async () => {
        setBusy(true);
        setError("");
        try {
            if (interview?.session?.status === "in_progress") {
                await resumeSession();
                return;
            }
            let media = stream;
            if (!media) media = await enableDevices(true);
            await startSessionNow(media);
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
            await enterFullscreen();
            setFullscreenActive(true);

            let media = stream;
            if (!media) media = await enableDevices(true);
            if (!media) throw new Error("Camera and microphone must be enabled to start");
            if (!media.getVideoTracks().some((track) => track.readyState === "live")) {
                throw new Error("A live camera is required to start the interview.");
            }
            if (requiresFaceCapture) {
                setStep("face");
                return;
            }
            await startSessionNow(media);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const resumeSession = async () => {
        setError("");
        try {
            await enterFullscreen();
        } catch (e) {
            setError(e.message);
            return;
        }
        setFullscreenActive(true);
        let media = stream;
        const liveCameraNow = Boolean(media?.getVideoTracks?.().some((track) => track.readyState === "live"));
        const liveMicNow = Boolean(media?.getAudioTracks?.().some((track) => track.readyState === "live"));
        if (!liveCameraNow || !liveMicNow) {
            media = await enableDevices(true);
            if (!media) {
                setError("Camera and microphone must be enabled to resume the interview.");
                return;
            }
        }
        if (requiresFaceCapture) {
            setStep("face");
            return;
        }
        // The last bot turn is always the current, unanswered question.
        const botTurns = transcript.filter((t) => t.role === "bot");
        const current = botTurns[botTurns.length - 1] || null;
        setQuestion(current ? { id: current.questionId, text: current.text } : null);
        setIndex(Math.max(0, (interview?.session?.answeredCount || 0)));
        setStep("interview");
        if (consent.recording) startRecording(media);
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
        recognition.lang = speechLang;
        speechBaseRef.current = answer.trimEnd();
        speechFinalRef.current = "";
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
            setAnswer([speechBaseRef.current, spoken].filter(Boolean).join(speechBaseRef.current && spoken ? " " : ""));
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

    // Single idempotent finish path. Guarded so a double-click on End Interview
    // (or a submit racing a completion) cannot finalize the interview twice.
    const finishInterview = async () => {
        if (finalizedRef.current || terminatingRef.current) return;
        finalizedRef.current = true;
        setBusy(true);
        setMonitorState(MONITOR_STATE.COMPLETED);
        try {
            void stopRecordingAndUpload().catch((error) => {
                console.error("Best-effort interview recording upload failed:", error.message);
            });
            const res = await api.interviews.complete(id);
            if (res) setInterview(res);
            stopAllMedia();
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            setDone(true);
            setStep("done");
        } catch (e) {
            finalizedRef.current = false; // allow a retry on network failure
            setBusy(false);
            setError(e.message);
            return;
        }
        setBusy(false);
    };

    // End Interview (top-right) -> confirmation dialog -> finalize + cleanup.
    const confirmEndInterview = async () => {
        setConfirmEndOpen(false);
        await finishInterview();
    };

    const candidateTurns = useMemo(() => transcript.filter((t) => t.role === "candidate").length, [transcript]);
    const progress = total ? Math.min(100, Math.round((candidateTurns / total) * 100)) : 0;
    const liveCamera = Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === "live"));
    const liveMicrophone = Boolean(stream?.getAudioTracks?.().some((track) => track.readyState === "live"));
    const monitorStale = Date.now() - proctorSignal.checkedAt > MONITOR_STALE_MS;
    const cameraHealthy = proctorSignal.connected
        && proctorSignal.identityStatus !== "mismatch"
        && proctorSignal.identityStatus !== "head_turned"
        && proctorSignal.identityStatus !== "no_face"
        && proctorSignal.faceCount <= 1
        && !proctorSignal.deviceDetected
        && !monitorStale;
    const canResume = cameraHealthy && liveCamera && liveMicrophone;
    const canContinue = canResume && fullscreenActive && online && !pausedReason && !terminatingRef.current
        && identityStatus !== "mismatch"
        && monitorState !== MONITOR_STATE.TERMINATED && monitorState !== MONITOR_STATE.TERMINATING;
    const identityBlocked = step === "interview" && faceVerificationRequired && (
        proctorSignal.identityBlocked
        || identityStatus !== "verified"
        || proctorSignal.faceCount > 1
    );
    const showPauseDialog = step === "interview"
        && (pausedReason || !canContinue)
        && !identityBlocked
        && !phoneConfirmed
        && monitorState !== MONITOR_STATE.TERMINATED
        && monitorState !== MONITOR_STATE.TERMINATING;

    // Derive the centralized monitoring state whenever its inputs change. The
    // face-away states only pause once the AIML gate confirms them (after its
    // 30s grace), so a blink, a partial frame, or a quick glance does not stall
    // the candidate.
    useEffect(() => {
        if (step !== "interview") return;
        if (terminatingRef.current) return; // terminating/terminated is set imperatively
        let next = MONITOR_STATE.RUNNING;
        if (!liveCamera) next = MONITOR_STATE.PAUSED_CAMERA_UNAVAILABLE;
        else if (!proctorSignal.connected || monitorStale) next = MONITOR_STATE.PAUSED_MONITORING_UNAVAILABLE;
        else if (proctorSignal.faceCount > 1) next = MONITOR_STATE.PAUSED_FACE_NOT_DETECTED;
        else if (proctorSignal.identityStatus === "no_face" || proctorSignal.identityStatus === "head_turned") next = MONITOR_STATE.PAUSED_FACE_NOT_DETECTED;
        monitorStateRef.current = next;
        setMonitorState((prev) => (prev === next ? prev : next));
    }, [step, liveCamera, proctorSignal.connected, proctorSignal.faceCount, proctorSignal.identityStatus, monitorStale]);

    // Preview status label (spec section 3): single source of truth for the PIP.
    const previewStatus = useMemo(() => {
        if (!liveCamera) return { label: "Camera unavailable", tone: "text-red-400" };
        if (phoneConfirmed) return { label: "Smartphone detected", tone: "text-red-400" };
        if (proctorSignal.faceCount > 1) return { label: "Multiple faces detected", tone: "text-red-400" };
        if (identityStatus === "mismatch") return { label: "Identity verification failed", tone: "text-red-400" };
        if (identityStatus === "head_turned") return { label: "Looking away too long", tone: "text-red-400" };
        if (identityStatus === "no_face") return { label: "Face not detected", tone: "text-red-400" };
        if (phoneWarning) return { label: "Possible device in view", tone: "text-amber-400" };
        if (!proctorSignal.connected || !proctorSignal.facePresent) return { label: "Face not detected", tone: "text-amber-400" };
        if (eyeStatus === "not_visible") return { label: "Eyes not visible", tone: "text-amber-400" };
        if (eyeStatus === "unclear") return { label: "Face position unclear", tone: "text-amber-400" };
        if (eyeStatus === "visible") return { label: "Eyes visible", tone: "text-emerald-400" };
        return { label: "Face detected", tone: "text-emerald-400" };
    }, [liveCamera, phoneConfirmed, phoneWarning, proctorSignal.connected, proctorSignal.facePresent, proctorSignal.faceCount, identityStatus, eyeStatus]);

    // Face tracking box color: green OK, amber low-confidence/missing, red critical.
    const faceTone = !proctorSignal.connected
        ? { label: "Monitor offline", tone: "border-slate-300 bg-slate-100 text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" }
        : proctorSignal.faceCount > 1 || phoneConfirmed || identityStatus === "mismatch"
            ? { label: "Check camera", tone: "border-red-500/30 bg-red-500/10 text-red-400" }
            : !proctorSignal.facePresent || eyeStatus === "not_visible" || phoneWarning
                ? { label: "Look at camera", tone: "border-amber-500/30 bg-amber-500/10 text-amber-400" }
                : { label: "Face detected", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" };

    if (loading) return <LoadingState label="Loading interview" className="min-h-64" />;

    if (step === "blocked") {
        return (
            <div className="mx-auto max-w-2xl">
                <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5">
                    <CardContent className="space-y-4 p-8 text-center">
                        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {error || "This interview is unavailable"}
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-zinc-400">
                            You can return to your interviews list and try again.
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
                            Your responses were saved. {interview?.reportStatus === "generating"
                                ? "The interview report is being generated and will be available to the coordinator shortly."
                                : "The coordinator can review the interview and its report."}
                        </p>
                        {interview?.report?.candidateSummary && (
                            <p className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
                                {interview.report.candidateSummary}
                            </p>
                        )}
                        <Button onClick={() => navigate("/student/interviews")}>
                            <ArrowLeft className="h-4 w-4" /> Back to interviews
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (step === "terminated") {
        const isPhone = terminationReason?.toLowerCase().includes("smartphone")
            || interview?.session?.terminationReason === "smartphone_detected";
        return (
            <div className="mx-auto max-w-2xl">
                <Card className="border-red-300 bg-red-50/70 dark:border-red-500/40 dark:bg-red-500/10">
                    <CardContent className="space-y-4 p-8 text-center">
                        <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">INTERVIEW TERMINATED</h2>
                        {isPhone ? (
                            <>
                                <p className="text-sm text-slate-700 dark:text-zinc-300">
                                    A smartphone was detected during the interview. Your interview has been terminated according to the proctoring policy.
                                </p>
                                {terminatedAt && (
                                    <p className="text-xs text-slate-500 dark:text-zinc-500">
                                        Detected at {terminatedAt.toLocaleTimeString()} · Reason: smartphone detected in camera view
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-slate-600 dark:text-zinc-400">
                                The session was terminated after three confirmed proctoring violations. Your saved answers and event log are available to the coordinator for review.
                            </p>
                        )}
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
                            <ul className="list-disc space-y-1 pl-5">
                                <li>During the session, a small camera frame is checked every couple of seconds for whether a face is visible, whether you look away, and whether a prohibited device is in view.</li>
                                <li>Your answers are transcribed so a report can be prepared for the coordinator. A microphone level is shown so you can confirm it works; it is not used to judge answer quality.</li>
                                <li>Recording audio/video is optional and separate from the camera check below. If you enable it, it is deleted automatically after the retention period.</li>
                            </ul>
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

    if (step === "face") {
        return (
            <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col items-center justify-center gap-4 px-4 py-6">
                <InterviewFaceCapture
                    interviewId={id}
                    attemptId={`interview_${id}`}
                    stream={stream}
                    busy={busy}
                    onVerified={handleFaceVerified}
                    onContinue={continueAfterFaceCapture}
                    onExit={() => navigate("/student/interviews")}
                />
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
        );
    }

    if (step === "check") {
        const checkedSecondsAgo = readiness.checkedAt ? Math.max(0, Math.round((now - readiness.checkedAt) / 1000)) : null;
        return (
            <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full items-center justify-center px-4 py-6">
              <div className="w-full max-w-3xl">
                <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                    <CardContent className="space-y-5 p-6">
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Camera &amp; microphone check</h1>
                        <p className="text-sm text-slate-600 dark:text-zinc-400">
                            Confirm your camera, lighting, microphone, and connection before starting. You can re-run these checks as often as you like.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                {cameras.length > 1 && (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-zinc-400">Camera</Label>
                                        <Select value={selectedCameraId} onValueChange={(value) => changeCamera(value)}>
                                            <SelectTrigger><SelectValue placeholder="Select a camera" /></SelectTrigger>
                                            <SelectContent>
                                                {cameras.map((camera) => (
                                                    <SelectItem key={camera.deviceId} value={camera.deviceId}>
                                                        {camera.label || `Camera ${camera.deviceId.slice(0, 6)}`}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900 dark:border-zinc-800">
                                    {stream && consent.camera ? (
                                        <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" />
                                    ) : (
                                        <div className="flex aspect-video items-center justify-center text-slate-500">
                                            <VideoOff className="h-8 w-8" />
                                        </div>
                                    )}
                                </div>
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

                                <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-zinc-800">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">Readiness</p>
                                        <span className="text-xs text-slate-400 dark:text-zinc-600">
                                            {checkedSecondsAgo == null ? "not checked yet" : `checked ${checkedSecondsAgo}s ago`}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <StatusPill
                                            ok={readiness.lighting === "good"}
                                            onLabel={readiness.lighting === "good" ? "Lighting good" : readiness.lighting === "too_dark" ? "Too dark" : readiness.lighting === "too_bright" ? "Too bright" : "Lighting ?"}
                                            offIcon={Sun}
                                            onIcon={CheckCircle2}
                                        />
                                        {readiness.face === "good" ? (
                                            <StatusPill ok onLabel="Face visible" onIcon={ScanFace} offIcon={AlertTriangle} />
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400">
                                                <ScanFace className="h-3.5 w-3.5" /> Face check at start
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={runReadinessChecks} disabled={checkingReadiness} type="button">
                                            {checkingReadiness ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Run checks again
                                        </Button>
                                        <span className="text-xs text-slate-500 dark:text-zinc-500">Face verification starts when you begin the interview.</span>
                                    </div>
                                    {readinessError && <p className="text-xs text-amber-700 dark:text-amber-300">{readinessError}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Speech-to-text language</Label>
                                    <Select value={speechLang} onValueChange={setSpeechLang}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {[
                                                ["en-US", "English (US)"],
                                                ["en-GB", "English (UK)"],
                                                ["hi-IN", "Hindi"],
                                                ["ta-IN", "Tamil"],
                                                ["te-IN", "Telugu"],
                                                ["kn-IN", "Kannada"],
                                                ["ml-IN", "Malayalam"],
                                            ].map(([value, label]) => (
                                                <SelectItem key={value} value={value}>{label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-400 dark:text-zinc-600">You can always type your answer instead.</p>
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
            </div>
        );
    }

    // Interview — dedicated full-screen shell (hides app nav; fills the viewport).
    return (
        <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100" style={{ height: "100dvh" }}>
            {/* ---- Top bar ---- */}
            <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <ScanFace className="h-5 w-5 shrink-0 text-violet-500" />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                            {interview?.interviewName || `${interview?.type || "General"} interview`}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-zinc-500">
                            Question {Math.min(index + 1, total)} of {total} · {consent.recording ? "Recording (opt-in)" : "Not recording"} · {violationCount}/3 violations
                        </p>
                    </div>
                </div>
                <span className={cn(
                    "hidden items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs sm:flex",
                    monitorState === MONITOR_STATE.RUNNING
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-500",
                )}>
                    <Circle className={cn("h-2 w-2 fill-current", monitorState === MONITOR_STATE.RUNNING ? "text-emerald-500" : "text-amber-500")} />
                    {monitorState.replace(/_/g, " ").toLowerCase()}
                </span>
                {!done && (
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setConfirmEndOpen(true)}
                        disabled={busy || terminatingRef.current}
                        className="shrink-0"
                        type="button"
                    >
                        <Square className="h-4 w-4" /> End interview
                    </Button>
                )}
            </header>

            {/* ---- Main area ---- */}
            <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 lg:flex-row">
                {!online && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
                        <WifiOff className="h-4 w-4" /> You appear to be offline. Your session is preserved; reconnect to continue submitting answers.
                    </div>
                )}

                {identityStatus === "mismatch" && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-300">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        IDENTITY VERIFICATION FAILED · Only the registered candidate may continue this interview.
                    </div>
                )}

                {/* Question + answer (left/center) */}
                <div className="flex min-h-0 flex-1 flex-col gap-3 lg:max-w-none">
                    {showPauseDialog && (
                        <AssessmentPausedOverlay
                            title={`Interview paused · ${violationCount}/3 confirmed violations`}
                            message={
                                pausedReason ||
                                (!fullscreenActive
                                    ? "Re-enter fullscreen to continue."
                                    : !proctorSignal.connected
                                        ? "Waiting for the AI camera monitor. Answers remain locked until monitoring is available."
                                        : "Waiting for a clear camera, face, and device check.")
                            }
                            proctorError={proctorError || undefined}
                            mediaError={mediaError}
                            error={error}
                            showReenableCamera={!liveCamera || !liveMicrophone}
                            onReenableCamera={() => enableDevices(true)}
                            canResume={canResume}
                            onResume={resumeAfterProctoring}
                            resumeLabel="Resume interview"
                            disabled={busy}
                            modal
                        />
                    )}

                    <Card className="min-h-0 flex-1 border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                        <CardContent className="flex h-full flex-col gap-4 p-5">
                            <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-5 dark:border-violet-500/20 dark:bg-violet-500/5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                                    Question {Math.min(index + 1, total)} of {total}
                                </p>
                                <p className="mt-2 text-lg font-medium text-slate-900 dark:text-white">
                                    {question?.text || "No further questions."}
                                </p>
                                {done && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">All questions answered.</p>}
                            </div>

                            <div className="flex min-h-0 flex-1 flex-col gap-2">
                                <Textarea
                                    className="min-h-0 flex-1 resize-none read-only:cursor-default"
                                    value={answer}
                                    readOnly
                                    placeholder="Your spoken answer will appear here."
                                    disabled={busy || done || !canContinue}
                                />
                                <p className="text-xs text-slate-500 dark:text-zinc-500">
                                    Speak your answer using the microphone. The transcript cannot be edited.
                                </p>
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
                                    {!SpeechRecognition && (
                                        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
                                            Speech recognition is not supported in this browser. Open the interview in a browser with speech recognition to answer.
                                        </p>
                                    )}
                                    <Button onClick={submitAnswer} disabled={busy || done || !answer.trim() || !canContinue} type="button">
                                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        {index + 1 >= total ? "Submit & finish" : "Submit answer"}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right-side panel (progress + transcript), stacks on small screens. */}
                <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
                    <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                        <CardContent className="space-y-3 p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-zinc-200">
                                <ListChecks className="h-4 w-4" /> Progress
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
                                <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all" style={{ width: `${progress}%` }} />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-zinc-500">{candidateTurns} of {total} answered</p>
                            <div className="flex flex-wrap gap-2 text-[11px]">
                                <StatusPill ok={liveCamera} onLabel="Camera" offLabel="Camera off" onIcon={Video} offIcon={VideoOff} />
                                <StatusPill ok={liveMicrophone} onLabel="Mic" offLabel="Mic off" onIcon={Mic} offIcon={MicOff} />
                                <StatusPill ok={online} onLabel="Online" offLabel="Offline" onIcon={Wifi} offIcon={WifiOff} />
                                <StatusPill ok={proctorSignal.connected && !monitorStale} onLabel="AI monitor" offLabel="Monitor offline" onIcon={ScanFace} offIcon={AlertTriangle} />
                                <StatusPill
                                    ok={identityStatus === "verified"}
                                    onLabel="Identity verified"
                                    offLabel={identityStatus === "mismatch" ? "Identity mismatch" : identityStatus === "unregistered" ? "Identity unavailable" : "Verifying identity"}
                                    onIcon={ShieldCheck}
                                    offIcon={ScanFace}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="min-h-0 flex-1 border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                        <CardContent className="flex h-full max-h-64 flex-col overflow-y-auto p-4 lg:max-h-none">
                            <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-zinc-200">Transcript</p>
                            {transcript.length === 0 && <p className="text-xs text-slate-500 dark:text-zinc-500">Your conversation will appear here.</p>}
                            {transcript.map((turn, i) => (
                                <div key={`${turn.questionId || "t"}-${i}`} className={`mb-2 rounded-lg p-3 text-sm ${turn.role === "bot" ? "bg-slate-100 dark:bg-zinc-800/60" : "bg-violet-50 dark:bg-violet-500/10"}`}>
                                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                                        {turn.role === "bot" ? "Interviewer" : "You"}
                                    </p>
                                    <p className="text-slate-700 dark:text-zinc-300">{turn.text}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </aside>
            </main>

            {/* ---- Bottom-right floating webcam preview ---- */}
            {stream && consent.camera && monitorState !== MONITOR_STATE.TERMINATED && (
                <div
                    ref={videoPipRef}
                    style={{ position: "fixed", right: 20, bottom: 20, width: 280, maxHeight: 200 }}
                    className="z-50 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
                >
                    <div className="relative">
                        <video ref={videoRef} autoPlay playsInline muted className="block w-full object-cover" style={{ aspectRatio: "4 / 3" }} />
                        <FaceAttentionOverlay metrics={faceMetrics} width={280} height={210} />
                        {/* Confirmed smartphone bounding box overlay (red).
                            Detector boxes are absolute pixels in the 320px-wide
                            monitor frame; normalize to % of the PIP. */}
                        {phoneBox && (
                            <div
                                className="pointer-events-none absolute rounded border-2 border-red-500"
                                style={{
                                    left: `${(phoneBox.x1 / 320) * 100}%`,
                                    top: `${(phoneBox.y1 / 240) * 100}%`,
                                    width: `${((phoneBox.x2 - phoneBox.x1) / 320) * 100}%`,
                                    height: `${((phoneBox.y2 - phoneBox.y1) / 240) * 100}%`,
                                }}
                            />
                        )}
                    </div>
                    <div className="flex items-center justify-between px-2 py-1">
                        <span className={cn("flex items-center gap-1.5 text-[11px] font-medium", previewStatus.tone)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", previewStatus.tone.replace("text-", "bg-"))} />
                            {previewStatus.label}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                            <span className={cn("h-1.5 w-1.5 rounded-full", faceTone.tone.includes("emerald") ? "bg-emerald-400" : faceTone.tone.includes("amber") ? "bg-amber-400" : faceTone.tone.includes("red") ? "bg-red-500" : "bg-slate-400")} />
                            {faceTone.label}
                        </span>
                    </div>
                </div>
            )}

            {identityBlocked && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
                    <Card className="w-full max-w-md border-amber-500/40 bg-white dark:bg-zinc-900">
                        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
                                <ScanFace className="h-8 w-8" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                {!proctorSignal.connected
                                    ? "Camera monitoring required"
                                    : "Candidate verification required"}
                            </h2>
                            <p className="text-sm text-slate-600 dark:text-zinc-300">
                                {proctorSignal.faceCount > 1
                                    ? "More than one person is visible. Only the registered candidate may continue."
                                    : identityStatus === "mismatch"
                                        ? "The face on camera does not match the registered candidate. The registered candidate must return to the camera."
                                        : identityStatus === "unverified"
                                            ? "The camera sees a face but cannot verify it clearly. Improve the lighting and keep your face centered in view."
                                            : !proctorSignal.connected
                                                ? "The live AI monitor has not returned a camera check yet. Keep the camera on while it reconnects."
                                                : "Waiting for the live camera check to verify the registered candidate."}
                            </p>
                            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                Answers are locked and the timer is paused until verification succeeds.
                            </div>
                            <p className="text-xs text-slate-400 dark:text-zinc-500">
                                {proctorSignal.connected
                                    ? "Answers stay locked until the camera confirms the registered candidate."
                                    : "This screen will close automatically when the monitor responds and identity is verified."}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ---- Smartphone-detected full-screen termination overlay ---- */}
            {phoneConfirmed && !terminatingRef.current && monitorState !== MONITOR_STATE.TERMINATED && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-red-950/80 p-6 backdrop-blur-sm">
                    <div className="max-w-md rounded-xl border border-red-500/50 bg-red-900/90 p-6 text-center text-red-100 shadow-2xl">
                        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
                        <p className="text-lg font-bold tracking-wide">Smartphone detected</p>
                        <p className="mt-2 text-sm text-red-200">Remove the phone from the camera view. The interview will be terminated if it remains visible.</p>
                    </div>
                </div>
            )}

            {/* ---- End Interview confirmation dialog ---- */}
            {confirmEndOpen && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
                    <Card className="w-full max-w-md border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                        <CardContent className="space-y-4 p-6">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">End this interview?</h2>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-zinc-400">
                                Ending the interview will stop your camera and microphone and submit the {candidateTurns} answer{candidateTurns === 1 ? "" : "s"} you have given so far. This cannot be undone.
                            </p>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setConfirmEndOpen(false)} type="button">Keep going</Button>
                                <Button variant="destructive" onClick={confirmEndInterview} disabled={busy} type="button">
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} End interview
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
