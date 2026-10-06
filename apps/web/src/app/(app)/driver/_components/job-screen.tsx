"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { nextJobStatuses, type CancelReason, type JobStatus, type JobView, type LatLng } from "@repo/shared";
import { Check, Phone, Star } from "lucide-react";
import { buttonStyles } from "@/components/button-styles";
import { ApiError, NetworkError } from "@/lib/api";
import { formatDistance, formatNaira, formatPhone } from "@/lib/format";
import { distanceMeters } from "@/lib/geo";
import { cancelJob } from "@/lib/jobs";
import { ISSUE_LABELS } from "@/lib/labels";
import { useNow } from "@/lib/use-seconds-left";
import { useSocketEvent } from "../../_components/session";
import { StarPicker } from "../../_components/star-picker";

// The map library is big and browser-only: load it just for this screen, never on the server.
const JobMap = dynamic(() => import("../../_components/job-map"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-2xl bg-neutral-soft sm:h-80" />,
});

const STATUS_TEXT: Record<JobStatus, { title: string; detail: string }> = {
  accepted: { title: "Offer accepted", detail: "Your vulcanizer is getting ready to leave." },
  en_route: { title: "On the way", detail: "Your vulcanizer is heading to you." },
  arrived: { title: "Your vulcanizer is here", detail: "Look out for them by your vehicle." },
  in_progress: { title: "Fixing your tyre", detail: "Pay in cash when the job is done." },
  completed: { title: "Job done", detail: "Thanks for using RoadPal." },
  cancelled: { title: "Job cancelled", detail: "" },
};

const TIMELINE: { status: JobStatus; label: string; at: keyof JobView }[] = [
  { status: "accepted", label: "Accepted", at: "acceptedAt" },
  { status: "en_route", label: "On the way", at: "enRouteAt" },
  { status: "arrived", label: "Arrived", at: "arrivedAt" },
  { status: "in_progress", label: "Fixing", at: "startedAt" },
  { status: "completed", label: "Done", at: "completedAt" },
];

const DRIVER_CANCEL_REASONS: { reason: CancelReason; label: string; offerReplacement?: boolean }[] = [
  { reason: "provider_no_show", label: "They’re not coming", offerReplacement: true },
  { reason: "cant_reach_other_party", label: "I can’t reach them", offerReplacement: true },
  { reason: "problem_solved", label: "Problem solved" },
  { reason: "found_other_help", label: "I found other help" },
  { reason: "emergency", label: "Emergency" },
  { reason: "other", label: "Something else" },
];

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });


export function JobScreen({
  job,
  onCancelled,
}: {
  job: JobView;
  /** reopened: the request is back out to other vulcanizers. */
  onCancelled: (reopened: boolean) => void;
}) {
  // Live pushes and the job itself (on load, reconnect, status change) can both carry a position:
  // whichever is newer wins.
  const [pushedFix, setPushedFix] = useState<{ location: LatLng; at: string } | null>(null);
  const providerFix = [pushedFix, job.providerLocation]
    .filter((fix) => fix !== null)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  const [cancelling, setCancelling] = useState(false);
  const text = STATUS_TEXT[job.status];
  const now = useNow();
  // How stale the vulcanizer's last position is: a phone in a pocket can stop sending.
  const ageSeconds = providerFix ? Math.max(0, Math.round((now - new Date(providerFix.at).getTime()) / 1000)) : null;

  useSocketEvent("job:location", ({ jobId, location, at }) => {
    if (jobId === job.id) setPushedFix({ location, at });
  });

  const enRoute = job.status === "en_route";
  const showMap = job.status === "accepted" || job.status === "en_route" || job.status === "arrived";
  const providerPin = enRoute ? (providerFix?.location ?? null) : null;
  const canCancel = nextJobStatuses(job.status, "driver").includes("cancelled");
  const currentStep = TIMELINE.findIndex((s) => s.status === job.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight" aria-live="polite">{text.title}</h1>
        <p className="text-muted">
          {enRoute && providerPin
            ? `${formatDistance(distanceMeters(providerPin, job.location))} away in a straight line.`
            : text.detail}
          {enRoute && ageSeconds !== null && ageSeconds > 30 && (
            <span className="text-on-signal-soft"> Last update {ageSeconds < 120 ? `${ageSeconds}s` : `${Math.round(ageSeconds / 60)} min`} ago.</span>
          )}
        </p>
      </div>

      {showMap && <JobMap driver={job.location} provider={providerPin} />}

      <ol className="grid grid-cols-5 gap-1" aria-label="Progress">
        {TIMELINE.map((step, i) => {
          const at = job[step.at] as string | null;
          const done = i <= currentStep;
          return (
            <li key={step.status} className="flex flex-col gap-2" aria-current={i === currentStep ? "step" : undefined}>
              <span className={`h-1.5 rounded-full ${done ? "bg-primary" : "bg-neutral-soft"}`} />
              <span className={`text-xs font-bold ${done ? "text-text" : "text-muted"}`}>{step.label}</span>
              <span className="text-xs text-muted tabular-nums">{at ? time(at) : ""}</span>
            </li>
          );
        })}
      </ol>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4" aria-label="Your vulcanizer">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-lg font-extrabold">{job.provider.name ?? "Your vulcanizer"}</span>
            <span className="inline-flex items-center gap-1 text-sm text-muted">
              {job.provider.ratingAvg !== null ? (
                <>
                  <Star size={14} className="fill-current text-signal" aria-hidden="true" />
                  {job.provider.ratingAvg.toFixed(1)} · {job.provider.ratingCount} rating{job.provider.ratingCount === 1 ? "" : "s"}
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
        <a href={`tel:${job.provider.phone}`} className={buttonStyles({ variant: "primary", size: "sm", className: "h-12 w-full" })}>
          <Phone className="size-4" aria-hidden="true" />
          Call {formatPhone(job.provider.phone)}
        </a>
      </section>

      {canCancel &&
        (cancelling ? (
          <CancelJobForm job={job} onDone={onCancelled} onBack={() => setCancelling(false)} />
        ) : (
          <button type="button" onClick={() => setCancelling(true)} className="self-center text-sm font-bold text-danger underline-offset-4 hover:underline">
            Cancel job
          </button>
        ))}
      {job.status === "in_progress" && (
        <p className="text-center text-sm text-muted">Work has started, so the job can’t be cancelled from here.</p>
      )}
    </div>
  );
}

function CancelJobForm({ job, onDone, onBack }: { job: JobView; onDone: (reopened: boolean) => void; onBack: () => void }) {
  const [reason, setReason] = useState<CancelReason>();
  const [findAnother, setFindAnother] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const offersReplacement = DRIVER_CANCEL_REASONS.find((r) => r.reason === reason)?.offerReplacement ?? false;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) return;
    setBusy(true);
    setProblem(null);
    const reopenRequest = offersReplacement && findAnother;
    try {
      await cancelJob(job.id, { reason, reopenRequest });
      onDone(reopenRequest);
    } catch (error) {
      setProblem(error instanceof ApiError || error instanceof NetworkError ? error.message : "Couldn’t cancel. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border-2 border-border p-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-extrabold">Why are you cancelling?</legend>
        {DRIVER_CANCEL_REASONS.map((r) => (
          <label key={r.reason} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold has-checked:bg-primary-soft has-checked:text-on-primary-soft">
            <input type="radio" name="reason" checked={reason === r.reason} onChange={() => setReason(r.reason)} className="size-4 accent-primary" />
            {r.label}
          </label>
        ))}
      </fieldset>

      {offersReplacement && (
        <label className="flex items-start gap-3 rounded-xl bg-neutral-soft p-3 text-sm text-on-neutral-soft">
          <input type="checkbox" checked={findAnother} onChange={(e) => setFindAnother(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span>
            <strong className="font-extrabold">Find me another vulcanizer</strong>
            <br />
            Your request goes back out to others nearby.
          </span>
        </label>
      )}

      {problem && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft">
          {problem}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onBack} disabled={busy} className={buttonStyles({ variant: "outline", size: "sm" })}>
          Keep job
        </button>
        <button type="submit" disabled={!reason || busy} className={buttonStyles({ variant: "primary", size: "sm" })}>
          {busy ? "Cancelling…" : "Cancel job"}
        </button>
      </div>
    </form>
  );
}

/** Shown once, right after the vulcanizer marks the job done. */
export function JobDone({ job, onSubmit, onSkip }: { job: JobView; onSubmit: (score: number, comment: string) => Promise<void>; onSkip: () => void }) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!score) return;
    setBusy(true);
    setProblem(null);
    try {
      await onSubmit(score, comment.trim());
    } catch (error) {
      setProblem(error instanceof ApiError || error instanceof NetworkError ? error.message : "Couldn’t send. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-4 pt-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary text-on-primary motion-safe:animate-rise">
          <Check className="size-8" strokeWidth={3} aria-hidden="true" />
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">Job done</h1>
        <p className="text-muted">
          Pay <strong className="text-text">{formatNaira(job.priceNaira)}</strong> in cash to {job.provider.name ?? "your vulcanizer"}.
        </p>
      </div>

      <fieldset className="flex flex-col items-center gap-3">
        <legend className="mb-3 w-full text-center font-extrabold">How did {job.provider.name ?? "they"} do?</legend>
        <StarPicker name="score" value={score} onChange={setScore} />
      </fieldset>

      <textarea
        rows={3}
        maxLength={500}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Anything to add? (optional)"
        className="resize-none rounded-2xl border-2 border-border bg-surface px-4 py-3 outline-none transition-colors placeholder:text-muted/70 focus:border-primary"
      />

      {problem && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft">
          {problem}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button type="submit" disabled={!score || busy} className={buttonStyles({ variant: "primary", className: "w-full" })}>
          {busy ? "Sending…" : "Send rating"}
        </button>
        <button type="button" onClick={onSkip} className="self-center py-2 text-sm font-bold text-muted underline-offset-4 hover:text-text hover:underline">
          Skip
        </button>
      </div>
    </form>
  );
}
