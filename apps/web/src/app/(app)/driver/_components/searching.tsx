"use client";

import { useEffect, useRef, useState } from "react";
import type { JobView, OfferView } from "@repo/shared";
import { Search } from "lucide-react";
import { buttonStyles } from "@/components/button-styles";
import { api, ApiError, NetworkError } from "@/lib/api";
import { acceptOffer } from "@/lib/jobs";
import { ISSUE_LABELS, VEHICLE_LABELS } from "@/lib/labels";
import { cancelRequest, type DriverRequest } from "@/lib/requests";
import { mmss, useSecondsLeft } from "@/lib/use-seconds-left";
import { useSession, useSocketEvent } from "../../_components/session";
import { OfferCard } from "./offer-card";

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof NetworkError ? error.message : "Something went wrong. Try again.";

// Quickest arrival first (they're stuck by the road), then cheapest.
const byArrivalThenPrice = (a: OfferView, b: OfferView) => a.etaMinutes - b.etaMinutes || a.priceNaira - b.priceNaira;

export function Searching({
  request,
  onChange,
  onAccepted,
  onCancelled,
  onStale,
}: {
  request: DriverRequest;
  onChange: (request: DriverRequest) => void;
  onAccepted: (job: JobView) => void;
  onCancelled: () => void;
  /** The request changed under us (accepted elsewhere, expired): reload the real state. */
  onStale: () => void;
}) {
  const { connection } = useSession();
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [widenedTo, setWidenedTo] = useState<{ km: number; notified: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const inFlight = useRef(false);
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

  function markGone(offerId: string, status: OfferView["status"]) {
    const offer = offers.find((o) => o.id === offerId && o.status === "pending");
    if (!offer) return;
    setOffers((list) => list.map((o) => (o.id === offerId ? { ...o, status } : o)));
    setNotice(`${offer.provider.name ?? "A vulcanizer"}’s offer is no longer available.`);
  }

  // De-duplicate by id: the same offer can arrive by push and by the catch-up fetch.
  useSocketEvent("offer:new", (offer) => {
    if (offer.requestId === request.id) setOffers((list) => [...list.filter((o) => o.id !== offer.id), offer]);
  });
  useSocketEvent("offer:withdrawn", ({ offerId }) => markGone(offerId, "withdrawn"));
  useSocketEvent("offer:expired", ({ offerId }) => markGone(offerId, "expired"));
  useSocketEvent("request:widened", ({ requestId, searchRadiusKm, newlyNotified }) => {
    if (requestId !== request.id) return;
    onChange({ ...request, searchRadiusKm });
    setWidenedTo({ km: searchRadiusKm, notified: newlyNotified });
  });

  async function accept(offer: OfferView) {
    if (inFlight.current) return;
    inFlight.current = true;
    setAccepting(offer.id);
    setProblem(null);
    setNotice(null);
    try {
      onAccepted(await acceptOffer(offer.id));
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      if (code === "REQUEST_NOT_OPEN") return onStale();
      // Taken by someone else, or withdrawn a moment ago: drop it and let them pick another.
      if (code === "OFFER_NOT_PENDING" || code === "PROVIDER_BUSY") {
        setOffers((list) => list.map((o) => (o.id === offer.id ? { ...o, status: "withdrawn" } : o)));
      }
      setProblem(messageOf(error));
    } finally {
      inFlight.current = false;
      setAccepting(null);
    }
  }

  async function cancel() {
    setCancelling(true);
    setProblem(null);
    try {
      await cancelRequest(request.id);
      onCancelled();
    } catch (error) {
      // Lost the race to an accept or the expiry: show whatever the request really is now.
      if (error instanceof ApiError && error.code === "REQUEST_NOT_OPEN") return onStale();
      setProblem(messageOf(error));
      setCancelling(false);
      setConfirmingCancel(false);
    }
  }

  const pending = offers.filter((o) => o.status === "pending").sort(byArrivalThenPrice);
  const cheapest = pending.length > 1 ? Math.min(...pending.map((o) => o.priceNaira)) : null;
  const searchLine = widenedTo
    ? `Searched wider: ${widenedTo.notified} more vulcanizer${widenedTo.notified === 1 ? "" : "s"} within ${widenedTo.km} km.`
    : `Asking vulcanizers within ${request.searchRadiusKm} km of you.`;

  return (
    <div className="flex flex-col gap-6">
      {pending.length === 0 ? (
        <div className="flex flex-col items-center gap-6 pt-4 text-center">
          <span className="relative flex size-20 items-center justify-center" aria-hidden="true">
            <span className="absolute inset-0 animate-ping rounded-full bg-signal/40 motion-reduce:hidden" />
            <span className="relative size-10 rounded-full bg-signal" />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Finding a vulcanizer</h1>
            <p className="text-muted" aria-live="polite">{searchLine}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex h-8 items-center gap-2 rounded-full bg-signal-soft px-3 text-sm font-semibold text-on-signal-soft">
              <span className="relative flex size-2.5" aria-hidden="true">
                <span className="absolute inline-flex size-full rounded-full bg-signal opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2.5 rounded-full bg-signal" />
              </span>
              <Search size={15} strokeWidth={2.4} aria-hidden="true" />
              Still looking · {request.searchRadiusKm} km
            </span>
            <span className="text-sm text-muted tabular-nums">{mmss(secondsLeft)} left</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight" aria-live="polite">
            {pending.length} offer{pending.length > 1 ? "s" : ""} so far
          </h1>
          <p className="text-sm text-muted">
            {ISSUE_LABELS[request.issueType]} · {VEHICLE_LABELS[request.vehicleType]}. You pay cash when the job is done.
          </p>
        </div>
      )}

      {notice && (
        <p role="status" className="rounded-2xl bg-info-soft px-4 py-3 text-sm font-semibold text-on-info-soft">
          {notice}
        </p>
      )}
      {problem && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft">
          {problem}
        </p>
      )}

      {pending.length > 0 ? (
        <ul className="flex flex-col gap-3" aria-label="Offers">
          {pending.map((offer, i) => (
            <li key={offer.id}>
              <OfferCard
                offer={offer}
                badge={i === 0 && pending.length > 1 ? "Fastest" : offer.priceNaira === cheapest && i !== 0 ? "Cheapest" : undefined}
                accepting={accepting === offer.id}
                disabled={accepting !== null || cancelling}
                onAccept={() => accept(offer)}
              />
            </li>
          ))}
        </ul>
      ) : (
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
      )}

      {confirmingCancel ? (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-border p-4">
          <p className="font-bold">Cancel this request?{pending.length ? " Vulcanizers who sent offers will be told." : ""}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmingCancel(false)} disabled={cancelling} className={buttonStyles({ variant: "outline", size: "sm" })}>
              Keep looking
            </button>
            <button type="button" onClick={cancel} disabled={cancelling} className={buttonStyles({ variant: "primary", size: "sm" })}>
              {cancelling ? "Cancelling…" : "Yes, cancel"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingCancel(true)}
          disabled={accepting !== null}
          className={buttonStyles({ variant: "outline", className: "w-full" })}
        >
          Cancel request
        </button>
      )}
    </div>
  );
}
