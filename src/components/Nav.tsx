"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHackmate } from "./HackmateProvider";
import { ThemeSwitch } from "./ThemeSwitch";
import { CountPill } from "./ui/Feedback";

const LINKS = [
  { href: "/", label: "Discover" },
  { href: "/tracker", label: "Tracker" },
  { href: "/calendar", label: "Calendar" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  const { tracked, clashes, error } = useHackmate();
  const active = tracked.filter((t) => t.status !== "results").length;
  return (
    <header className="sticky top-0 z-[1000] border-b-(length:--line) border-border bg-surface">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-6">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span className="grid h-8 w-8 -rotate-6 place-items-center rounded-lg border-(length:--line) border-border bg-warn-soft text-base font-bold text-text shadow-hard-sm">H</span>
          <span className="hidden sm:inline">HackMate</span>
        </Link>
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto p-1 text-sm">
          {LINKS.map((l) => {
            const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border-(length:--line) px-3 py-1 font-semibold ${on ? "border-border bg-accent-soft text-text shadow-hard-sm" : "border-transparent text-muted hover:border-border hover:text-text"}`}
              >
                {l.label}
                {l.href === "/tracker" && active > 0 && (
                  <CountPill label={`${active} active`}>{active}</CountPill>
                )}
                {l.href === "/calendar" && clashes.length > 0 && (
                  <CountPill tone="danger" label={`${clashes.length} clash${clashes.length > 1 ? "es" : ""}`}>{clashes.length}</CountPill>
                )}
              </Link>
            );
          })}
        </nav>
        {/* Outside the scrolling nav so it stays in reach on phones. */}
        <div className="shrink-0">
          <ThemeSwitch />
        </div>
      </div>
      {error && (
        <div className="border-t border-danger/30 bg-danger-soft px-4 py-2 text-center text-sm text-danger">{error}</div>
      )}
    </header>
  );
}
