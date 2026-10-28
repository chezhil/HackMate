/** Compare event links without tracking parameters; paths and query values remain case-sensitive. */
export function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.host.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/%[0-9a-f]{2}/gi, (encoded) => {
      const ch = String.fromCharCode(Number.parseInt(encoded.slice(1), 16));
      return /[a-z0-9._~-]/i.test(ch) ? ch : encoded.toUpperCase();
    }).replace(/\/+$/, "");
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid|ref)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return `${host}${path}${url.search}`;
  } catch { return null; }
}

/** Only same-origin paths are accepted for post-login navigation, including browser URL normalization. */
export function safeReturnPath(value: string | null): string {
  const base = "https://hackmate.invalid";
  if (!value?.startsWith("/") || /[\\\x00-\x20\x7f]/.test(value)) return "/profile";
  try {
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : "/profile";
  } catch { return "/profile"; }
}
