"use client";

import { useSyncExternalStore } from "react";
import { isServerSlow, subscribeToSlowRequests } from "@/lib/api";

/**
 * Explains a long wait instead of leaving a silent spinner: the free API host sleeps after 15
 * quiet minutes and takes about a minute to wake. Appears only while a request is slow.
 */
export function WakingServerNotice() {
  const slow = useSyncExternalStore(subscribeToSlowRequests, isServerSlow, () => false);
  if (!slow) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <p
        role="status"
        className="flex max-w-md items-center gap-3 rounded-2xl bg-text px-4 py-3 text-sm font-semibold text-ground shadow-lg motion-safe:animate-rise"
      >
        <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-ground/30 border-t-ground motion-reduce:animate-none" aria-hidden="true" />
        Waking up the server… after a quiet spell this can take up to a minute.
      </p>
    </div>
  );
}
