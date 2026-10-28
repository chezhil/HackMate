"use client";

import { ArrowLeft, Award, CalendarDays, ExternalLink, FileText, MapPin, Pencil, Trophy, UserX, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useAccount } from "@/components/useAccount";
import { Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { call } from "@/lib/client";
import { RESULT_TONE } from "@/app/results/ResultsView";
import { fmtDate, fmtRange } from "@/lib/format";
import type { Member, MemberCertificate, MemberHackathon } from "@/lib/types";
import { RESULT_LABELS } from "@/lib/types";

/** Someone's public profile: what they chose to show under Discover → People. */
export function PersonView() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAccount();
  const [m, setM] = useState<Member | null>(null);
  const [done, setDone] = useState<MemberHackathon[]>([]);
  const [certs, setCerts] = useState<MemberCertificate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ member: Member; hackathons: MemberHackathon[]; certificates: MemberCertificate[] }>(`/api/people/${username}`).then(
      (d) => {
        setM(d.member);
        setDone(d.hackathons ?? []);
        setCerts(d.certificates ?? []);
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

      <section aria-labelledby="done" className="card space-y-3 p-5">
        <h2 id="done" className="text-sm font-bold uppercase tracking-wide">Hackathons · {done.length}</h2>
        {done.length === 0 ? (
          <p className="text-sm text-muted">{me?.username === m.username ? "Hackathons you've submitted to or finished show up here." : "No finished hackathons yet."}</p>
        ) : (
          <ul className="divide-y divide-border">
            {done.map((h) => (
              <li key={h.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <a href={h.url} target="_blank" rel="noreferrer" className="break-words font-semibold hover:underline">{h.title}</a>
                  <p className="text-xs text-muted">{fmtRange(h)} · {h.mode === "online" ? "Online" : "In person"}</p>
                  {h.project && (
                    <p className="mt-1 text-sm">
                      Built <span className="font-semibold">{h.project.name}</span>
                      {h.project.tagline && <span className="text-muted">: {h.project.tagline}</span>}
                      {h.project.repoUrl && <> · <a href={h.project.repoUrl} target="_blank" rel="noreferrer nofollow" className="text-accent hover:underline">Code ↗</a></>}
                      {h.project.demoUrl && <> · <a href={h.project.demoUrl} target="_blank" rel="noreferrer nofollow" className="text-accent hover:underline">Demo ↗</a></>}
                    </p>
                  )}
                </div>
                {h.result ? (
                  <Badge tone={RESULT_TONE[h.result]}>{h.result === "won" && <Trophy aria-hidden className="size-3" />}{RESULT_LABELS[h.result]}</Badge>
                ) : (
                  <Badge>Awaiting results</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="certs" className="card space-y-3 p-5">
        <h2 id="certs" className="text-sm font-bold uppercase tracking-wide">Certificates · {certs.length}</h2>
        {certs.length === 0 ? (
          <p className="text-sm text-muted">{me?.username === m.username ? "Certificates you add on a hackathon's Wrap-up page show up here." : "No certificates yet."}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {certs.map((c) => {
              const href = c.file ? `/api/files/${c.file}` : c.url;
              const body = (
                <>
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border-(length:--line) border-border bg-surface-2">
                    {c.file && c.mime?.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/files/${c.file}`} alt="" className="h-full w-full object-cover" />
                    ) : c.file ? (
                      <FileText aria-hidden className="size-5 text-muted" />
                    ) : (
                      <Award aria-hidden className="size-5 text-accent" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-semibold">{c.title}</span>
                    <span className="block text-xs text-muted">{c.hackathonTitle}{c.receivedAt && ` · ${fmtDate(c.receivedAt)}`}</span>
                  </span>
                  {href && <ExternalLink aria-hidden className="size-3.5 shrink-0 text-muted" />}
                </>
              );
              return (
                <li key={c.id}>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="card card-lift flex items-center gap-3 p-3 text-sm">{body}</a>
                  ) : (
                    <div className="card flex items-center gap-3 p-3 text-sm">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
