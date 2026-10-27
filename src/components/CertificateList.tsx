"use client";

import Link from "next/link";
import { useState } from "react";
import { hid } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import type { Certificate } from "@/lib/types";

export interface CertData {
  certificates: Certificate[];
  missing: { hackathonId: string; title: string; endedAt: string | null }[];
}

async function send(url: string, method: string, body: FormData | object): Promise<CertData> {
  const res = await fetch(url, {
    method,
    ...(body instanceof FormData ? { body } : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

function UploadButton({ onFile, label }: { onFile: (f: File) => void; label: string }) {
  return (
    <label className="btn btn-sm cursor-pointer">
      {label}
      <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}

/**
 * The certificate vault. Finished hackathons with no certificate recorded show up as pending,
 * so nothing slips through. Pass `hackathonId` to show just one hackathon's certificates.
 */
export function CertificateList({ data, onChange, hackathonId }: { data: CertData; onChange: (d: CertData) => void; hackathonId?: string }) {
  const [error, setError] = useState<string | null>(null);
  const certs = hackathonId ? data.certificates.filter((c) => c.hackathonId === hackathonId) : data.certificates;
  const missing = hackathonId ? data.missing.filter((m) => m.hackathonId === hackathonId) : data.missing;
  const received = certs.filter((c) => c.status === "received");
  const pending = certs.filter((c) => c.status === "pending");

  const run = (p: Promise<CertData>) => p.then(onChange, (e: Error) => setError(e.message));

  const create = (hId: string, status: "pending" | "received", file?: File) => {
    const form = new FormData();
    form.append("hackathonId", hId);
    form.append("title", "Certificate of participation");
    form.append("status", status);
    if (file) form.append("file", file);
    return run(send("/api/certificates", "POST", form));
  };

  const attach = (c: Certificate, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return run(send(`/api/certificates/${c.id}`, "PATCH", form));
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      {(pending.length > 0 || missing.length > 0) && (
        <div>
          <h3 className="label text-warn">Pending</h3>
          <ul className="space-y-1.5">
            {missing.map((m) => (
              <li key={m.hackathonId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-warn/50 px-3 py-2 text-sm">
                <span>
                  {!hackathonId && <Link href={`/hackathon/${hid(m.hackathonId)}`} className="font-medium hover:underline">{m.title}</Link>}
                  <span className="text-muted">{hackathonId ? "No certificate yet" : ` · ended ${fmtDate(m.endedAt)}`}</span>
                </span>
                <span className="flex gap-1.5">
                  <UploadButton label="Upload" onFile={(f) => create(m.hackathonId, "received", f)} />
                  <button className="btn btn-sm" onClick={() => create(m.hackathonId, "pending")} title="Track it as expected">Expecting one</button>
                </span>
              </li>
            ))}
            {pending.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/40 bg-warn-soft/40 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{c.title}</span>
                  {!hackathonId && <span className="text-muted"> · {c.hackathonTitle}</span>}
                </span>
                <span className="flex gap-1.5">
                  <UploadButton label="Upload" onFile={(f) => attach(c, f)} />
                  <button className="btn btn-sm" onClick={() => run(send(`/api/certificates/${c.id}`, "PATCH", { status: "received" }))}>Got it</button>
                  <button className="text-xs text-muted hover:text-danger" onClick={() => run(send(`/api/certificates/${c.id}`, "DELETE", {}))}>✕</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="label text-ok">In the vault ({received.length})</h3>
        {received.length === 0 ? (
          <p className="text-sm text-muted">No certificates stored yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {received.map((c) => (
              <li key={c.id} className="group flex gap-3 rounded-lg border border-border p-2.5 text-sm">
                <a
                  href={c.file ? `/api/files/${c.file}` : (c.url ?? "#")}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded bg-surface-2 text-2xl"
                >
                  {c.file && c.mime?.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${c.file}`} alt="" className="h-full w-full object-cover" />
                  ) : (
                    "📜"
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.title}</div>
                  {!hackathonId && <div className="truncate text-xs text-muted">{c.hackathonTitle}</div>}
                  <div className="text-xs text-muted">{c.receivedAt && `Received ${fmtDate(c.receivedAt)}`}</div>
                </div>
                <button className="self-start text-xs text-muted opacity-0 hover:text-danger group-hover:opacity-100" onClick={() => confirm("Delete this certificate?") && run(send(`/api/certificates/${c.id}`, "DELETE", {}))}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hackathonId && missing.length === 0 && (
        <div className="flex gap-1.5">
          <UploadButton label="+ Upload certificate" onFile={(f) => create(hackathonId, "received", f)} />
        </div>
      )}
    </div>
  );
}
