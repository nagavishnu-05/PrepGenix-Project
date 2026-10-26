const DEFAULT_MONITOR_INTERVAL_MS = 2000;
const MIN_MONITOR_INTERVAL_MS = 1500;
const MAX_MONITOR_INTERVAL_MS = 5000;

export function getProctoringApiBase() {
    const configuredBase = import.meta.env.VITE_PROCTORING_API?.trim();
    if (configuredBase) return configuredBase.replace(/\/+$/, "");
    if (import.meta.env.PROD) {
        throw new Error("VITE_PROCTORING_API must point to the hosted proctoring service.");
    }
    return "http://localhost:5050";
}

export function getProctoringMonitorIntervalMs() {
    const configuredInterval = Number.parseInt(import.meta.env.VITE_FACE_CHECK_INTERVAL_MS || "", 10);
    if (!Number.isFinite(configuredInterval) || configuredInterval <= 0) return DEFAULT_MONITOR_INTERVAL_MS;
    return Math.min(MAX_MONITOR_INTERVAL_MS, Math.max(MIN_MONITOR_INTERVAL_MS, configuredInterval));
}

export async function resetProctoringMonitor(attemptId) {
    const response = await fetch(`${getProctoringApiBase()}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
    });
    if (!response.ok) throw new Error(`Proctoring service returned HTTP ${response.status}`);
}
