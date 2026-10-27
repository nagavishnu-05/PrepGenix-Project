const DEFAULT_MONITOR_INTERVAL_MS = 2000;
const MIN_MONITOR_INTERVAL_MS = 1500;
const MAX_MONITOR_INTERVAL_MS = 5000;

export function getProctoringApiBase() {
    const configuredBase = import.meta.env.VITE_PROCTORING_API?.trim();
    if (configuredBase) return configuredBase.replace(/\/+$/, "");
    if (import.meta.env.PROD) {
        // Fallback to common relative patterns or same origin proxy if configured
        // Avoid throwing hard in production to prevent breaking camera monitoring
        console.error("VITE_PROCTORING_API is not set in production build. Falling back to same-origin /proctoring or localhost:5050 may not work.");
        // Try to use a reasonable fallback
        return (typeof window !== "undefined" && window.location?.origin ? `${window.location.origin.replace(/\/$/, "")}:5050` : "http://localhost:5050");
    }
    return "http://localhost:5050";
}

export function getProctoringMonitorIntervalMs() {
    const configuredInterval = Number.parseInt(import.meta.env.VITE_FACE_CHECK_INTERVAL_MS || "", 10);
    if (!Number.isFinite(configuredInterval) || configuredInterval <= 0) return DEFAULT_MONITOR_INTERVAL_MS;
    return Math.min(MAX_MONITOR_INTERVAL_MS, Math.max(MIN_MONITOR_INTERVAL_MS, configuredInterval));
}

export async function resetProctoringMonitor(attemptId) {
    let base;
    try {
        base = getProctoringApiBase();
    } catch (err) {
        console.error("Cannot reset proctoring monitor:", err.message);
        return;
    }
    try {
        const response = await fetch(`${base}/reset`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attemptId }),
        });
        if (!response.ok) throw new Error(`Proctoring service returned HTTP ${response.status}`);
    } catch (err) {
        console.error("resetProctoringMonitor failed:", err.message);
    }
}
