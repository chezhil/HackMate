import {
  Clapperboard, Flame, FolderKanban, Gavel, Lightbulb, ListChecks, MessageCircleQuestion, Mic, PartyPopper, Presentation,
  ScrollText, Users,
} from "lucide-react";

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

/**
 * Everything on a hackathon page, grouped by when you'd use it: four stages of three, so the columns line up.
 * This panel is the page's only navigation.
 */
export const TOOL_GROUPS: { label: string; tools: HackathonTool[] }[] = [
  {
    label: "Explore",
    tools: [
      { key: "rules", label: "Rules & overview", blurb: "Summary, gotchas, judging", tab: "overview", Icon: ScrollText },
      { key: "ask", label: "Ask AI", blurb: "Answers with sources", tab: "ask", Icon: MessageCircleQuestion },
      { key: "ideas", label: "Ideas", blurb: "Suggestions, critique, past winners", tab: "ideas", Icon: Lightbulb },
    ],
  },
  {
    label: "Build",
    tools: [
      { key: "team", label: "Team", blurb: "Teammates and a recruiting post", tab: "team", Icon: Users },
      { key: "project", label: "Your project", blurb: "Used by the pitch and submit tools", tab: "project", Icon: FolderKanban },
      { key: "standups", label: "Standups", blurb: "Voice or written", tab: "standups", Icon: Mic },
    ],
  },
  {
    label: "Pitch",
    tools: [
      { key: "pitch", label: "Pitch script", blurb: "Timed to the criteria", tab: "pitch", section: "pitch", Icon: Presentation },
      { key: "roast", label: "Roast my deck", blurb: "Weak spots and fixes", tab: "pitch", section: "roast", Icon: Flame },
      { key: "qa", label: "Mock judge Q&A", blurb: "Practise, get scored", tab: "pitch", section: "qa", Icon: Gavel },
    ],
  },
  {
    label: "Finish",
    tools: [
      // The demo video is usually a submission deliverable, so it sits with Submit.
      { key: "video", label: "Demo video", blurb: "Shot-by-shot script", tab: "pitch", section: "video", Icon: Clapperboard },
      { key: "submit", label: "Submit", blurb: "Checklist and checks", tab: "submit", Icon: ListChecks },
      { key: "wrapup", label: "Wrap-up", blurb: "Result, prizes, retro", tab: "wrapup", Icon: PartyPopper },
    ],
  },
];

export const TOOLS: HackathonTool[] = TOOL_GROUPS.flatMap((g) => g.tools);
