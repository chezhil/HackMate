import "server-only";
import { createHash } from "node:crypto";
import { ANONYMOUS, currentScope, get, run } from "./db";
import { allowAll, clientIp, retryAt } from "./request";

/**
 * One entry point for every AI call, routed by task.
 *
 * Gemini's free tier has tight rate limits, so it only gets the jobs it's best at and that run
 * rarely: reading a whole hackathon page once (long context, cached) and listening to voice notes
 * (audio input). Everything interactive and frequent goes to Groq. Each task falls back to the other
 * provider when its first choice is missing, rate-limited or failing; for audio the fallback is
 * Groq's Whisper (see `transcribe`).
 */

export type Provider = "groq" | "gemini";
export type Task =
  | "extract" | "audio" | "vision" | "chat" | "ideas" | "critique" | "post" | "summarize"
  | "pitch" | "roast" | "qa" | "review" | "writeup" | "retro";

const ROUTES: Record<Task, Provider[]> = {
  extract: ["gemini", "groq"],
  audio: ["gemini"],
  chat: ["groq", "gemini"],
  ideas: ["groq", "gemini"],
  critique: ["groq", "gemini"],
  post: ["groq", "gemini"],
  summarize: ["groq", "gemini"],
  pitch: ["groq", "gemini"],
  roast: ["groq", "gemini"],
  qa: ["groq", "gemini"],
  review: ["groq", "gemini"],
  writeup: ["groq", "gemini"],
  retro: ["groq", "gemini"],
  // checking a screenshot needs image input; Groq's current models are text-only
  vision: ["gemini"],
};

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiRequest {
  task: Task;
  system: string;
  messages: AiMessage[];
  json?: boolean;
  temperature?: number;
  /** Attach audio or an image to the last user message (Gemini only). */
  media?: { mime: string; base64: string };
  /** Give up on Gemini after this long and fall through to the next provider (default 120 s). */
  geminiTimeoutMs?: number;
  /**
   * Reuse an earlier answer to the same request, for anyone, for this long. Only for answers that don't depend
   * on who's asking and where a fresh one wouldn't be better (reading a page, checking a screenshot); never for
   * "give me new ideas". `key` replaces the request hash when the prompt has parts that change but don't matter
   * (like the current time).
   */
  cache?: { ttlDays: number; key?: string };
}

export interface AiResult {
  text: string;
  provider: Provider;
  model: string;
  /** Answered from the shared cache, without calling a provider. */
  cached?: boolean;
}

export class AiUnavailableError extends Error {}

/**
 * For a route's catch: the AI being unavailable or over its allowance is a 503 with its message; anything else
 * is rethrown for the route wrapper (a 404 for "not found", otherwise a generic 500).
 */
export function aiFailure(e: unknown): Response {
  if (e instanceof AiUnavailableError) return Response.json({ error: e.message }, { status: 503 });
  throw e;
}

// ---------- per-account limits ----------
//
// Groq and Gemini free tiers are shared by everyone on this HackMate, so each account gets an allowance of real
// AI calls (answers from the cache don't count). Signed-out visitors on a public HackMate only ever trigger the
// one-off read of a hackathon's rules, limited per address. Background jobs aren't limited.

const HOUR = 3_600_000;
const limit = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

async function checkAllowance(task: Task) {
  const who = currentScope();
  const ip = clientIp();
  if (ip == null) return; // not from a request
  const rules =
    who === ANONYMOUS
      ? [{ key: `ai:ip:${ip}`, max: limit("AI_LIMIT_ANON_PER_HOUR", 10), windowMs: HOUR }]
      : [
          { key: `ai:${who ?? "local"}:h`, max: limit("AI_LIMIT_PER_HOUR", 60), windowMs: HOUR },
          { key: `ai:${who ?? "local"}:d`, max: limit("AI_LIMIT_PER_DAY", 300), windowMs: 24 * HOUR },
        ];
  const full = await allowAll(rules);
  if (!full) return;
  const when = (await retryAt(full.key, full.windowMs)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const span = full.windowMs === HOUR ? "this hour" : "today";
  console.warn(`[ai] limit reached for ${who ?? "local"} (${full.key}) on ${task}`);
  throw new AiUnavailableError(`You've used your AI allowance for ${span} (${full.max} requests). It frees up again around ${when}.`);
}

const KEYS: Record<Provider, () => string | undefined> = {
  groq: () => process.env.GROQ_API_KEY,
  gemini: () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
};

const GROQ_BASE = "https://api.groq.com/openai/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ---------- model resolution ----------
// Use GROQ_MODEL / GEMINI_MODEL when set; otherwise ask the API what's available and pick a fast,
// general model, so we don't break when a provider retires a model name.

const state = globalThis as unknown as {
  hackmateAiModels?: Partial<Record<Provider, string>>;
  hackmateGeminiCooldownUntil?: number;
  hackmateGeminiLastCall?: number;
};
state.hackmateAiModels ??= {};

function versionScore(id: string) {
  const m = id.match(/(\d+(?:[.-]\d+)?)/);
  return m ? Number(m[1].replace("-", ".")) : 0;
}

async function listModels(provider: Provider, key: string): Promise<string[]> {
  if (provider === "groq") {
    const res = await fetch(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Groq models: HTTP ${res.status}`);
    const data = (await res.json()) as { data: { id: string }[] };
    return data.data.map((m) => m.id);
  }
  const res = await fetch(`${GEMINI_BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Gemini models: HTTP ${res.status}`);
  const data = (await res.json()) as { models: { name: string; supportedGenerationMethods?: string[] }[] };
  return data.models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
}

function pickModel(provider: Provider, ids: string[]): string | undefined {
  const byVersion = (a: string, b: string) => versionScore(b) - versionScore(a);
  if (provider === "groq") {
    const chat = ids.filter((id) => !/whisper|guard|orpheus|tts|allam|compound/.test(id));
    return (
      chat.find((id) => /gpt-oss-120b/.test(id)) ??
      chat.find((id) => /llama-3\.3-70b|llama-4/.test(id)) ??
      chat.filter((id) => /qwen/.test(id)).sort(byVersion)[0] ??
      chat[0]
    );
  }
  const gemini = ids
    .filter((id) => /^gemini-[\d.]+-flash/.test(id) && !/lite|image|tts|audio|live|thinking|exp/.test(id))
    .sort((a, b) => byVersion(a, b) || Number(/preview/.test(a)) - Number(/preview/.test(b)));
  return gemini[0];
}

async function modelFor(provider: Provider, key: string): Promise<string> {
  const override = provider === "groq" ? process.env.GROQ_MODEL : process.env.GEMINI_MODEL;
  if (override) return override;
  const cached = state.hackmateAiModels![provider];
  if (cached) return cached;
  const picked = pickModel(provider, await listModels(provider, key));
  if (!picked) throw new Error(`No usable ${provider} model found for this API key`);
  state.hackmateAiModels![provider] = picked;
  return picked;
}

// ---------- provider calls ----------

class RateLimitError extends Error {}

// Groq's free tier allows ~8k tokens per minute per model, so requests are trimmed to fit
// (roughly 4 characters per token, leaving room for the reply).
const GROQ_MAX_INPUT_CHARS = Number(process.env.GROQ_MAX_INPUT_CHARS ?? 18_000);

/** Shorten the longest parts (usually pasted page text) until the request fits the budget. */
function fitToBudget(system: string, messages: AiMessage[], budget: number) {
  const parts = [system, ...messages.map((m) => m.content)];
  let total = parts.reduce((n, p) => n + p.length, 0);
  while (total > budget) {
    const i = parts.reduce((best, p, j) => (p.length > parts[best].length ? j : best), 0);
    const cut = Math.min(total - budget + 20, parts[i].length - 200);
    if (cut <= 0) break;
    parts[i] = parts[i].slice(0, parts[i].length - cut) + "\n…[truncated]";
    total = parts.reduce((n, p) => n + p.length, 0);
  }
  return { system: parts[0], messages: messages.map((m, j) => ({ ...m, content: parts[j + 1] })) };
}

async function callGroq(req: AiRequest, key: string): Promise<AiResult> {
  const model = await modelFor("groq", key);
  const { system, messages } = fitToBudget(req.system, req.messages, GROQ_MAX_INPUT_CHARS);
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: req.temperature ?? 0.4,
      messages: [{ role: "system", content: system }, ...messages],
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (res.status === 429) throw new RateLimitError("Groq rate limit");
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return { text: data.choices[0]?.message?.content ?? "", provider: "groq", model };
}

const GEMINI_MIN_INTERVAL_MS = Number(process.env.GEMINI_MIN_INTERVAL_MS ?? 4_000);

async function callGemini(req: AiRequest, key: string): Promise<AiResult> {
  const model = await modelFor("gemini", key);
  // Space calls out to stay under the free-tier requests-per-minute limit.
  const wait = (state.hackmateGeminiLastCall ?? 0) + GEMINI_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  state.hackmateGeminiLastCall = Date.now();

  const contents = req.messages.map((m, i) => {
    const parts: Record<string, unknown>[] = [{ text: m.content }];
    if (req.media && i === req.messages.length - 1) parts.push({ inline_data: { mime_type: req.media.mime, data: req.media.base64 } });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.4,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
        // Gemini 3 thinks hard by default, which is slow; extraction and transcription don't need it.
        ...(/^gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
      },
    }),
    signal: AbortSignal.timeout(req.geminiTimeoutMs ?? 120_000),
  });
  if (res.status === 429 || res.status === 503) {
    // 503 = "model overloaded"; back off the same way so the next calls go straight to Groq.
    state.hackmateGeminiCooldownUntil = Date.now() + 60_000;
    throw new RateLimitError(res.status === 429 ? "Gemini rate limit" : "Gemini overloaded");
  }
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return { text, provider: "gemini", model };
}

function available(p: Provider) {
  if (!KEYS[p]()) return false;
  if (p === "gemini" && (state.hackmateGeminiCooldownUntil ?? 0) > Date.now()) return false;
  return true;
}

// ---------- shared cache ----------

function cacheKey(req: AiRequest): string {
  if (req.cache?.key) return `${req.task}:${req.cache.key}`;
  const h = createHash("sha256");
  h.update(JSON.stringify([req.task, req.system, req.messages, req.json ?? false, req.temperature ?? null, req.media?.mime ?? null]));
  if (req.media) h.update(req.media.base64);
  return `${req.task}:${h.digest("hex")}`;
}

/** Serve from the cache, or run and store the answer. `accept` keeps bad answers (unparseable JSON) out. */
async function cached(req: AiRequest, call: () => Promise<AiResult>, accept: (text: string) => boolean = () => true): Promise<AiResult> {
  if (!req.cache) return call();
  const key = cacheKey(req);
  const now = new Date();
  const hit = (await get("SELECT text, provider, model FROM ai_cache WHERE key = ? AND expires_at > ?", key, now.toISOString())) as
    | { text: string; provider: Provider; model: string }
    | undefined;
  if (hit) {
    (await run("UPDATE ai_cache SET hits = hits + 1 WHERE key = ?", key));
    return { ...hit, cached: true };
  }
  const result = await call();
  if (accept(result.text)) {
    const expires = new Date(now.getTime() + req.cache.ttlDays * 86_400_000);
    (await run(`INSERT INTO ai_cache (key, task, text, provider, model, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET text = excluded.text, provider = excluded.provider, model = excluded.model,
           created_at = excluded.created_at, expires_at = excluded.expires_at, hits = 0`, key, req.task, result.text, result.provider, result.model, now.toISOString(), expires.toISOString()));
  }
  return result;
}

/** How much the cache has saved: answers stored, and calls answered from them. */
export async function cacheStats() {
  const r = (await get("SELECT COUNT(*) AS entries, COALESCE(SUM(hits), 0) AS hits FROM ai_cache WHERE expires_at > ?", new Date().toISOString())) as {
    entries: number;
    hits: number;
  };
  return { entries: r.entries, savedCalls: r.hits };
}

export function generate(req: AiRequest): Promise<AiResult> {
  return cached(req, () => callProviders(req));
}

async function callProviders(req: AiRequest): Promise<AiResult> {
  await checkAllowance(req.task);
  const order = ROUTES[req.task].filter(available);
  if (order.length === 0) {
    const needs = req.task === "audio" ? "GEMINI_API_KEY" : "GROQ_API_KEY or GEMINI_API_KEY";
    const limited = ROUTES[req.task].some((p) => KEYS[p]());
    throw new AiUnavailableError(
      limited ? "The AI provider is rate-limited right now. Try again in a minute." : `AI isn't set up: add ${needs} to .env.local and restart.`,
    );
  }
  let lastError: unknown;
  for (const p of order) {
    try {
      return p === "groq" ? await callGroq(req, KEYS.groq()!) : await callGemini(req, KEYS.gemini()!);
    } catch (e) {
      lastError = e;
      console.warn(`[ai] ${p} failed for ${req.task}:`, (e as Error).message);
    }
  }
  throw lastError;
}

/** Ask for JSON and parse it, tolerating ```json fences. */
export async function generateJson<T>(req: Omit<AiRequest, "json">): Promise<AiResult & { data: T }> {
  const full = { ...req, json: true };
  const result = await cached(full, () => callProviders(full), (text) => {
    try {
      parseJson(text);
      return true;
    } catch {
      return false;
    }
  });
  return { ...result, data: parseJson(result.text) as T };
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = cleaned.search(/[[{]/);
  return JSON.parse(start > 0 ? cleaned.slice(start) : cleaned);
}

/** Speech-to-text with Groq's Whisper: the fallback when Gemini can't take a voice note. */
export async function transcribe(audio: Buffer, mime: string): Promise<string> {
  await checkAllowance("audio");
  const key = KEYS.groq();
  if (!key) throw new AiUnavailableError("Transcription needs GEMINI_API_KEY or GROQ_API_KEY in .env.local.");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `note.${mime.split("/")[1] ?? "webm"}`);
  form.append("model", process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3-turbo");
  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Whisper HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { text: string }).text.trim();
}

export async function aiStatus() {
  return {
    groq: { configured: Boolean(KEYS.groq()), model: process.env.GROQ_MODEL ?? state.hackmateAiModels!.groq ?? null },
    gemini: {
      configured: Boolean(KEYS.gemini()),
      model: process.env.GEMINI_MODEL ?? state.hackmateAiModels!.gemini ?? null,
      coolingDown: (state.hackmateGeminiCooldownUntil ?? 0) > Date.now(),
    },
    routes: ROUTES,
    cache: await cacheStats(),
  };
}
