"use client";

import { useState } from "react";
import { ISSUE_TYPES, ProviderProfileSchema, UpdateMeSchema, type IssueType } from "@repo/shared";
import { buttonStyles } from "@/components/button-styles";
import { describeError } from "@/lib/api";
import { updateMe } from "@/lib/auth";
import { ISSUE_LABELS } from "@/lib/labels";
import { saveProfile, type ProviderProfile } from "@/lib/providers";
import { useSession } from "../../_components/session";

const RADIUS_CHOICES = [3, 5, 10, 20, 30, 50];

/** First-time setup, and later edits. Name lives on the user; services and radius on the profile. */
export function ProfileForm({
  profile,
  onSaved,
  onCancel,
}: {
  profile: ProviderProfile | null;
  onSaved: (profile: ProviderProfile) => void;
  onCancel?: () => void;
}) {
  const { me, setMe } = useSession();
  const [name, setName] = useState(me.name ?? "");
  const [services, setServices] = useState<IssueType[]>(profile?.services ?? ["flat_tyre", "puncture"]);
  const [radius, setRadius] = useState(profile?.serviceRadiusKm ?? 10);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const firstTime = profile === null;

  const toggle = (type: IssueType) =>
    setServices((list) => (list.includes(type) ? list.filter((t) => t !== type) : [...list, type]));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // Same schemas as the API, so the messages match too.
    const nameCheck = UpdateMeSchema.safeParse({ name });
    const profileCheck = ProviderProfileSchema.safeParse({ services, serviceRadiusKm: radius });
    const issue = nameCheck.error?.issues[0] ?? profileCheck.error?.issues[0];
    if (issue) return setProblem(issue.message);

    setBusy(true);
    setProblem(null);
    try {
      if (nameCheck.data!.name !== me.name) setMe(await updateMe(nameCheck.data!));
      onSaved(await saveProfile(profileCheck.data!));
    } catch (error) {
      setProblem(describeError(error, "Couldn’t save. Try again."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">{firstTime ? "Set up your workshop" : "Your services"}</h1>
        <p className="text-muted">
          {firstTime ? "Drivers see this when you send them a price. You can change it any time." : "Changes apply to new requests."}
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold">Name drivers will see</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="organization"
          placeholder="e.g. Bayo Vulcanizer"
          maxLength={60}
          className="h-14 rounded-2xl border-2 border-border bg-surface px-4 text-lg font-semibold outline-none transition-colors placeholder:font-normal placeholder:text-muted/70 focus:border-primary"
        />
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-bold">What can you fix?</legend>
        <div className="grid grid-cols-2 gap-2">
          {ISSUE_TYPES.map((type) => (
            <label
              key={type}
              className="flex h-12 items-center justify-center rounded-xl border-2 border-border bg-surface px-3 text-center text-sm font-bold transition-colors hover:border-muted has-checked:border-primary has-checked:bg-primary-soft has-checked:text-on-primary-soft has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
            >
              <input type="checkbox" checked={services.includes(type)} onChange={() => toggle(type)} className="sr-only" />
              {ISSUE_LABELS[type]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-bold">How far will you travel?</legend>
        <p className="mb-2 text-sm text-muted">You’ll only get requests within this distance.</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {RADIUS_CHOICES.map((km) => (
            <label
              key={km}
              className="flex h-12 items-center justify-center rounded-xl border-2 border-border bg-surface text-sm font-bold transition-colors hover:border-muted has-checked:border-primary has-checked:bg-primary-soft has-checked:text-on-primary-soft has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
            >
              <input type="radio" name="radius" checked={radius === km} onChange={() => setRadius(km)} className="sr-only" />
              {km} km
            </label>
          ))}
        </div>
      </fieldset>

      {problem && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft">
          {problem}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button type="submit" disabled={busy} className={buttonStyles({ variant: "primary", className: "w-full" })}>
          {busy ? "Saving…" : firstTime ? "Save and continue" : "Save changes"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="self-center py-2 text-sm font-bold text-muted underline-offset-4 hover:text-text hover:underline">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
