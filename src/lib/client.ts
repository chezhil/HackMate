// Browser-side JSON fetch helper shared by the client components.
export async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Path segment for a hackathon id ("source:id" contains a colon). */
export const hid = (id: string) => encodeURIComponent(id);
