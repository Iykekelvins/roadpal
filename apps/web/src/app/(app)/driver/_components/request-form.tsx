"use client";

import { useRef, useState } from "react";
import { ISSUE_TYPES, VEHICLE_TYPES, type IssueType, type VehicleType } from "@repo/shared";
import { LocateFixed, MapPin } from "lucide-react";
import { buttonStyles } from "@/components/button-styles";
import { ApiError, NetworkError } from "@/lib/api";
import { ISSUE_LABELS, VEHICLE_LABELS } from "@/lib/labels";
import { locate, type Fix } from "@/lib/geolocation";
import { createRequest, type DriverRequest } from "@/lib/requests";

const NOTE_MAX = 280;

export function RequestForm({
  notice,
  onCreated,
  onAlreadyActive,
}: {
  notice: string | null;
  onCreated: (request: DriverRequest) => void;
  onAlreadyActive: () => void;
}) {
  const [fix, setFix] = useState<Fix>({ state: "idle" });
  const [vehicle, setVehicle] = useState<VehicleType>("car");
  const [issue, setIssue] = useState<IssueType>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function findMe() {
    setFix({ state: "locating" });
    setFix(await locate());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (fix.state !== "found" || !issue || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const trimmed = note.trim();
      onCreated(await createRequest({ location: fix.location, vehicleType: vehicle, issueType: issue, note: trimmed || undefined }));
    } catch (error) {
      if (error instanceof ApiError && error.code === "ACTIVE_REQUEST_EXISTS") return onAlreadyActive();
      setProblem(
        error instanceof NetworkError || error instanceof ApiError ? error.message : "Something went wrong. Try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const ready = fix.state === "found" && issue !== undefined;

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Get tyre help</h1>
        <p className="text-muted">Nearby vulcanizers will send you a price and arrival time.</p>
      </div>

      {notice && (
        <p role="status" className="rounded-2xl bg-info-soft px-4 py-3 text-sm font-semibold text-on-info-soft">
          {notice}
        </p>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="where">
        <h2 id="where" className="text-sm font-bold">Where are you?</h2>
        {fix.state === "found" ? (
          <div className="flex items-center gap-3 rounded-2xl border-2 border-primary bg-primary-soft px-4 py-3 text-on-primary-soft">
            <MapPin className="size-5 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-sm font-semibold">
              Location found <span className="font-normal">(accurate to about {fix.accuracyMeters} m)</span>
            </span>
            <button type="button" onClick={findMe} className="text-sm font-extrabold underline underline-offset-4">
              Refresh
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={findMe}
            disabled={fix.state === "locating"}
            className={buttonStyles({ variant: "outline", className: "w-full" })}
          >
            <LocateFixed className="size-5" aria-hidden="true" />
            {fix.state === "locating" ? "Finding you…" : "Use my current location"}
          </button>
        )}
        {fix.state === "failed" && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft">
            {fix.message}
          </p>
        )}
      </section>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-bold">Vehicle</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {VEHICLE_TYPES.map((type) => (
            <Chip key={type} name="vehicle" checked={vehicle === type} onSelect={() => setVehicle(type)}>
              {VEHICLE_LABELS[type]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-bold">What’s wrong?</legend>
        <div className="grid grid-cols-2 gap-2">
          {ISSUE_TYPES.map((type) => (
            <Chip key={type} name="issue" checked={issue === type} onSelect={() => setIssue(type)}>
              {ISSUE_LABELS[type]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="flex justify-between text-sm font-bold">
          <span>
            Anything else? <span className="font-normal text-muted">(optional)</span>
          </span>
          <span className="font-normal text-muted" aria-live="polite">
            {note.length > NOTE_MAX - 40 ? `${NOTE_MAX - note.length} left` : ""}
          </span>
        </span>
        <textarea
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Silver Corolla, opposite the filling station"
          className="resize-none rounded-2xl border-2 border-border bg-surface px-4 py-3 outline-none transition-colors placeholder:text-muted/70 focus:border-primary"
        />
      </label>

      {problem && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft">
          {problem}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button type="submit" disabled={!ready || busy} className={buttonStyles({ variant: "signal", className: "w-full" })}>
          {busy ? "Sending…" : "Find a vulcanizer"}
        </button>
        {!ready && (
          <p className="text-center text-sm text-muted">
            {fix.state !== "found" ? "Share your location" : "Pick what’s wrong"} to continue.
          </p>
        )}
      </div>
    </form>
  );
}

/** A radio button that looks like a chip. A real radio, so arrow keys and screen readers work. */
function Chip({ name, checked, onSelect, children }: { name: string; checked: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <label className="flex h-12 items-center justify-center rounded-xl border-2 border-border bg-surface px-3 text-center text-sm font-bold transition-colors hover:border-muted has-checked:border-primary has-checked:bg-primary-soft has-checked:text-on-primary-soft has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary">
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      {children}
    </label>
  );
}
