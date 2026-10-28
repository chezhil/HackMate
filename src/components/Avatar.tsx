/** Initial on a colour picked from the name, so people are easy to tell apart in a list. */
const TONES = ["bg-accent text-accent-text", "bg-warn-soft text-text", "bg-ok-soft text-text", "bg-danger-soft text-text", "bg-accent-soft text-text"];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  let n = 0;
  for (const ch of name) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  const box = size === "sm" ? "size-6 rounded-md text-xs" : size === "lg" ? "size-16 rounded-2xl text-2xl" : "size-11 rounded-xl text-lg";
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center border-(length:--line) border-border font-bold ${box} ${TONES[n % TONES.length]}`}>
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
