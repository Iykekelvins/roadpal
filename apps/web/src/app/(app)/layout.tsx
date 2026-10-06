import { Logo } from "@/components/logo";

// App screens: built for a phone, so on a desktop they sit in a narrow centred column instead of
// stretching a two-button form across a 1440px screen.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-md items-center px-4">
          <Logo />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8 sm:py-12">{children}</main>
    </>
  );
}
