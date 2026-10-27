"use client";

import { Inbox, Monitor, Moon, Pin, RefreshCw, Sun, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Countdown, useNow } from "@/components/ui/Countdown";
import { Dialog } from "@/components/ui/Dialog";
import { Badge, Banner, CheckRow, CheckSummary, CountPill, EmptyState, Kbd, ScoreBadge, Skeleton } from "@/components/ui/Feedback";
import { ChipToggle, Field } from "@/components/ui/Form";
import { Segmented, Tabs } from "@/components/ui/Tabs";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { EVENT_COLORS } from "@/components/ui/tone";

type Theme = "system" | "light" | "dark";

const COLORS = [
  ["bg", "Page"], ["surface", "Cards"], ["surface-2", "Hover, wells"], ["border", "Dividers"], ["border-strong", "Input edges"],
  ["text", "Body"], ["muted", "Secondary"], ["accent", "Actions, links"], ["accent-soft", "Selected"],
  ["ok", "Pass, paid"], ["warn", "Warning, due soon"], ["danger", "Fail, overdue"],
] as const;

const TYPE = [
  ["text-2xs", "2xs · 11/14 · calendar chips"],
  ["text-xs", "xs · 12/16 · meta, badges"],
  ["text-sm", "sm · 14/20 · body and controls"],
  ["text-base", "base · 16/24 · long AI output"],
  ["text-lg font-semibold", "lg · 18/28 · card titles"],
  ["text-xl font-semibold", "xl · 20/28 · empty states"],
  ["page-title", "page title · 30/36 · marker swipe"],
  ["text-3xl font-semibold tabular-nums", "3xl · 30/36 · 12 wins"],
] as const;

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "ask", label: "Ask AI" },
  { key: "submit", label: "Submit", badge: <CountPill tone="danger" label="2 failing checks">2</CountPill> },
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

export function DesignView() {
  const [theme, setTheme] = useState<Theme>("system");

  // Preview only: pin the theme on <html> while this page is open, and hand it back on the way out.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    return () => { delete root.dataset.theme; };
  }, [theme]);

  return (
    <ToastProvider>
      <div className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title">Design system</h1>
            <p className="text-sm text-muted">Tokens from replica/design/tokens.json. Every pair here passes WCAG AA in both themes.</p>
          </div>
          <div role="radiogroup" aria-label="Theme" className="flex rounded-lg border border-border p-0.5">
            {([["system", Monitor], ["light", Sun], ["dark", Moon]] as const).map(([k, Icon]) => (
              <button
                key={k}
                role="radio"
                aria-checked={theme === k}
                onClick={() => setTheme(k)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm capitalize ${theme === k ? "bg-surface-2 font-medium text-text" : "text-muted hover:text-text"}`}
              >
                <Icon aria-hidden className="size-4" /> {k}
              </button>
            ))}
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Colour roles">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COLORS.map(([name, use]) => (
                <li key={name} className="flex items-center gap-2 text-xs">
                  <span className="size-8 shrink-0 rounded-lg border border-border" style={{ background: `var(--${name})` }} />
                  <span><span className="block font-mono text-text">{name}</span><span className="text-muted">{use}</span></span>
                </li>
              ))}
            </ul>
            <div>
              <p className="label">Event colours (calendar bars, white text)</p>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_COLORS.map((c, i) => (
                  <span key={c} className="rounded-md px-1.5 text-2xs leading-4 text-on-event" style={{ background: c }}>Event {i + 1}</span>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Type scale (Geist)">
            <ul className="space-y-1.5">
              {TYPE.map(([cls, label]) => <li key={cls} className={cls}>{label}</li>)}
            </ul>
          </Section>

          <Section title="Buttons">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" icon={<Pin className="size-4" />}>Pin to tracker</Button>
              <Button>Open page</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="danger" icon={<Trash2 className="size-4" />}>Remove</Button>
              <IconButton label="Refresh feeds" icon={<RefreshCw className="size-4" />} variant="default" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm">Small primary</Button>
              <Button size="sm">Small</Button>
              <Button variant="primary" loading>Checking</Button>
              <Button disabled>Disabled</Button>
            </div>
            <p className="text-xs text-muted">Press <Kbd>Tab</Kbd> to see the focus ring. It only shows for keyboard focus.</p>
          </Section>

          <Section title="Inputs">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Project name" hint="Shown on your portfolio.">
                {(p) => <input {...p} className="input" placeholder="HackMate" />}
              </Field>
              <Field label="Repo URL" error="That repo is private. Judges can't open it.">
                {(p) => <input {...p} className="input" defaultValue="github.com/you/secret" />}
              </Field>
              <Field label="Mode">
                {(p) => (
                  <select {...p} className="input">
                    <option>Online + offline</option>
                    <option>Online only</option>
                  </select>
                )}
              </Field>
              <Field label="Disabled">
                {(p) => <input {...p} className="input" disabled value="Read only" readOnly />}
              </Field>
            </div>
            <Chips />
          </Section>

          <Section title="Tabs and switches">
            <TabsDemo />
          </Section>

          <Section title="Status">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Neutral</Badge>
              <Badge tone="accent">Claimed</Badge>
              <Badge tone="ok">Paid</Badge>
              <Badge tone="warn">Won</Badge>
              <Badge tone="danger">Overdue</Badge>
              <ScoreBadge score={8.5} />
              <ScoreBadge score={6} />
              <ScoreBadge score={3} />
              <CountPill>3</CountPill>
            </div>
            <Countdowns />
          </Section>

          <Section title="Submission checks">
            <CheckSummary statuses={["fail", "warn", "pass", "pass", "pass"]} />
            <ul className="space-y-1.5">
              <CheckRow status="fail" label="Repo is public" detail="github.com/you/app returns 404 when signed out." />
              <CheckRow status="warn" label="Video length" detail="2:14. The limit is 2:00." />
              <CheckRow status="pass" label="Team size" detail="3 of 4 allowed." />
              <CheckRow status="info" label="Judging" detail="Innovation counts for 40%." />
            </ul>
          </Section>

          <Section title="Banners">
            <Banner tone="warn">Couldn&apos;t reach MLH on the last refresh. Showing the last data we have.</Banner>
            <Banner tone="danger" action={<Button size="sm">Retry</Button>}>The AI couldn&apos;t read this hackathon&apos;s page.</Banner>
            <Banner tone="ok">All required items are done.</Banner>
            <Banner>Reminders go to the Outbox until SMTP is set up.</Banner>
          </Section>

          <Section title="Overlays">
            <Overlays />
          </Section>

          <Section title="Loading and empty">
            <div className="grid gap-2 sm:grid-cols-2">
              <Skeleton />
              <Skeleton />
            </div>
            <EmptyState icon={<Inbox />} title="Nothing tracked yet" action={<Button variant="primary">Find hackathons</Button>}>
              Pin a hackathon from Discover and it shows up here.
            </EmptyState>
          </Section>
        </div>
      </div>
    </ToastProvider>
  );
}

function Countdowns() {
  // Targets are relative to now, so each sample always shows the same state.
  const now = useNow();
  if (now == null) return null;
  const at = (ms: number) => new Date(now + ms).toISOString();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Countdown to={at(9 * 86_400_000)} label="Reg closes" />
      <Countdown to={at(2 * 86_400_000 + 3 * 3_600_000)} />
      <Countdown to={at(5 * 3_600_000 + 12 * 60_000)} label="Submit" />
      <Countdown to={at(-3_600_000)} />
    </div>
  );
}

function Chips() {
  const [on, setOn] = useState(new Set(["AI/ML"]));
  return (
    <div className="flex flex-wrap gap-1.5">
      {["AI/ML", "Web3", "Climate", "Health", "Open"].map((t) => (
        <ChipToggle
          key={t}
          on={on.has(t)}
          onClick={() => setOn((s) => {
            const next = new Set(s);
            if (next.has(t)) next.delete(t);
            else next.add(t);
            return next;
          })}
        >
          {t}
        </ChipToggle>
      ))}
    </div>
  );
}

function TabsDemo() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("overview");
  const [view, setView] = useState<"split" | "list" | "map">("split");
  return (
    <div className="space-y-3">
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Example sections" />
      <Segmented
        options={[{ key: "split", label: "Split" }, { key: "list", label: "List" }, { key: "map", label: "Map" }]}
        value={view}
        onChange={setView}
        label="Layout"
      />
      <p className="text-xs text-muted">Arrow keys move between options. <Kbd>Home</Kbd> and <Kbd>End</Kbd> jump to the ends.</p>
    </div>
  );
}

function Overlays() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <Button onClick={() => toast({ message: "Moved to Building", tone: "info", undo: () => toast({ message: "Moved back to Registered", tone: "info" }) })}>
        Toast with Undo
      </Button>
      <Button variant="danger" onClick={() => toast({ message: "Couldn't save. Check your connection.", tone: "error" })}>Error toast</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Unpin this hackathon?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Keep it</Button>
            <Button variant="danger" onClick={() => setOpen(false)}>Unpin</Button>
          </>
        }
      >
        <p className="text-muted">Its deadlines leave your calendar. Ideas, notes and checks stay saved.</p>
      </Dialog>
    </div>
  );
}
