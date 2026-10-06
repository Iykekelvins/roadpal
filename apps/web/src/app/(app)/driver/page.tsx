"use client";

import { useEffect, useState } from "react";
import { getActiveRequest, type DriverRequest } from "@/lib/requests";
import { useSession, useSocketEvent } from "../_components/session";
import { RequestForm } from "./_components/request-form";
import { Searching } from "./_components/searching";

/**
 * The driver's home. Which screen shows depends on their active request, and the server is the
 * source of truth: it's fetched on load and again after every reconnect (pushes missed while
 * offline are gone), then kept current by live events in between.
 */
export default function DriverHomePage() {
  const { connection, signOut } = useSession();
  const [request, setRequest] = useState<DriverRequest | null>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    getActiveRequest()
      .then((active) => {
        if (ignore) return;
        setRequest(active);
        setLoadFailed(false);
      })
      .catch(() => !ignore && setLoadFailed(true));
    return () => {
      ignore = true;
    };
  }, [connection]);

  useSocketEvent("request:expired", ({ requestId }) => {
    if (request?.id !== requestId) return;
    setRequest(null);
    setNotice("No vulcanizer took your request in time. Send it again to keep looking.");
  });

  let screen: React.ReactNode;
  if (request === undefined) {
    screen = <p className="text-muted">{loadFailed ? "Couldn’t load. Check your signal; we’ll retry when you’re back." : "Loading…"}</p>;
  } else if (request === null) {
    screen = (
      <RequestForm
        notice={notice}
        onCreated={(created) => {
          setNotice(null);
          setRequest(created);
        }}
        onAlreadyActive={() => getActiveRequest().then(setRequest, () => {})}
      />
    );
  } else if (request.status === "open") {
    screen = (
      <Searching
        request={request}
        onChange={setRequest}
        onCancelled={() => {
          setRequest(null);
          setNotice(null);
        }}
      />
    );
  } else {
    // matched: an offer was accepted. The job screen (tracking, arrival, payment) comes next.
    screen = (
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Help is on the way</h1>
        <p className="text-muted">You accepted an offer. The live job screen is the next thing we build.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {screen}
      <button type="button" onClick={signOut} className="self-center text-sm font-bold text-muted underline-offset-4 hover:text-text hover:underline">
        Log out
      </button>
    </div>
  );
}
