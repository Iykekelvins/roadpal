"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  EN_ROUTE_LOCATION_INTERVAL_SECONDS,
  nextJobStatuses,
  type CancelReason,
  type JobStatus,
  type JobView,
  type LatLng,
} from "@repo/shared";
import { Navigation, Phone } from "lucide-react";
import { buttonStyles } from "@/components/button-styles";
import { describeError } from "@/lib/api";
import { formatDistance, formatNaira, formatPhone } from "@/lib/format";
import { distanceMeters } from "@/lib/geo";
import { watchLocation } from "@/lib/geolocation";
import { cancelJob, updateJobStatus } from "@/lib/jobs";
import { ISSUE_LABELS, VEHICLE_LABELS } from "@/lib/labels";
import { useSession, useSocketEvent } from "../../_components/session";

const JobMap = dynamic(() => import("../../_components/job-map"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-2xl bg-neutral-soft sm:h-80" />,
});

const STATUS_TEXT: Record<JobStatus, { title: string; detail: string }> = {
  accepted: { title: "You got the job", detail: "Head to the driver, and tap “I’m on my way” as you leave." },
  en_route: { title: "On your way", detail: "The driver can see you coming on their map." },
  arrived: { title: "You’ve arrived", detail: "Find the driver, then start work." },
  in_progress: { title: "Working on it", detail: "Tap “Job done” once the tyre is fixed and you’ve been paid." },
  completed: { title: "Job done", detail: "" },
  cancelled: { title: "Job cancelled", detail: "" },
};

// The one forward step a vulcanizer can take from each status.
const NEXT_ACTION: Partial<Record<JobStatus, { to: "en_route" | "arrived" | "in_progress" | "completed"; label: string }>> = {
  accepted: { to: "en_route", label: "I’m on my way" },
  en_route: { to: "arrived", label: "I’ve arrived" },
  arrived: { to: "in_progress", label: "Start work" },
  in_progress: { to: "completed", label: "Job done, cash collected" },
};

const PROVIDER_CANCEL_REASONS: { reason: CancelReason; label: string }[] = [
  { reason: "cant_reach_other_party", label: "I can’t reach the driver" },
  { reason: "problem_solved", label: "The driver says it’s fixed" },
  { reason: "emergency", label: "Emergency" },
  { reason: "other", label: "Something else" },
];

/**
 * While en route, streams this phone's position to the driver over the socket, every
 * EN_ROUTE_LOCATION_INTERVAL_SECONDS. Also returns the latest position for our own map.
 */
function useLiveLocation(jobId: string, streaming: boolean, tracking: boolean) {
  const { socket } = useSession();
  const [here, setHere] = useState<LatLng | null>(null);
  const latest = useRef<LatLng | null>(null);

  useEffect(() => {
    if (!tracking) return;
    return watchLocation((fix) => {
      if (fix.state !== "found") return;
      latest.current = fix.location;
      setHere(fix.location);
    });
  }, [tracking]);

  useEffect(() => {
    if (!streaming) return;
    const send = () => {
      if (!latest.current || !socket.connected) return;
      // volatile: if the connection is down, drop this position rather than queue it. A stale
      // position delivered late is worse than the next fresh one.
      socket.volatile.emit("location:update", latest.current, () => {});
    };
    send();
    const timer = setInterval(send, EN_ROUTE_LOCATION_INTERVAL_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [jobId, streaming, socket]);

  return here;
}

export function ProviderJob({ job, onChange, onClose }: { job: JobView; onChange: (job: JobView) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const active = job.status !== "completed" && job.status !== "cancelled";
  const here = useLiveLocation(job.id, job.status === "en_route", active);
  const text = STATUS_TEXT[job.status];
  const action = NEXT_ACTION[job.status];
  const canCancel = nextJobStatuses(job.status, "provider").includes("cancelled");

  useSocketEvent("job:updated", (updated) => updated.id === job.id && onChange(updated));

  async function advance() {
    if (!action) return;
    setBusy(true);
    setProblem(null);
    try {
      onChange(await updateJobStatus(job.id, action.to));
    } catch (error) {
      setProblem(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  if (job.status === "completed" || job.status === "cancelled") {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border-2 border-primary bg-primary-soft p-4 text-on-primary-soft">
        <h1 className="text-2xl font-extrabold tracking-tight">{text.title}</h1>
        <p>
          {job.status === "completed"
            ? `You earned ${formatNaira(job.priceNaira)}. Nice work.`
            : job.cancelledBy === "driver"
              ? "The driver cancelled this job."
              : "You cancelled this job. The driver’s request went back out to others."}
        </p>
        <button type="button" onClick={onClose} className={buttonStyles({ variant: "primary", className: "w-full" })}>
          Back to requests
        </button>
      </div>
    );
  }

  const directions = `https://www.google.com/maps/dir/?api=1&destination=${job.location.lat},${job.location.lng}&travelmode=driving`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight" aria-live="polite">{text.title}</h1>
        <p className="text-muted">
          {here && job.status !== "in_progress" ? `${formatDistance(distanceMeters(here, job.location))} away in a straight line. ` : ""}
          {text.detail}
        </p>
      </div>

      {job.status !== "in_progress" && <JobMap driver={job.location} provider={here} label="Map of you and the driver" />}

      {action && (
        <button type="button" onClick={advance} disabled={busy} className={buttonStyles({ variant: "signal", className: "w-full" })}>
          {busy ? "Updating…" : action.label}
        </button>
      )}
      {problem && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft">
          {problem}
        </p>
      )}

      <section aria-label="The job" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-lg font-extrabold">{job.driver.name ?? "Driver"}</span>
            <span className="text-sm text-muted">
              {ISSUE_LABELS[job.issueType]} · {VEHICLE_LABELS[job.vehicleType]}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-2xl font-extrabold tabular-nums">{formatNaira(job.priceNaira)}</span>
            <span className="text-xs font-bold text-muted">collect in cash</span>
          </div>
        </div>
        {job.note && <p className="rounded-xl bg-neutral-soft px-3 py-2 text-sm text-on-neutral-soft">“{job.note}”</p>}
        <div className="grid grid-cols-2 gap-2">
          <a href={`tel:${job.driver.phone}`} className={buttonStyles({ variant: "primary", size: "sm", className: "h-12" })}>
            <Phone className="size-4" aria-hidden="true" />
            Call
          </a>
          <a href={directions} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "outline", size: "sm", className: "h-12" })}>
            <Navigation className="size-4" aria-hidden="true" />
            Directions
          </a>
        </div>
        <p className="text-center text-xs text-muted">{formatPhone(job.driver.phone)}</p>
      </section>

      {canCancel &&
        (cancelling ? (
          <CancelForm job={job} onDone={onChange} onBack={() => setCancelling(false)} />
        ) : (
          <button type="button" onClick={() => setCancelling(true)} className="self-center text-sm font-bold text-danger underline-offset-4 hover:underline">
            Cancel job
          </button>
        ))}
    </div>
  );
}

function CancelForm({ job, onDone, onBack }: { job: JobView; onDone: (job: JobView) => void; onBack: () => void }) {
  const [reason, setReason] = useState<CancelReason>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) return;
    setBusy(true);
    setProblem(null);
    try {
      // reopenRequest is ignored for vulcanizers: the driver's request always goes back out.
      onDone(await cancelJob(job.id, { reason, reopenRequest: false }));
    } catch (error) {
      setProblem(describeError(error, "Couldn’t cancel. Try again."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border-2 border-border p-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-extrabold">Why are you cancelling?</legend>
        <p className="mb-2 text-sm text-muted">The driver’s request goes back out to other vulcanizers.</p>
        {PROVIDER_CANCEL_REASONS.map((r) => (
          <label key={r.reason} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold has-checked:bg-primary-soft has-checked:text-on-primary-soft">
            <input type="radio" name="reason" checked={reason === r.reason} onChange={() => setReason(r.reason)} className="size-4 accent-primary" />
            {r.label}
          </label>
        ))}
      </fieldset>
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
