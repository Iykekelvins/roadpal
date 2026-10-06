"use client";

import { useEffect, useState } from "react";
import type { OfferView } from "@repo/shared";
import { buttonStyles } from "@/components/button-styles";
import { api, ApiError, NetworkError } from "@/lib/api";
import { ISSUE_LABELS, VEHICLE_LABELS } from "@/lib/labels";
import { cancelRequest, getActiveRequest, type DriverRequest } from "@/lib/requests";
import { useSession, useSocketEvent } from "../../_components/session";

function useSecondsLeft(until: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function Searching({
  request,
  onChange,
  onCancelled,
}: {
  request: DriverRequest;
  onChange: (request: DriverRequest) => void;
  onCancelled: () => void;
}) {
  const { connection } = useSession();
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [widenedTo, setWidenedTo] = useState<{ km: number; notified: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const secondsLeft = useSecondsLeft(request.expiresAt);

  // REST catch-up on mount and after every reconnect; pushes keep it current in between.
  useEffect(() => {
    let ignore = false;
    api<{ offers: OfferView[] }>(`/requests/${request.id}/offers`)
      .then(({ offers }) => !ignore && setOffers(offers))
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [request.id, connection]);

  const setStatus = (offerId: string, status: OfferView["status"]) =>
    setOffers((list) => list.map((o) => (o.id === offerId ? { ...o, status } : o)));

  // De-duplicate by id: the same offer can arrive by push and by the catch-up fetch.
  useSocketEvent("offer:new", (offer) => {
    if (offer.requestId === request.id) setOffers((list) => [...list.filter((o) => o.id !== offer.id), offer]);
  });
  useSocketEvent("offer:withdrawn", ({ offerId }) => setStatus(offerId, "withdrawn"));
  useSocketEvent("offer:expired", ({ offerId }) => setStatus(offerId, "expired"));
  useSocketEvent("request:widened", ({ requestId, searchRadiusKm, newlyNotified }) => {
    if (requestId !== request.id) return;
    onChange({ ...request, searchRadiusKm });
    setWidenedTo({ km: searchRadiusKm, notified: newlyNotified });
  });

  async function cancel() {
    setBusy(true);
    setProblem(null);
    try {
      await cancelRequest(request.id);
      onCancelled();
    } catch (error) {
      // Lost the race to an accept or the expiry: show whatever the request really is now.
      if (error instanceof ApiError && error.code === "REQUEST_NOT_OPEN") {
        const active = await getActiveRequest().catch(() => undefined);
        if (active) return onChange(active);
        if (active === null) return onCancelled();
      }
      setProblem(error instanceof ApiError || error instanceof NetworkError ? error.message : "Couldn’t cancel. Try again.");
      setBusy(false);
      setConfirming(false);
    }
  }

  const pending = offers.filter((o) => o.status === "pending");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-6 pt-4 text-center">
        <span className="relative flex size-20 items-center justify-center" aria-hidden="true">
          <span className="absolute inset-0 animate-ping rounded-full bg-signal/40 motion-reduce:hidden" />
          <span className="relative size-10 rounded-full bg-signal" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {pending.length ? `${pending.length} offer${pending.length > 1 ? "s" : ""} in` : "Finding a vulcanizer"}
          </h1>
          <p className="text-muted" aria-live="polite">
            {widenedTo
              ? `Searched wider: ${widenedTo.notified} more vulcanizer${widenedTo.notified === 1 ? "" : "s"} within ${widenedTo.km} km.`
              : `Asking vulcanizers within ${request.searchRadiusKm} km of you.`}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface text-center">
        <div className="flex flex-col gap-1 p-4">
          <dt className="text-xs font-bold text-muted">Issue</dt>
          <dd className="text-sm font-extrabold">{ISSUE_LABELS[request.issueType]}</dd>
        </div>
        <div className="flex flex-col gap-1 p-4">
          <dt className="text-xs font-bold text-muted">Vehicle</dt>
          <dd className="text-sm font-extrabold">{VEHICLE_LABELS[request.vehicleType]}</dd>
        </div>
        <div className="flex flex-col gap-1 p-4">
          <dt className="text-xs font-bold text-muted">Expires in</dt>
          <dd className="text-sm font-extrabold tabular-nums">{mmss(secondsLeft)}</dd>
        </div>
      </dl>

      <p className="rounded-2xl bg-neutral-soft px-4 py-3 text-sm text-on-neutral-soft">
        Offers appear here as they arrive: price, arrival time and rating. Choosing one comes in the next update.
      </p>

      {problem && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft">
          {problem}
        </p>
      )}

      {confirming ? (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-border p-4">
          <p className="font-bold">Cancel this request?{pending.length ? " Vulcanizers who sent offers will be told." : ""}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={buttonStyles({ variant: "outline", size: "sm" })}>
              Keep looking
            </button>
            <button type="button" onClick={cancel} disabled={busy} className={buttonStyles({ variant: "primary", size: "sm" })}>
              {busy ? "Cancelling…" : "Yes, cancel"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={buttonStyles({ variant: "outline", className: "w-full" })}>
          Cancel request
        </button>
      )}
    </div>
  );
}
