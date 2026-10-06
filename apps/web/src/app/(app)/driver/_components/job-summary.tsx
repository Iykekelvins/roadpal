"use client";

import type { JobStatus, JobView } from "@repo/shared";
import { Phone, Star } from "lucide-react";
import { buttonStyles } from "@/components/button-styles";
import { formatNaira, formatPhone } from "@/lib/format";
import { ISSUE_LABELS } from "@/lib/labels";

const STATUS_TEXT: Record<JobStatus, { title: string; detail: string }> = {
  accepted: { title: "Offer accepted", detail: "Your vulcanizer is getting ready to leave." },
  en_route: { title: "On the way", detail: "Your vulcanizer is heading to you." },
  arrived: { title: "Your vulcanizer is here", detail: "Look out for them by your vehicle." },
  in_progress: { title: "Fixing your tyre", detail: "Pay in cash when the job is done." },
  completed: { title: "Job done", detail: "Thanks for using RoadPal." },
  cancelled: { title: "Job cancelled", detail: "" },
};

/** The accepted job. The live map, status timeline and cancel/rating come in the next steps. */
export function JobSummary({ job }: { job: JobView }) {
  const { provider } = job;
  const text = STATUS_TEXT[job.status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight" aria-live="polite">{text.title}</h1>
        <p className="text-muted">{text.detail}</p>
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4" aria-label="Your vulcanizer">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-lg font-extrabold">{provider.name ?? "Your vulcanizer"}</span>
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
          <div className="flex flex-col items-end">
            <span className="text-2xl font-extrabold tabular-nums">{formatNaira(job.priceNaira)}</span>
            <span className="text-xs font-bold text-muted">cash on completion</span>
          </div>
        </div>
        <p className="text-sm text-muted">
          {ISSUE_LABELS[job.issueType]} · quoted arrival ~{job.etaMinutes} min
        </p>
        <a href={`tel:${provider.phone}`} className={buttonStyles({ variant: "primary", size: "sm", className: "h-12 w-full" })}>
          <Phone className="size-4" aria-hidden="true" />
          Call {formatPhone(provider.phone)}
        </a>
      </section>
    </div>
  );
}
