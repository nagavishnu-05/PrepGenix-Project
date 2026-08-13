import { useRef, useState, useCallback, useEffect } from "react";
export function useCamera() {
    const videoRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [isActive, setIsActive] = useState(false);
    const [error, setError] = useState(null);
    const [retryCount, setRetryCount] = useState(0);
    const mountedRef = useRef(true);
    const streamRef = useRef(null);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
            }
        };
    }, []);
    const startCamera = useCallback(async () => {
        if (streamRef.current) {
            return;
        }
        try {
            setError(null);
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user", frameRate: { ideal: 15 } },
                audio: false,
            });
            if (!mountedRef.current) {
                mediaStream.getTracks().forEach((t) => t.stop());
                return;
            }
            streamRef.current = mediaStream;
            setStream(mediaStream);
            setIsActive(true);
            setRetryCount(0);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        }
        catch (err) {
            if (!mountedRef.current)
                return;
            setIsActive(false);
            if (err instanceof DOMException) {
                if (err.name === "NotAllowedError") {
                    setError("Camera access denied. Please allow camera permissions in your browser settings.");
                }
                else if (err.name === "NotFoundError") {
                    setError("No camera detected on this device.");
                }
                else if (err.name === "NotReadableError") {
                    setError("Camera is busy (another app may be using it).");
                }
                else {
                    setError(`Camera error: ${err.message}`);
                }
            }
            else {
                setError("Failed to access camera.");
            }
        }
    }, []);
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        setStream(null);
        setIsActive(false);
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);
    return { videoRef, stream, isActive, startCamera, stopCamera, error, retryCount };
}
