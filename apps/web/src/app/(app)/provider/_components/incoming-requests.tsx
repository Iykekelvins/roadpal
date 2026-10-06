"use client";

import { useEffect, useState } from "react";
import { CreateOfferSchema, type JobView, type NearbyRequest } from "@repo/shared";
import { Clock, MapPin } from "lucide-react";
import { buttonStyles } from "@/components/button-styles";
import { ApiError, describeError } from "@/lib/api";
import { formatDistance, formatNaira } from "@/lib/format";
import { ISSUE_LABELS, VEHICLE_LABELS } from "@/lib/labels";
import { getNearbyRequests, makeOffer } from "@/lib/providers";
import { mmss, useNow } from "@/lib/use-seconds-left";
import { useSession, useSocketEvent } from "../../_components/session";

const REFRESH_MS = 30_000;
const PRICE_CHOICES = [2000, 3000, 4000, 5000];
const ETA_CHOICES = [5, 10, 15, 20, 30];

type MyOffer = NonNullable<NearbyRequest["myOffer"]>;

/**
 * Requests near an online vulcanizer. The feed is the truth (on going online, on reconnect, and
 * every 30s so requests taken by someone else drop off); live pushes add new ones in between.
 */
export function IncomingRequests({ onAccepted }: { onAccepted: (job: JobView) => void }) {
  const { connection } = useSession();
  const [requests, setRequests] = useState<NearbyRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const now = useNow();

  useEffect(() => {
    let ignore = false;
    const load = () =>
      getNearbyRequests().then(
        (list) => {
          if (ignore) return;
          setRequests(list);
          setLoaded(true);
        },
        () => {}, // keep showing what we have; the next refresh or reconnect retries
      );
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [connection]);

  const patchOffer = (requestId: string, change: Partial<MyOffer>) =>
    setRequests((list) => list.map((r) => (r.id === requestId && r.myOffer ? { ...r, myOffer: { ...r.myOffer, ...change } } : r)));

  useSocketEvent("request:new", (request) =>
    setRequests((list) => (list.some((r) => r.id === request.id) ? list : [...list, request].sort((a, b) => a.distanceMeters - b.distanceMeters))),
  );
  useSocketEvent("offer:rejected", ({ requestId }) => patchOffer(requestId, { status: "rejected" }));
  useSocketEvent("offer:expired", ({ requestId }) => patchOffer(requestId, { status: "expired" }));
  useSocketEvent("offer:accepted", (job) => onAccepted(job));

  // Expiry is swept on the server every 30s; hide expired ones right away on screen.
  const visible = requests.filter((r) => new Date(r.expiresAt).getTime() > now);

  return (
    <section aria-labelledby="incoming" className="flex flex-col gap-3">
      <h2 id="incoming" className="font-extrabold">
        Requests near you{visible.length ? ` (${visible.length})` : ""}
      </h2>
      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          {loaded ? "No requests right now. New ones appear here as drivers ask for help." : "Looking for requests…"}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((request) => (
            <li key={request.id}>
              <RequestCard
                request={request}
                now={now}
                onOffered={(offer) => setRequests((list) => list.map((r) => (r.id === request.id ? { ...r, myOffer: offer } : r)))}
                onGone={() => setRequests((list) => list.filter((r) => r.id !== request.id))}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestCard({
  request,
  now,
  onOffered,
  onGone,
}: {
  request: NearbyRequest;
  now: number;
  onOffered: (offer: MyOffer) => void;
  onGone: () => void;
}) {
  const [offering, setOffering] = useState(false);
  const minutesAgo = Math.max(0, Math.floor((now - new Date(request.createdAt).getTime()) / 60_000));
  const secondsLeft = Math.max(0, Math.round((new Date(request.expiresAt).getTime() - now) / 1000));
  const offer = request.myOffer;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 motion-safe:animate-rise">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-lg font-extrabold">{ISSUE_LABELS[request.issueType]}</span>
          <span className="text-sm text-muted">
            {VEHICLE_LABELS[request.vehicleType]} · {minutesAgo === 0 ? "just now" : `${minutesAgo} min ago`}
          </span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-soft px-3 py-1 text-sm font-bold text-on-neutral-soft">
          <MapPin size={14} aria-hidden="true" />
          {formatDistance(request.distanceMeters)}
        </span>
      </div>

      {request.note && <p className="rounded-xl bg-neutral-soft px-3 py-2 text-sm text-on-neutral-soft">“{request.note}”</p>}

      {offer ? (
        <OfferStatus offer={offer} />
      ) : offering ? (
        <OfferForm request={request} onSent={onOffered} onGone={onGone} onCancel={() => setOffering(false)} />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-muted tabular-nums">
            <Clock size={15} aria-hidden="true" />
            Closes in {mmss(secondsLeft)}
          </span>
          <button type="button" onClick={() => setOffering(true)} className={buttonStyles({ variant: "signal", size: "sm" })}>
            Send a price
          </button>
        </div>
      )}
    </article>
  );
}

function OfferStatus({ offer }: { offer: MyOffer }) {
  const summary = `${formatNaira(offer.priceNaira)} · ~${offer.etaMinutes} min`;
  const text = {
    pending: { line: `Offer sent: ${summary}`, detail: "Waiting for the driver to choose.", tone: "bg-primary-soft text-on-primary-soft" },
    accepted: { line: `Accepted: ${summary}`, detail: "Opening the job…", tone: "bg-primary-soft text-on-primary-soft" },
    rejected: { line: "The driver chose someone else.", detail: "More requests will come.", tone: "bg-neutral-soft text-on-neutral-soft" },
    withdrawn: { line: "Your offer was withdrawn.", detail: "You went offline or took another job.", tone: "bg-neutral-soft text-on-neutral-soft" },
    expired: { line: "Your offer expired.", detail: "Offers last 5 minutes so prices stay current.", tone: "bg-neutral-soft text-on-neutral-soft" },
  }[offer.status];
  return (
    <div role="status" className={`flex flex-col gap-0.5 rounded-xl px-3 py-2 text-sm ${text.tone}`}>
      <span className="font-extrabold">{text.line}</span>
      <span>{text.detail}</span>
    </div>
  );
}

function OfferForm({
  request,
  onSent,
  onGone,
  onCancel,
}: {
  request: NearbyRequest;
  onSent: (offer: MyOffer) => void;
  onGone: () => void;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState("");
  const [eta, setEta] = useState(10);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = CreateOfferSchema.safeParse({ priceNaira: Number(price.replace(/\D/g, "")), etaMinutes: eta });
    if (!parsed.success) return setProblem(parsed.error.issues[0]!.message);
    setBusy(true);
    setProblem(null);
    try {
      const sent = await makeOffer(request.id, parsed.data);
      onSent({ id: sent.id, priceNaira: sent.priceNaira, etaMinutes: sent.etaMinutes, status: sent.status });
    } catch (error) {
      // Taken, cancelled or expired a moment ago: drop the card.
      if (error instanceof ApiError && error.status === 404) return onGone();
      setProblem(describeError(error, "Couldn’t send your price. Try again."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 border-t border-border pt-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold">Your price</span>
        <span className="flex h-12 items-center rounded-xl border-2 border-border bg-ground transition-colors focus-within:border-primary">
          <span className="pl-4 text-lg font-bold text-muted">₦</span>
          <input
            inputMode="numeric"
            autoFocus
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d,]/g, ""))}
            placeholder="3,500"
            className="h-full min-w-0 flex-1 rounded-r-xl bg-transparent px-2 text-lg font-bold tabular-nums outline-none placeholder:font-normal placeholder:text-muted/70"
          />
        </span>
        <span className="flex flex-wrap gap-2">
          {PRICE_CHOICES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrice(String(p))}
              className="rounded-full border border-border px-3 py-1 text-sm font-bold transition-colors hover:border-muted"
            >
              {formatNaira(p)}
            </button>
          ))}
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">You can get there in</legend>
        <div className="grid grid-cols-5 gap-1.5">
          {ETA_CHOICES.map((m) => (
            <label
              key={m}
              className="flex h-10 items-center justify-center rounded-xl border-2 border-border text-sm font-bold transition-colors has-checked:border-primary has-checked:bg-primary-soft has-checked:text-on-primary-soft has-focus-visible:outline-3 has-focus-visible:outline-primary"
            >
              <input type="radio" name={`eta-${request.id}`} checked={eta === m} onChange={() => setEta(m)} className="sr-only" />
              {m} min
            </label>
          ))}
        </div>
      </fieldset>

      {problem && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-on-danger-soft">
          {problem}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={buttonStyles({ variant: "outline", size: "sm" })}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !price} className={buttonStyles({ variant: "primary", size: "sm" })}>
          {busy ? "Sending…" : "Send offer"}
        </button>
      </div>
    </form>
  );
}
