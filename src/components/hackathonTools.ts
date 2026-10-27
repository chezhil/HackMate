import { Clapperboard, Flame, Gavel, Lightbulb, ListChecks, MessageCircleQuestion, Presentation, ScrollText } from "lucide-react";
import { hid } from "@/lib/client";

export type ToolTab = "overview" | "ask" | "ideas" | "pitch" | "submit";
export type ToolSection = "pitch" | "video" | "roast" | "qa";

export interface HackathonTool {
  key: string;
  label: string;
  blurb: string;
  tab: ToolTab;
  section?: ToolSection;
  Icon: typeof Flame;
}

/** The AI tools on a hackathon page, in the order you'd use them. The strip, Tracker shortcuts and links share this list. */
export const TOOLS: HackathonTool[] = [
  { key: "rules", label: "Understand the rules", blurb: "Summary, gotchas, judging", tab: "overview", Icon: ScrollText },
  { key: "ask", label: "Ask AI", blurb: "Answers with sources", tab: "ask", Icon: MessageCircleQuestion },
  { key: "ideas", label: "Ideas", blurb: "Suggestions, critique, past winners", tab: "ideas", Icon: Lightbulb },
  { key: "pitch", label: "Pitch script", blurb: "Timed to the criteria", tab: "pitch", section: "pitch", Icon: Presentation },
  { key: "video", label: "Demo video", blurb: "Shot-by-shot script", tab: "pitch", section: "video", Icon: Clapperboard },
  { key: "roast", label: "Roast my deck", blurb: "Weak spots and fixes", tab: "pitch", section: "roast", Icon: Flame },
  { key: "qa", label: "Mock judge Q&A", blurb: "Practise, get scored", tab: "pitch", section: "qa", Icon: Gavel },
  { key: "submit", label: "Check submission", blurb: "Against the rules", tab: "submit", Icon: ListChecks },
];

export const toolByKey = (key: string) => TOOLS.find((t) => t.key === key)!;

/** Link straight to a tool, e.g. /hackathon/…?tab=pitch&section=qa. */
export function toolHref(hackathonId: string, tool: HackathonTool) {
  const q = new URLSearchParams();
  if (tool.tab !== "overview") q.set("tab", tool.tab);
  if (tool.section && tool.section !== "pitch") q.set("section", tool.section);
  const qs = q.toString();
  return `/hackathon/${hid(hackathonId)}${qs ? `?${qs}` : ""}`;
}
