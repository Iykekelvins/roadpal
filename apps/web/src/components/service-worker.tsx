"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production only. In development a service worker caching /_next/static
 * would fight hot reloading, so any leftover one is removed instead.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    } else {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
    }
  }, []);
  return null;
}
