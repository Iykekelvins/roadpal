"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { JobView } from "@repo/shared";
import { getActiveJob, rateJob } from "@/lib/jobs";
import { getActiveRequest, type DriverRequest } from "@/lib/requests";
import { useSession, useSocketEvent } from "../_components/session";
import { JobDone, JobScreen } from "./_components/job-screen";
import { RequestForm } from "./_components/request-form";
import { Searching } from "./_components/searching";

type View =
  | { kind: "loading"; failed?: boolean }
  | { kind: "idle" } // nothing active: show the request form
  | { kind: "searching"; request: DriverRequest }
  | { kind: "job"; job: JobView }
  | { kind: "done"; job: JobView }; // just completed: pay and rate

/** What the driver has going on right now, according to the server. A job outranks a request. */
async function loadView(): Promise<View> {
  const job = await getActiveJob();
  if (job) return { kind: "job", job };
  const request = await getActiveRequest();
  return request?.status === "open" ? { kind: "searching", request } : { kind: "idle" };
}

/**
 * The driver's home. Which screen shows depends on their active job or request, and the server is
 * the source of truth: it's fetched on load and again after every reconnect (pushes missed while
 * offline are gone), then kept current by live events in between.
 */
export default function DriverHomePage() {
  const { connection, signOut } = useSession();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const reload = () => setReloads((n) => n + 1);

  useEffect(() => {
    let ignore = false;
    loadView().then(
      (next) => !ignore && setView(next),
      () => !ignore && setView((current) => (current.kind === "loading" ? { kind: "loading", failed: true } : current)),
    );
    return () => {
      ignore = true;
    };
  }, [connection, reloads]);

  useSocketEvent("request:expired", ({ requestId }) => {
    if (view.kind !== "searching" || view.request.id !== requestId) return;
    setView({ kind: "idle" });
    setNotice("No vulcanizer took your request in time. Send it again to keep looking.");
  });

  useSocketEvent("job:updated", (job) => {
    if (view.kind !== "job" || view.job.id !== job.id) return;
    if (job.status === "completed") {
      setView({ kind: "done", job });
    } else if (job.status === "cancelled") {
      // If the vulcanizer cancelled, the server reopened the request and is asking others nearby.
      setNotice(job.cancelledBy === "provider" ? "Your vulcanizer cancelled. We’re asking others nearby." : null);
      reload();
    } else {
      setView({ kind: "job", job });
    }
  });

  let screen: React.ReactNode;
  switch (view.kind) {
    case "loading":
      screen = <p className="text-muted">{view.failed ? "Couldn’t load. Check your signal; we’ll retry when you’re back." : "Loading…"}</p>;
      break;
    case "idle":
      screen = (
        <RequestForm
          notice={notice}
          onCreated={(request) => {
            setNotice(null);
            setView({ kind: "searching", request });
          }}
          onAlreadyActive={reload}
        />
      );
      break;
    case "searching":
      screen = (
        <>
          {notice && (
            <p role="status" className="mb-6 rounded-2xl bg-info-soft px-4 py-3 text-sm font-semibold text-on-info-soft">
              {notice}
            </p>
          )}
          <Searching
            key={view.request.id}
            request={view.request}
            onChange={(request) => setView({ kind: "searching", request })}
            onAccepted={(job) => {
              setNotice(null);
              setView({ kind: "job", job });
            }}
            onCancelled={() => {
              setNotice(null);
              setView({ kind: "idle" });
            }}
            onStale={reload}
          />
        </>
      );
      break;
    case "job":
      screen = (
        <JobScreen
          job={view.job}
          onCancelled={(reopened) => {
            setNotice(reopened ? "Job cancelled. We’re asking other vulcanizers nearby." : null);
            reload();
          }}
        />
      );
      break;
    case "done":
      screen = (
        <JobDone
          job={view.job}
          onSubmit={async (score, comment) => {
            await rateJob(view.job.id, { score, comment: comment || undefined });
            setNotice("Thanks for rating. It helps other drivers choose.");
            setView({ kind: "idle" });
          }}
          onSkip={() => setView({ kind: "idle" })}
        />
      );
      break;
  }

  return (
    <div className="flex flex-col gap-10">
      <div>{screen}</div>
      <nav aria-label="Account" className="flex items-center justify-center gap-6 text-sm font-bold text-muted">
        <Link href="/driver/history" className="underline-offset-4 hover:text-text hover:underline">
          Past jobs
        </Link>
        <button type="button" onClick={signOut} className="underline-offset-4 hover:text-text hover:underline">
          Log out
        </button>
      </nav>
    </div>
  );
}
