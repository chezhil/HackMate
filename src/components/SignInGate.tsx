"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAccount } from "./useAccount";
import { PageSkeleton } from "./PageSkeleton";
import { EmptyState } from "./ui/Feedback";

/** Pages that are all about your own data. Discover, hackathon pages and people stay open to everyone. */
const PERSONAL = ["/tracker", "/calendar", "/results", "/profile", "/settings"];

/** On a public HackMate, personal pages ask signed-out visitors to sign in instead of showing an empty shell. */
export function SignInGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { loaded, user, loginRequired } = useAccount();
  const personal = PERSONAL.some((p) => path === p || path.startsWith(`${p}/`));
  // Until we know who's signed in, a skeleton; then the sign-in prompt for a signed-out visitor.
  const waiting = personal && !loaded;
  const gated = personal && loaded && !user && loginRequired;
  const next = encodeURIComponent(path);
  // The page itself always renders, just hidden while waiting or gated, so Next can still check it for
  // instant navigation; a signed-out visitor's reads come back empty anyway.
  return (
    <>
      {waiting && <PageSkeleton />}
      {gated && (
        <EmptyState
          level={1}
          icon={<LockKeyhole />}
          title="Sign in to see this"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href={`/signin?next=${next}`} className="btn btn-primary">Sign in</Link>
              <Link href={`/signin?mode=signup&next=${next}`} className="btn">Create account</Link>
            </div>
          }
        >
          Your tracker, calendar, results and profile belong to your account. You can still browse hackathons and people without one.
        </EmptyState>
      )}
      <div hidden={waiting || gated}>{children}</div>
    </>
  );
}
