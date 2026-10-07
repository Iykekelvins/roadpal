"use client";

import { useEffect } from "react";

/**
 * Starts waking the API while someone reads the landing page, so it's likely ready by the time
 * they tap "Get help". /health/live doesn't touch the database or count as app activity.
 */
export function WakeServer() {
  useEffect(() => {
    fetch("/api/health/live", { cache: "no-store" }).catch(() => {});
  }, []);
  return null;
}
