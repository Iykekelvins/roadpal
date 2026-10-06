"use client";

import { useEffect, useState } from "react";
import type { EarningsView } from "@repo/shared";
import { Star } from "lucide-react";
import { buttonStyles } from "@/components/button-styles";
import { ApiError, NetworkError } from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { locate } from "@/lib/geolocation";
import { ISSUE_LABELS } from "@/lib/labels";
import { getEarnings, getProfile, goOffline, goOnline, type ProviderProfile } from "@/lib/providers";
import { useNow } from "@/lib/use-seconds-left";
import { useSession, useSocketEvent } from "../_components/session";
import { useLocationHeartbeat, useWakeLock } from "./_components/presence";
import { ProfileForm } from "./_components/profile-form";

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof NetworkError ? error.message : "Something went wrong. Try again.";

export default function ProviderHomePage() {
  const { me, connection, signOut } = useSession();
  const [profile, setProfile] = useState<ProviderProfile | null>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [earnings, setEarnings] = useState<EarningsView | null>(null);

  // Server truth on load and after every reconnect (the sweep may have set us offline meanwhile).
  useEffect(() => {
    let ignore = false;
    getProfile().then(
      (p) => {
        if (ignore) return;
        setProfile(p);
        setLoadFailed(false);
      },
      () => !ignore && setLoadFailed(true),
    );
    getEarnings().then((e) => !ignore && setEarnings(e), () => {});
    return () => {
      ignore = true;
    };
  }, [connection]);

  let screen: React.ReactNode;
  if (profile === undefined) {
    screen = <p className="text-muted">{loadFailed ? "Couldn’t load. Check your signal; we’ll retry when you’re back." : "Loading…"}</p>;
  } else if (profile === null || editing) {
    screen = (
      <ProfileForm
        profile={profile}
        onSaved={(saved) => {
          setProfile(saved);
          setEditing(false);
        }}
        onCancel={profile ? () => setEditing(false) : undefined}
      />
    );
  } else {
    screen = (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold text-muted">Hi, {me.name ?? "there"}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{profile.isOnline ? "You’re online" : "You’re offline"}</h1>
        </div>
        <OnlinePanel profile={profile} onChange={setProfile} />
        {earnings && <EarningsCard earnings={earnings} />}
        <ProfileSummary profile={profile} onEdit={() => setEditing(true)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div>{screen}</div>
      <button type="button" onClick={signOut} className="self-center text-sm font-bold text-muted underline-offset-4 hover:text-text hover:underline">
        Log out
      </button>
    </div>
  );
}

function OnlinePanel({ profile, onChange }: { profile: ProviderProfile; onChange: (profile: ProviderProfile) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const online = profile.isOnline;
  const now = useNow();

  const setOffline = (message: string) => {
    onChange({ ...profile, isOnline: false, lastLocation: null, lastLocationAt: null });
    setNotice(message);
  };
  const heartbeat = useLocationHeartbeat(online, () =>
    setOffline("You were set offline because your location stopped reaching RoadPal. Go online again when you’re ready."),
  );
  const wakeLockSupported = useWakeLock(online);

  useSocketEvent("provider:offline", () =>
    setOffline("You were set offline because your location stopped updating, so you won’t miss requests you can’t answer. Keep RoadPal open while you’re online."),
  );

  async function toggle() {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      if (online) {
        onChange(await goOffline());
      } else {
        const fix = await locate();
        if (fix.state !== "found") throw new Error(fix.state === "failed" ? fix.message : "Couldn’t get your location.");
        onChange(await goOnline(fix.location));
      }
    } catch (error) {
      setProblem(error instanceof Error && !(error instanceof ApiError) && !(error instanceof NetworkError) ? error.message : messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  const lastSent = heartbeat.lastSentAt ?? (profile.lastLocationAt ? new Date(profile.lastLocationAt).getTime() : null);
  const secondsAgo = lastSent ? Math.max(0, Math.round((now - lastSent) / 1000)) : null;

  return (
    <section
      aria-label="Availability"
      className={`flex flex-col gap-4 rounded-2xl border-2 p-4 transition-colors ${online ? "border-primary bg-primary-soft" : "border-border bg-surface"}`}
    >
      <div className="flex items-center gap-3">
        <span className="relative flex size-3" aria-hidden="true">
          {online && <span className="absolute inline-flex size-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />}
          <span className={`relative inline-flex size-3 rounded-full ${online ? "bg-primary" : "bg-muted"}`} />
        </span>
        <p className={`text-sm font-semibold ${online ? "text-on-primary-soft" : "text-muted"}`}>
          {online
            ? `Getting requests within ${profile.serviceRadiusKm} km.${secondsAgo !== null ? ` Location sent ${secondsAgo < 60 ? `${secondsAgo}s` : `${Math.round(secondsAgo / 60)} min`} ago.` : ""}`
            : "Go online to get requests from drivers near you."}
        </p>
      </div>

      {online && (
        <p className="text-sm text-on-primary-soft">
          {wakeLockSupported
            ? "Your screen stays on while you’re online, so drivers can find you."
            : "Keep RoadPal open with the screen on while you’re online, so drivers can find you."}
        </p>
      )}

      {(problem ?? heartbeat.problem) && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-on-danger-soft">
          {problem ?? heartbeat.problem}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-info-soft px-3 py-2 text-sm font-semibold text-on-info-soft">
          {notice}
        </p>
      )}

      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={buttonStyles({ variant: online ? "outline" : "signal", className: "w-full" })}
      >
        {busy ? (online ? "Going offline…" : "Finding you…") : online ? "Go offline" : "Go online"}
      </button>
    </section>
  );
}

function EarningsCard({ earnings }: { earnings: EarningsView }) {
  const rows = [
    { label: "Today", bucket: earnings.today },
    { label: "This week", bucket: earnings.thisWeek },
    { label: "All time", bucket: earnings.allTime },
  ];
  return (
    <section aria-label="Earnings" className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface text-center">
      {rows.map(({ label, bucket }) => (
        <div key={label} className="flex flex-col gap-1 p-4">
          <span className="text-xs font-bold text-muted">{label}</span>
          <span className="text-lg font-extrabold tabular-nums">{formatNaira(bucket.naira)}</span>
          <span className="text-xs text-muted">
            {bucket.jobs} job{bucket.jobs === 1 ? "" : "s"}
          </span>
        </div>
      ))}
    </section>
  );
}

function ProfileSummary({ profile, onEdit }: { profile: ProviderProfile; onEdit: () => void }) {
  return (
    <section aria-label="Your services" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-extrabold">Your services</h2>
        <button type="button" onClick={onEdit} className="text-sm font-bold text-primary underline-offset-4 hover:underline">
          Edit
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {profile.services.map((s) => (
          <li key={s} className="rounded-full bg-neutral-soft px-3 py-1 text-sm font-semibold text-on-neutral-soft">
            {ISSUE_LABELS[s]}
          </li>
        ))}
      </ul>
      <p className="inline-flex flex-wrap items-center gap-x-1 text-sm text-muted">
        Up to {profile.serviceRadiusKm} km away ·{" "}
        {profile.ratingAvg !== null ? (
          <>
            <Star size={14} className="fill-current text-signal" aria-hidden="true" />
            {profile.ratingAvg.toFixed(1)} from {profile.ratingCount} rating{profile.ratingCount === 1 ? "" : "s"}
          </>
        ) : (
          "no ratings yet"
        )}
      </p>
    </section>
  );
}
