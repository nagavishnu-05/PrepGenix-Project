const DEFAULT_MONITOR_INTERVAL_MS = 2000;
const MIN_MONITOR_INTERVAL_MS = 1500;
const MAX_MONITOR_INTERVAL_MS = 5000;

export function getProctoringApiBase() {
    const configuredBase = import.meta.env.VITE_PROCTORING_API?.trim();
    if (configuredBase) {
        const base = configuredBase.replace(/\/+$/, "");
        // In production (HTTPS), prefer HTTPS to avoid mixed content
        if (typeof window !== "undefined" && window.location.protocol === "https:" && base.startsWith("http://") && !base.includes("localhost") && !base.includes("127.0.0.1")) {
            // Try to upgrade to https if possible
            console.warn("VITE_PROCTORING_API uses http on an HTTPS page; attempting to use as-is but this will be blocked by browsers. Consider using https.");
        }
        return base;
    }
    if (import.meta.env.PROD) {
        console.error("VITE_PROCTORING_API is not set in production build. The proctoring API (port 5050) must be deployed separately and configured via VITE_PROCTORING_API.");
        // Try same-origin as a last resort - unlikely to work if deployed separately
        if (typeof window !== "undefined" && window.location?.origin) {
            return window.location.origin;
        }
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
