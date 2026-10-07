import Link from "next/link";
import { buttonStyles } from "@/components/button-styles";
import { Logo } from "@/components/logo";
import { WakeServer } from "@/components/wake-server";

// The informational site: full-width and responsive. App screens live in the (app) route group
// with their own layout. Route groups (folders in parentheses) don't appear in the URL.
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="elevate-on-scroll sticky top-0 z-10 border-b border-border bg-ground/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Sections" className="hidden items-center gap-8 text-sm font-semibold text-muted md:flex">
            <a href="#how-it-works" className="transition-colors hover:text-text">How it works</a>
            <a href="#vulcanizers" className="transition-colors hover:text-text">For vulcanizers</a>
            <a href="#faq" className="transition-colors hover:text-text">FAQ</a>
          </nav>
          <Link href="/login?as=driver" className={buttonStyles({ variant: "signal", size: "sm", className: "rounded-xl" })}>
            Get help
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>
      <WakeServer />

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-2">
            <Logo />
            <p className="text-sm text-muted">Roadside tyre help, from vulcanizers near you.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-muted">
            <a href="#how-it-works" className="transition-colors hover:text-text">How it works</a>
            <a href="#vulcanizers" className="transition-colors hover:text-text">For vulcanizers</a>
            <a href="#faq" className="transition-colors hover:text-text">FAQ</a>
            <Link href="/login" className="transition-colors hover:text-text">Log in</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
