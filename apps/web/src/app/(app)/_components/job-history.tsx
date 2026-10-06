"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { APP_TIMEZONE, type JobHistoryPage } from "@repo/shared";
import { ArrowLeft } from "lucide-react";
import { buttonStyles } from "@/components/button-styles";
import { describeError } from "@/lib/api";
import { HOME } from "@/lib/auth";
import { formatNaira } from "@/lib/format";
import { getHistory, rateJob } from "@/lib/jobs";
import { CANCEL_REASON_LABELS, ISSUE_LABELS, VEHICLE_LABELS } from "@/lib/labels";
import { useSession } from "./session";
import { StarPicker, Stars } from "./star-picker";

type Item = JobHistoryPage["items"][number];

// Always Lagos time, whatever timezone the phone is set to: matches the earnings "today".
const when = new Intl.DateTimeFormat("en-NG", {
  timeZone: APP_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function JobHistory() {
  const { me } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "more" | "failed">("loading");

  async function load(after?: string) {
    setState(after ? "more" : "loading");
    try {
      const page = await getHistory(after);
      setItems((list) => (after ? [...list, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setState("ready");
    } catch {
      setState("failed");
    }
  }

  useEffect(() => {
    let ignore = false;
    getHistory().then(
      (page) => {
        if (ignore) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setState("ready");
      },
      () => !ignore && setState("failed"),
    );
    return () => {
      ignore = true;
    };
  }, []);

  const rated = (jobId: string, score: number) =>
    setItems((list) => list.map((item) => (item.job.id === jobId ? { ...item, myRating: score } : item)));

  return (
    <div className="flex flex-col gap-6">
      <Link href={HOME[me.role]} className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight">Past jobs</h1>

      {state === "loading" && <p className="text-muted">Loading…</p>}
      {state === "failed" && items.length === 0 && (
        <p className="text-muted">Couldn’t load your jobs. Check your signal and try again.</p>
      )}
      {state !== "loading" && state !== "failed" && items.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          {me.role === "driver" ? "No jobs yet. When a vulcanizer helps you, it shows up here." : "No jobs yet. Jobs you finish show up here."}
        </p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.job.id}>
              <HistoryCard item={item} viewer={me.role} onRated={rated} />
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <button
          type="button"
          onClick={() => load(cursor)}
          disabled={state === "more"}
          className={buttonStyles({ variant: "outline", className: "w-full" })}
        >
          {state === "more" ? "Loading…" : "Show older jobs"}
        </button>
      )}
      {state === "failed" && items.length > 0 && <p className="text-center text-sm text-muted">Couldn’t load more. Try again.</p>}
    </div>
  );
}

function HistoryCard({ item, viewer, onRated }: { item: Item; viewer: "driver" | "provider"; onRated: (jobId: string, score: number) => void }) {
  const { job, myRating } = item;
  const completed = job.status === "completed";
  const other = viewer === "driver" ? (job.provider.name ?? "Vulcanizer") : (job.driver.name ?? "Driver");
  const cancelledByMe = job.cancelledBy === viewer;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-extrabold">{other}</span>
          <span className="text-sm text-muted">
            {ISSUE_LABELS[job.issueType]} · {VEHICLE_LABELS[job.vehicleType]}
          </span>
          <span className="text-xs text-muted tabular-nums">{when.format(new Date(job.acceptedAt))}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`text-lg font-extrabold tabular-nums ${completed ? "" : "text-muted line-through"}`}>
            {formatNaira(job.priceNaira)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${completed ? "bg-primary-soft text-on-primary-soft" : "bg-neutral-soft text-on-neutral-soft"}`}
          >
            {completed ? "Completed" : cancelledByMe ? "You cancelled" : `${viewer === "driver" ? "Vulcanizer" : "Driver"} cancelled`}
          </span>
        </div>
      </div>

      {!completed && job.cancelReason && <p className="text-sm text-muted">Reason: {CANCEL_REASON_LABELS[job.cancelReason]}</p>}

      {completed && viewer === "driver" && (myRating !== null ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          You rated <Stars score={myRating} />
        </p>
      ) : (
        <RateInline jobId={job.id} name={other} onRated={(score) => onRated(job.id, score)} />
      ))}
    </article>
  );
}

/** For a job the driver didn't rate at the time (e.g. it finished while the app was closed). */
function RateInline({ jobId, name, onRated }: { jobId: string; name: string; onRated: (score: number) => void }) {
  const [score, setScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setProblem(null);
    try {
      await rateJob(jobId, { score });
      onRated(score);
    } catch (error) {
      setProblem(describeError(error, "Couldn’t send. Try again."));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="text-sm font-bold">How did {name} do?</span>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StarPicker name={`score-${jobId}`} value={score} onChange={setScore} size="sm" />
        <button type="button" onClick={send} disabled={!score || busy} className={buttonStyles({ variant: "primary", size: "sm" })}>
          {busy ? "Sending…" : "Rate"}
        </button>
      </div>
      {problem && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
