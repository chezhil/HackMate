# HackMate — design brief for Stitch

How to use this file:

1. Pick a visual direction in Part 1 (delete the two you don't want).
2. Paste **Part 1** into Stitch first. It sets the product, the look and the rules for every screen.
3. Then paste **one screen from Part 2 at a time**, in order. Each screen prompt stands on its own.
4. Generate both a desktop (1440 wide) and a mobile (390 wide) version of each screen.

Everything below describes HackMate's real features and data. Invent nothing beyond it.

---

## Part 1 — Product and look (paste this first)

**Product.** HackMate is a web app for people who enter hackathons, mostly students and early-career developers
in India, solo or in teams of 2 to 4. It pulls upcoming hackathons from Unstop, Devfolio, MLH and WeMakeDevs into one
list. You pin the ones you want, track each through to submission, and keep a record of what you built and won.
The core loop: **find a hackathon that fits → understand its rules → get a submission in, on time, that passes every rule.**

**Who uses it and how.** Someone with a laptop at their desk, scanning many options, then working deeply on one or
two at a time. On phones they check deadlines and ask quick questions about the rules. It's a tool they open
daily during a hackathon, so it must be fast to scan and calm to work in, never noisy.

**Navigation.** A top bar with the logo ("HackMate", a small square mark with the letter H) and five sections:
Discover, Tracker (shows a count of active hackathons), Calendar (shows a red count of schedule clashes), Profile, Settings.
On mobile the sections become a scrollable row or a bottom tab bar.

**Visual direction (keep one):**

- **A. Sharp and dense.** Cool neutral greys, a single strong accent, 13–14px body text, tight 8px spacing,
  thin 1px borders, almost no shadows, compact cards that fit many on screen. Think precise productivity tool.
- **B. Bold and lively.** Warm off-white background, one saturated accent plus a secondary highlight, larger
  rounded cards (16px radius) with event cover images, generous spacing, friendly display headings.
- **C. Dark-first and technical.** Near-black background, high-contrast text, a neon-leaning accent used sparingly,
  monospace for numbers, dates and countdowns, subtle grid textures. Must still have a light mode.

**Rules for every screen:**

- Light **and** dark mode for everything.
- Text contrast at least WCAG AA: 4.5:1 for body text, 3:1 for large text, input borders and focus rings.
- Colour is never the only signal. Status always has an icon or a word too (✓ passed, ⚠ warning, ✕ failed, "Overdue").
- One status vocabulary everywhere: **ok** (green: passed, paid, done), **warn** (amber: due within 7 days, needs work,
  won-but-unpaid), **danger** (red: due within 48 hours, failed, overdue, clash), **accent** (selected, links, primary
  actions), **neutral** (everything else).
- Line icons in one consistent set (Lucide style). No emoji as icons.
- An open-licence font (Geist, Inter, IBM Plex or Manrope). Numbers in countdowns and scores use tabular figures.
- Visible keyboard focus ring on every interactive element.
- Every list has a designed **empty** state and a **loading** state (skeleton blocks, not spinners).
- Cards are flat with a border; only floating layers (menus, dialogs, popovers, toasts) get a shadow.
- Countdown pills are a signature element: a small clock icon plus "11h 50m" or "4d 11h", coloured by urgency.
- Copy is short and plain. Sentence case. No exclamation marks.

**Sample data to use** (real items from the app):

| Hackathon | Source | Format | Where | Dates | Prize | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Mergetober: Open Source Month | WeMakeDevs | Online | — | Oct 1 – Oct 31 | $5,000 in prizes | Results |
| No Hands: The Wispr Challenge | WeMakeDevs | Online | — | Oct 16 – Oct 31 | ₹1,00,000 | Pinned |
| Yantravedh Hardware Hackathon | Unstop | In person | Pune, India | ends Oct 27 | — | Pinned, registration closes in 11h |
| Anna AI OS Founding Builder Challenge 2026 | Unstop | Online | — | ends Nov 30 | $80,000 in prizes | — |
| Prompts to Profit Hackathon | Unstop | In person | Gandhinagar, India | ends Nov 1 | ₹3,00,000 | registration closes in 2d |
| HerHack 2026 | Unstop | Hybrid | Faridabad, India | ends Nov 10 | ₹2,00,000 | — |

Themes used as filters: AI / ML, Web3, Web & Apps, Fintech, Health, Climate, Security, Open Source, Social Good,
Gaming, Hardware / IoT, Data, DevTools, Education. There are about 278 upcoming hackathons at a time.

---

## Part 2 — Screens (paste one at a time)

### 1. Discover

Design the Discover screen of HackMate, where people find hackathons to enter.

- Header: title "Discover hackathons", a line "278 of 278 upcoming · updated 2 hours ago", and a "Refresh feeds" button.
- A wide search field ("Search name, organizer, city…").
- Filters: Format (online / in person / hybrid), City (with counts), Prize band ($1k+, $5k+, $10k+), When (next 7 days,
  next 30 days, registration open), Length (up to 2 days, 3–7 days, over a week), theme chips, source chips
  (Unstop, Devfolio, MLH, WeMakeDevs), "Free entry only", "Hide ones that clash with my tracker".
- Active filters as removable chips with "Clear all". A sort menu (soonest, registration closing, biggest prize) and a
  Split / List / Map switch.
- Split view: a list of hackathon cards on the left, a map on the right with coloured pins (in person, hybrid,
  ones I'm tracking) and a "Search as I move the map" toggle. Hovering a card highlights its pin.
- Each card: cover image, title, format badge, city, date range, source, one-line tagline, prize, a registration
  countdown pill, up to 3 theme chips, a red "Clashes with No Hands: The Wispr Challenge" warning when relevant,
  and a "Pin" button that becomes "✓ Tracking".
- Mobile: search plus a "Filters · 2" button that opens a bottom sheet ending in a "Show 37 hackathons" button.
  List first; the map is its own view.
- Also show the empty state ("No hackathons match" with "Clear all filters") and a warning banner
  ("Couldn't reach MLH on the last refresh. Showing the last data we have.").

### 2. Hackathon page — header and Overview

Design one hackathon's page in HackMate, using "Mergetober: Open Source Month" as the example.

- Header: cover image, title, "Oct 1 – Oct 31 · Online · WeMakeDevs", the prize line, and actions "Open page ↗",
  a status button ("✓ Results"), and "Unpin" (or a primary "Pin to tracker" when not pinned).
- Tabs: Overview, Ask AI, Ideas, Team, Pitch, Submit, Standups, Wrap-up. On mobile the tabs scroll sideways.
- Overview, main column: an AI-written summary; "Alerts & gotchas" as stacked rows with an icon per level
  (critical: "Solo-only competition; teams are not allowed." / warning: "AI-generated PRs are prohibited." /
  info: "PRs opened in October count even if not merged by Oct 31.") with the exact quote from the rules under some;
  tracks; prizes; judging criteria with weights.
- Side panel: "At a glance" (team size "Solo only", deliverables, eligibility, IP / ownership), Judges, and a
  vertical **Schedule timeline** (past steps ticked and greyed, the next step bold with a live countdown pill),
  and a small "Read 9k characters 2 hours ago · Re-read rules" line.
- A state where the AI is still reading the rules: a progress note, with the quick scan already shown below.

### 3. Hackathon page — Ask AI

Design the Ask AI tab: a chat that answers questions using only this hackathon's rules, with sources.

- User question bubble: "How many pull requests do I need, and do they have to be merged?"
- Answer: plain text with small superscript citation numbers [1] [2] [3] after each claim.
- Clicking a number opens a popover: the quoted sentence from the rules ("You can have up to 5 PRs open at a time."),
  a "Quoted from the hackathon page" note with a shield-check icon (or "exact sentence not matched" when it couldn't
  be verified), and "Show full passage". On mobile the popover is a bottom sheet.
- Under the answer, a collapsible "6 sources from the rules" list.
- An answer the rules can't support gets a "Not in the rules" amber badge.
- Under the latest answer, 3 suggested follow-up chips ("Do PRs need to be merged?", "When does the hackathon end?",
  "Can I work in a team?").
- Empty state with starter chips ("Can I participate solo?", "What do I need to submit?", "How long can the demo
  video be?"). Input at the bottom with an "Ask" button, and a "Clear conversation" link.

### 4. Hackathon page — Submit

Design the Submit tab: a checklist built from the rules plus automated submission checks.

- Header "Submission checklist" with a "3/5 required done" badge.
- Checklist rows: checkbox, label, "from rules" badge or "(optional)", a short detail, and proof attached as a link
  field or an uploaded file (image thumbnail, "Video attached · 118s"). Add-item row at the bottom.
- Side panel "Check my submission": a primary "Check submission" button, then a summary line
  "1 failing · 1 warning · 3 passing", then CI-style rows: ✕ "Repo is public: github.com/you/app returns 404 when
  signed out", ⚠ "Video length: 2:14. The limit is 2:00", ✓ "Team size: 3 of 4 allowed".
- A "Write it up" panel: LinkedIn / X thread / Dev.to choices and a generated draft with a "Post on LinkedIn ↗" button.

### 5. Hackathon page — Ideas and Pitch

Design two tabs.

- **Ideas:** AI guidelines and idea suggestions for the tracks; past winning projects with a trophy and prize; my
  ideas as cards, each showing a row of score chips per version (6 → 7 → 8.5) and the latest critique
  (score out of 10, positives, negatives, risks, fixes). "Critique this version" button.
- **Pitch:** a project form (name, tagline, problem, solution, stack, repo, demo, video); sections for
  "Pitch script" (pick 1–7 minutes), "Demo video script" (a table of time, shot, voiceover, caption),
  "Deck roaster" (paste slides, get a big score badge, a verdict, quoted weak spots with fixes), and
  "Mock judge Q&A" (five judge questions answered one at a time; each graded out of 10 with what was missed and a
  model answer; a round score and past rounds). Make the mock Q&A feel like a practice session with a clear result.

### 6. Tracker

Design the Tracker: a board that moves each pinned hackathon through Pinned → Registered → Building → Submitted → Results.

- Five columns with counts. Cards are draggable between columns (show one being dragged and the drop target).
- Card: title, dates, place, source, a "Next: Registration closes" line with a countdown pill, a clash warning icon,
  and the action for its stage: "Register ↗" and "I've registered" / "Start building →" / a project-link field and
  "Mark submitted" / a result choice (Won, Runner-up, Special mention, Participated, Not selected).
- Expanding a card shows its deadlines (editable), clashes and notes, and "Remove from tracker".
- A clashes panel at the top when two pinned hackathons overlap.
- Keyboard hints (S to change status, ↑/↓ to move) and an Undo toast after a move ("Moved to Building · Undo").
- Empty state: "Nothing tracked yet" with "Find hackathons".

### 7. Calendar

Design the Calendar: a month view of every tracked hackathon and deadline.

- Month grid (Monday first) with today highlighted, multi-day event bars in up to 8 distinct colours, small red
  deadline chips with a clock icon, and red-tinted days where events clash. "Show all discovered" toggle,
  previous / next month and "Today".
- Side panel: "Upcoming deadlines" (label, hackathon, countdown pill coloured by urgency, date and time, "+ Google"),
  "Clashes" ("No Hands: The Wispr Challenge overlaps Yantravedh Hardware Hackathon · both running on Oct 27"),
  and "Sync to your calendar" (Google, Apple, Outlook, .ics download).
- Selecting a day shows that day's events and deadlines below the grid.

### 8. Profile

Design the Profile: a personal record after hackathons, with tabs Stats, Portfolio, Certificates, Prizes, Notes.

- Header: name, headline ("Full-stack dev · 12× hackathon finalist"), location, links.
- **Stats:** tiles (hackathons done, win rate, prize money won / paid / owed, certificates, average idea score,
  average Q&A score), a daily activity heatmap for the year, a weekly streak, and personal bests.
- **Portfolio:** finished projects as cards with result badge, links (Code, Live demo, Video), prizes and
  certificate; pin up to 6; "Save as PDF".
- **Certificates:** a wallet grid of certificate thumbnails with title, hackathon, issue date; a "Pending" group
  for finished hackathons without one.
- **Prizes:** rows with amount and currency, status (Won → Claimed → Paid) and expected date; overdue ones flagged
  in red ("follow up with the organizers"); totals at the top.
- **Notes:** retros per hackathon with a 1–5 star rating, "went well", "do better" and "lessons".

### 9. Settings

Design Settings: email reminders (lead-time chips: 1 week, 3 days, 1 day, 3 hours, 1 hour; send-test-email button),
an amber banner when email delivery isn't set up, AI provider status (Groq and Gemini, configured or not),
calendar sync links, and an Outbox listing emails with "sent" or "logged" badges.

---

## Notes for bringing the design back into code

- Keep these role names when you hand the design back, so it drops straight into `replica/design/tokens.json`:
  `bg, surface, surface-2, border, border-strong, text, muted, accent, accent-hover, accent-soft, accent-text,
  ok, ok-soft, warn, warn-soft, danger, danger-soft, focus, event-1 … event-8` (for light and dark).
- Re-check contrast after: `python3 contrast.py replica/design/tokens.json` must report 0 failures.
- The app's behaviour stays as it is (filters in the URL, citations, countdown thresholds: red within 48 hours, amber within 7 days).
