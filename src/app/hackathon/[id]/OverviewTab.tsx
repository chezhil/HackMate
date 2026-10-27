"use client";

import { CircleCheck, Info, OctagonX, TriangleAlert } from "lucide-react";
import { fmtDateTime, relative } from "@/lib/format";
import { useHackmate } from "@/components/HackmateProvider";
import { Countdown } from "@/components/ui/Countdown";
import { Badge, Banner, Spinner } from "@/components/ui/Feedback";
import type { Hackathon } from "@/lib/types";
import type { DetailsPayload } from "./HackathonView";

const LEVEL_STYLE = {
  critical: "border-danger/40 bg-danger-soft text-danger",
  warning: "border-warn/40 bg-warn-soft text-warn",
  info: "border-border bg-surface-2 text-text",
};
const LEVEL_ICON = { critical: OctagonX, warning: TriangleAlert, info: Info };

function LevelIcon({ level }: { level: keyof typeof LEVEL_ICON }) {
  const Icon = LEVEL_ICON[level];
  return <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const Empty = ({ what, waiting }: { what: string; waiting?: boolean }) => (
  <p className="text-sm text-muted">{waiting ? "Reading…" : `No ${what} listed on the page.`}</p>
);

export function OverviewTab({ data, onRefresh }: { data: DetailsPayload; onRefresh: () => void }) {
  const { details, building, ruleAlerts, hackathon: h } = data;
  const info = details?.info;
  const team = info?.teamSize;
  const teamText =
    team?.max === 1 || h.teamMax === 1
      ? "Solo only"
      : team?.min || team?.max || h.teamMin || h.teamMax
        ? `${team?.min ?? h.teamMin ?? 1}–${team?.max ?? h.teamMax ?? "?"} people`
        : "Not stated";

  // AI alerts first; rule-based ones fill in anything the AI didn't mention (or all of them without AI).
  const aiAlerts = info?.alerts ?? [];
  const extraRules = ruleAlerts.filter(
    (r) => !aiAlerts.some((a) => a.text.toLowerCase().includes(r.label.split(/[ :—/]/)[0].toLowerCase())),
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-main-side">
      <div className="space-y-4">
        {building && (
          <div className="card flex items-center gap-3 p-4 text-sm">
            <Spinner className="text-accent" />
            Reading the full rules with AI. This can take up to a minute; the quick scan below is ready now.
          </div>
        )}
        {!building && details?.error && (
          <Banner tone="warn">{details.error}</Banner>
        )}

        {info?.summary && (
          <Section title="Summary">
            <p className="text-sm leading-relaxed">{info.summary}</p>
          </Section>
        )}

        <Section title="Alerts & gotchas">
          {aiAlerts.length === 0 && extraRules.length === 0 ? (
            <p className="text-sm text-muted">{building ? "Scanning…" : "Nothing unusual found. Still skim the rules before submitting."}</p>
          ) : (
            <ul className="space-y-2">
              {aiAlerts.map((a, i) => (
                <li key={`ai${i}`} className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${LEVEL_STYLE[a.level]}`}>
                  <LevelIcon level={a.level} /> {a.text}
                </li>
              ))}
              {extraRules.map((r) => (
                <li key={r.key} className={`rounded-lg border px-3 py-2 text-sm ${LEVEL_STYLE[r.level]}`}>
                  <div className="flex gap-2"><LevelIcon level={r.level} /> {r.label}</div>
                  {r.quote && <div className="mt-1 text-xs italic opacity-80">“{r.quote}”</div>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Judging criteria">
          {info?.judgingCriteria.length ? (
            <ul className="space-y-2">
              {info.judgingCriteria.map((c, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{c.name}</span>
                  {c.weight && <Badge tone="accent" className="ml-2">{c.weight}</Badge>}
                  {c.description && <p className="text-muted">{c.description}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty what="judging criteria" waiting={building} />
          )}
        </Section>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Tracks">
            {info?.tracks.length ? (
              <ul className="space-y-1.5 text-sm">
                {info.tracks.map((t, i) => (
                  <li key={i}>
                    <span className="font-medium">{t.name}</span>
                    {t.description && <span className="text-muted"> — {t.description}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty what="tracks" waiting={building} />
            )}
          </Section>
          <Section title="Prizes">
            {info?.prizes.length ? (
              <ul className="space-y-1 text-sm">
                {info.prizes.map((p, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="min-w-0">{p.name}</span>
                    {p.value && <span className="max-w-[50%] break-words text-right font-medium text-ok">{p.value}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{h.prizeText ?? "No prizes listed."}</p>
            )}
          </Section>
        </div>

        {(info?.rules.length ?? 0) > 0 && (
          <Section title="Other rules">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {info!.rules.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </Section>
        )}
      </div>

      <aside className="space-y-4">
        <Section title="At a glance">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="label">Team size</dt>
              <dd>{teamText}{team?.notes && <span className="block text-xs text-muted">{team.notes}</span>}</dd>
            </div>
            <div>
              <dt className="label">Deliverables</dt>
              <dd>
                {info?.deliverables.length ? (
                  <ul className="space-y-1">
                    {info.deliverables.map((d, i) => (
                      <li key={i}>
                        {d.item}
                        {d.limit && <span className="block text-xs text-muted">{d.limit}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted">Not stated</span>
                )}
              </dd>
            </div>
            {(info?.eligibility.length ?? 0) > 0 && (
              <div>
                <dt className="label">Eligibility</dt>
                <dd>
                  <ul className="list-disc pl-4">{info!.eligibility.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </dd>
              </div>
            )}
            <div>
              <dt className="label">IP / ownership</dt>
              <dd className={info?.ipTerms ? "" : "text-muted"}>{info?.ipTerms ?? "Not mentioned"}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Judges">
          {info?.judges.length ? (
            <ul className="space-y-1.5 text-sm">
              {info.judges.map((j, i) => (
                <li key={i}>
                  <span className="font-medium">{j.name}</span>
                  {j.title && <span className="block text-xs text-muted">{j.title}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty what="judges" waiting={building} />
          )}
        </Section>

        <Section title="Schedule">
          <Timeline h={h} dates={info?.importantDates ?? []} waiting={building} />
        </Section>

        <div className="text-xs text-muted">
          {details && !building && (
            <>
              Read {Math.round(details.sourceChars / 1000)}k characters {relative(details.fetchedAt)}
              {details.provider && ` with ${details.provider.split(":")[0]}`}.{" "}
            </>
          )}
          <button className="text-accent hover:underline disabled:opacity-50" onClick={onRefresh} disabled={building}>
            {building ? "Reading…" : "Re-read rules"}
          </button>
        </div>
      </aside>
    </div>
  );
}

interface Milestone {
  label: string;
  at: number;
  iso: string;
}

const dayOf = (t: number) => new Date(t).toDateString();

/**
 * Feed dates (registration, start, end) plus whatever dates the AI found in the rules, in order.
 * Past steps are ticked off, the next one gets a live countdown. Works before the AI has read anything.
 */
function Timeline({ h, dates, waiting }: { h: Hackathon; dates: { label: string; date: string }[]; waiting: boolean }) {
  const { now } = useHackmate();
  const all: Milestone[] = [];
  const add = (label: string, iso: string | null | undefined) => {
    const at = iso ? new Date(iso).getTime() : NaN;
    if (Number.isNaN(at)) return;
    // The AI often restates a feed date; keep one entry per day when the labels share a word.
    const word = label.toLowerCase().split(/\W+/).find((w) => w.length > 3);
    if (all.some((m) => dayOf(m.at) === dayOf(at) && (!word || m.label.toLowerCase().includes(word)))) return;
    all.push({ label, at, iso: new Date(at).toISOString() });
  };
  add("Registration closes", h.regEndsAt);
  add("Hackathon starts", h.startsAt);
  add("Hackathon ends", h.endsAt);
  for (const d of dates) add(d.label, d.date);
  const undated = dates.filter((d) => Number.isNaN(new Date(d.date).getTime()));
  all.sort((a, b) => a.at - b.at);
  const next = all.find((m) => m.at > now);

  if (all.length === 0) return <Empty what="dates" waiting={waiting} />;
  return (
    <ol className="relative space-y-3 border-l border-border pl-4 text-sm">
      {all.map((m) => {
        const past = m.at <= now;
        const isNext = m === next;
        return (
          <li key={`${m.label}${m.at}`} className="relative">
            <span
              aria-hidden
              className={`absolute -left-[1.3rem] top-1 grid size-2.5 place-items-center rounded-full ring-4 ring-surface ${past ? "bg-muted" : isNext ? "bg-accent" : "bg-border-strong"}`}
            />
            <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${past ? "text-muted" : ""}`}>
              <span className={isNext ? "font-semibold" : "font-medium"}>{m.label}</span>
              {past && <CircleCheck aria-label="Done" className="size-3.5 text-ok" />}
              {isNext && <Countdown to={m.iso} />}
            </div>
            <time dateTime={m.iso} className="block text-xs text-muted">{fmtDateTime(m.iso)}</time>
          </li>
        );
      })}
      {undated.map((d, i) => (
        <li key={`u${i}`} className="relative text-muted">
          <span aria-hidden className="absolute -left-[1.3rem] top-1 size-2.5 rounded-full bg-border ring-4 ring-surface" />
          <span className="font-medium">{d.label}</span>
          <span className="block text-xs">{d.date}</span>
        </li>
      ))}
    </ol>
  );
}
