"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { findClashes, type Clash } from "@/lib/clashes";
import type { DeadlineKind, Hackathon, ResultKind, TrackedWithHackathon, TrackStatus } from "@/lib/types";

interface SyncReport {
  at: string;
  sources: Record<string, { ok: boolean; count: number; error?: string }>;
}

interface TrackedPatch {
  status?: TrackStatus;
  submissionUrl?: string | null;
  result?: ResultKind | null;
  resultNotes?: string | null;
  notes?: string | null;
}

interface HackmateState {
  hackathons: Hackathon[];
  tracked: TrackedWithHackathon[];
  trackedIds: Set<string>;
  clashes: Clash[];
  lastSync: SyncReport | null;
  /** Current time, ticking once a minute, so countdowns and "upcoming" filters stay fresh. */
  now: number;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
  track: (id: string) => Promise<void>;
  untrack: (id: string) => Promise<void>;
  updateTracked: (id: string, patch: TrackedPatch) => Promise<void>;
  addDeadline: (hackathonId: string, kind: DeadlineKind, label: string, dueAt: string) => Promise<void>;
  updateDeadline: (id: number, patch: { label?: string; dueAt?: string; done?: boolean }) => Promise<void>;
  deleteDeadline: (id: number) => Promise<void>;
}

const Ctx = createContext<HackmateState | null>(null);

type ListResponse = { hackathons: Hackathon[]; tracked: TrackedWithHackathon[]; lastSync: SyncReport };

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function HackmateProvider({ children }: { children: React.ReactNode }) {
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [tracked, setTracked] = useState<TrackedWithHackathon[]>([]);
  const [lastSync, setLastSync] = useState<SyncReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const apply = useCallback((data: ListResponse) => {
    setHackathons(data.hackathons);
    setTracked(data.tracked);
    setLastSync(data.lastSync);
    setError(null);
  }, []);

  const fail = useCallback((e: unknown) => setError((e as Error).message), []);

  const refresh = useCallback(
    () => call<ListResponse>("/api/hackathons").then(apply, fail).finally(() => setLoading(false)),
    [apply, fail],
  );

  useEffect(() => {
    call<ListResponse>("/api/hackathons")
      .then(apply, fail)
      .finally(() => setLoading(false));
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [apply, fail]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await call("/api/sync", "POST");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  // Every tracker mutation returns the fresh tracked list.
  const mutate = useCallback(async (url: string, method: string, body?: unknown) => {
    try {
      const data = await call<{ tracked: TrackedWithHackathon[] }>(url, method, body);
      setTracked(data.tracked);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }, []);

  const value = useMemo<HackmateState>(() => {
    const trackedPath = (id: string) => `/api/tracker/${encodeURIComponent(id)}`;
    return {
      hackathons,
      tracked,
      trackedIds: new Set(tracked.map((t) => t.hackathonId)),
      clashes: findClashes(tracked),
      lastSync,
      now,
      loading,
      syncing,
      error,
      refresh,
      syncNow,
      track: (id) => mutate("/api/tracker", "POST", { hackathonId: id }),
      untrack: (id) => mutate(trackedPath(id), "DELETE"),
      updateTracked: (id, patch) => mutate(trackedPath(id), "PATCH", patch),
      addDeadline: (hackathonId, kind, label, dueAt) => mutate("/api/deadlines", "POST", { hackathonId, kind, label, dueAt }),
      updateDeadline: (id, patch) => mutate(`/api/deadlines/${id}`, "PATCH", patch),
      deleteDeadline: (id) => mutate(`/api/deadlines/${id}`, "DELETE"),
    };
  }, [hackathons, tracked, lastSync, now, loading, syncing, error, refresh, syncNow, mutate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHackmate() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHackmate must be used inside HackmateProvider");
  return ctx;
}
