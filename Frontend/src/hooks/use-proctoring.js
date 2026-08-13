import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

function requestFullscreen() {
    const el = document.documentElement;
    try {
        if (el.requestFullscreen) {
            const p = el.requestFullscreen();
            if (p && typeof p.catch === "function") p.catch(() => {});
            return p || Promise.resolve();
        }
    } catch {
        // fullscreen unsupported/denied (headless, iframes) — the test still runs;
        // the fullscreenchange listener records fullscreen_exit violations instead.
    }
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

export default function useProctoring({ attemptId, config, previewRef, onAutoSubmit, onViolation }) {
    const [status, setStatus] = useState("idle"); // idle | denied | ready | active
    const [violationCount, setViolationCount] = useState(0);
    const [cameraActive, setCameraActive] = useState(false);
    const [micActive, setMicActive] = useState(false);
    const [fullscreenActive, setFullscreenActive] = useState(false);
    const [lastAnalysis, setLastAnalysis] = useState(null);
    const [warning, setWarning] = useState(null);

    const streamRef = useRef(null);
    const canvasRef = useRef(null);
    const audioCtxRef = useRef(null);
    const intervalRef = useRef(null);
    const activeRef = useRef(false);
    const runningRef = useRef(false);
    const countRef = useRef(0);
    const warnedRef = useRef(new Set());

    const maxViolations = config?.maxViolations ?? 5;
    const autoSubmit = config?.autoSubmit ?? true;
    const intervalMs = (config?.snapshotIntervalSec ?? 20) * 1000;

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

    const reportViolation = useCallback(async (type, description, extra = {}) => {
        if (!activeRef.current) return;
        countRef.current += 1;
        setViolationCount(countRef.current);
        onViolation?.(type, countRef.current);
        const severity = { multiple_faces: "high", no_face: "medium", voice_detected: "high", fullscreen_exit: "high", camera_lost: "high", mic_lost: "high" }[type] || "medium";
        if (!warnedRef.current.has(type)) {
            warnedRef.current.add(type);
            setWarning({ type, description, severity });
            setTimeout(() => setWarning(null), 5000);
        }
        try {
            const r = await api.proctoring.report({ attemptId, type, severity, description, ...extra });
            if (r.violationCount != null) {
                countRef.current = r.violationCount;
                setViolationCount(r.violationCount);
            }
            if (r.autoSubmitted) {
                stop();
                onAutoSubmit?.(r.result);
            }
        } catch {
            if (autoSubmit && countRef.current >= maxViolations) {
                stop();
                onAutoSubmit?.();
            }
        }
    }, [attemptId, autoSubmit, maxViolations, onAutoSubmit, onViolation, stop]);

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
        if (!activeRef.current || runningRef.current) return;
        runningRef.current = true;
        try {
            const image = captureFrame();
            const audio = await captureAudio();
            if (!image && !audio) return;
            const r = await api.proctoring.analyze({ attemptId, image, audio });
            setLastAnalysis(r.analysis);
            if (r.violationCount != null) {
                countRef.current = r.violationCount;
                setViolationCount(r.violationCount);
            }
            if (r.autoSubmitted) {
                stop();
                onAutoSubmit?.(r.result);
            }
        } catch {
            // transient network/analysis errors are ignored; next tick retries
        } finally {
            runningRef.current = false;
        }
    }, [attemptId, captureFrame, captureAudio, onAutoSubmit, stop]);

    const hasBeenFullscreenRef = useRef(false);
    const startGraceUntilRef = useRef(0);

    const start = useCallback(async () => {
        activeRef.current = true;
        setStatus("active");
        startGraceUntilRef.current = Date.now() + 3000;
        await requestFullscreen();
        const isFs = document.fullscreenElement != null;
        if (isFs) hasBeenFullscreenRef.current = true;
        setFullscreenActive(isFs);
        intervalRef.current = setInterval(tick, intervalMs);
        tick();
    }, [intervalMs, tick]);

    const enable = useCallback(async (allowSimulated = false) => {
        window.__ENABLE_V2 = (window.__ENABLE_V2 || 0) + 1;
        window.__ENABLE_LOGGED = true;
        console.log("[proctoring] enable() called", new Date().toISOString());
        setStatus("ready");
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
                            console.warn("[proctoring] Hardware media access unavailable. Using simulated stream fallback.");
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
            if (vTrack) vTrack.addEventListener("ended", () => { setCameraActive(false); reportViolation("camera_lost", "Camera disconnected during test."); });
            if (aTrack) aTrack.addEventListener("ended", () => { setMicActive(false); reportViolation("mic_lost", "Microphone disconnected during test."); });
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
    }, [previewRef, reportViolation]);

    useEffect(() => {
        if (!activeRef.current) return;
        const onVis = () => {
            if (Date.now() < startGraceUntilRef.current) return;
            if (document.hidden) reportViolation("tab_switch", "Tab or window switched during the test.");
        };
        const onBlur = () => {
            if (Date.now() < startGraceUntilRef.current) return;
            reportViolation("window_blur", "Window lost focus during the test.");
        };
        const onFs = () => {
            const fs = document.fullscreenElement != null;
            if (fs) {
                hasBeenFullscreenRef.current = true;
            }
            setFullscreenActive(fs);
            if (!fs && hasBeenFullscreenRef.current && Date.now() >= startGraceUntilRef.current) {
                reportViolation("fullscreen_exit", "You exited fullscreen during the test.");
            }
        };
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("blur", onBlur);
        document.addEventListener("fullscreenchange", onFs);
        return () => {
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("blur", onBlur);
            document.removeEventListener("fullscreenchange", onFs);
        };
    }, [status, reportViolation]);

    useEffect(() => () => stop(), [stop]);

    return { status, violationCount, cameraActive, micActive, fullscreenActive, lastAnalysis, warning, enable, start, stop, reportViolation };
}
