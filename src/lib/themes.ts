// Every source tags themes differently (or not at all), so we map titles, taglines
// and source tags onto one small set of themes the filters can use.

export const THEMES = [
  "AI / ML",
  "Web3",
  "Web & Apps",
  "Fintech",
  "Health",
  "Climate",
  "Security",
  "Open Source",
  "Social Good",
  "Gaming",
  "Hardware / IoT",
  "Data",
  "DevTools",
  "Education",
] as const;

export type Theme = (typeof THEMES)[number];

const RULES: [Theme, RegExp][] = [
  ["AI / ML", /\b(ai|a\.i\.|ml|machine learning|deep learning|llms?|gen ?ai|generative|agents?|agentic|rag|nlp|computer vision|neural|gpt|mcp)\b/i],
  ["Web3", /\b(web ?3|blockchain|crypto|defi|nft|ethereum|solana|polygon|smart contracts?|dao|onchain|on-chain)\b/i],
  ["Web & Apps", /\b(web|app development|mobile|android|ios|frontend|front-end|full ?stack|ui|ux|software development)\b/i],
  ["Fintech", /\b(fintech|finance|financial|banking|payments?|trading|insurance)\b/i],
  ["Health", /\b(health|healthcare|medical|medtech|biotech|wellness|mental health)\b/i],
  ["Climate", /\b(climate|sustainab\w*|environment\w*|green|energy|clean ?tech|agri\w*)\b/i],
  ["Security", /\b(security|cyber\w*|ctf|bug bounty|vulnerabilit\w*|infosec)\b/i],
  ["Open Source", /\b(open[- ]?source|oss|hacktoberfest|mergetober|pull requests?)\b/i],
  ["Social Good", /\b(social (good|impact)|smart india|sih|civic|govtech|accessibility|community)\b/i],
  ["Gaming", /\b(gam(e|es|ing)|game ?jam|esports|ar\/vr|vr|ar|metaverse|xr)\b/i],
  ["Hardware / IoT", /\b(hardware|iot|robotics?|embedded|arduino|drones?|electronics)\b/i],
  ["Data", /\b(data|analytics|datathon|big data|scraping|scrape)\b/i],
  ["DevTools", /\b(dev ?tools?|developer tools?|devops|cloud|kubernetes|backend|api|infra\w*|ci\/cd)\b/i],
  ["Education", /\b(edtech|education|learning platform|students?)\b/i],
];

export function inferThemes(...texts: (string | null | undefined)[]): Theme[] {
  const haystack = texts.filter(Boolean).join(" \n ");
  return RULES.filter(([, re]) => re.test(haystack)).map(([theme]) => theme);
}
