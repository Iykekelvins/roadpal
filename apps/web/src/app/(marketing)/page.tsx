import {
  Banknote,
  BellRing,
  ChevronDown,
  CircleCheck,
  HandCoins,
  LocateFixed,
  Navigation,
  Radar,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { buttonStyles } from "@/components/button-styles";
import { OffersPreview } from "./_components/offers-preview";
import { RevealOnScroll } from "./_components/reveal-on-scroll";

// Server components only: this page renders to plain HTML and adds no JavaScript of its own,
// so it loads fast on a weak connection. Motion is CSS (see globals.css) plus one tiny observer
// that triggers scroll reveals; the FAQ uses <details>.

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: LocateFixed,
    title: "Tell us what's wrong",
    body: "Your location is picked up automatically. Choose your vehicle and the problem: flat tyre, puncture, burst, no spare or low pressure.",
  },
  {
    icon: HandCoins,
    title: "Compare offers",
    body: "Vulcanizers in range send their price and how soon they can reach you. See their rating before you pick one.",
  },
  {
    icon: Navigation,
    title: "Track, then pay",
    body: "Follow them on the map, call with one tap, and pay in cash or by transfer once your tyre is fixed.",
  },
];

const REASONS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: HandCoins, title: "You choose the price", body: "Offers, not a fixed rate. Compare price and arrival time, then decide." },
  { icon: Radar, title: "Built for the highway", body: "If no one is close, RoadPal widens the search on its own and tells more vulcanizers." },
  { icon: UserCheck, title: "Know who's coming", body: "Name and rating before you accept. Their phone number as soon as you do." },
  { icon: ShieldCheck, title: "Your location stays private", body: "Vulcanizers see how far away you are. Only the one you accept sees exactly where." },
];

const PROVIDER_POINTS: { icon: LucideIcon; text: string }[] = [
  { icon: BellRing, text: "Go online when you're free. Jobs within your range come straight to your phone." },
  { icon: SlidersHorizontal, text: "Choose which jobs you take and how far you'll travel." },
  { icon: HandCoins, text: "Set your own price for every job." },
  { icon: Banknote, text: "Get paid directly by the driver, in cash or by transfer." },
  { icon: Star, text: "Build your reputation with a rating after every job." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "How do I pay?",
    a: "Directly to the vulcanizer, in cash or by bank transfer, once the job is done. RoadPal doesn't take payment in the app.",
  },
  {
    q: "What if the vulcanizer doesn't show up?",
    a: "Cancel the job and choose to look again. Your request goes back out to other vulcanizers nearby, and the one who didn't show can't offer on it again.",
  },
  {
    q: "Do I need to install an app?",
    a: "No. RoadPal works in your phone's browser or on a computer. On your phone you can add it to your home screen for one-tap access.",
  },
  {
    q: "What can RoadPal help with?",
    a: "Tyre problems: flat tyres, punctures, burst tyres, no spare, and tyres that need air.",
  },
  {
    q: "What if there's no vulcanizer near me?",
    a: "Every few minutes without an offer, RoadPal searches a wider area and alerts more vulcanizers, up to 50 km away.",
  },
];

/** Staggers items in a row: each one's reveal starts a little after the previous. */
const stagger = (i: number) => ({ "--reveal-delay": `${i * 90}ms` }) as CSSProperties;

/**
 * The hero's entrance, in one place so it reads as one sequence (ms after load; each element
 * then takes 600ms to rise in). The two columns cascade in parallel and finish together: the
 * checklist (left) and the second offer (right) both start at 280ms, so the whole hero lands at
 * 880ms. Keep the last item of each column on the same start time when retuning.
 */
const HERO_TIMELINE = {
  eyebrow: 0,
  headline: 70,
  paragraph: 140,
  buttons: 210,
  checklist: 280,
  preview: 70,
  offers: [175, 280],
};

const entrance = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-bold uppercase tracking-[0.08em] text-primary">{children}</p>;
}

export default function LandingPage() {
  return (
    <>
      <RevealOnScroll />
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 md:grid-cols-2 md:pb-24 md:pt-20 lg:gap-20">
        <div className="flex flex-col gap-6">
          <div className="motion-safe:animate-rise" style={entrance(HERO_TIMELINE.eyebrow)}>
            <Eyebrow>Roadside tyre help</Eyebrow>
          </div>
          <h1
            className="text-4xl font-extrabold leading-[1.05] tracking-tight motion-safe:animate-rise sm:text-5xl lg:text-6xl"
            style={entrance(HERO_TIMELINE.headline)}
          >
            Flat tyre? Get a vulcanizer to you.
          </h1>
          <p className="max-w-xl text-lg text-muted motion-safe:animate-rise" style={entrance(HERO_TIMELINE.paragraph)}>
            Share where you are. Vulcanizers nearby send offers with their price and arrival time. Pick
            one, watch them come to you on the map, and pay when the job is done.
          </p>
          <div className="flex flex-col gap-3 motion-safe:animate-rise sm:flex-row" style={entrance(HERO_TIMELINE.buttons)}>
            <Link href="/login?as=driver" className={buttonStyles({ variant: "signal" })}>
              Get help now
            </Link>
            <Link href="/login?as=provider" className={buttonStyles({ variant: "outline" })}>
              I&apos;m a vulcanizer
            </Link>
          </div>
          <ul
            className="flex flex-col gap-2 text-sm text-muted motion-safe:animate-rise sm:flex-row sm:flex-wrap sm:gap-x-6"
            style={entrance(HERO_TIMELINE.checklist)}
          >
            {["Nothing to pay upfront", "Cash or transfer on completion", "No app to install"].map((point) => (
              <li key={point} className="inline-flex items-center gap-2">
                <CircleCheck size={16} className="text-primary" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="motion-safe:animate-rise" style={entrance(HERO_TIMELINE.preview)}>
          <OffersPreview offerDelaysMs={HERO_TIMELINE.offers} />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-y border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 md:py-24">
          <div className="reveal flex max-w-2xl flex-col gap-3">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Three steps from stuck to sorted</h2>
          </div>
          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li
                key={title}
                style={stagger(i)}
                className="reveal flex flex-col gap-4 rounded-2xl border border-border bg-ground p-6 transition-[translate,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-on-primary-soft">
                    <Icon size={24} aria-hidden="true" />
                  </span>
                  <span className="text-sm font-bold text-muted">Step {i + 1}</span>
                </div>
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why RoadPal */}
      <section className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 md:py-24">
        <div className="reveal flex max-w-2xl flex-col gap-3">
          <Eyebrow>Why RoadPal</Eyebrow>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Made for breakdowns far from town</h2>
        </div>
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {REASONS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="reveal flex gap-4" style={stagger(i % 2)}>
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface text-primary ring-1 ring-border">
                <Icon size={24} aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="text-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* For vulcanizers */}
      <section id="vulcanizers" className="scroll-mt-20 bg-primary text-on-primary">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:items-center md:py-24">
          <div className="reveal flex flex-col gap-5">
            <p className="text-sm font-bold uppercase tracking-[0.08em] opacity-80">For vulcanizers</p>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">More jobs, sent straight to your phone</h2>
            <p className="text-lg opacity-90">
              Drivers stuck near you can find you, even when you&apos;re not by the roadside. You decide
              which jobs to take and what to charge.
            </p>
            <Link
              href="/login?as=provider"
              className={buttonStyles({ variant: "inverse", className: "w-full sm:w-auto sm:self-start" })}
            >
              Start as a vulcanizer
            </Link>
          </div>
          {/* One trigger for the whole list: the cards cascade in together once it enters view. */}
          <ul className="reveal-group flex flex-col gap-4">
            {PROVIDER_POINTS.map(({ icon: Icon, text }, i) => (
              <li
                key={text}
                style={stagger(i)}
                className="reveal-item flex items-start gap-4 rounded-2xl bg-on-primary/10 p-4"
              >
                <Icon size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span className="text-base">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto flex max-w-3xl scroll-mt-20 flex-col gap-8 px-4 py-16 sm:px-6 md:py-24">
        <div className="reveal flex flex-col gap-3">
          <Eyebrow>Questions</Eyebrow>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Good to know</h2>
        </div>
        <div className="reveal flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          {FAQ.map(({ q, a }) => (
            // Same `name` on every <details> makes an exclusive accordion: opening one closes the rest.
            <details key={q} name="faq" className="faq group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-lg font-bold transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary">
                {q}
                <ChevronDown
                  size={20}
                  className="shrink-0 text-muted transition-transform duration-300 group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <p className="px-5 pb-5 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final call to action */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 md:pb-24">
        <div className="reveal flex flex-col items-start gap-6 rounded-3xl border border-border bg-surface p-8 md:flex-row md:items-center md:justify-between md:p-12">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Stuck right now?</h2>
            <p className="text-muted">Request help in under a minute. Vulcanizers nearby are alerted straight away.</p>
          </div>
          <Link href="/login?as=driver" className={buttonStyles({ variant: "signal", className: "w-full shrink-0 md:w-auto" })}>
            Get help now
          </Link>
        </div>
      </section>
    </>
  );
}
