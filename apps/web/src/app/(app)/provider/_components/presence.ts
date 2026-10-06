"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { IDLE_LOCATION_INTERVAL_SECONDS, type LatLng } from "@repo/shared";
import { ApiError, NetworkError } from "@/lib/api";
import { watchLocation } from "@/lib/geolocation";
import { sendLocation } from "@/lib/providers";

/**
 * While online, tells the server where this vulcanizer is every IDLE_LOCATION_INTERVAL_SECONDS.
 * The server switches a vulcanizer offline after 2 minutes of silence, so a phone that stops
 * sending (screen off, app closed, no signal) stops getting requests it couldn't answer.
 */
export function useLocationHeartbeat(active: boolean, onServerOffline: () => void) {
  const [problem, setProblem] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const latest = useRef<LatLng | null>(null);
  const serverOffline = useEffectEvent(onServerOffline);

  useEffect(() => {
    if (!active) return;
    // The browser pushes a new reading whenever the position changes; we keep only the latest...
    const stopWatching = watchLocation((fix) => {
      if (fix.state === "found") {
        latest.current = fix.location;
        setProblem(null);
      } else if (fix.state === "failed") {
        setProblem(fix.message);
      }
    });
    // ...and send it on a steady beat, so a moving phone doesn't flood the API.
    const timer = setInterval(async () => {
      if (!latest.current) return;
      try {
        const result = await sendLocation(latest.current);
        if (result.accepted) setLastSentAt(Date.now());
      } catch (error) {
        // 409: the server already set us offline (e.g. after the phone slept). Reflect it.
        if (error instanceof ApiError && error.status === 409) serverOffline();
        else if (error instanceof NetworkError) setProblem("No connection. Your location isn’t reaching RoadPal.");
      }
    }, IDLE_LOCATION_INTERVAL_SECONDS * 1000);

    return () => {
      stopWatching();
      clearInterval(timer);
      latest.current = null;
    };
  }, [active]);

  return { problem: active ? problem : null, lastSentAt };
}

/**
 * Keeps the screen on while online (Screen Wake Lock API). Phones stop running web pages when the
 * screen sleeps, which would silence the heartbeat. Returns false where the browser doesn't support it.
 */
export function useWakeLock(active: boolean) {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  useEffect(() => {
    if (!active || !supported) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (stopped) await lock.release();
      } catch {
        // Denied (e.g. battery saver): the heartbeat still works while the screen is on.
      }
    };
    // The browser drops the lock whenever the tab is hidden; take it again on return.
    const onVisibility = () => document.visibilityState === "visible" && void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => {});
    };
  }, [active, supported]);

  return supported;
}
