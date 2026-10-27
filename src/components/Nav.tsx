"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHackmate } from "./HackmateProvider";

const LINKS = [
  { href: "/", label: "Discover" },
  { href: "/tracker", label: "Tracker" },
  { href: "/calendar", label: "Calendar" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  const { tracked, clashes, error } = useHackmate();
  const active = tracked.filter((t) => t.status !== "results").length;
  return (
    <header className="sticky top-0 z-[1000] border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-6">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-accent-text">H</span>
          <span className="hidden sm:inline">HackMate</span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => {
            const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 ${on ? "bg-surface-2 font-medium text-text" : "text-muted hover:text-text"}`}
              >
                {l.label}
                {l.href === "/tracker" && active > 0 && (
                  <span className="rounded-full bg-accent-soft px-1.5 text-xs text-accent">{active}</span>
                )}
                {l.href === "/calendar" && clashes.length > 0 && (
                  <span className="rounded-full bg-danger-soft px-1.5 text-xs text-danger" title="Clashes">
                    {clashes.length}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
      {error && (
        <div className="border-t border-danger/30 bg-danger-soft px-4 py-2 text-center text-sm text-danger">{error}</div>
      )}
    </header>
  );
}
