"use client";

import { useSyncExternalStore } from "react";
import { call } from "@/lib/client";
import type { Account } from "@/lib/types";

// One shared copy of "who's signed in", so the nav, Profile and People all agree after a sign-in or sign-out.
type State = { loaded: boolean; user: Account | null; loginRequired: boolean };
let state: State = { loaded: false, user: null, loginRequired: false };
const listeners = new Set<() => void>();
let fetching = false;

const emit = (next: State) => {
  state = next;
  for (const l of listeners) l();
};

export function reloadAccount() {
  fetching = true;
  return call<{ user: Account | null; loginRequired?: boolean }>("/api/auth")
    .then(({ user, loginRequired }) => emit({ loaded: true, user, loginRequired: !!loginRequired }))
    .catch(() => emit({ loaded: true, user: null, loginRequired: state.loginRequired }))
    .finally(() => { fetching = false; });
}

export const setAccount = (user: Account | null) => emit({ ...state, loaded: true, user });

const subscribe = (l: () => void) => {
  listeners.add(l);
  if (!state.loaded && !fetching) void reloadAccount();
  return () => listeners.delete(l);
};
const SERVER: State = { loaded: false, user: null, loginRequired: false };

export function useAccount(): State {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}
