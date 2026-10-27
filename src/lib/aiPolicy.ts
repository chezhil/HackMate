// Pure: finds a hackathon's stated policy on using AI tools, from its rules or description.

export type AiPolicyKind = "allowed" | "conditional" | "banned";

export interface AiPolicy {
  kind: AiPolicyKind;
  /** The sentence it was read from, shown on hover so you can judge it yourself. */
  quote: string;
}

/** Using AI as a tool — not hackathons *about* AI ("build with generative AI" is a theme, not a rule). */
const AI_TOOL =
  /\b(AI[- ](?:tools?|assistan(?:ce|ts?)|assisted|generated|coding|code|models?)|use of AI|using AI|(?:generative|gen) AI tools?|ChatGPT|Copilot|LLM[- ]?generated|LLMs?|Cursor|Claude|Gemini|vibe[- ]?cod\w*)\b/i;
// "must not" only counts when it's about using AI ("must not use AI"), not data rules ("must not be uploaded to AI tools").
const BANNED = /\b(not (?:be )?(?:allowed|permitted)|prohibit\w*|forbid\w*|banned|disallow\w*|strictly no|no AI\b|must not (?:use|rely)|cannot use|can't use|will (?:be|lead to) (?:a )?(?:ban|disqualif\w*)|disqualif\w*)\b/i;
const ALLOWED = /\b(allowed|permitted|may use|can use|free to use|are welcome|encouraged|is fine|feel free)\b/i;
const CONDITION =
  /\b(provided|as long as|so long as|must (?:disclose|declare|document|explain|understand|credit)|disclos\w*|declare|attribut\w*|without[- ]understanding|understand(?:s|ing)? (?:and can explain|the code)|(?:able to|can|expected to) (?:be able to )?explain|clearly document)\b/i;

/** Split into sentences and bullet points, which is where rules live in these descriptions. */
const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|\n+|\s[•●▪]\s|\s-\s(?=[A-Z])/)
    .map((s) => s.replace(/^[\s•●▪*#>-]+/, "").replace(/\*\*/g, "").trim())
    .filter((s) => s.length > 8 && s.length < 400);

/**
 * The first sentence that states a policy wins, worst case first: a ban beats a conditional allowance,
 * which beats a plain allowance. Mentions that only describe the theme return nothing.
 */
export function aiPolicy(text: string | null | undefined): AiPolicy | null {
  if (!text) return null;
  let best: AiPolicy | null = null;
  const rank: Record<AiPolicyKind, number> = { banned: 0, conditional: 1, allowed: 2 };
  for (const s of sentences(text)) {
    if (!AI_TOOL.test(s)) continue;
    const kind: AiPolicyKind | null = CONDITION.test(s) && (ALLOWED.test(s) || BANNED.test(s))
      ? "conditional"
      : BANNED.test(s)
        ? "banned"
        : ALLOWED.test(s)
          ? "allowed"
          : null;
    if (kind && (!best || rank[kind] < rank[best.kind])) best = { kind, quote: s };
  }
  return best;
}
