import { RESULT_LABELS, STATUSES, type ResultKind, type TrackStatus } from "./types";

/** Small runtime guards for user input; TypeScript types do not validate a request body. */
export async function readJson(req: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch { /* Invalid JSON is a client error. */ }
  return badRequest("Expected a JSON object");
}

export const badRequest = (error: string) => Response.json({ error }, { status: 400 });
export const isDate = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "" && Number.isFinite(new Date(value).getTime());
export const isPositiveId = (value: number) => Number.isSafeInteger(value) && value > 0;
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; }
  catch { return false; }
}

export function validFields(body: Record<string, unknown>, rules: Record<string, (value: unknown) => boolean>): boolean {
  return Object.entries(rules).every(([key, check]) => body[key] === undefined || check(body[key]));
}
export const text = (value: unknown): value is string => typeof value === "string";
export const nullableText = (value: unknown) => value === null || text(value);
export const boolean = (value: unknown): value is boolean => typeof value === "boolean";
export const optionalUrl = (value: unknown) => value === null || value === "" || isHttpUrl(value);

export const isTrackStatus = (value: unknown): value is TrackStatus =>
  typeof value === "string" && STATUSES.some((status) => status.key === value);

export const isResultKind = (value: unknown): value is ResultKind =>
  typeof value === "string" && Object.hasOwn(RESULT_LABELS, value);

export const prizeRules = {
  title: text, amount: (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0),
  currency: (v: unknown) => typeof v === "string" && ["INR", "USD", "EUR", "GBP"].includes(v),
  kind: (v: unknown) => ["cash", "swag", "credits", "other"].includes(v as string),
  status: (v: unknown) => ["won", "claimed", "paid"].includes(v as string),
  expectedBy: (v: unknown) => v === null || v === "" || isDate(v),
  paidAt: (v: unknown) => v === null || isDate(v), notes: nullableText,
};

/** A route segment as text; a malformed %-escape is kept as typed instead of crashing. */
export function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The request's multipart form, or a 400 when it isn't one. */
export async function readForm(req: Request): Promise<FormData | Response> {
  try {
    return await req.formData();
  } catch {
    return badRequest("Expected a file upload (multipart form)");
  }
}
