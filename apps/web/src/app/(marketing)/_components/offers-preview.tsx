import { Clock, MapPin, Search, Star } from "lucide-react";
import { formatNaira } from "@/lib/format";

// Illustrative sample, not live data. Folders starting with "_" are private: never routes.
const SAMPLE_OFFERS = [
  { initials: "BV", name: "Bayo Vulcanizer", rating: "4.6", jobs: 58, price: 3500, eta: "8 min", distance: "2.0 km" },
  { initials: "ET", name: "Emeka Tyres", rating: "4.8", jobs: 124, price: 4000, eta: "12 min", distance: "3.2 km" },
];

/** `offerDelaysMs`: when each sample offer drops in, so the hero can chain it into its timeline. */
export function OffersPreview({ offerDelaysMs = [] }: { offerDelaysMs?: number[] }) {
  return (
    <figure className="mx-auto w-full max-w-sm">
      <div className="flex flex-col gap-3 rounded-[28px] border border-border bg-surface p-4 shadow-[0_24px_60px_-30px_rgb(0_0_0/0.35)]">
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="inline-flex h-8 items-center gap-2 rounded-full bg-signal-soft px-3 text-sm font-semibold text-on-signal-soft">
            {/* Live dot: the ring pings outward while a request is being broadcast. */}
            <span className="relative flex size-2.5" aria-hidden="true">
              <span className="absolute inline-flex size-full rounded-full bg-signal opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2.5 rounded-full bg-signal" />
            </span>
            <Search size={15} strokeWidth={2.4} aria-hidden="true" />
            Finding help · 10 km
          </span>
          <span className="text-sm text-muted tabular-nums">8:42 left</span>
        </div>
        <p className="px-1 text-xl font-bold">2 offers so far</p>

        {SAMPLE_OFFERS.map((offer, i) => (
          <div
            key={offer.name}
            className="flex flex-col gap-3 rounded-2xl border border-border p-4 motion-safe:animate-rise"
            // Offers "arrive" one after another, like the real screen.
            style={{ animationDelay: `${offerDelaysMs[i] ?? 0}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft font-extrabold text-on-primary-soft">
                  {offer.initials}
                </span>
                <div className="flex flex-col">
                  <span className="font-bold">{offer.name}</span>
                  <span className="inline-flex items-center gap-1 text-sm text-muted">
                    <Star size={14} className="fill-current text-signal" aria-hidden="true" />
                    {offer.rating} · {offer.jobs} jobs
                  </span>
                </div>
              </div>
              <span className="text-2xl font-extrabold tracking-tight tabular-nums">{formatNaira(offer.price)}</span>
            </div>
            <div className="flex gap-4 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5"><Clock size={15} aria-hidden="true" />{offer.eta}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin size={15} aria-hidden="true" />{offer.distance} away</span>
            </div>
            <span className="flex h-12 items-center justify-center rounded-xl bg-primary font-bold text-on-primary">
              Accept {formatNaira(offer.price)}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-3 text-center text-sm text-muted">What a driver sees while offers come in</figcaption>
    </figure>
  );
}
