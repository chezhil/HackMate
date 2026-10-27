// Rule-based "gotchas" pulled straight from a hackathon's rules text. Works without any AI key,
// and backs up the AI extraction with exact quotes.

export interface RuleAlert {
  key: string;
  level: "critical" | "warning" | "info";
  label: string;
  quote: string | null;
}

interface Rule {
  key: string;
  level: RuleAlert["level"];
  re: RegExp;
  label: (m: RegExpMatchArray) => string;
}

const WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const NUM = `\\d{1,2}|${WORDS.join("|")}`;
const num = (s: string) => (WORDS.includes(s.toLowerCase()) ? WORDS.indexOf(s.toLowerCase()) + 1 : Number(s));

const RULES: Rule[] = [
  { key: "solo", level: "critical", re: /\b(solo|individual)\s+(participation|participants?|only|event|hackathon)\b|\bteams? (are )?not allowed\b|\bteam size\s*[:\-–]?\s*1\b/i, label: () => "Solo only — no teams" },
  { key: "video", level: "warning", re: new RegExp(`\\b(?:video|demo)[^.\\n]{0,60}?\\b(${NUM})\\s*(?:-|–|to)?\\s*(?:\\d{1,2}\\s*)?(?:min(?:ute)?s?|mins)\\b|\\b(${NUM})[\\s-]*min(?:ute)?s?\\b[^.\\n]{0,40}\\b(?:video|demo)\\b`, "i"), label: (m) => `Demo video limit: ${num(m[1] ?? m[2])} min` },
  { key: "video-required", level: "warning", re: /\b(demo|pitch|project|explainer) video\b|\bvideo (submission|demo|link)\b|\byoutube link\b/i, label: () => "Video required" },
  { key: "deck", level: "warning", re: /\b(pitch[- ]?deck|ppt|powerpoint|slide ?deck|presentation slides?)\b/i, label: () => "Pitch deck / slides required" },
  { key: "slides-limit", level: "warning", re: /\b(?:max(?:imum)?|up to|no more than|not exceed)\s*(\d{1,2})\s*slides\b|\b(\d{1,2})\s*slides?\s*(?:max|maximum)\b/i, label: (m) => `Slide limit: ${m[1] ?? m[2]} slides` },
  { key: "ip", level: "warning", re: /\b(intellectual property|IP rights?|ownership of (the )?(project|submission|code)|rights to (use|the) (submission|project)|exclusive (license|rights))\b/i, label: () => "IP / ownership terms — read before submitting" },
  { key: "fresh-code", level: "warning", re: /\b(built|created|written|developed) (entirely )?during the (hackathon|event)\b|\bfrom scratch\b|\bpre-?existing (code|projects?|work)\b|\bprior work\b/i, label: () => "Code must be written during the event" },
  { key: "github", level: "info", re: /\b(public )?github (repo|repository|link)\b|\bopen[- ]source (your|the) (code|project)\b|\bmust be open[- ]source\b/i, label: () => "Public GitHub repo expected" },
  { key: "students", level: "critical", re: /\b(only (for )?(college |university )?students|students only|currently enrolled|valid (college|student) id)\b/i, label: () => "Students only" },
  { key: "women", level: "critical", re: /\b(women[- ]only|only (for )?women|female participants only|all[- ]women teams?)\b/i, label: () => "Women-only event" },
  { key: "age", level: "critical", re: /\b(18\s*(?:years|\+)|minimum age|above the age of \d+|at least \d+ years old)\b/i, label: () => "Age restriction" },
  { key: "in-person", level: "info", re: /\b(must be (physically )?present|in-person attendance (is )?(mandatory|required)|offline round|on-?site finale)\b/i, label: () => "In-person attendance required at some stage" },
  { key: "fee", level: "info", re: /\b(registration fee|entry fee|participation fee)\b/i, label: () => "Has an entry / registration fee" },
  { key: "abstract", level: "info", re: /\b(abstract|idea submission|proposal) (round|submission|deadline)\b|\bppt round\b/i, label: () => "Idea / proposal round before the build" },
];

function quoteAround(text: string, index: number, length: number) {
  const start = Math.max(0, text.lastIndexOf("\n", index) + 1, index - 140);
  const endNl = text.indexOf("\n", index + length);
  const end = Math.min(text.length, endNl === -1 ? text.length : endNl, index + length + 140);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

export function ruleAlerts(text: string, team?: { min: number | null; max: number | null }): RuleAlert[] {
  const out: RuleAlert[] = [];
  if (team?.max === 1) out.push({ key: "solo", level: "critical", label: "Solo only — no teams", quote: null });
  else if (team?.min && team.min > 1) out.push({ key: "team-min", level: "critical", label: `Team required: at least ${team.min} people`, quote: null });
  for (const rule of RULES) {
    if (out.some((a) => a.key === rule.key)) continue;
    const m = text.match(rule.re);
    if (!m || m.index === undefined) continue;
    out.push({ key: rule.key, level: rule.level, label: rule.label(m), quote: quoteAround(text, m.index, m[0].length) });
  }
  // A specific limit makes the generic "video required" redundant.
  if (out.some((a) => a.key === "video")) return out.filter((a) => a.key !== "video-required");
  return out;
}
