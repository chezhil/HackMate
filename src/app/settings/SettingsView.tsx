"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarSync } from "@/components/CalendarSync";
import { fmtDateTime } from "@/lib/format";
import type { Settings } from "@/lib/types";
import { LEAD_OPTIONS } from "@/lib/types";

interface Email {
  id: number;
  toAddr: string;
  subject: string;
  body: string;
  delivered: number;
  error: string | null;
  createdAt: string;
}

export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [smtp, setSmtp] = useState(false);
  const [emails, setEmails] = useState<Email[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadOutbox = useCallback(async () => {
    const data = (await (await fetch("/api/outbox")).json()) as { emails: Email[] };
    setEmails(data.emails);
  }, []);

  useEffect(() => {
    void (async () => {
      const data = (await (await fetch("/api/settings")).json()) as { settings: Settings; smtpConfigured: boolean };
      setSettings(data.settings);
      setSmtp(data.smtpConfigured);
      await loadOutbox();
    })();
  }, [loadOutbox]);

  if (!settings) return <div className="h-64 animate-pulse rounded-xl bg-surface-2" />;

  const save = async (patch: Partial<Settings>) => {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, ...patch }),
    });
    const data = (await res.json()) as { settings: Settings };
    setSettings(data.settings);
    setSaving(false);
    setStatus("Saved");
    setTimeout(() => setStatus(null), 1500);
  };

  const post = async (url: string, done: (data: Record<string, unknown>) => string) => {
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();
    setStatus(res.ok ? done(data) : data.error);
    await loadOutbox();
  };

  const toggleLead = (m: number) => {
    const has = settings.leadMinutes.includes(m);
    const leadMinutes = has ? settings.leadMinutes.filter((x) => x !== m) : [...settings.leadMinutes, m];
    void save({ leadMinutes });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        {status && <span className="text-sm text-muted">{status}</span>}
      </div>

      <section className="card space-y-4 p-4">
        <div>
          <h2 className="font-semibold">Email reminders</h2>
          <p className="text-sm text-muted">
            HackMate checks every 5 minutes and emails you before each deadline on your tracked hackathons.
          </p>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const email = new FormData(e.currentTarget).get("email") as string;
            void save({ email });
          }}
        >
          <input name="email" type="email" className="input" placeholder="you@example.com" defaultValue={settings.email} />
          <button className="btn btn-primary" disabled={saving}>Save</button>
        </form>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.remindersEnabled} onChange={(e) => save({ remindersEnabled: e.target.checked })} />
          Send reminder emails
        </label>

        <div>
          <span className="label">Remind me</span>
          <div className="flex flex-wrap gap-1.5">
            {LEAD_OPTIONS.map((o) => {
              const on = settings.leadMinutes.includes(o.minutes);
              return (
                <button
                  key={o.minutes}
                  onClick={() => toggleLead(o.minutes)}
                  className={`chip ${on ? "border-accent bg-accent-soft text-accent" : "hover:text-text"}`}
                >
                  {on ? "✓ " : ""}{o.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">These also become alerts on the events in your synced calendar.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-sm" disabled={!settings.email} onClick={() => post("/api/reminders/test", (d) => (d.delivered ? "Test email sent" : `Logged to outbox: ${d.error}`))}>
            Send test email
          </button>
          <button className="btn btn-sm" onClick={() => post("/api/reminders/run", (d) => (d.skipped ? `${d.skipped}` : `${d.sent} reminder(s) sent`))}>
            Check reminders now
          </button>
        </div>

        {!smtp && (
          <div className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            <strong>Email delivery isn&apos;t set up yet.</strong> Reminders are written to the outbox below instead of being sent.
            Add SMTP details to <code>.env.local</code> (see <code>.env.example</code>; a Gmail app password or Resend/SendGrid SMTP works) and restart.
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Calendar</h2>
        <p className="mb-3 text-sm text-muted">Pick your calendar app. Tracked hackathons and deadlines stay in sync through a private feed.</p>
        <CalendarSync />
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Outbox</h2>
        {emails.length === 0 ? (
          <p className="text-sm text-muted">No emails yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {emails.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 text-xs ${e.delivered ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}>
                      {e.delivered ? "sent" : "logged"}
                    </span>
                    <span className="font-medium">{e.subject}</span>
                    <span className="text-xs text-muted">→ {e.toAddr} · {fmtDateTime(e.createdAt)}</span>
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-2 font-sans text-xs">{e.body}</pre>
                  {e.error && <p className="mt-1 text-xs text-muted">{e.error}</p>}
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
