import Link from "next/link";

/** RoadPal mark + wordmark. The mark is a placeholder tyre glyph until there is a real logo. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 rounded-xl" aria-label="RoadPal home">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-on-primary">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
        </svg>
      </span>
      <span className="text-xl font-extrabold tracking-tight">RoadPal</span>
    </Link>
  );
}
