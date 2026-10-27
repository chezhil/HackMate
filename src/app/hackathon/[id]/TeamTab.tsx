"use client";

import { User } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, EmptyState } from "@/components/ui/Feedback";
import { call, hid } from "@/lib/client";
import type { Teammate } from "@/lib/types";
import type { DetailsPayload } from "./HackathonView";

const BLANK = { name: "", role: "", skills: "", contact: "", confirmed: true };

/** Where to post the "looking for teammates" message. Each opens with the text prefilled where the site allows it. */
function shareTargets(text: string, hackathonUrl: string, source: string) {
  const t = encodeURIComponent(text);
  return [
    { label: "X / Twitter", href: `https://x.com/intent/post?text=${t}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/feed/?shareActive=true&text=${t}` },
    { label: "Reddit r/hackathon", href: `https://www.reddit.com/r/hackathon/submit?type=self&title=${encodeURIComponent("Looking for teammates")}&text=${t}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${t}` },
    ...(source === "unstop" || source === "devfolio"
      ? [{ label: `${source === "unstop" ? "Unstop" : "Devfolio"} team finder`, href: hackathonUrl }]
      : []),
  ];
}

export function TeamTab({ id, data }: { id: string; data: DetailsPayload }) {
  const h = data.hackathon;
  const info = data.details?.info;
  const max = info?.teamSize.max ?? h.teamMax;
  const min = info?.teamSize.min ?? h.teamMin;
  const solo = max === 1;

  const [team, setTeam] = useState<Teammate[]>([]);
  const [form, setForm] = useState(BLANK);
  const [post, setPost] = useState({ lookingFor: "", aboutMe: "", idea: "" });
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    call<{ team: Teammate[] }>(`/api/h/${hid(id)}/team`).then((d) => setTeam(d.team), () => {});
  }, [id]);

  const size = team.filter((t) => t.confirmed).length + 1; // + you

  if (solo) {
    return (
      <EmptyState icon={<User />} title="This is a solo hackathon">
        Teams aren&apos;t allowed, so there&apos;s nothing to set up here.
      </EmptyState>
    );
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = await call<{ team: Teammate[] }>(`/api/h/${hid(id)}/team`, "POST", form);
    setTeam(d.team);
    setForm(BLANK);
  };

  const makePost = async () => {
    setDrafting(true);
    try {
      const d = await call<{ text: string }>(`/api/h/${hid(id)}/team/post`, "POST", post);
      setDraft(d.text);
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card space-y-3 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Your team</h2>
          <span className={`text-sm ${max && size > max ? "text-danger" : min && size < min ? "text-warn" : "text-muted"}`}>
            {size}{max ? ` / ${max}` : ""} people{min && size < min ? ` · need at least ${min}` : ""}
            {max && size > max ? " · over the limit" : ""}
          </span>
        </div>
        <ul className="divide-y divide-border">
          <li className="py-2 text-sm"><span className="font-medium">You</span></li>
          {team.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-2 py-2 text-sm">
              <div>
                <span className="font-medium">{t.name}</span>
                {t.role && <span className="text-muted"> · {t.role}</span>}
                {!t.confirmed && <Badge tone="warn" className="ml-2">invited</Badge>}
                {t.skills && <div className="text-xs text-muted">{t.skills}</div>}
                {t.contact && <div className="text-xs text-muted">{t.contact}</div>}
              </div>
              <div className="flex shrink-0 gap-2 text-xs">
                {!t.confirmed && (
                  <button
                    className="text-accent hover:underline"
                    onClick={() => call<{ team: Teammate[] }>(`/api/team/${t.id}`, "PATCH", { confirmed: true }).then((d) => setTeam(d.team))}
                  >
                    Confirm
                  </button>
                )}
                <button
                  className="text-muted hover:text-danger"
                  onClick={() => call<{ team: Teammate[] }>(`/api/team/${t.id}`, "DELETE").then((d) => setTeam(d.team))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-2">
          <input className="input" placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Role (frontend, ML, design…)" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          <input className="input" placeholder="Skills" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
          <input className="input" placeholder="Contact (Discord, email…)" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" checked={!form.confirmed} onChange={(e) => setForm({ ...form, confirmed: !e.target.checked })} />
            Invited, not confirmed yet
          </label>
          <button className="btn btn-primary" type="submit">Add teammate</button>
        </form>
      </section>

      <section className="card space-y-3 p-4">
        <div>
          <h2 className="font-semibold">Find teammates</h2>
          <p className="text-sm text-muted">Write a short &ldquo;looking for teammates&rdquo; post, then share it where people are looking.</p>
        </div>
        <input className="input" placeholder="Looking for (e.g. a designer and a backend dev)" value={post.lookingFor} onChange={(e) => setPost({ ...post, lookingFor: e.target.value })} />
        <input className="input" placeholder="About you (skills, experience)" value={post.aboutMe} onChange={(e) => setPost({ ...post, aboutMe: e.target.value })} />
        <input className="input" placeholder="Idea in one line (optional)" value={post.idea} onChange={(e) => setPost({ ...post, idea: e.target.value })} />
        <button className="btn btn-primary" onClick={makePost} disabled={drafting}>{drafting ? "Writing…" : draft ? "Rewrite post" : "Write post"}</button>
        {draft && (
          <div className="space-y-2">
            <textarea className="input min-h-36 text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="flex flex-wrap gap-1.5">
              <button
                className="btn btn-sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(draft);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied" : "Copy (for Discord / Slack)"}
              </button>
              {shareTargets(draft, h.url, h.source).map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="btn btn-sm">{s.label} ↗</a>
              ))}
            </div>
            <p className="text-xs text-muted">Each link opens that site with your post filled in; you review and post it yourself.</p>
          </div>
        )}
      </section>
    </div>
  );
}
