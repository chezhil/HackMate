import {
  Clapperboard, Flame, FolderKanban, Gavel, Lightbulb, ListChecks, MessageCircleQuestion, Mic, PartyPopper, Presentation,
  ScrollText, Users,
} from "lucide-react";
import { hid } from "@/lib/client";

export type ToolTab = "overview" | "ask" | "ideas" | "team" | "project" | "pitch" | "submit" | "standups" | "wrapup";
export type ToolSection = "pitch" | "video" | "roast" | "qa";

export interface HackathonTool {
  key: string;
  label: string;
  blurb: string;
  tab: ToolTab;
  section?: ToolSection;
  Icon: typeof Flame;
}

/** Everything on a hackathon page, grouped by when you'd use it. This panel is the page's only navigation. */
export const TOOL_GROUPS: { label: string; tools: HackathonTool[] }[] = [
  {
    label: "Understand",
    tools: [
      { key: "rules", label: "Rules & overview", blurb: "Summary, gotchas, judging", tab: "overview", Icon: ScrollText },
      { key: "ask", label: "Ask AI", blurb: "Answers with sources", tab: "ask", Icon: MessageCircleQuestion },
    ],
  },
  {
    label: "Plan",
    tools: [
      { key: "ideas", label: "Ideas", blurb: "Suggestions, critique, past winners", tab: "ideas", Icon: Lightbulb },
      { key: "team", label: "Team", blurb: "Teammates and a recruiting post", tab: "team", Icon: Users },
      { key: "project", label: "Your project", blurb: "Used by every tool below", tab: "project", Icon: FolderKanban },
    ],
  },
  {
    label: "Pitch",
    tools: [
      { key: "pitch", label: "Pitch script", blurb: "Timed to the criteria", tab: "pitch", section: "pitch", Icon: Presentation },
      { key: "video", label: "Demo video", blurb: "Shot-by-shot script", tab: "pitch", section: "video", Icon: Clapperboard },
      { key: "roast", label: "Roast my deck", blurb: "Weak spots and fixes", tab: "pitch", section: "roast", Icon: Flame },
      { key: "qa", label: "Mock judge Q&A", blurb: "Practise, get scored", tab: "pitch", section: "qa", Icon: Gavel },
    ],
  },
  {
    label: "Finish",
    tools: [
      { key: "submit", label: "Submit", blurb: "Checklist and checks", tab: "submit", Icon: ListChecks },
      { key: "standups", label: "Standups", blurb: "Voice or written", tab: "standups", Icon: Mic },
      { key: "wrapup", label: "Wrap-up", blurb: "Result, prizes, retro", tab: "wrapup", Icon: PartyPopper },
    ],
  },
];

export const TOOLS: HackathonTool[] = TOOL_GROUPS.flatMap((g) => g.tools);

export const toolByKey = (key: string) => TOOLS.find((t) => t.key === key)!;

/** Link straight to a tool, e.g. /hackathon/…?tab=pitch&section=qa. */
export function toolHref(hackathonId: string, tool: HackathonTool) {
  const q = new URLSearchParams();
  if (tool.tab !== "overview") q.set("tab", tool.tab);
  if (tool.section && tool.section !== "pitch") q.set("section", tool.section);
  const qs = q.toString();
  return `/hackathon/${hid(hackathonId)}${qs ? `?${qs}` : ""}`;
}
