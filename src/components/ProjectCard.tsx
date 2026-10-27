"use client";

import { useEffect, useState } from "react";
import { call, hid } from "@/lib/client";
import type { Project } from "@/lib/types";

const FIELDS: { key: keyof Project; label: string; placeholder: string; long?: boolean }[] = [
  { key: "name", label: "Project name", placeholder: "VoiceDesk" },
  { key: "tagline", label: "One-liner", placeholder: "Run your helpdesk by talking to it" },
  { key: "problem", label: "Problem", placeholder: "Who hurts, and how much?", long: true },
  { key: "solution", label: "What you built", placeholder: "What it does and how the demo goes", long: true },
  { key: "stack", label: "Tech stack", placeholder: "Next.js, FastAPI, Whisper, Postgres" },
  { key: "repoUrl", label: "Repo", placeholder: "https://github.com/…" },
  { key: "demoUrl", label: "Live demo", placeholder: "https://…" },
  { key: "videoUrl", label: "Demo video", placeholder: "https://youtu.be/…" },
];

/** What you're building. Pitches, scripts, checks and write-ups all read from this. */
export function ProjectCard({ id, onSaved }: { id: string; onSaved?: (p: Project) => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    call<{ project: Project }>(`/api/h/${hid(id)}/project`).then((d) => {
      setProject(d.project);
      setOpen(!d.project.updatedAt); // open the form until it's been filled in once
    });
  }, [id]);

  if (!project) return <div className="h-14 animate-pulse rounded-xl bg-surface-2" />;

  const save = async () => {
    const d = await call<{ project: Project }>(`/api/h/${hid(id)}/project`, "PUT", project);
    setProject(d.project);
    setSaved(true);
    setOpen(false);
    setTimeout(() => setSaved(false), 1500);
    onSaved?.(d.project);
  };

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-bold">{project.name || "Your project"}</h2>
          <p className="truncate text-sm text-muted">
            {project.tagline || (project.updatedAt ? "No one-liner yet" : "Fill this in once; the pitch, video script, checks and posts all use it.")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {saved && <span className="text-xs text-ok">Saved</span>}
          <button className="btn btn-sm" onClick={() => setOpen(!open)}>{open ? "Close" : "Edit project"}</button>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className={f.long ? "md:col-span-2" : ""}>
              <span className="label">{f.label}</span>
              {f.long ? (
                <textarea
                  className="input min-h-16"
                  placeholder={f.placeholder}
                  value={project[f.key] as string}
                  onChange={(e) => setProject({ ...project, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  className="input"
                  placeholder={f.placeholder}
                  value={project[f.key] as string}
                  onChange={(e) => setProject({ ...project, [f.key]: e.target.value })}
                />
              )}
            </label>
          ))}
          <div className="md:col-span-2">
            <button className="btn btn-primary" onClick={save}>Save project</button>
          </div>
        </div>
      )}
    </section>
  );
}
