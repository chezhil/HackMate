import { LogoMark } from "./Logo";
import { PageSkeleton } from "./PageSkeleton";

const LINKS = ["Discover", "Tracker", "Calendar", "Results", "Profile", "Settings"];

/**
 * What the first load shows before the app's data arrives: the real header (logo and tabs, not yet clickable)
 * over the page skeleton, so the page doesn't jump when the nav appears.
 */
export function LoadingShell() {
  return (
    <>
      <header className="sticky top-0 z-[1000] border-b-(length:--line) border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-6">
          <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <LogoMark className="motion-safe:animate-[hm-wiggle_1.2s_ease-in-out_infinite]" />
            <span className="hidden sm:inline">HackMate</span>
          </span>
          <div className="flex min-w-0 flex-1 gap-1 overflow-hidden p-1 text-sm" aria-hidden>
            {LINKS.map((l) => (
              <span key={l} className="whitespace-nowrap rounded-lg border-(length:--line) border-transparent px-3 py-1 font-semibold text-muted">
                {l}
              </span>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6" aria-busy="true">
        <p className="sr-only" role="status">Loading HackMate…</p>
        <PageSkeleton />
      </main>
    </>
  );
}
