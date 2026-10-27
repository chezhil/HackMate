"use client";

import { ScrollText, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CertificateList, type CertData } from "@/components/CertificateList";
import { money, PrizeList } from "@/components/PrizeList";
import { Badge, CountPill, Stars } from "@/components/ui/Feedback";
import { Tabs } from "@/components/ui/Tabs";
import { call, hid } from "@/lib/client";
import { fmtDate, fmtRange } from "@/lib/format";
import type { Certificate, Prize, Profile, Project, Retro, Stats, TrackedWithHackathon } from "@/lib/types";
import { RESULT_LABELS, SOURCE_LABELS } from "@/lib/types";

interface PortfolioEntry {
  tracked: TrackedWithHackathon;
  project: Project;
  prizes: Prize[];
  certificates: Certificate[];
  retro: Retro;
}

interface ProfileData {
  profile: Profile;
  stats: Stats;
  portfolio: PortfolioEntry[];
  prizes: Prize[];
  certificates: Certificate[];
  missingCertificates: CertData["missing"];
}

const TABS = [
  { key: "stats", label: "Stats" },
  { key: "portfolio", label: "Portfolio" },
  { key: "certificates", label: "Certificates" },
  { key: "prizes", label: "Prizes" },
  { key: "notes", label: "Notes" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const usd = (n: number) => `$${n.toLocaleString()}`;

export function ProfileView() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [tab, setTab] = useState<Tab>("stats");

  const load = () => call<ProfileData>("/api/profile").then(setData);
  useEffect(() => {
    void call<ProfileData>("/api/profile").then(setData);
  }, []);

  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-surface-2" />;

  return (
    <div className="space-y-4">
      <ProfileHeader profile={data.profile} onSaved={(profile) => setData({ ...data, profile })} />
      <Tabs
        tabs={TABS.map((t) => ({
          ...t,
          badge: t.key === "certificates" && data.stats.certificates.pending > 0 ? <CountPill tone="warn" label="Pending certificates">{data.stats.certificates.pending}</CountPill> : undefined,
        }))}
        value={tab}
        onChange={setTab}
        label="Profile sections"
        className="print:hidden"
      />
      {tab === "stats" && <StatsTab stats={data.stats} />}
      {tab === "portfolio" && <PortfolioTab entries={data.portfolio} />}
      {tab === "certificates" && (
        <section className="card p-4">
          <CertificateList
            data={{ certificates: data.certificates, missing: data.missingCertificates }}
            onChange={() => void load()}
          />
        </section>
      )}
      {tab === "prizes" && <PrizesTab data={data} onChange={() => void load()} />}
      {tab === "notes" && <NotesTab entries={data.portfolio} />}
    </div>
  );
}

// ---------- header ----------

const PROFILE_FIELDS: { key: keyof Profile; label: string; placeholder: string }[] = [
  { key: "name", label: "Name", placeholder: "Your name" },
  { key: "headline", label: "Headline", placeholder: "Full-stack dev · 12× hackathon finalist" },
  { key: "location", label: "Location", placeholder: "Bengaluru" },
  { key: "github", label: "GitHub", placeholder: "https://github.com/you" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/you" },
  { key: "website", label: "Website", placeholder: "https://you.dev" },
];

function ProfileHeader({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [editing, setEditing] = useState(!profile.name);
  const [form, setForm] = useState(profile);
  const links = [
    profile.github && { label: "GitHub", href: profile.github },
    profile.linkedin && { label: "LinkedIn", href: profile.linkedin },
    profile.website && { label: "Website", href: profile.website },
  ].filter(Boolean) as { label: string; href: string }[];

  if (editing) {
    return (
      <section className="card grid gap-2 p-4 md:grid-cols-2">
        <h1 className="text-lg font-semibold md:col-span-2">Your profile</h1>
        {PROFILE_FIELDS.map((f) => (
          <label key={f.key}>
            <span className="label">{f.label}</span>
            <input className="input" placeholder={f.placeholder} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          </label>
        ))}
        <label className="md:col-span-2">
          <span className="label">Bio</span>
          <textarea className="input min-h-16" placeholder="What you like to build" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        </label>
        <div className="flex gap-2 md:col-span-2">
          <button
            className="btn btn-primary"
            onClick={async () => {
              const d = await call<{ profile: Profile }>("/api/profile", "PUT", form);
              onSaved(d.profile);
              setEditing(false);
            }}
          >
            Save profile
          </button>
          {profile.name && <button className="btn" onClick={() => setEditing(false)}>Cancel</button>}
        </div>
      </section>
    );
  }

  return (
    <header className="flex flex-wrap items-start gap-4">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent text-2xl font-semibold text-accent-text">
        {profile.name.trim()[0]?.toUpperCase() ?? "?"}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">{profile.name}</h1>
        {profile.headline && <p className="text-muted">{profile.headline}{profile.location && ` · ${profile.location}`}</p>}
        {profile.bio && <p className="mt-1 max-w-2xl text-sm">{profile.bio}</p>}
        {links.length > 0 && (
          <div className="mt-1 flex gap-3 text-sm">
            {links.map((l) => <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="text-accent hover:underline">{l.label} ↗</a>)}
          </div>
        )}
      </div>
      <div className="flex gap-2 print:hidden">
        <button className="btn btn-sm" onClick={() => window.print()} title="Save your portfolio as a PDF">Save as PDF</button>
        <button className="btn btn-sm" onClick={() => { setForm(profile); setEditing(true); }}>Edit profile</button>
      </div>
    </header>
  );
}

// ---------- stats ----------

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

const monthLabel = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleString(undefined, { month: "short" });

/** Hackathons finished per month: one series, so no legend; hover a bar for the numbers. */
function MonthChart({ months }: { months: Stats["byMonth"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...months.map((m) => m.count));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Hackathons finished per month</h2>
        <button className="text-xs text-muted hover:text-text" onClick={() => setAsTable(!asTable)}>{asTable ? "Show chart" : "Show table"}</button>
      </div>
      {asTable ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted"><tr><th className="py-1">Month</th><th>Finished</th><th>Placed</th></tr></thead>
          <tbody className="divide-y divide-border">
            {months.map((m) => <tr key={m.month}><td className="py-1">{monthLabel(m.month)} {m.month.slice(0, 4)}</td><td>{m.count}</td><td>{m.wins}</td></tr>)}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <div className="flex h-40 gap-1.5 border-b border-border pl-6">
            <div className="absolute inset-y-0 left-0 flex w-5 flex-col-reverse justify-between pb-0 text-right text-2xs text-muted" style={{ height: "10rem" }}>
              {ticks.map((t) => <span key={t} className="-translate-y-1/2 leading-none">{t}</span>)}
            </div>
            {months.map((m, i) => (
              <div
                key={m.month}
                className="relative flex flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={`w-full max-w-8 rounded-t-[4px] transition-opacity ${hover !== null && hover !== i ? "opacity-50" : ""}`}
                  style={{ height: `${(m.count / max) * 100}%`, minHeight: m.count ? 4 : 0, background: "var(--accent)" }}
                />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs shadow">
                    <div className="font-medium">{monthLabel(m.month)} {m.month.slice(0, 4)}</div>
                    <div>{m.count} finished · {m.wins} placed</div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 pl-6 pt-1">
            {months.map((m) => <div key={m.month} className="flex-1 text-center text-2xs text-muted">{monthLabel(m.month)}</div>)}
          </div>
        </div>
      )}
    </section>
  );
}

function RankList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              <span className="truncate">{r.label}</span>
              <span className="text-right tabular-nums text-muted">{r.count}</span>
              <div className="col-span-2 h-1.5 rounded-full bg-surface-2">
                <div className="h-1.5 rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: "var(--accent)" }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatsTab({ stats }: { stats: Stats }) {
  if (stats.tracked === 0) {
    return <p className="card p-8 text-center text-sm text-muted">Pin and finish a hackathon to start building your stats.</p>;
  }
  const resultRows = Object.entries(stats.results)
    .map(([k, count]) => ({ label: k === "pending" ? "Waiting on results" : RESULT_LABELS[k as keyof typeof RESULT_LABELS], count }))
    .sort((a, b) => b.count - a.count);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Hackathons done" value={String(stats.done)} sub={`${stats.inProgress} in progress · ${stats.tracked} tracked`} />
        <Tile label="Win rate" value={stats.winRate === null ? "—" : `${stats.winRate}%`} sub={`${stats.podiums} placed · ${stats.wins} won outright`} />
        <Tile label="Prize money won" value={usd(stats.prizeUsd.won)} sub={`${usd(stats.prizeUsd.paid)} paid · ${usd(stats.prizeUsd.pending)} pending`} />
        <Tile label="Certificates" value={String(stats.certificates.received)} sub={`${stats.certificates.pending} pending`} />
      </div>
      <MonthChart months={stats.byMonth} />
      <div className="grid gap-4 md:grid-cols-3">
        <RankList title="Results" rows={resultRows} />
        <RankList title="Top themes" rows={stats.topThemes.map((t) => ({ label: t.theme, count: t.count }))} />
        <section className="card space-y-3 p-4 text-sm">
          <h2 className="text-sm font-semibold">Practice</h2>
          <div>
            <div className="text-xs text-muted">Average idea critique score</div>
            <div className="text-xl font-semibold">{stats.avgIdeaScore ?? "—"}<span className="text-sm text-muted">/10</span></div>
          </div>
          <div>
            <div className="text-xs text-muted">Average mock Q&A score</div>
            <div className="text-xl font-semibold">{stats.avgQaScore ?? "—"}<span className="text-sm text-muted">/10</span></div>
          </div>
          <div>
            <div className="text-xs text-muted">Formats</div>
            <div>{Object.entries(stats.byMode).map(([m, n]) => `${n} ${m}`).join(" · ") || "—"}</div>
          </div>
        </section>
      </div>
      <p className="text-xs text-muted">Prize totals are converted to USD at rough fixed rates; only cash prizes count.</p>
    </div>
  );
}

// ---------- portfolio ----------

function PortfolioTab({ entries }: { entries: PortfolioEntry[] }) {
  if (entries.length === 0) return <p className="card p-8 text-center text-sm text-muted">Finished hackathons show up here with your project, result and prizes.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {entries.map(({ tracked: t, project: p, prizes, certificates }) => {
        const links = [
          p.repoUrl && { label: "Code", href: p.repoUrl },
          p.demoUrl && { label: "Live demo", href: p.demoUrl },
          p.videoUrl && { label: "Video", href: p.videoUrl },
          t.submissionUrl && !p.repoUrl && !p.demoUrl && { label: "Submission", href: t.submissionUrl },
        ].filter(Boolean) as { label: string; href: string }[];
        return (
          <article key={t.hackathonId} className="card space-y-2 p-4 break-inside-avoid">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold">{p.name || t.hackathon.title}</h3>
                {p.tagline && <p className="text-sm text-muted">{p.tagline}</p>}
              </div>
              {t.result && (
                <Badge tone={t.result === "won" || t.result === "runner_up" ? "ok" : "neutral"} className="shrink-0">
                  {t.result === "won" && <Trophy aria-hidden className="size-3" />}
                  {RESULT_LABELS[t.result]}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted">
              <Link href={`/hackathon/${hid(t.hackathonId)}`} className="hover:underline">{t.hackathon.title}</Link> · {fmtRange(t.hackathon)} · {SOURCE_LABELS[t.hackathon.source]}
            </p>
            {p.solution && <p className="line-clamp-3 text-sm">{p.solution}</p>}
            {p.stack && <p className="text-xs text-muted">Built with {p.stack}</p>}
            {prizes.length > 0 && (
              <p className="flex items-start gap-1.5 text-sm text-ok"><Trophy aria-hidden className="mt-0.5 size-4 shrink-0" /> {prizes.map((x) => `${x.title}${x.amount ? ` (${money(x.amount, x.currency)})` : ""}`).join(", ")}</p>
            )}
            <div className="flex flex-wrap gap-3 text-sm">
              {links.map((l) => <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="text-accent hover:underline">{l.label} ↗</a>)}
              {certificates.filter((c) => c.status === "received").map((c) => (
                <a key={c.id} href={c.file ? `/api/files/${c.file}` : (c.url ?? "#")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline"><ScrollText aria-hidden className="size-4" /> Certificate</a>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ---------- prizes ----------

function PrizesTab({ data, onChange }: { data: ProfileData; onChange: () => void }) {
  const s = data.stats.prizeUsd;
  const options = data.portfolio.map((e) => ({ id: e.tracked.hackathonId, title: e.tracked.hackathon.title }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Won" value={usd(s.won)} sub={`${data.stats.prizeCount} prize${data.stats.prizeCount === 1 ? "" : "s"}`} />
        <Tile label="Paid out" value={usd(s.paid)} />
        <Tile label="Still owed" value={usd(s.pending)} sub={data.prizes.some((p) => p.status !== "paid" && p.expectedBy && new Date(p.expectedBy) < new Date()) ? "Some payouts are overdue" : undefined} />
      </div>
      <section className="card p-4">
        {options.length === 0 && data.prizes.length === 0 ? (
          <p className="text-sm text-muted">Finish a hackathon first, then record what you won here or on its Wrap-up tab.</p>
        ) : (
          <PrizeList prizes={data.prizes} onChange={onChange} hackathonOptions={options} />
        )}
      </section>
    </div>
  );
}

// ---------- notes ----------

function NotesTab({ entries }: { entries: PortfolioEntry[] }) {
  const withNotes = entries.filter((e) => e.retro.updatedAt);
  const without = entries.filter((e) => !e.retro.updatedAt);
  return (
    <div className="space-y-3">
      {withNotes.length === 0 && <p className="card p-6 text-center text-sm text-muted">No retro notes yet. Write them on a hackathon&apos;s Wrap-up tab.</p>}
      {withNotes.map(({ tracked: t, retro: r }) => (
        <article key={t.hackathonId} className="card space-y-2 p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/hackathon/${hid(t.hackathonId)}`} className="font-semibold hover:underline">{t.hackathon.title}</Link>
            <span className="flex items-center gap-1 text-xs text-muted">{r.rating ? <Stars value={r.rating} /> : null} {r.updatedAt && `· ${fmtDate(r.updatedAt)}`}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {([["Went well", r.wentWell, "text-ok"], ["Do better", r.improve, "text-warn"], ["Lessons", r.lessons, "text-accent"]] as const).map(([label, text, tone]) => (
              <div key={label}>
                <h4 className={`label ${tone}`}>{label}</h4>
                <p className="whitespace-pre-wrap">{text || <span className="text-muted">—</span>}</p>
              </div>
            ))}
          </div>
        </article>
      ))}
      {without.length > 0 && (
        <p className="text-xs text-muted">
          No notes yet for: {without.map((e, i) => (
            <span key={e.tracked.hackathonId}>{i > 0 && ", "}<Link href={`/hackathon/${hid(e.tracked.hackathonId)}`} className="text-accent hover:underline">{e.tracked.hackathon.title}</Link></span>
          ))}
        </p>
      )}
    </div>
  );
}
