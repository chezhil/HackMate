import type { Citation } from "./types";

export interface Passage {
  n: number;
  text: string;
}

const STOPWORDS = new Set("a an the is are was be can i we my our to of in on for and or do does how what when where who which with it this that there any if about".split(" "));

/**
 * The parts of the page most relevant to the question, numbered so the model can cite them.
 * Keeps each chat request small enough for Groq's free tier: paragraphs scored by how many of
 * the question's words they contain, kept in page order.
 */
export function relevantPassages(text: string, question: string, maxChars = 7_000): Passage[] {
  const paras = text.split(/\n{2,}|\n(?=[•#-])/).map((p, i) => ({ p: p.trim(), i })).filter((x) => x.p.length > 20);
  let picked = paras;
  if (text.length > maxChars) {
    const terms = question.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((t) => !STOPWORDS.has(t)) ?? [];
    const scored = paras.map((x) => {
      const lower = x.p.toLowerCase();
      return { ...x, score: terms.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0) + (x.i < 3 ? 0.5 : 0) };
    });
    picked = [];
    let used = 0;
    for (const x of [...scored].sort((a, b) => b.score - a.score)) {
      if (used + x.p.length > maxChars) continue;
      picked.push(x);
      used += x.p.length;
    }
    picked.sort((a, b) => a.i - b.i);
  }
  return picked.map((x, k) => ({ n: k + 1, text: x.p }));
}

export function passagesBlock(passages: Passage[]): string {
  return passages.map((p) => `[P${p.n}] ${p.text}`).join("\n\n") || "(none)";
}

/** Lowercase, straight quotes, single spaces: enough to match a quote the model copied with small changes. */
const norm = (s: string) =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

const MAX_FALLBACK = 400;

/**
 * Turns the model's `[P3]` markers into display numbers [1], [2]… in reading order and pairs each
 * with its passage. Markers that point at no passage are dropped. A quote counts as verified only
 * if it really occurs in that passage; otherwise the citation shows the start of the passage.
 */
export function resolveCitations(
  answer: string,
  quotes: Record<string, string> | undefined,
  passages: Passage[],
): { content: string; citations: Citation[] } {
  const byN = new Map(passages.map((p) => [p.n, p]));
  const order = new Map<number, number>();
  const citations: Citation[] = [];

  const content = answer
    .replace(/\s*\[P(\d+)\]/g, (_m, raw: string) => {
      const p = byN.get(Number(raw));
      if (!p) return "";
      let k = order.get(p.n);
      if (k == null) {
        k = order.size + 1;
        order.set(p.n, k);
        const quote = (quotes?.[`P${p.n}`] ?? quotes?.[raw] ?? "").trim();
        const verified = quote.length >= 8 && norm(p.text).includes(norm(quote));
        citations.push({
          n: k,
          quote: verified ? quote : p.text.length > MAX_FALLBACK ? `${p.text.slice(0, MAX_FALLBACK).trimEnd()}…` : p.text,
          passage: p.text,
          verified,
        });
      }
      return ` [${k}]`;
    })
    // Two citations in a row read as "[1] [2]", not "[1][2]".
    .replace(/\](?=\[)/g, "] ")
    .trim();

  return { content, citations };
}
