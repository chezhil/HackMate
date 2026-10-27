// Turns replica/design/tokens.json into src/app/tokens.css (CSS variables + the Tailwind theme mapping).
// Run from the repo root: node replica/design/build-tokens.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(path.join(here, "tokens.json"), "utf8"));
const out = path.join(here, "../../src/app/tokens.css");

const vars = (obj, indent) =>
  Object.entries(obj)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => `${indent}--${k}: ${v};`)
    .join("\n");

const { light, dark } = t.color;
const shared = {
  // Shadows are drawn in the border (ink) colour, so they flip with the theme on their own.
  "pop-shadow": t.shadow.pop,
  "hard-shadow": t.shadow.hard,
  "hard-sm-shadow": t.shadow["hard-sm"],
  line: `${t["border-width"].line}px`,
  "map-filter": t.map["tile-filter"],
  scrim: t.overlay.scrim,
  "dur-fast": t.motion.fast,
  "dur-base": t.motion.base,
  ease: t.motion.ease,
  "side-panel": `${t.layout["side-panel"] / 16}rem`,
  ...Object.fromEntries(Object.entries(t.z).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [`z-${k}`, v])),
};
const darkOnly = { scrim: t.overlay["scrim-dark"], "map-filter": t.map["tile-filter-dark"] };

const theme = [
  ...Object.keys(light).map((k) => `  --color-${k}: var(--${k});`),
  ...Object.entries(t.type)
    .filter(([k]) => k === "2xs")
    .flatMap(([k, s]) => [`  --text-${k}: ${s.size / 16}rem;`, `  --text-${k}--line-height: ${s.line / 16}rem;`]),
  "  --shadow-pop: var(--pop-shadow);",
  "  --shadow-hard: var(--hard-shadow);",
  "  --shadow-hard-sm: var(--hard-sm-shadow);",
  // Remap Tailwind's corner scale so existing rounded-md/lg/xl/2xl classes follow the tokens.
  `  --radius-md: ${t.radius.sm / 16}rem;`,
  `  --radius-lg: ${t.radius.md / 16}rem;`,
  `  --radius-xl: ${t.radius.lg / 16}rem;`,
  `  --radius-2xl: ${t.radius.xl / 16}rem;`,
  `  --font-sans: ${t.font.sans};`,
  `  --font-mono: ${t.font.mono};`,
].join("\n");

const css = `/* Generated from replica/design/tokens.json by replica/design/build-tokens.mjs. Do not edit by hand. */

:root {
  color-scheme: light;
${vars(light, "  ")}
${vars(shared, "  ")}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${vars(dark, "    ")}
${vars(darkOnly, "    ")}
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
${vars(dark, "  ")}
${vars(darkOnly, "  ")}
}

@theme inline {
${theme}
}
`;

writeFileSync(out, css);
console.log(`wrote ${path.relative(process.cwd(), out)}`);
