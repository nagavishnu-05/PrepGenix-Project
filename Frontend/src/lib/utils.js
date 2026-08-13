import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
export function formatDate(date) {
    return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}
export function formatDateTime(date) {
    return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
export function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0)
        return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
export function formatDuration(minutes) {
    if (minutes < 60)
        return `${minutes}m`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}
export function getDifficultyColor(difficulty) {
    switch (difficulty.toLowerCase()) {
        case "easy": return "text-emerald-400";
        case "medium": return "text-amber-400";
        case "hard": return "text-red-400";
        default: return "text-zinc-400";
    }
}
export function getDifficultyBg(difficulty) {
    switch (difficulty.toLowerCase()) {
        case "easy": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
        case "medium": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
        case "hard": return "bg-red-500/10 text-red-400 border-red-500/20";
        default: return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
}
export function getViolationSeverityColor(severity) {
    switch (severity.toLowerCase()) {
        case "low": return "text-yellow-400 bg-yellow-500/10";
        case "medium": return "text-orange-400 bg-orange-500/10";
        case "high": return "text-red-400 bg-red-500/10";
        case "critical": return "text-red-500 bg-red-600/10";
        default: return "text-zinc-400 bg-zinc-500/10";
    }
}
export function generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
export function truncate(str, length) {
    if (str.length <= length)
        return str;
    return str.slice(0, length) + "...";
}
export function calculatePercentage(value, total) {
    if (total === 0)
        return 0;
    return Math.round((value / total) * 100);
}
