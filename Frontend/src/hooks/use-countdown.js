import { useState, useEffect, useCallback, useRef } from "react";
export function useCountdown(totalSeconds, onComplete) {
    const [seconds, setSeconds] = useState(totalSeconds);
    const [isRunning, setIsRunning] = useState(false);
    const intervalRef = useRef(null);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    useEffect(() => {
        if (!isRunning || seconds <= 0)
            return;
        intervalRef.current = setInterval(() => {
            setSeconds((prev) => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current);
                    setIsRunning(false);
                    onCompleteRef.current?.();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            if (intervalRef.current)
                clearInterval(intervalRef.current);
        };
    }, [isRunning, seconds]);
    const start = useCallback(() => setIsRunning(true), []);
    const pause = useCallback(() => setIsRunning(false), []);
    const reset = useCallback((newSeconds) => {
        setSeconds(newSeconds ?? totalSeconds);
        setIsRunning(false);
    }, [totalSeconds]);
    const percentage = totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0;
    const isLow = seconds < totalSeconds * 0.25;
    const isWarning = seconds < totalSeconds * 0.5;
    return { seconds, isRunning, percentage, isLow, isWarning, start, pause, reset };
}
