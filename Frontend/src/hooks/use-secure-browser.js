import { useEffect, useCallback, useRef } from "react";
import { useTestStore } from "@/store/test-store";
const BLOCKED_SHORTCUTS = [
    { key: "c", ctrl: true, name: "Copy" },
    { key: "v", ctrl: true, name: "Paste" },
    { key: "x", ctrl: true, name: "Cut" },
    { key: "a", ctrl: true, name: "Select All" },
    { key: "u", ctrl: true, name: "View Source" },
    { key: "s", ctrl: true, name: "Save" },
    { key: "p", ctrl: true, name: "Print" },
    { key: "shift", ctrl: true, name: "DevTools" },
    { key: "i", ctrl: true, name: "DevTools" },
    { key: "j", ctrl: true, name: "DevTools" },
];
export function useSecureBrowser() {
    const { addViolation } = useTestStore();
    const violationCooldown = useRef(new Map());
    const reportViolation = useCallback((type, description, severity) => {
        const now = Date.now();
        const lastTime = violationCooldown.current.get(type) || 0;
        if (now - lastTime < 5000)
            return;
        violationCooldown.current.set(type, now);
        addViolation({
            id: `v-${Date.now()}`,
            attemptId: "current",
            type: type,
            severity,
            description,
            timestamp: new Date().toISOString(),
        });
    }, [addViolation]);
    useEffect(() => {
        const handleContextMenu = (e) => {
            e.preventDefault();
            reportViolation("right_click", "Right-click attempted", "low");
        };
        const handleKeyDown = (e) => {
            const isCtrl = e.ctrlKey || e.metaKey;
            for (const shortcut of BLOCKED_SHORTCUTS) {
                if (e.key.toLowerCase() === shortcut.key && isCtrl === shortcut.ctrl) {
                    e.preventDefault();
                    reportViolation("keyboard_shortcut", `Blocked shortcut: ${shortcut.name}`, "low");
                    return;
                }
            }
            if (e.key === "F12") {
                e.preventDefault();
                reportViolation("devtools_open", "F12 key pressed", "medium");
            }
        };
        const handleVisibilityChange = () => {
            if (document.hidden) {
                reportViolation("tab_switch", "Tab became hidden", "high");
            }
        };
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                reportViolation("fullscreen_exit", "Exited fullscreen mode", "medium");
            }
        };
        const handleBlur = () => {
            reportViolation("window_switch", "Window lost focus", "medium");
        };
        const handleResize = () => {
            const diff = Math.abs(window.outerWidth - window.innerWidth);
            const diffH = Math.abs(window.outerHeight - window.innerHeight);
            if (diff > 200 || diffH > 200) {
                reportViolation("devtools_open", "Possible DevTools detected via window size", "high");
            }
        };
        const handleDragStart = (e) => e.preventDefault();
        const handleSelectStart = (e) => {
            const target = e.target;
            if (!target.closest('[data-selectable="true"]')) {
                if (!target.closest('.monaco-editor') && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
                    // Don't prevent, let CSS handle it
                }
            }
        };
        document.addEventListener("contextmenu", handleContextMenu);
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        window.addEventListener("blur", handleBlur);
        window.addEventListener("resize", handleResize);
        document.addEventListener("dragstart", handleDragStart);
        document.addEventListener("selectstart", handleSelectStart);
        const root = document.documentElement;
        if (root.requestFullscreen) {
            root.requestFullscreen().catch(() => { });
        }
        return () => {
            document.removeEventListener("contextmenu", handleContextMenu);
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            window.removeEventListener("blur", handleBlur);
            window.removeEventListener("resize", handleResize);
            document.removeEventListener("dragstart", handleDragStart);
            document.removeEventListener("selectstart", handleSelectStart);
        };
    }, [reportViolation]);
    return { reportViolation };
}
