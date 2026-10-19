import { cn } from "@/lib/utils";
import { Video, VideoOff, Mic, MicOff, Maximize2, ScanFace, AlertTriangle } from "lucide-react";

function pillClasses(active) {
    return cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs",
        active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400",
    );
}

/**
 * Compact live status chips for an assessment in progress.
 * Both the interview room and the test flow render this so the signals
 * (camera, face, mic, fullscreen, monitor connection) look and behave the same.
 */
export function ProctoringStatusBar({ cameraActive, micActive, fullscreenActive, faceLabel, faceTone, monitorOnline = true }) {
    return (
        <div className="flex items-center gap-3">
            <span className={pillClasses(cameraActive)}>
                {cameraActive ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
                Cam
            </span>
            <span className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", faceTone)}>
                <ScanFace className="h-3.5 w-3.5" />
                {faceLabel}
            </span>
            <span className={pillClasses(micActive)}>
                {micActive ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                Mic
            </span>
            <span
                className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs",
                    fullscreenActive
                        ? "border-slate-300 bg-slate-100 text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        : "border-red-500/30 bg-red-500/10 text-red-400",
                )}
            >
                <Maximize2 className="h-3.5 w-3.5" />
                {fullscreenActive ? "Fullscreen" : "Not fullscreen"}
            </span>
            {!monitorOnline && (
                <span className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Monitor offline
                </span>
            )}
        </div>
    );
}

export default ProctoringStatusBar;
