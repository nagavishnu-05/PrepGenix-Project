import { useEffect, useRef } from "react";

// Keys must match the attention states the analyzer actually emits
// (focused | distracted | uncertain | absent). The old keys
// (doubtful / looking_away) never matched, so any "distracted" or "uncertain"
// frame silently fell through to the `absent` style and rendered "No face"
// on top of a verified face. The aliases are kept so alternate backends still
// resolve to a sensible label instead of the "No face" fallback.
const ATTENTION_STYLES = {
    focused: { label: "Focused", dot: "bg-emerald-400", text: "text-emerald-300", stroke: "rgba(52,211,153,0.9)" },
    distracted: { label: "Looking away", dot: "bg-red-400", text: "text-red-300", stroke: "rgba(248,113,113,0.9)" },
    uncertain: { label: "Uncertain", dot: "bg-amber-400", text: "text-amber-300", stroke: "rgba(251,191,36,0.9)" },
    absent: { label: "No face", dot: "bg-zinc-500", text: "text-zinc-400", stroke: "rgba(161,161,170,0.7)" },
    doubtful: { label: "Uncertain", dot: "bg-amber-400", text: "text-amber-300", stroke: "rgba(251,191,36,0.9)" },
    looking_away: { label: "Looking away", dot: "bg-red-400", text: "text-red-300", stroke: "rgba(248,113,113,0.9)" },
};

/**
 * Draws a single face box over the camera preview.
 *
 * The underlying model reports 478 landmarks, but rendering the full mesh is
 * noisy at PIP size. The box is derived from the landmark extent, so it still
 * tracks the real face without drawing hundreds of segments.
 */
export default function FaceAttentionOverlay({ metrics, width = 176, height = 132, showBox = true }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const landmarks = metrics?.landmarks;
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        if (!showBox || !Array.isArray(landmarks) || landmarks.length === 0) return;

        // Landmarks arrive in pixels of the captured frame (320px wide). Fit
        // their bounding box into the visible PIP once, here, rather than
        // assuming the capture frame matches the displayed element.
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const [x, y] of landmarks) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;

        const srcW = maxX - minX || 1;
        const srcH = maxY - minY || 1;

        // Contain the mesh inside the PIP, then pad it out to a square-ish
        // frame with a margin so the box sits slightly outside the face.
        const margin = 0.14;
        const scale = Math.min(width / (srcW * (1 + margin * 2)), height / (srcH * (1 + margin * 2)));
        const boxW = srcW * (1 + margin * 2) * scale;
        const boxH = srcH * (1 + margin * 2) * scale;
        const boxX = (width - boxW) / 2;
        const boxY = (height - boxH) / 2;

        const state = ATTENTION_STYLES[metrics?.attention_state] || ATTENTION_STYLES.absent;

        ctx.lineWidth = 2;
        ctx.strokeStyle = state.stroke;

        if (typeof ctx.roundRect === "function") {
            ctx.beginPath();
            ctx.roundRect(boxX, boxY, boxW, boxH, 10);
            ctx.stroke();
        } else {
            ctx.strokeRect(boxX, boxY, boxW, boxH);
        }

        // Corner ticks give a light "scanning" cue without extra clutter.
        const tick = Math.min(boxW, boxH) * 0.16;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(boxX, boxY + tick);
        ctx.lineTo(boxX, boxY);
        ctx.lineTo(boxX + tick, boxY);
        ctx.moveTo(boxX + boxW - tick, boxY);
        ctx.lineTo(boxX + boxW, boxY);
        ctx.lineTo(boxX + boxW, boxY + tick);
        ctx.moveTo(boxX + boxW, boxY + boxH - tick);
        ctx.lineTo(boxX + boxW, boxY + boxH);
        ctx.lineTo(boxX + boxW - tick, boxY + boxH);
        ctx.moveTo(boxX + tick, boxY + boxH);
        ctx.lineTo(boxX, boxY + boxH);
        ctx.lineTo(boxX, boxY + boxH - tick);
        ctx.stroke();
    }, [metrics, width, height, showBox]);

    const state = ATTENTION_STYLES[metrics?.attention_state] || ATTENTION_STYLES.absent;

    return (
        <div className="pointer-events-none absolute inset-0">
            <canvas ref={canvasRef} style={{ width: `${width}px`, height: `${height}px` }} className="absolute inset-0" />
            <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px]">
                <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />
                <span className={state.text}>{state.label}</span>
            </div>
        </div>
    );
}
