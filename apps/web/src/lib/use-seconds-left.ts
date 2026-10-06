"use client";

import { useEffect, useState } from "react";

/**
 * Seconds until `until` (ISO time), ticking every second. Display only: it uses this device's
 * clock, which can be off, so the server still decides what has actually expired.
 */
export function useSecondsLeft(until: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
}

export const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
