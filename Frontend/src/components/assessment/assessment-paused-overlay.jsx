import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Video, Maximize } from "lucide-react";

/**
 * Shared overlay shown when an assessment is blocked by proctoring or readiness.
 * Both the interview room and the test flow use this so the pause/resume wording
 * and actions stay consistent.
 */
export function AssessmentPausedOverlay({
    title,
    message,
    proctorError,
    mediaError,
    error,
    showReenableCamera = false,
    onReenableCamera,
    canResume = true,
    onResume,
    resumeLabel = "Resume assessment",
    resumeIcon = <Maximize className="h-4 w-4" />,
    disabled = false,
    modal = false,
}) {
    return (
        <div
            className={modal ? "fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" : undefined}
            role={modal ? "dialog" : undefined}
            aria-modal={modal ? "true" : undefined}
            aria-labelledby={modal ? "assessment-paused-title" : undefined}
        >
        <Card className={`border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10${modal ? " w-full max-w-md shadow-2xl" : ""}`}>
            <CardContent className={modal ? "flex flex-col gap-4 p-6" : "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"}>
                <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                        <p id={modal ? "assessment-paused-title" : undefined} className="font-semibold text-amber-900 dark:text-amber-200">{title}</p>
                        <p className="text-sm text-amber-800 dark:text-amber-300">{message}</p>
                        {proctorError && <p className="mt-1 text-sm text-red-700 dark:text-red-300">{proctorError}</p>}
                        {mediaError && <p className="mt-1 text-sm text-red-700 dark:text-red-300">{mediaError}</p>}
                        {error && <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>}
                    </div>
                </div>
                <div className={modal ? "flex flex-wrap justify-end gap-2" : "flex flex-wrap gap-2"}>
                    {showReenableCamera && (
                        <Button variant="outline" onClick={onReenableCamera} disabled={disabled} type="button">
                            <Video className="h-4 w-4" /> Re-enable camera &amp; mic
                        </Button>
                    )}
                    <Button onClick={onResume} disabled={!canResume || disabled} type="button">
                        {resumeIcon} {resumeLabel}
                    </Button>
                </div>
            </CardContent>
        </Card>
        </div>
    );
}

export default AssessmentPausedOverlay;
