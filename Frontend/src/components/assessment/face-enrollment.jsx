import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, ScanFace, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ENROLLMENT_STATES = {
    NOT_STARTED: "NOT_STARTED",
    CAMERA_CHECK: "CAMERA_CHECK",
    CAPTURING: "CAPTURING",
    ENROLLED: "ENROLLED",
    FAILED: "FAILED",
};

const REQUIRED_FRAMES = 5;

export function FaceEnrollment({ proctoring, attemptId, previewRef, onComplete, onCancel }) {
    const [enrollState, setEnrollState] = useState(ENROLLMENT_STATES.NOT_STARTED);
    const [captured, setCaptured] = useState(0);
    const [message, setMessage] = useState("Position your face inside the camera frame.");
    const [error, setError] = useState("");
    const canvasRef = useRef(null);
    const autoCaptureRef = useRef(null);

    const captureAndEnroll = useCallback(async () => {
        if (enrollState === ENROLLMENT_STATES.CAPTURING) return;
        setEnrollState(ENROLLMENT_STATES.CAPTURING);
        setError("");

        try {
            const video = previewRef?.current;
            if (!video || !video.videoWidth) {
                setEnrollState(ENROLLMENT_STATES.FAILED);
                setError("Camera not ready.");
                return;
            }

            const canvas = canvasRef.current || (canvasRef.current = document.createElement("canvas"));
            canvas.width = 320;
            const h = video.videoHeight && video.videoWidth ? Math.round((video.videoHeight / video.videoWidth) * 320) : 240;
            canvas.height = h;
            canvas.getContext("2d").drawImage(video, 0, 0, 320, h);
            const imageBase64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

            const proctoringApiBase = import.meta.env.VITE_PROCTORING_API || "http://localhost:5050";

            const result = await fetch(`${proctoringApiBase}/enroll-frame`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: imageBase64, attemptId }),
            }).then((r) => r.json());

            const newCaptured = result.captured || 0;
            setCaptured(newCaptured);

            if (result.status === "ready") {
                setEnrollState(ENROLLMENT_STATES.ENROLLED);
                setMessage("Face captured successfully. Your identity has been registered for this assessment.");
                try {
                    const { api } = await import("@/lib/api");
                    await api.proctoring.registerFace(attemptId, imageBase64);
                } catch {}
                setTimeout(() => onComplete?.(), 1500);
                return;
            }

            if (result.status === "error") {
                setEnrollState(ENROLLMENT_STATES.FAILED);
                setError(result.message || "Face enrollment failed.");
                return;
            }

            if (result.status === "capturing") {
                setMessage(result.message || `Capturing face... (${newCaptured}/${REQUIRED_FRAMES})`);
                autoCaptureRef.current = setTimeout(() => {
                    setEnrollState(ENROLLMENT_STATES.NOT_STARTED);
                }, 400);
            }
        } catch (e) {
            setEnrollState(ENROLLMENT_STATES.FAILED);
            setError("Face registration failed: " + e.message);
        }
    }, [enrollState, previewRef, attemptId, onComplete]);

    useEffect(() => {
        return () => {
            if (autoCaptureRef.current) clearTimeout(autoCaptureRef.current);
        };
    }, []);

    const progressPct = Math.round((captured / REQUIRED_FRAMES) * 100);

    return (
        <div className="mx-auto max-w-lg">
            <Card className="border-zinc-800 bg-zinc-900/40">
                <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                    <div className={cn(
                        "flex h-16 w-16 items-center justify-center rounded-full",
                        enrollState === ENROLLMENT_STATES.ENROLLED
                            ? "bg-gradient-to-br from-emerald-500 to-green-600"
                            : "bg-gradient-to-br from-violet-500 to-indigo-600"
                    )}>
                        {enrollState === ENROLLMENT_STATES.ENROLLED
                            ? <CheckCircle2 className="h-8 w-8 text-white" />
                            : <ScanFace className="h-8 w-8 text-white" />
                        }
                    </div>

                    <h2 className="text-2xl font-bold text-white">
                        {enrollState === ENROLLMENT_STATES.ENROLLED ? "Face Enrolled" : "Face Enrollment"}
                    </h2>

                    <p className="text-sm text-zinc-400">
                        {enrollState === ENROLLMENT_STATES.ENROLLED
                            ? "Your identity has been registered for this assessment."
                            : "Position your face inside the camera frame. We'll capture multiple frames for reliable verification."
                        }
                    </p>

                    <div className="w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                        <video ref={previewRef} autoPlay playsInline muted className="h-52 w-full object-cover" />
                        <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-zinc-400">
                            <Camera className="h-3.5 w-3.5 text-emerald-400" /> Camera active
                        </div>
                    </div>

                    {captured > 0 && enrollState !== ENROLLMENT_STATES.ENROLLED && (
                        <div className="w-full space-y-2">
                            <div className="flex justify-between text-xs text-zinc-400">
                                <span>Capturing face...</span>
                                <span>{captured} / {REQUIRED_FRAMES}</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300"
                                    style={{ width: `${progressPct}%` }}
                                />
                            </div>
                            <p className="text-center text-xs text-zinc-500">Keep your face visible and steady</p>
                        </div>
                    )}

                    {error && (
                        <div className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                            {error}
                        </div>
                    )}

                    {message && !error && (
                        <p className="text-xs text-zinc-500">{message}</p>
                    )}

                    <div className="mt-2 flex flex-wrap justify-center gap-3">
                        {enrollState !== ENROLLMENT_STATES.ENROLLED && (
                            <Button onClick={captureAndEnroll} disabled={enrollState === ENROLLMENT_STATES.CAPTURING}>
                                <ScanFace className="h-4 w-4" />
                                {enrollState === ENROLLMENT_STATES.CAPTURING
                                    ? "Capturing..."
                                    : captured > 0
                                        ? "Capture Next Frame"
                                        : "Capture Face"
                                }
                            </Button>
                        )}
                        {enrollState === ENROLLMENT_STATES.ENROLLED && (
                            <Button onClick={onComplete}>
                                <CheckCircle2 className="h-4 w-4" /> Continue to Test
                            </Button>
                        )}
                        {enrollState !== ENROLLMENT_STATES.ENROLLED && (
                            <Button variant="outline" onClick={onCancel}>Cancel</Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
