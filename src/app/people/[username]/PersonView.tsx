"use client";

import { ArrowLeft, CalendarDays, MapPin, Pencil, UserX, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useAccount } from "@/components/useAccount";
import { Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { call } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import type { Member } from "@/lib/types";

/** Someone's public profile: what they chose to show under Discover → People. */
export function PersonView() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAccount();
  const [m, setM] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ member: Member }>(`/api/people/${username}`).then(
      (d) => {
        setM(d.member);
        document.title = `${d.member.profile.name || d.member.username} · HackMate`;
      },
      (e: Error) => setError(e.message),
    );
  }, [username, user?.profile]);

  if (error) {
    return (
      <EmptyState level={1} icon={<UserX />} title="Profile not found" action={<Link href="/?show=people" className="btn btn-primary">See everyone</Link>}>
        No one on HackMate has that username.
      </EmptyState>
    );
  }
  if (!m) return <Skeleton className="mx-auto h-64 max-w-3xl" />;
  const me = user;
  const p = m.profile;
  const name = p.name || m.username;
  // Only http(s) links are shown, so a profile can't carry a javascript: link.
  const links = [
    { label: "GitHub", href: p.github },
    { label: "LinkedIn", href: p.linkedin },
    { label: "Website", href: p.website },
  ].filter((l) => /^https?:\/\//i.test(l.href));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/?show=people" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft aria-hidden className="size-4" /> All people
      </Link>
      <article className="card space-y-4 p-5">
        <header className="flex flex-wrap items-start gap-4">
          <Avatar name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="page-title break-words">{name}</h1>
            <p className="text-sm text-muted">@{m.username}</p>
            {p.headline && <p className="mt-1 break-words">{p.headline}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {p.location && <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="size-3" /> {p.location}</span>}
              <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden className="size-3" /> Joined {fmtDate(m.joinedAt)}</span>
            </p>
          </div>
          {me?.username === m.username && (
            <Link href="/profile" className="btn btn-sm"><Pencil aria-hidden className="size-3.5" /> Edit profile</Link>
          )}
        </header>
        {p.lookingForTeam && <Badge tone="ok"><Users aria-hidden className="size-3" /> Looking for a team</Badge>}
        {p.bio && <p className="whitespace-pre-line break-words text-sm">{p.bio}</p>}
        {p.skills.length > 0 && (
          <section>
            <h2 className="label">Skills</h2>
            <div className="flex flex-wrap gap-1.5">{p.skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>
          </section>
        )}
        {links.length > 0 && (
          <section className="flex flex-wrap gap-2">
            {links.map((l) => <a key={l.label} href={l.href} target="_blank" rel="noreferrer nofollow" className="btn btn-sm">{l.label} ↗</a>)}
          </section>
        )}
        {!p.bio && !p.headline && p.skills.length === 0 && links.length === 0 && (
          <p className="text-sm text-muted">{me?.username === m.username ? "Your profile is empty. Edit it so people know what you build." : "Nothing here yet."}</p>
        )}
      </article>
    </div>
  );
}
