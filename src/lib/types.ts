// Shared types used by the server (sync, API) and the client (pages).

export type Source = "unstop" | "devfolio" | "mlh" | "wemakedevs";
export type Mode = "online" | "offline" | "hybrid";

export const SOURCE_LABELS: Record<Source, string> = {
  unstop: "Unstop",
  devfolio: "Devfolio",
  mlh: "MLH",
  wemakedevs: "WeMakeDevs",
};

export interface Hackathon {
  id: string; // `${source}:${sourceId}`
  source: Source;
  title: string;
  tagline: string | null;
  url: string;
  image: string | null;
  mode: Mode;
  city: string | null;
  state: string | null;
  country: string | null;
  venue: string | null;
  lat: number | null;
  lng: number | null;
  startsAt: string | null; // ISO, UTC
  endsAt: string | null;
  regStartsAt: string | null;
  regEndsAt: string | null;
  prizeText: string | null;
  prizeUsd: number | null; // rough USD value of the cash prize pool, for filtering
  entryFee: "free" | "paid" | null;
  themes: string[];
  organizer: string | null;
}

export type TrackStatus = "interested" | "registered" | "building" | "submitted" | "results";

export const STATUSES: { key: TrackStatus; label: string }[] = [
  { key: "interested", label: "Pinned" },
  { key: "registered", label: "Registered" },
  { key: "building", label: "Building" },
  { key: "submitted", label: "Submitted" },
  { key: "results", label: "Results" },
];

export type ResultKind = "won" | "runner_up" | "special_mention" | "participated" | "not_selected";

export const RESULT_LABELS: Record<ResultKind, string> = {
  won: "Won",
  runner_up: "Runner-up",
  special_mention: "Special mention",
  participated: "Participated",
  not_selected: "Not selected",
};

export interface Tracked {
  hackathonId: string;
  status: TrackStatus;
  pinnedAt: string;
  registeredAt: string | null;
  submittedAt: string | null;
  submissionUrl: string | null;
  result: ResultKind | null;
  resultNotes: string | null;
  notes: string | null;
}

export type DeadlineKind = "registration" | "start" | "submission" | "results" | "custom";

export const DEADLINE_LABELS: Record<DeadlineKind, string> = {
  registration: "Registration closes",
  start: "Hackathon starts",
  submission: "Submission due",
  results: "Results announced",
  custom: "Deadline",
};

export interface Deadline {
  id: number;
  hackathonId: string;
  kind: DeadlineKind;
  label: string;
  dueAt: string;
  auto: boolean; // created from feed data (re-synced unless the user edited it)
  done: boolean;
}

export interface TrackedWithHackathon extends Tracked {
  hackathon: Hackathon;
  deadlines: Deadline[];
}

export interface Settings {
  email: string;
  remindersEnabled: boolean;
  leadMinutes: number[]; // how long before each deadline to send a reminder
  calendarProvider: "google" | "apple" | "outlook" | "other";
  calendarToken: string;
}

export const LEAD_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 7 * 24 * 60, label: "1 week before" },
  { minutes: 3 * 24 * 60, label: "3 days before" },
  { minutes: 24 * 60, label: "1 day before" },
  { minutes: 3 * 60, label: "3 hours before" },
  { minutes: 60, label: "1 hour before" },
];
