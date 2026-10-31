"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNotable, worstSeverity } from "@/lib/clashes";
import { useHackmate } from "./HackmateProvider";
import { ThemeSwitch } from "./ThemeSwitch";
import { useAccount } from "./useAccount";
import { Avatar } from "./Avatar";
import { LogoMark } from "./Logo";
import { CountPill } from "./ui/Feedback";

const LINKS = [
  { href: "/", label: "Discover" },
  { href: "/tracker", label: "Tracker" },
  { href: "/calendar", label: "Calendar" },
  { href: "/results", label: "Results" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  const { tracked, clashes, error } = useHackmate();
  const { loaded, user } = useAccount();
  const active = tracked.filter((t) => t.status !== "results").length;
  // Minor clashes (long online events side by side) don't count toward the badge.
  const notable = clashes.filter(isNotable);
  const worst = worstSeverity(notable);
  return (
    <header className="sticky top-0 z-[1000] border-b-(length:--line) border-border bg-surface">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-6">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <LogoMark />
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
                {l.href === "/calendar" && notable.length > 0 && (
                  <CountPill tone={worst === "medium" ? "warn" : "danger"} label={`${notable.length} clash${notable.length > 1 ? "es" : ""} to look at`}>
                    {notable.length}
                  </CountPill>
                )}
              </Link>
            );
          })}
        </nav>
        {/* Outside the scrolling nav so it stays in reach on phones. */}
        <div className="flex shrink-0 items-center gap-2">
          <ThemeSwitch />
          {user ? (
            <Link
              href="/profile"
              className="flex items-center gap-1.5 rounded-lg border-(length:--line) border-border bg-surface px-1.5 py-1 text-sm font-semibold shadow-hard-sm hover:bg-surface-2"
              title={`Signed in as @${user.username}`}
            >
              <Avatar name={user.profile.name || user.username} size="sm" />
              <span className="hidden max-w-32 truncate md:inline">@{user.username}</span>
            </Link>
          ) : (
            // Hidden until we know, so it doesn't flash "Sign in" for someone who is.
            <Link href="/signin" className={`btn btn-sm ${loaded ? "" : "invisible"}`}>Sign in</Link>
          )}
        </div>
      </div>
      {error && (
        <div className="border-t border-danger/30 bg-danger-soft px-4 py-2 text-center text-sm text-danger">{error}</div>
      )}
    </header>
  );
}
