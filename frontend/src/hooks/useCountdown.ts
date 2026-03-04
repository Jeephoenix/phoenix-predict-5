import { useState, useEffect } from "react";

export function useCountdown(secondsLeft: number) {
  const [display, setDisplay] = useState({ minutes: "00", seconds: "00", pct: 100 });

  useEffect(() => {
    const total = 5 * 60; // 5 minutes
    const remaining = Math.max(0, secondsLeft);
    const pct = Math.round((remaining / total) * 100);
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    setDisplay({
      minutes: String(m).padStart(2, "0"),
      seconds: String(s).padStart(2, "0"),
      pct,
    });
  }, [secondsLeft]);

  return display;
}
