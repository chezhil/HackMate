"use client";

import { Info, OctagonX, TriangleAlert } from "lucide-react";
import { fmtDateTime, relative } from "@/lib/format";
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {building && (
          <div className="card flex items-center gap-3 p-4 text-sm">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            Reading the full rules with AI. This can take up to a minute; the quick scan below is ready now.
          </div>
        )}
        {!building && details?.error && (
          <div className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{details.error}</div>
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
                  {c.weight && <span className="ml-2 rounded-md bg-accent-soft px-1.5 text-xs text-accent">{c.weight}</span>}
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
                    <span>{p.name}</span>
                    {p.value && <span className="shrink-0 font-medium text-ok">{p.value}</span>}
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

        {(info?.importantDates.length ?? 0) > 0 && (
          <Section title="Key dates">
            <ul className="space-y-1.5 text-sm">
              {info!.importantDates.map((d, i) => {
                const valid = !Number.isNaN(new Date(d.date).getTime());
                return (
                  <li key={i}>
                    <span className="font-medium">{d.label}</span>
                    <span className="block text-xs text-muted">
                      {valid ? `${fmtDateTime(d.date)} · ${relative(d.date)}` : d.date}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

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
