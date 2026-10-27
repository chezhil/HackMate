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
  teamMin: number | null;
  teamMax: number | null;
  /** Full description text from the feed. Only set by the source adapters; not sent in list responses. */
  description?: string | null;
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

/** Structured facts the AI pulls out of a hackathon's page. Every field may be empty. */
export interface HackathonInfo {
  summary: string;
  teamSize: { min: number | null; max: number | null; soloAllowed: boolean | null; notes: string | null };
  eligibility: string[];
  deliverables: { item: string; limit: string | null }[];
  alerts: { level: "critical" | "warning" | "info"; text: string }[];
  ipTerms: string | null;
  judges: { name: string; title: string | null }[];
  judgingCriteria: { name: string; weight: string | null; description: string | null }[];
  tracks: { name: string; description: string | null }[];
  prizes: { name: string; value: string | null }[];
  importantDates: { label: string; date: string }[];
  rules: string[];
  pastWinners: { name: string; description: string | null; year: string | null }[];
}

export interface HackathonDetails {
  hackathonId: string;
  sourceChars: number;
  info: HackathonInfo | null;
  provider: string | null;
  error: string | null;
  fetchedAt: string;
}

export interface WinnerProject {
  name: string;
  tagline: string | null;
  hackathon: string | null;
  prizes: string[];
  url: string;
  tags: string[];
}

/** A numbered source for an Ask AI answer: the rule text the claim rests on. */
export interface Citation {
  n: number;
  /** The sentence the model quoted, checked against the page; or the start of the passage if it didn't match. */
  quote: string;
  /** The whole paragraph from the hackathon page. */
  passage: string;
  verified: boolean;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  provider: string | null;
  createdAt: string;
  citations: Citation[];
  /** The model said the rules don't answer this. */
  notFound: boolean;
}

export interface IdeaCritique {
  score: number; // 1–10
  verdict: string;
  positives: string[];
  negatives: string[];
  risks: string[];
  suggestions: string[];
  criteriaFit: { criterion: string; score: number; note: string }[];
}

export interface IdeaVersion {
  id: number;
  text: string;
  critique: IdeaCritique | null;
  provider: string | null;
  createdAt: string;
}

export interface Idea {
  id: number;
  hackathonId: string;
  title: string;
  createdAt: string;
  versions: IdeaVersion[];
}

export interface IdeaSuggestion {
  title: string;
  pitch: string;
  whyItCouldWin: string;
  track: string | null;
  stack: string[];
}

export interface Teammate {
  id: number;
  name: string;
  role: string | null;
  skills: string | null;
  contact: string | null;
  confirmed: boolean;
}

export interface Standup {
  id: number;
  author: string | null;
  mime: string;
  durationSec: number | null;
  transcript: string | null;
  summary: { done: string[]; next: string[]; blockers: string[] } | null;
  error: string | null;
  createdAt: string;
}

// ---------- pitch & submission ----------

export interface Project {
  hackathonId: string;
  name: string;
  tagline: string;
  problem: string;
  solution: string;
  stack: string;
  repoUrl: string;
  demoUrl: string;
  videoUrl: string;
  updatedAt: string | null;
}

export interface PitchScript {
  title: string;
  hook: string;
  sections: { name: string; seconds: number; text: string }[];
  tips: string[];
}

export interface VideoScript {
  title: string;
  totalSeconds: number;
  scenes: { start: number; end: number; shot: string; voiceover: string; onScreen: string }[];
  tips: string[];
}

export interface DeckRoast {
  score: number;
  verdict: string;
  strengths: string[];
  weakPoints: { issue: string; quote: string | null; fix: string }[];
  missing: string[];
  rewrittenOpening: string;
  timing: string | null;
}

export interface Writeup {
  platform: "linkedin" | "x" | "devto";
  text: string;
}

export type AiOutputKind = "pitch" | "video" | "roast" | "writeup";

export interface AiOutput<T = unknown> {
  id: number;
  kind: AiOutputKind;
  params: Record<string, unknown>;
  content: T;
  provider: string | null;
  createdAt: string;
}

export interface QaGrade {
  score: number;
  feedback: string;
  missed: string[];
  modelAnswer: string;
}

export interface QaTurn {
  id: number;
  session: number;
  judge: string;
  question: string;
  answer: string | null;
  grade: QaGrade | null;
  createdAt: string;
}

export type ChecklistKind = "check" | "link" | "file";

export interface ChecklistItem {
  id: number;
  label: string;
  detail: string | null;
  kind: ChecklistKind;
  required: boolean;
  done: boolean;
  value: string | null;
  file: string | null;
  mime: string | null;
  meta: { durationSec?: number; accept?: "image" | "video" | "pdf" | "any"; limitSec?: number } | null;
  origin: "rules" | "default" | "custom";
}

export interface SubmissionCheck {
  itemId: number | null;
  label: string;
  status: "pass" | "warn" | "fail" | "info";
  detail: string;
}

// ---------- after the hackathon ----------

export interface Certificate {
  id: number;
  hackathonId: string;
  hackathonTitle: string;
  title: string;
  status: "pending" | "received";
  url: string | null;
  file: string | null;
  mime: string | null;
  receivedAt: string | null;
}

export type PrizeStatus = "won" | "claimed" | "paid";

export const PRIZE_STATUS_LABELS: Record<PrizeStatus, string> = {
  won: "Won, not claimed",
  claimed: "Claimed, awaiting payout",
  paid: "Paid out",
};

export interface Prize {
  id: number;
  hackathonId: string;
  hackathonTitle: string;
  title: string;
  amount: number | null;
  currency: string;
  kind: "cash" | "swag" | "credits" | "other";
  status: PrizeStatus;
  expectedBy: string | null;
  paidAt: string | null;
  notes: string | null;
}

export interface Retro {
  hackathonId: string;
  rating: number | null;
  wentWell: string;
  improve: string;
  lessons: string;
  updatedAt: string | null;
}

export interface Profile {
  name: string;
  headline: string;
  bio: string;
  location: string;
  github: string;
  linkedin: string;
  website: string;
}

export interface Stats {
  tracked: number;
  done: number;
  inProgress: number;
  withResults: number;
  wins: number;
  podiums: number;
  winRate: number | null;
  prizeUsd: { won: number; paid: number; pending: number };
  prizeCount: number;
  certificates: { received: number; pending: number };
  byMonth: { month: string; count: number; wins: number }[];
  byMode: Record<string, number>;
  topThemes: { theme: string; count: number }[];
  avgIdeaScore: number | null;
  avgQaScore: number | null;
  results: Record<string, number>;
}
