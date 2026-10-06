"use client";

import { OFFER_TTL_MINUTES, type OfferView } from "@repo/shared";
import { Clock, MapPin, Star } from "lucide-react";
import { buttonStyles } from "@/components/button-styles";
import { formatDistance, formatNaira } from "@/lib/format";
import { mmss, useSecondsLeft } from "@/lib/use-seconds-left";

const initials = (name: string | null) =>
  (name ?? "Vulcanizer")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export function OfferCard({
  offer,
  badge,
  accepting,
  disabled,
  onAccept,
}: {
  offer: OfferView;
  /** "Fastest" / "Cheapest": helps compare at a glance. */
  badge?: string;
  accepting: boolean;
  disabled: boolean;
  onAccept: () => void;
}) {
  const expiresAt = new Date(new Date(offer.createdAt).getTime() + OFFER_TTL_MINUTES * 60_000).toISOString();
  const secondsLeft = useSecondsLeft(expiresAt);
  const { provider } = offer;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 motion-safe:animate-rise">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft font-extrabold text-on-primary-soft" aria-hidden="true">
            {initials(provider.name)}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-bold">{provider.name ?? "Vulcanizer"}</span>
            <span className="inline-flex items-center gap-1 text-sm text-muted">
              {provider.ratingAvg !== null ? (
                <>
                  <Star size={14} className="fill-current text-signal" aria-hidden="true" />
                  {provider.ratingAvg.toFixed(1)} · {provider.ratingCount} rating{provider.ratingCount === 1 ? "" : "s"}
                </>
              ) : (
                "New on RoadPal"
              )}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-2xl font-extrabold tracking-tight tabular-nums">{formatNaira(offer.priceNaira)}</span>
          {badge && (
            <span className="rounded-full bg-signal-soft px-2 py-0.5 text-xs font-extrabold text-on-signal-soft">{badge}</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Clock size={15} aria-hidden="true" />
          Arrives in ~{offer.etaMinutes} min
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={15} aria-hidden="true" />
          {formatDistance(offer.distanceMeters)} away
        </span>
        {secondsLeft > 0 && secondsLeft <= 120 && (
          <span className="tabular-nums text-on-signal-soft">Offer ends in {mmss(secondsLeft)}</span>
        )}
      </div>

      <button type="button" onClick={onAccept} disabled={disabled} className={buttonStyles({ variant: "primary", size: "sm", className: "h-12 w-full" })}>
        {accepting ? "Accepting…" : `Accept ${formatNaira(offer.priceNaira)}`}
      </button>
    </article>
  );
}
