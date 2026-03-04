import { useState, useEffect } from "react";

export function useCountdown(lockTimestamp: number) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    function calculate() {
      const now       = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, lockTimestamp - now);
      setSecondsLeft(remaining);
    }
    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [lockTimestamp]);

  const total = 5 * 60;
  const pct   = total > 0 ? Math.round((secondsLeft / total) * 100) : 0;
  const m     = Math.floor(secondsLeft / 60);
  const s     = secondsLeft % 60;

  return {
    minutes: String(m).padStart(2, "0"),
    seconds: String(s).padStart(2, "0"),
    pct,
    secondsLeft,
  };
}
