import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetching links that people type in (a hackathon's page, a submission's demo link) without letting a link reach
 * this server's own network: every hop's name has to resolve to public addresses only, and redirects are followed
 * by hand so each one is checked too.
 */

export class PrivateAddressError extends Error {
  constructor() {
    super("That link points at a private network address, not a public website.");
  }
}

function isPrivateAddress(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/i, "");
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const x = ip.toLowerCase();
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb");
}

async function assertPublic(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new PrivateAddressError();
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addrs.length === 0) throw new Error("HTTP 0: name not found");
  if (addrs.some(isPrivateAddress)) throw new PrivateAddressError();
}

/** fetch, following up to 5 redirects by hand so each hop is checked. Throws PrivateAddressError for a private hop. */
export async function fetchPublic(start: string | URL, init: { headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<Response> {
  let url = new URL(start);
  for (let hop = 0; hop < 6; hop++) {
    await assertPublic(url);
    const res = await fetch(url.href, { headers: init.headers, redirect: "manual", signal: AbortSignal.timeout(init.timeoutMs ?? 20_000) });
    const to = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && to) {
      await res.body?.cancel();
      url = new URL(to, url);
      continue;
    }
    return res;
  }
  throw new Error("HTTP 0: too many redirects");
}

/** A public page's text, at most `maxChars` long; throws on an HTTP error ("… → HTTP 404"). */
export async function fetchPublicText(url: string | URL, headers: Record<string, string>, maxChars = 2_000_000): Promise<string> {
  const res = await fetchPublic(url, { headers });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`${url} → HTTP ${res.status}`);
  }
  return (await res.text()).slice(0, maxChars);
}
