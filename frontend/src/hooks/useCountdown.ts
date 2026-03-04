import { useState, useEffect, useRef } from "react";

export function useCountdown(lockTimestamp: number) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function calculate() {
      const now       = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, lockTimestamp - now);
      setSecondsLeft(remaining);
    }

    // Clear any existing interval
    if (intervalRef.current) clearInterval(intervalRef.current);

    calculate();
    intervalRef.current = setInterval(calculate, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [lockTimestamp]);

  // Force re-render every second regardless
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const now       = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, lockTimestamp - now);
  const total     = 5 * 60;
  const pct       = total > 0 ? Math.round((remaining / total) * 100) : 0;
  const m         = Math.floor(remaining / 60);
  const s         = remaining % 60;

  return {
    minutes: String(m).padStart(2, "0"),
    seconds: String(s).padStart(2, "0"),
    pct,
    secondsLeft: remaining,
  };
}
