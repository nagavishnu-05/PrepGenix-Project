import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";

function requestFullscreen() {
    const el = document.documentElement;
    try {
        if (el.requestFullscreen) {
            const p = el.requestFullscreen();
            if (p && typeof p.catch === "function") p.catch(() => {});
            return p || Promise.resolve();
        }
    } catch {}
    try {
        if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    } catch {}
    return Promise.resolve();
}

function exitFullscreen() {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
}

function toWavBase64(audioBuffer, targetRate = 16000) {
    const src = audioBuffer.getChannelData(0);
    const rate = audioBuffer.sampleRate;
    const targetLen = Math.round((src.length * targetRate) / rate);
    const out = new Float32Array(targetLen);
    for (let i = 0; i < targetLen; i++) {
        const idx = Math.min(src.length - 1, Math.floor((i * rate) / targetRate));
        out[i] = src[idx];
    }
    const bytes = new Uint8Array(44 + out.length * 2);
    const dv = new DataView(bytes.buffer);
    dv.setUint32(0, 0x46464952, true);
    dv.setUint32(4, 36 + out.length * 2, true);
    dv.setUint32(8, 0x45564157, true);
    dv.setUint32(12, 0x20746d66, true);
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, targetRate, true);
    dv.setUint32(28, targetRate * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    dv.setUint32(36, 0x61746164, true);
    dv.setUint32(40, out.length * 2, true);
    for (let i = 0; i < out.length; i++) {
        const s = Math.max(-1, Math.min(1, out[i]));
        dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
}

const VIOLATION_REASON_MAP = {
    fullscreen_exit: "FULLSCREEN_EXIT",
    multiple_faces: "MULTIPLE_FACES",
    phone_detected: "PHONE_DETECTED",
    dev_tools: "DEV_TOOLS",
    screen_capture: "SCREEN_CAPTURE",
    tab_switch: "TAB_SWITCH",
    window_blur: "WINDOW_FOCUS_LOST",
    right_click: "RIGHT_CLICK",
    copy_attempt: "COPY_ATTEMPT",
    paste_attempt: "PASTE_ATTEMPT",
    camera_lost: "CAMERA_LOST",
    mic_lost: "MIC_LOST",
    no_face: "NO_FACE",
    voice_detected: "VOICE_DETECTED",
    looking_away: "LOOKING_AWAY",
    IMPOSTER_DETECTED: "IMPOSTER_DETECTED",
    ELECTRONIC_DEVICE: "ELECTRONIC_DEVICE",
    MULTIPLE_PERSONS: "MULTIPLE_PERSONS",
    CANDIDATE_NOT_VISIBLE: "CANDIDATE_NOT_VISIBLE",
    f5_refresh: "F5_REFRESH",
    escape_pressed: "ESCAPE_PRESSED",
};

export default function useProctoring({ attemptId, config, previewRef, onAutoSubmit }) {
    const [status, setStatus] = useState("idle");
    const [cameraActive, setCameraActive] = useState(false);
    const [micActive, setMicActive] = useState(false);
    const [fullscreenActive, setFullscreenActive] = useState(false);
    const [simulated, setSimulated] = useState(false);
    const [faceMonitor, setFaceMonitor] = useState({
        faceRegistered: false,
        match: null,
        similarity: null,
        faceCount: 0,
        quality: "unknown",
        metrics: null,
        known: false,
        identityBlocked: false,
        identityStatus: "checking",
        identityBlockReason: null,
    });

    const streamRef = useRef(null);
    const canvasRef = useRef(null);
    const audioCtxRef = useRef(null);
    const intervalRef = useRef(null);
    const activeRef = useRef(false);
    const runningRef = useRef(false);
    const autoSubmittedRef = useRef(false);
    // Declared with the other refs so it exists before `tick` reads it. Using a
    // ref declared further down the function body threw a temporal-dead-zone
    // error on the first monitoring tick, so no frame ever reached the API and
    // the UI sat on "No face" for the whole test.
    const graceUntilRef = useRef(0);
    const lastTickOkRef = useRef(false);
    const fullscreenRequiredRef = useRef(true);

    const monitoringIntervalMs = parseInt(import.meta.env.VITE_FACE_CHECK_INTERVAL_MS || "2000", 10);
    const intervalMs = monitoringIntervalMs;

    const stop = useCallback(() => {
        activeRef.current = false;
        setStatus("idle");
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        const stream = streamRef.current;
        if (stream) stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (previewRef?.current) previewRef.current.srcObject = null;
        setCameraActive(false);
        setMicActive(false);
        exitFullscreen();
    }, [previewRef]);

    // Fullscreen is a hard requirement, but browsers only grant it from a user
    // gesture. If the request was refused we must not wait for a
    // `fullscreenchange` that will never come, otherwise the exit detector stays
    // gated off and leaving fullscreen is never detected. Mark ourselves as
    // "supposed to be fullscreen" as soon as monitoring is active, so a later
    // exit (or a never-granted request) is still caught.
    useEffect(() => {
        fullscreenRequiredRef.current = status !== "idle";
    }, [status]);

    const captureFrame = useCallback(() => {
        const video = previewRef?.current;
        if (!video || !video.videoWidth) return undefined;
        const canvas = canvasRef.current || (canvasRef.current = document.createElement("canvas"));
        const w = 320;
        const h = video.videoHeight && video.videoWidth ? Math.round((video.videoHeight / video.videoWidth) * w) : 240;
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(video, 0, 0, w, h);
        return canvas.toDataURL("image/jpeg", 0.5).split(",")[1];
    }, [previewRef]);

    // Violations are recorded for staff review but do NOT stop the test. Each
    // report carries a JPEG snapshot; the backend archives it to Supabase.
    // A per-type cooldown keeps a sustained condition (e.g. phone on screen)
    // from inserting one row per 2-second monitoring tick.
    const lastReportRef = useRef({});
    const REPORT_COOLDOWN_MS = 12000;
    const reportViolation = useCallback(async (type, opts = {}) => {
        if (!attemptId || !activeRef.current) return;
        const now = Date.now();
        if (now - (lastReportRef.current[type] || 0) < REPORT_COOLDOWN_MS) return;
        lastReportRef.current[type] = now;
        const snapshot = opts.snapshot || captureFrame();
        try {
            await api.proctoring.report({
                attemptId,
                type,
                severity: opts.severity,
                description: opts.description,
                cameraFrame: snapshot,
                metadata: opts.metadata,
            });
        } catch {
            // best-effort: a failed report must never interrupt the assessment
        }
    }, [attemptId, captureFrame]);

    // Terminates the attempt for hard integrity events (fullscreen exit, Esc,
    // refresh/close) and PERSISTS the lock on the backend, so reloading the
    // page cannot resume the attempt. Only a staff reset clears it. The event
    // is recorded (with a snapshot) so staff can see why.
    const submitAndStop = useCallback((type, record = true) => {
        if (autoSubmittedRef.current) return;
        autoSubmittedRef.current = true;
        const reason = VIOLATION_REASON_MAP[type] || type.toUpperCase();
        if (record && attemptId) {
            // `keepalive` lets this request finish even during `pagehide`/unload,
            // which is what fires when the candidate refreshes or closes the tab.
            try {
                api.tests.terminateAttempt(attemptId, {
                    type: reason,
                    description: `Attempt terminated during the assessment (${reason}).`,
                    cameraFrame: captureFrame(),
                }).catch(() => {});
            } catch {}
        }
        stop();
        onAutoSubmit?.("disqualified", reason);
    }, [attemptId, captureFrame, onAutoSubmit, stop]);

    const captureAudio = useCallback(() => {
        const stream = streamRef.current;
        if (!stream || !stream.getAudioTracks().length) return Promise.resolve(undefined);
        return new Promise((resolve) => {
            try {
                const mr = new MediaRecorder(stream);
                const chunks = [];
                mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
                mr.onstop = async () => {
                    try {
                        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
                        const ab = await blob.arrayBuffer();
                        if (!ab.byteLength) return resolve(undefined);
                        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
                        const decoded = await audioCtxRef.current.decodeAudioData(ab);
                        resolve(toWavBase64(decoded));
                    } catch {
                        resolve(undefined);
                    }
                };
                mr.start();
                setTimeout(() => {
                    try { if (mr.state !== "inactive") mr.stop(); } catch { resolve(undefined); }
                }, 2500);
            } catch {
                resolve(undefined);
            }
        });
    }, []);

    const tick = useCallback(async () => {
        if (!activeRef.current || runningRef.current || autoSubmittedRef.current) return;
        // Skip monitoring during grace period after start or stream reattachment.
        if (Date.now() < graceUntilRef.current) return;
        runningRef.current = true;
        try {
            const image = captureFrame();
            if (!image) {
                // The video element has not produced a frame yet. Keep reporting
                // the previous state rather than letting the UI fall back to
                // "No face", which reads as a violation when it is really just
                // a warm-up.
                return;
            }

            const proctoringApiBase = import.meta.env.VITE_PROCTORING_API || "http://localhost:5050";
            const r = await fetch(`${proctoringApiBase}/monitor`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image, attemptId, cameraActive: cameraActive }),
            }).then((res) => res.json());

            // `known` distinguishes "the detector ran and saw nothing" from "we have not
            // heard back yet". Without it the badge shows "No face" until the
            // first response arrives, which looks like an accusation.
            setFaceMonitor((prev) => ({
                faceRegistered: r.face_registered || false,
                match: r.match ?? null,
                similarity: r.similarity ?? null,
                faceCount: r.face_count ?? 0,
                personCount: r.person_count ?? 0,
                devices: r.devices || [],
                deviceDetected: r.device_detected || false,
                quality: r.quality || "unknown",
                metrics: r.metrics || prev.metrics || null,
                known: true,
                identityBlocked: r.identity_blocked || false,
                identityStatus: r.identity_status || "checking",
                identityBlockReason: r.identity_block_reason || null,
            }));
            lastTickOkRef.current = true;

            // The AIML monitor debounces conditions into confirmed violations.
            // Forward each new one to the backend for staff review (with the
            // frame we just captured), but never stop the test here.
            for (const v of r.violations || []) {
                reportViolation(v.type, {
                    description: v.description,
                    severity: v.severity,
                    metadata: {
                        violationCount: v.violation_count,
                        faceCount: r.face_count,
                        personCount: r.person_count,
                        devices: r.devices,
                        similarity: r.similarity,
                    },
                    snapshot: image,
                });
            }
        } catch {
            // transient network errors ignored
        } finally {
            runningRef.current = false;
        }
    }, [attemptId, captureFrame, cameraActive, reportViolation]);

    const hasBeenFullscreenRef = useRef(false);
    const enrollmentGraceRef = useRef(false);

    const start = useCallback(async () => {
        activeRef.current = true;
        autoSubmittedRef.current = false;
        enrollmentGraceRef.current = true;
        setStatus("active");
        graceUntilRef.current = Date.now() + 5000;
        await requestFullscreen();
        const isFs = document.fullscreenElement != null;
        if (isFs) hasBeenFullscreenRef.current = true;
        setFullscreenActive(isFs);
        intervalRef.current = setInterval(tick, intervalMs);
        tick();
    }, [intervalMs, tick]);

    const enable = useCallback(async (allowSimulated = false) => {
        setStatus("ready");
        setSimulated(false);
        try {
            await requestFullscreen().catch(() => {});
            let stream = null;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
            } catch {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true });
                } catch {
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    } catch {
                        const hostname = typeof window !== "undefined" ? window.location.hostname : "";
                        const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1" || hostname.endsWith(".local");
                        if (allowSimulated || isLocal) {
                            setSimulated(true);
                            const canvas = document.createElement("canvas");
                            canvas.width = 640;
                            canvas.height = 480;
                            const ctx = canvas.getContext("2d");
                            const draw = () => {
                                ctx.fillStyle = "#09090b";
                                ctx.fillRect(0, 0, 640, 480);
                                ctx.fillStyle = "#818cf8";
                                ctx.font = "bold 20px sans-serif";
                                ctx.fillText("Proctored Camera Feed (Active)", 150, 220);
                                ctx.fillStyle = "#a1a1aa";
                                ctx.font = "14px sans-serif";
                                ctx.fillText(`Localhost • ${new Date().toLocaleTimeString()}`, 220, 260);
                            };
                            draw();
                            setInterval(draw, 1000);
                            stream = canvas.captureStream(15);
                            try {
                                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                                const osc = audioCtx.createOscillator();
                                const dst = audioCtx.createMediaStreamDestination();
                                osc.connect(dst);
                                osc.start();
                                const aTrack = dst.stream.getAudioTracks()[0];
                                if (aTrack) stream.addTrack(aTrack);
                            } catch {}
                        } else {
                            throw new Error("No media devices available");
                        }
                    }
                }
            }

            streamRef.current = stream;
            const vTrack = stream.getVideoTracks()[0];
            const aTrack = stream.getAudioTracks()[0];
            setCameraActive(!!vTrack);
            setMicActive(!!aTrack);
            if (vTrack) vTrack.addEventListener("ended", () => { setCameraActive(false); submitAndStop("camera_lost"); });
            if (aTrack) aTrack.addEventListener("ended", () => { setMicActive(false); submitAndStop("mic_lost"); });
            if (previewRef?.current) {
                previewRef.current.srcObject = stream;
                await previewRef.current.play().catch(() => {});
            }
            await requestFullscreen().catch(() => {});
            if (document.fullscreenElement != null) hasBeenFullscreenRef.current = true;
            return "ready";
        } catch {
            setStatus("denied");
            return "denied";
        }
    }, [previewRef, submitAndStop]);

    useEffect(() => {
        if (!activeRef.current) return;
        const onVis = () => {
            if (Date.now() < graceUntilRef.current) return;
            if (document.hidden) reportViolation("tab_switch", { description: "Candidate switched away from the test tab." });
        };
        const onBlur = () => {
            if (Date.now() < graceUntilRef.current) return;
            reportViolation("window_blur", { description: "Test window lost focus." });
        };
        // Esc is swallowed by the browser to leave fullscreen, so `keydown` for
        // Escape frequently never fires. `fullscreenchange` is the only event
        // that reliably fires on Esc, so it is what terminates the attempt.
        const onFs = () => {
            const fs = document.fullscreenElement != null;
            if (fs) {
                hasBeenFullscreenRef.current = true;
            }
            setFullscreenActive(fs);
            if (!fs && fullscreenRequiredRef.current && Date.now() >= graceUntilRef.current) {
                hasBeenFullscreenRef.current = false;
                submitAndStop("fullscreen_exit");
            }
        };
        const onContextMenu = (e) => {
            if (Date.now() < graceUntilRef.current) return;
            e.preventDefault();
            reportViolation("right_click", { description: "Right-click attempted during the assessment." });
        };
        const onKeyDown = (e) => {
            if (Date.now() < graceUntilRef.current) return;
            const key = e.key.toLowerCase();
            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;
            if (key === "f5" || (ctrl && key === "r")) {
                e.preventDefault();
                submitAndStop("f5_refresh");
                return;
            }
            if (key === "escape") {
                e.preventDefault();
                submitAndStop("escape_pressed");
                return;
            }
            if (key === "f12" || (ctrl && shift && ["i", "j", "c"].includes(key))) {
                e.preventDefault();
                reportViolation("dev_tools", { description: "Developer tools shortcut attempted." });
                return;
            }
            if (ctrl && key === "u") {
                e.preventDefault();
                reportViolation("dev_tools", { description: "View-source shortcut attempted." });
                return;
            }
            if (ctrl && ["c", "v", "x"].includes(key)) {
                if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT" || document.querySelector(".monaco-editor:focus")) return;
                e.preventDefault();
                reportViolation(key === "c" ? "copy_attempt" : key === "v" ? "paste_attempt" : "copy_attempt", { description: "Clipboard shortcut attempted." });
                return;
            }
            if (key === "printscreen") {
                reportViolation("screen_capture", { description: "Screenshot key pressed." });
            }
        };
        // `pagehide` fires for reload, close and back/forward. It runs synchronously
        // during teardown, so the attempt is closed locally without needing a
        // network request to survive unload.
        const onPageHide = () => {
            if (!activeRef.current) return;
            submitAndStop("f5_refresh");
        };
        const onBeforeUnload = (e) => {
            if (!activeRef.current) return;
            e.preventDefault();
            e.returnValue = "";
        };
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("blur", onBlur);
        document.addEventListener("fullscreenchange", onFs);
        document.addEventListener("contextmenu", onContextMenu);
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("beforeunload", onBeforeUnload);
        window.addEventListener("pagehide", onPageHide);
        return () => {
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("blur", onBlur);
            document.removeEventListener("fullscreenchange", onFs);
            document.removeEventListener("contextmenu", onContextMenu);
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("beforeunload", onBeforeUnload);
            window.removeEventListener("pagehide", onPageHide);
        };
    }, [status, submitAndStop, reportViolation]);

    const reattachStream = useCallback(() => {
        const stream = streamRef.current;
        const video = previewRef?.current;
        if (stream && video) {
            if (video.srcObject !== stream) {
                video.srcObject = stream;
            }
            if (video.paused || video.ended) {
                video.play().catch(() => {});
            }
        }
    }, [previewRef]);

    const captureFrameForEnrollment = useCallback(() => {
        const video = previewRef?.current;
        if (!video || !video.videoWidth) return undefined;
        const canvas = canvasRef.current || (canvasRef.current = document.createElement("canvas"));
        canvas.width = 320;
        const h = video.videoHeight && video.videoWidth ? Math.round((video.videoHeight / video.videoWidth) * 320) : 240;
        canvas.height = h;
        canvas.getContext("2d").drawImage(video, 0, 0, 320, h);
        return canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
    }, [previewRef]);

    const enrollFrame = useCallback(async (imageBase64) => {
        const proctoringApiBase = import.meta.env.VITE_PROCTORING_API || "http://localhost:5050";
        const res = await fetch(`${proctoringApiBase}/enroll-frame`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imageBase64, attemptId }),
        });
        return res.json();
    }, [attemptId]);

    const enrollStatus = useCallback(async () => {
        const proctoringApiBase = import.meta.env.VITE_PROCTORING_API || "http://localhost:5050";
        const res = await fetch(`${proctoringApiBase}/enroll-status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attemptId }),
        });
        return res.json();
    }, [attemptId]);

    useEffect(() => () => stop(), [stop]);

    // Memoised on purpose. A fresh object literal on every render made effects
    // that depend on it (reattachStream, face-capture flow) re-run in a loop,
    // which kept resetting the grace window so monitoring never started.
    return useMemo(
        () => ({
            status,
            cameraActive,
            micActive,
            fullscreenActive,
            simulated,
            faceMonitor,
            enable,
            start,
            stop,
            reattachStream,
            streamRef,
            captureFrameForEnrollment,
            enrollFrame,
            enrollStatus,
        }),
        [
            status,
            cameraActive,
            micActive,
            fullscreenActive,
            simulated,
            faceMonitor,
            enable,
            start,
            stop,
            reattachStream,
            captureFrameForEnrollment,
            enrollFrame,
            enrollStatus,
        ]
    );
}
