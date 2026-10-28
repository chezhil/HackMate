"use client";

import { MapPin, Search, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "./Avatar";
import { useAccount } from "./useAccount";
import { Badge, Banner, EmptyState, Skeleton } from "./ui/Feedback";
import { ChipToggle } from "./ui/Form";
import { call } from "@/lib/client";
import type { Member } from "@/lib/types";

/** Everyone with an account on this HackMate, searchable by name, skill or place. */
export function PeopleDirectory() {
  const { user } = useAccount();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [lookingOnly, setLookingOnly] = useState(false);
  const [skill, setSkill] = useState<string | null>(null);

  useEffect(() => {
    call<{ members: Member[] }>("/api/people").then((d) => setMembers(d.members), (e: Error) => setError(e.message));
    // Reload when you sign in or up, so you appear in the list straight away.
  }, [user?.username]);

  // The most common skills, as quick filters.
  const topSkills = useMemo(() => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const m of members ?? []) for (const s of m.profile.skills) {
      const k = s.toLowerCase();
      counts.set(k, { label: counts.get(k)?.label ?? s, n: (counts.get(k)?.n ?? 0) + 1 });
    }
    return [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
  }, [members]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (members ?? []).filter((m) => {
      const p = m.profile;
      if (lookingOnly && !p.lookingForTeam) return false;
      if (skill && !p.skills.some((s) => s.toLowerCase() === skill)) return false;
      return !needle || [m.username, p.name, p.headline, p.location, p.bio, ...p.skills].join(" ").toLowerCase().includes(needle);
    });
  }, [members, q, lookingOnly, skill]);

  return (
    <div className="space-y-4">
      {!user && (
        <Banner tone="accent" action={<Link href="/signin?mode=signup&next=/?show=people" className="btn btn-sm btn-primary"><UserPlus aria-hidden className="size-3.5" /> Create account</Link>}>
          Make an account to show up here, so other hackers can find you for a team.
        </Banner>
      )}
      {error && <Banner tone="danger">{error}</Banner>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search people</span>
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className="input pl-8" type="search" placeholder="Search name, skill, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <ChipToggle on={lookingOnly} onClick={() => setLookingOnly(!lookingOnly)}>
          <Users aria-hidden className="size-3" /> Looking for a team
        </ChipToggle>
      </div>
      {topSkills.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Filter by skill">
          {topSkills.map(([k, { label, n }]) => (
            <ChipToggle key={k} on={skill === k} onClick={() => setSkill(skill === k ? null : k)}>{label} · {n}</ChipToggle>
          ))}
        </div>
      )}

      <p className="text-sm text-muted" aria-live="polite">
        {members == null ? "Loading people…" : `${shown.length} of ${members.length} ${members.length === 1 ? "person" : "people"}`}
      </p>

      {members == null && !error && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-32" />)}</div>
      )}
      {members?.length === 0 && (
        <EmptyState icon={<Users />} title="No one has signed up yet" action={!user && <Link href="/signin?mode=signup&next=/?show=people" className="btn btn-primary">Be the first</Link>}>
          Profiles appear here as people create accounts.
        </EmptyState>
      )}
      {members != null && members.length > 0 && shown.length === 0 && (
        <EmptyState icon={<Search />} title="No one matches">Try another search, or turn off a filter.</EmptyState>
      )}

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((m) => <PersonCard key={m.username} m={m} you={m.username === user?.username} />)}
      </ul>
    </div>
  );
}

function PersonCard({ m, you }: { m: Member; you: boolean }) {
  const p = m.profile;
  const name = p.name || m.username;
  return (
    <li>
      <Link href={`/people/${m.username}`} className="card card-lift flex h-full gap-3 p-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="min-w-0 break-words font-bold leading-snug">{name}</span>
            <span className="text-xs text-muted">@{m.username}</span>
            {you && <Badge tone="accent">You</Badge>}
          </div>
          {p.headline && <p className="line-clamp-2 break-words text-sm text-muted">{p.headline}</p>}
          {p.location && <p className="flex items-center gap-1 text-xs text-muted"><MapPin aria-hidden className="size-3" /> {p.location}</p>}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {p.lookingForTeam && <Badge tone="ok"><Users aria-hidden className="size-3" /> Looking for a team</Badge>}
            {p.skills.slice(0, 4).map((s) => <span key={s} className="chip">{s}</span>)}
            {p.skills.length > 4 && <span className="chip">+{p.skills.length - 4}</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}
