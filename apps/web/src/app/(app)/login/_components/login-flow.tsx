"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneSchema, type UserRole } from "@repo/shared";
import { buttonStyles } from "@/components/button-styles";
import { ApiError, NetworkError } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { HOME, requestOtp, restoreSession, verifyOtp } from "@/lib/auth";

type Step = "phone" | "code" | "role";
type Problem = { kind: "error" | "offline"; message: string } | null;

const RESEND_AFTER_SECONDS = 30;

// What the user types after the fixed +234: "803 123 4567", "0803…", or a pasted "+234803…".
function toPhone(input: string) {
  const local = input.replace(/\D/g, "").replace(/^234(?=\d{10}$)/, "").replace(/^0/, "");
  return PhoneSchema.safeParse(`+234${local}`);
}


function toProblem(error: unknown): Problem {
  if (error instanceof NetworkError) return { kind: "offline", message: error.message };
  if (error instanceof ApiError) {
    const firstFieldError = error.fieldErrors && Object.values(error.fieldErrors).flat()[0];
    return { kind: "error", message: firstFieldError ?? error.message };
  }
  return { kind: "error", message: "Something went wrong. Try again." };
}

export function LoginFlow({ suggestedRole }: { suggestedRole?: UserRole }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<UserRole | undefined>(suggestedRole);
  const [devCode, setDevCode] = useState<string>();
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  // A ref, not state: auto-submit and the button can fire in the same tick, before a re-render.
  const inFlight = useRef(false);

  // Already logged in (refresh cookie still valid)? Skip the form.
  useEffect(() => {
    restoreSession()
      .then((me) => me && router.replace(HOME[me.role]))
      .catch(() => {}); // offline or logged out: just show the form
  }, [router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function run(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await task();
    } catch (error) {
      setProblem(toProblem(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const sendCode = (target: string) =>
    run(async () => {
      const sent = await requestOtp(target);
      setPhone(target);
      setDevCode(sent.devCode);
      setCode("");
      setResendIn(RESEND_AFTER_SECONDS);
      setStep("code");
    });

  function submitPhone(event: React.FormEvent) {
    event.preventDefault();
    const parsed = toPhone(phoneInput);
    if (!parsed.success) {
      setProblem({ kind: "error", message: parsed.error.issues[0]!.message });
      return;
    }
    void sendCode(parsed.data);
  }

  const submitCode = (value: string, chosenRole?: UserRole) =>
    run(async () => {
      try {
        const { user } = await verifyOtp(phone, value, chosenRole);
        router.replace(HOME[user.role]);
      } catch (error) {
        // New number: the code was right, but we need to know who they are before creating the account.
        if (error instanceof ApiError && error.code === "ROLE_REQUIRED") {
          setStep("role");
          return;
        }
        // A rejected code (wrong, expired, used up) sends them back to type it again.
        if (error instanceof ApiError) {
          setCode("");
          setStep("code");
        }
        throw error;
      }
    });

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void submitCode(digits); // no extra tap once the 6th digit is in
  }

  return (
    <div className="flex flex-col gap-8">
      {step === "phone" && (
        <form onSubmit={submitPhone} noValidate className="flex flex-col gap-6">
          <Heading title="Log in or sign up" subtitle="Enter your phone number. We’ll text you a 6‑digit code." />
          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold">Phone number</span>
            <span className="flex h-14 items-center rounded-2xl border-2 border-border bg-surface transition-colors focus-within:border-primary">
              <span className="border-r border-border px-4 text-lg font-bold text-muted">+234</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                autoFocus
                placeholder="803 123 4567"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                aria-invalid={problem?.kind === "error"}
                className="h-full min-w-0 flex-1 rounded-r-2xl bg-transparent px-4 text-lg font-semibold tracking-wide outline-none placeholder:font-normal placeholder:text-muted/70"
              />
            </span>
          </label>
          <ProblemMessage problem={problem} />
          <button type="submit" disabled={busy} className={buttonStyles({ variant: "primary", className: "w-full" })}>
            {busy ? "Sending code…" : "Send code"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitCode(code);
          }}
          noValidate
          className="flex flex-col gap-6"
        >
          <Heading
            title="Enter the code"
            subtitle={
              <>
                Sent to <strong className="font-bold text-text">{formatPhone(phone)}</strong>.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setProblem(null);
                    setStep("phone");
                  }}
                  className="font-bold text-primary underline-offset-4 hover:underline"
                >
                  Change number
                </button>
              </>
            }
          />
          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold">6-digit code</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code" // lets phones offer the code from the SMS
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              aria-invalid={problem?.kind === "error"}
              className="h-16 rounded-2xl border-2 border-border bg-surface text-center text-3xl font-extrabold tracking-[0.5em] indent-[0.5em] outline-none transition-colors focus:border-primary"
            />
          </label>

          {devCode && (
            <p className="flex items-center justify-between gap-3 rounded-2xl bg-signal-soft px-4 py-3 text-sm text-on-signal-soft">
              <span>
                Dev mode, no SMS sent. Code: <strong className="font-extrabold tracking-widest">{devCode}</strong>
              </span>
              <button type="button" onClick={() => onCodeChange(devCode)} className="font-extrabold underline underline-offset-4">
                Use it
              </button>
            </p>
          )}

          <ProblemMessage problem={problem} />
          <button type="submit" disabled={busy || code.length < 6} className={buttonStyles({ variant: "primary", className: "w-full" })}>
            {busy ? "Checking…" : "Continue"}
          </button>
          <button
            type="button"
            disabled={busy || resendIn > 0}
            onClick={() => void sendCode(phone)}
            className="self-center text-sm font-bold text-primary underline-offset-4 hover:underline disabled:text-muted disabled:no-underline"
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </button>
        </form>
      )}

      {step === "role" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (role) void submitCode(code, role);
          }}
          className="flex flex-col gap-6"
        >
          <Heading title="Welcome to RoadPal" subtitle="This number is new here. How will you use RoadPal?" />
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Account type</legend>
            <RoleOption value="driver" checked={role === "driver"} onSelect={setRole} title="I need tyre help" detail="Request a vulcanizer and track them to your car." />
            <RoleOption value="provider" checked={role === "provider"} onSelect={setRole} title="I'm a vulcanizer" detail="Get nearby jobs and send your price." />
          </fieldset>
          <p className="text-sm text-muted">You can’t switch this later, so pick the one that fits.</p>
          <ProblemMessage problem={problem} />
          <button type="submit" disabled={busy || !role} className={buttonStyles({ variant: "primary", className: "w-full" })}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>
      )}
    </div>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="text-muted">{subtitle}</p>
    </div>
  );
}

function RoleOption({
  value,
  checked,
  onSelect,
  title,
  detail,
}: {
  value: UserRole;
  checked: boolean;
  onSelect: (role: UserRole) => void;
  title: string;
  detail: string;
}) {
  // A real radio input under the card: keyboard arrows and screen readers work for free.
  return (
    <label className="flex cursor-pointer items-start gap-4 rounded-2xl border-2 border-border bg-surface p-4 transition-colors hover:border-muted has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary">
      <input type="radio" name="role" value={value} checked={checked} onChange={() => onSelect(value)} className="mt-1 size-5 accent-primary" />
      <span className="flex flex-col gap-1">
        <span className="font-extrabold">{title}</span>
        <span className="text-sm text-muted">{detail}</span>
      </span>
    </label>
  );
}

function ProblemMessage({ problem }: { problem: Problem }) {
  // role="alert" makes screen readers announce it as soon as it appears.
  return (
    <div role="alert" className="empty:hidden">
      {problem && (
        <p
          className={
            problem.kind === "offline"
              ? "rounded-2xl bg-info-soft px-4 py-3 text-sm font-semibold text-on-info-soft"
              : "rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-on-danger-soft"
          }
        >
          {problem.message}
        </p>
      )}
    </div>
  );
}
