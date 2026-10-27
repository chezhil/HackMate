# Recon map: HackMate × reference apps (web)

Scope: all nine areas of HackMate (Discover, Hackathon page, Tracker, Calendar, Ideas/Pitch/Q&A, Team,
Submit, Profile, Prizes and certificates), with UX patterns borrowed from 22 reference products.
For: hackathon participants (solo hackers and small teams, mostly in India: INR prizes, Unstop/Devfolio feeds).
Date: 2026-10-27

## How this recon differs from a normal one

HackMate already exists (Next.js 16, SQLite, about 7.9k lines). This is not a clone of one app. It is a
**pattern recon**: for each HackMate area it lists what each reference does well, what HackMate does today,
and the gap between them. Two changes to the usual format follow from that:

- `features.csv` → `original` names the **reference app** the pattern comes from (or `HackMate` for
  features that are HackMate's own).
- `features.csv` → `clone` is HackMate's **current state** (`yes` / `partial` / `no`), read from the code,
  instead of starting at `no`. That way `/replica-diff` scores the real gap.

Rules followed: public pages only, no accounts, no logins, no source bundles or network logs, a handful of page
reads at normal speed. Nothing from the reference apps (code, copy, icons, brand) goes into HackMate. Only
the interaction patterns do.

## Sources

`checked` = read during this recon. `known` = the public page exists, but this recon did not re-read it
(the pattern notes come from general product knowledge and should be checked against a screenshot first).

| # | area | source | URL | what to take | status |
| --- | --- | --- | --- | --- | --- |
| 1 | Discover | Devpost hackathon listing | https://devpost.com/hackathons | filter facets (status, online/in person, theme tags), sort by prize/deadline, card with countdown | blocked (403 to automated fetch). Facets confirmed only via third-party scraper docs; open in a browser to check |
| 2 | Discover | Devpost help center | https://help.devpost.com | eligibility ("open to") and hackathon lifecycle terms | known |
| 3 | Discover | Airbnb search | https://www.airbnb.com/s/homes | list next to map, pins with a value on them, hover sync, "search as I move the map", filter modal with "Show N results" | known |
| 4 | Discover | Luma discover | https://luma.com/discover | city tiles with event counts, category tiles, regional tabs | checked |
| 5 | Hackathon page | Devfolio hackathons | https://devfolio.co/hackathons | page sections: overview, tracks/prizes, schedule, judges, FAQs | known |
| 6 | Hackathon page | Devfolio guide (hackers) | https://devfolio.co/docs/guide/participating-in-hackathons | team formation and submission flow | checked (index only) |
| 7 | Hackathon page | Perplexity help center | https://www.perplexity.ai/help-center/en/articles/10352895-how-does-perplexity-work | numbered inline citations that link to the source | checked |
| 8 | Tracker | Linear board layout docs | https://linear.app/docs/board-layout | drag between columns, `S` change status, `X` select, Alt+Shift+↑/↓ to top/bottom, Space peek, hide empty columns, swimlanes | checked |
| 9 | Tracker | Linear keyboard shortcuts | https://linear.app/docs/keyboard-shortcuts | Cmd+K palette, `?` cheat sheet | known |
| 10 | Tracker | Trello help | https://support.atlassian.com/trello/ | drag cards, card badges (due date, checklist n/m), archive | known |
| 11 | Calendar | Notion Calendar help | https://www.notion.com/help/category/notion-calendar | month/week views, overlapping events shown side by side, keyboard nav | known |
| 12 | Calendar | Fantastical | https://flexibits.com/fantastical | natural-language entry, compact upcoming list, menu-bar "next up" | known |
| 13 | Calendar | Cron | https://cron.com | Cron became Notion Calendar in 2024: same patterns as #11 | known |
| 14 | Ideas | Notion page history | https://www.notion.com/help/duplicate-delete-and-restore-content | version list, view an old version, restore | known |
| 15 | Pitch | Pitch.com help | https://help.pitch.com | presenter view: current/next, notes, timer, rehearsal | known |
| 16 | Mock Q&A | Duolingo | https://www.duolingo.com | instant per-answer feedback, lesson result screen, streaks, retrying mistakes | known |
| 17 | Team | Discord profiles / member list | https://support.discord.com | profile card (avatar, roles, about), searchable member list | known |
| 18 | Team | Wellfound co-founder matching | https://wellfound.com/cofounders | "looking for" post: role sought, skills, commitment | blocked (403). Pattern from general knowledge |
| 19 | Submit | Vercel Checks | https://vercel.com/docs/checks | checks run after each deploy; all must conclude before going live; core/perf/e2e groups | checked |
| 20 | Submit | GitHub status checks | https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collecting-information-about-changes-in-a-repository/about-status-checks | required vs optional checks, summary line "n failing, n passing", re-run, details link | known |
| 21 | Profile | GitHub profile contributions | https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/viewing-contributions-on-your-profile | daily heatmap, pinned items | known |
| 22 | Profile | Strava | https://www.strava.com | weekly streaks, personal records, year in sport | known |
| 23 | Profile | Read.cv | https://techcrunch.com/2025/01/17/perplexity-acquires-read-cv-a-social-media-platform-for-professionals/ | **defunct**: acquired by Perplexity in Jan 2025 and wound down. Use as a pattern memory only; a live comparison is Peerlist (https://peerlist.io) | checked |
| 24 | Profile | Polywork | https://kitemetric.com/blogs/top-polywork-alternatives-in-2025 | **reported shut down** Jan 2025 (one weak source, unconfirmed). Same note as #23 | checked (weak) |
| 25 | Prizes | Stripe payouts | https://docs.stripe.com/api/payouts/object | payout statuses pending / in_transit / paid / failed / canceled, expected arrival date | checked (statuses via API docs) |
| 26 | Certificates | Credly | https://info.credly.com | badge wallet: issuer, issue date, share/verify link | known |
| 27 | HackMate itself | the code | `src/` in this repo | every current screen, state and table | checked |

Terms note: no reference account was used, so no product's account terms apply to this work. Separately (not
part of this recon), HackMate's feed adapters read undocumented Unstop and Devfolio endpoints (see README).
That data belongs to those platforms. Keep linking out to the original page rather than republishing it.

## Core loop

Find a hackathon that fits → understand its rules → track it to a submission that passes every rule check
on time. Everything after that (pitch, Q&A, profile, prizes) makes people come back for the next one.

## Pattern map (reference → HackMate today → gap)

| area | reference pattern | HackMate today | gap worth building |
| --- | --- | --- | --- |
| Discover | Airbnb: list and map stay in sync on **hover**, map pins show the price, "search as I move the map" | split view, click a pin to scroll to the card, pins are plain markers | hover sync, prize-on-pin, filter by map bounds |
| Discover | Airbnb: filters in a sheet with a live "Show 42" button; active filters as removable chips | all filters inline in one card; "Clear n filters" link | removable chips row; mobile filter sheet |
| Discover | Luma: browse by city tiles with counts | city `<select>` with counts | city tiles as an empty-search landing |
| Discover | Devpost: status (open/upcoming), eligibility, countdown on card | date window, "Reg closes in…" on card | eligibility filter (students / open to all), length filter |
| Hackathon page | Devfolio: section-per-thing (tracks, prizes, judges, schedule) | Overview has tracks, prizes, judges, key dates, rule gotchas | schedule as a timeline; deep-linkable tabs (`?tab=submit`) |
| Hackathon page | Perplexity: numbered inline citations `[1]` that open the quoted passage | Ask AI answers only from rules, no citations | **citations to the rule passage**, source panel, follow-up suggestions |
| Tracker | Linear: drag, `S` to set status, `X` select, Cmd+K, Space peek, optimistic moves | status `<select>` + per-stage action buttons, no drag, no keys | drag and drop, keyboard map, peek, undo toast |
| Tracker | Trello: card badges (due, checklist 3/7) | "Next: <deadline> in 2d" line | checklist badge (from Submit), failing-check badge |
| Calendar | Notion Calendar: month + week, overlaps side by side, `T` today | month grid, multi-day bars, clash days in red, day panel | week/agenda view, keyboard nav |
| Calendar | Fantastical/Cron: compact list with live countdowns, NL entry | "Upcoming deadlines" list with relative times | live ticking countdown under 24h; "submission fri 5pm" entry |
| Ideas | Notion: page history, view and restore an old version | every version kept, score chips per version | side-by-side diff, restore |
| Pitch | Pitch.com: presenter view with current/next section, notes, timer | timed script as text | presenter mode with per-section timer and over-time warning |
| Mock Q&A | Duolingo: instant feedback, result screen, streak, practise mistakes | per-answer score, missed points, model answer, round average, past rounds | result screen, practice streak, "retry weak answers" round, spoken answers |
| Team | Discord: profile card with roles and skills; searchable member list | teammates per hackathon (name, role, skills, contact, confirmed) | cross-hackathon "people I've hacked with" directory, skill-gap hint |
| Team | Wellfound: structured "looking for" post (role, skills, commitment) | AI-written post, share to X/LinkedIn/Reddit/WhatsApp/Discord | structured fields feeding the post |
| Submit | Vercel/GitHub: pass/warn/fail rows, summary "2 failing · 1 warning · 8 passing", required vs optional, re-run, last run time | pass/warn/fail rows, AI summary line, required flag, "Check again" | count summary bar, last-run time, status badge on Tracker card, run history |
| Profile | GitHub: daily contribution heatmap, pinned projects | monthly bar chart, portfolio list | heatmap of daily activity, pin up to 6 projects |
| Profile | Strava: streaks, personal records | tiles: done, win rate, prize money, scores | streak (weeks with activity), PRs (best score, biggest prize) |
| Profile | Read.cv: clean public page | portfolio tab + "Save as PDF" | public read-only `/u/<handle>` page (needs deploy) |
| Prizes | Stripe: pending → in transit → paid, failed, expected date, overdue | won → claimed → paid, expected-by date, overdue flag, won/paid/owed totals | "not received" (failed) status, timeline per prize |
| Certificates | Credly: wallet grid with issuer, date, share link | certificate list with file/URL, auto-pending for finished hackathons | wallet grid with issuer, share link |

## Screens

`new` = proposed by this recon, not in HackMate yet.

| ID | screen | route / how to reach | purpose | key components | states seen (HackMate today) | states missing |
| --- | --- | --- | --- | --- | --- | --- |
| S01 | Discover | `/` | find hackathons | filter card, theme/source chips, segmented split/list/map, HackathonCard, MapView, sort | loading skeleton, filled, empty ("No hackathons match"), feed-failure banner, online-only map note, 200-cap note | mobile filter sheet, first-run (feeds still loading for the first time) |
| S02 | Hackathon page shell | `/hackathon/[id]` | one hackathon, all tools | header (image, dates, mode, prize), pin/unpin, underline tabs | loading pulse, error + back link, AI-reading poll | tab in URL |
| S03 | Overview tab | S02 → Overview | rules digest | summary, tracks, prizes, judges, deliverables, rule-alert quotes | filled, "waiting" empty per section, no-AI-key fallback | schedule timeline |
| S04 | Ask AI tab | S02 → Ask AI | questions answered from the rules | chat list, input, example placeholder | empty intro, answering, error | citations, follow-ups, "not in the rules" state |
| S05 | Ideas tab | S02 → Ideas | guidelines, suggestions, idea critique | idea cards, version score chips, critique panel | empty, critiquing, scored | version diff, restore |
| S06 | Team tab | S02 → Team | team vs size limit, recruiting post | teammate rows, confirmed/invited, post generator, share buttons | empty, filled, over-limit | skill-gap hint |
| S07 | Pitch tab | S02 → Pitch | script, storyboard, deck roaster | project form, length picker, output history, score badge | empty project, generating, filled | presenter mode (S21) |
| S08 | Mock Q&A (in Pitch) | S02 → Pitch → Mock judge Q&A | practice judge questions | question card, answer box, grade (score, missed, model answer), round score, past rounds | not started, in round, graded, unfinished | result screen (S22) |
| S09 | Submit tab | S02 → Submit | rule-based checklist + checks + write-ups | checklist items (check/link/upload), check rows pass/warn/fail, write-up generator | empty checklist, checking, results | count summary bar, last-run time |
| S10 | Standups tab | S02 → Standups | voice notes → done/next/blockers | recorder, list, transcript, summary | empty, recording, transcribing, error | — |
| S11 | Wrap-up tab | S02 → Wrap-up | result, prizes, certificates, retro | result select, PrizeList, CertificateList, retro form, "draft from my notes" | empty, filled | — |
| S12 | Tracker | `/tracker` | pipeline board | 5 columns, TrackerCard with stage action, ClashList | empty ("Nothing tracked yet"), filled, clashes | dragging, keyboard focus ring, undo toast |
| S13 | Calendar | `/calendar` | month view + deadlines | month grid, event bars, deadline chips, day panel, upcoming list, ClashList, CalendarSync | filled, clash days, no deadlines | week view, today shortcut |
| S14 | Profile: Stats | `/profile` | numbers that motivate | profile header, stat Tiles, monthly bars, RankList | first-run profile form, filled | heatmap, streak, PRs |
| S15 | Profile: Portfolio | `/profile` → Portfolio | finished projects | ProjectCard, links, Save as PDF | empty, filled | pinned projects |
| S16 | Profile: Certificates | `/profile` → Certificates | certificate vault | CertificateList, pending auto rows | empty, pending, received | wallet grid |
| S17 | Profile: Prizes | `/profile` → Prizes | prize tracker | PrizeList, status pill, overdue flag, totals | empty, won/claimed/paid, overdue | not-received status |
| S18 | Profile: Notes | `/profile` → Notes | all retros | retro cards | empty, filled | — |
| S19 | Settings | `/settings` | reminders, SMTP status, outbox, AI status | lead-time chips, outbox list, test email | configured, not configured | — |
| S20 | Command palette (new) | Cmd+K anywhere | jump to a hackathon, move a card, open a tab | modal, fuzzy list, shortcut hints | — | empty query, no match |
| S21 | Presenter mode (new) | S07 → Present | rehearse the pitch | full-screen section, next section, timer, progress | — | over time, paused |
| S22 | Practice result (new) | end of an S08 round | close the feedback loop | score ring, per-question chips, streak, "retry weak answers" | — | first round, new best |
| S23 | People directory (new) | `/people` or S06 → "From past teams" | find past teammates by skill | profile cards, skill chips, search | — | empty (no past teams) |
| S24 | Public portfolio (new) | `/u/<handle>` (deployed only) | shareable CV of hackathons | header, pinned projects, heatmap, certificates | — | private (toggle off), not deployed |
| S25 | Hackathon peek (new) | Space / hover-preview on S01 or S12 | look without leaving the list | side drawer with Overview essentials | — | AI still reading |

## Flows

Click counts are for HackMate today, read from the code. "Target" is the number to beat.

```
F01 Find a hackathon and pin it
    S01 theme chip -> city select -> pick city -> Pin on card
    happy path clicks: 4   target: 2 (saved search or city tile + Pin)
    edge: feeds still loading on first run, a source down, pin clashes with a tracked event (warning shown), online-only + map view

F02 Check a rule before committing
    S01 card -> S02/S03 Overview -> Ask AI tab -> type, Enter
    happy path clicks: 3 + typing   target: 3, with a cited answer
    edge: AI still reading the page (poll), no AI key, Gemini cooling down, answer not in the rules

F03 Move a hackathon through the pipeline
    S12 card status select -> option   (or the stage action button: 1 click)
    happy path clicks: 1–2 per move   target: 1 drag or 1 key (S)
    edge: moving to Submitted needs a project link, Results needs a result, moving back a stage

F04 Spot and resolve a clash
    S01 clash warning on card -> S13 Calendar -> clash day -> S12 unpin one
    happy path clicks: 4   target: 2 (resolve from the clash list)
    edge: deadline due during another event, two deadlines on the same day

F05 Get deadlines into my calendar
    S13 Sync -> Google / Apple / Outlook / .ics
    happy path clicks: 2 + external app   target: 2
    edge: Google/Outlook need a public URL (NEXT_PUBLIC_BASE_URL), no SMTP so reminders go to the Outbox

F06 Sharpen an idea
    S05 write idea -> Critique -> edit -> Critique again
    happy path clicks: 2 per round   target: 2, plus a diff against the last version
    edge: Groq rate limit (8k tokens/min), very long idea text

F07 Rehearse judge Q&A
    S07 -> Mock judge Q&A -> Start -> answer x5 -> round score
    happy path clicks: ~7 + 5 answers   target: same, ending on a result screen (S22)
    edge: judges not listed (AI judges used), round abandoned half way

F08 Fill the team
    S06 add teammate (form) -> write post -> Share on X
    happy path clicks: 3 + form   target: 2 (pick from past teammates, S23)
    edge: team already at max size, solo-only hackathon

F09 Submit with confidence
    S09 add proof (link/upload) -> Check submission -> fix a fail -> Check again -> S12 Mark submitted
    happy path clicks: 4 + fixes   target: 3, with "n failing" visible on the S12 card
    edge: repo private, video over length, screenshot shows the wrong thing, past the deadline

F10 Wrap up and get paid
    S11 result -> add prize -> add certificate -> retro -> S17 won -> claimed -> paid
    happy path clicks: ~8   target: ~6 (prize status changed straight from the row)
    edge: prize overdue, non-INR currency, certificate never arrives

F11 Show my track record
    S15 Save as PDF
    happy path clicks: 1   target: 1 copy-link to S24 once deployed
    edge: nothing finished yet, missing project links

F12 Log a standup
    S10 record -> stop -> auto transcribe and split
    happy path clicks: 2   target: 2
    edge: mic permission denied, Gemini cooling down (falls back to Groq Whisper), silence
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button (`btn`) | default, primary, sm, link-style | default, hover, disabled, busy text ("Checking…") | all |
| Chip (filter toggle) | theme, source | off, on (accent) | S01 |
| Input / Select | input, select, textarea | default, focus, disabled | all |
| Card | plain, padded section | — | all |
| Tabs (underline) | page tabs | active, inactive | S02, S14–S18 |
| Segmented control | split/list/map | active | S01 |
| HackathonCard | default, selected, tracked | clash warning, reg-closing countdown | S01 |
| MapView (Leaflet + OSM) | split, full | pin selected, tracked pin | S01 |
| Count pill | accent, danger | — | Nav |
| Banner | warn, danger | — | S01, Nav |
| Skeleton / pulse | card, page | — | S01, S02 |
| Check row | pass, warn, fail | — | S09 |
| Score badge | ok ≥8, warn ≥5, danger | — | S05, S07, S08 |
| Status pill / select | prize (won/claimed/paid), tracker stage | overdue | S12, S17 |
| DeadlineEditor | auto, custom | done | S03, S13 |
| ClashList | — | empty | S12, S13 |
| CalendarSync | — | public URL missing | S13 |
| CopyButton | — | copied | S06, S09 |
| ProjectCard / Tile / RankList / bar chart | — | empty | S14, S15 |
| **new** CommandPalette | — | empty, no match | all (S20) |
| **new** Draggable column + card | — | dragging, drop target, focus | S12 |
| **new** Toast with Undo | info, error | — | S12, S17 |
| **new** Citation chip `[1]` + source panel | — | hover, open | S04 |
| **new** Removable filter chip row | — | — | S01 |
| **new** Countdown | days, hours, live (<24h), overdue | — | S01, S12, S13 |
| **new** Check summary bar | all pass, warnings, failing | — | S09, S12 |
| **new** Activity heatmap | — | empty | S14, S24 |
| **new** Streak counter / score ring | — | new best | S14, S22 |
| **new** Version diff | inline, side by side | — | S05 |
| **new** Peek drawer | — | loading | S01, S12 |

## Inferred data model

HackMate's schema is already real (`src/lib/db.ts`), so existing tables are listed briefly at **high**
confidence. The new parts are what the reference patterns need; they are guesses for `/replica-architect`.

```
Existing (evidence: src/lib/db.ts; confidence: high)
hackathons        id, source, title, url, mode, city, lat/lng, starts/ends, reg dates, prize_text, prize_usd,
                  entry_fee, themes json, organizer, description, team_min, team_max
tracked           hackathon_id, status (interested|registered|building|submitted|results), dates, submission_url, result, notes
deadlines         id, hackathon_id, kind, label, due_at, auto, done
hackathon_details hackathon_id, source_text, info json (tracks, prizes, judges, deliverables...), provider
chat_messages     id, hackathon_id, role, content, provider
ideas / idea_versions      idea 1-n versions (text, critique json)
teammates         id, hackathon_id, name, role, skills, contact, confirmed
standups          id, hackathon_id, file, transcript, summary
projects          hackathon_id, name, tagline, problem, solution, stack, repo/demo/video urls
ai_outputs        id, hackathon_id, kind (pitch|video|roast|writeup...), params, content
qa_turns          id, hackathon_id, session, judge, question, answer, grade json
checklist_items   id, hackathon_id, label, kind, required, done, value, file, meta, origin
certificates      id, hackathon_id, title, status (pending|received), url, file
prizes            id, hackathon_id, title, amount, currency, kind, status (won|claimed|paid), expected_by, paid_at
retros            hackathon_id, rating, went_well, improve, lessons
settings, reminders_sent, email_log, geocache, past_winners

New / changed (confidence: guess unless marked)
chat_messages.citations  json [{n, quote, offset}] pointing into hackathon_details.source_text
                  evidence: Perplexity numbered citations (source 7); confidence: medium
tracked.sort      INTEGER, order within a column
                  evidence: Linear Alt+Shift+↑/↓, Trello reorder; confidence: high that it's needed
saved_searches    id, name, filters json, notify (0|1), last_seen_count
                  evidence: Airbnb wishlists / Luma follow; confidence: guess
people            id, name, skills json, contact, links, notes, first_met_hackathon_id
teammates.person_id  FK -> people (teammates stay per hackathon, people span them)
                  evidence: Discord member list, Wellfound profiles; confidence: medium
check_runs        id, hackathon_id, ran_at, summary, checks json (status pass|warn|fail)
                  evidence: GitHub re-run + history, Vercel per-deploy checks; confidence: medium
prizes.status     add 'not_received' (Stripe 'failed'); keep overdue derived from expected_by
                  evidence: Stripe payout statuses (source 25); confidence: medium
certificates      add issuer, issued_at, share_url
                  evidence: Credly wallet; confidence: medium
settings keys     profile.handle, profile.public (0|1), profile.pinned json [hackathon_id...]
                  evidence: GitHub pinned, Read.cv public page; confidence: medium
Derived, no table: activity heatmap (dates from standups, idea_versions, qa_turns, tracked.submitted_at),
                  streak (consecutive weeks with any activity), personal records (max qa score, max prize).
```

Relationships: Hackathon 1-1 Tracked, Hackathon 1-n Deadline / ChatMessage / Idea / Teammate / Standup /
QaTurn / ChecklistItem / CheckRun / Certificate / Prize; Idea 1-n IdeaVersion; Person 1-n Teammate;
Hackathon 1-1 Project / HackathonDetails / Retro.

## Feature matrix

See `features.csv` (106 rows). Must: 41, should: 38, could: 18, skip: 9. HackMate today: 43 yes, 11 partial,
43 no. Every `must` is already `yes` except three: **Ask AI citations** (no), a clear **"not in the rules"
answer state** (partial) and **drag cards on the tracker** (no).

## Out of scope (cannot or should not be cloned)

- **Other people.** Devpost/Devfolio project galleries, Wellfound's co-founder pool, Discord servers. A
  teammate *marketplace* needs a user network HackMate doesn't have (it's a single-user local app). Build
  the local "people I've hacked with" directory and outbound posts instead.
- **Platform-owned data.** Hackathon listings belong to Unstop, Devfolio, MLH and WeMakeDevs; past-winner
  projects belong to Devfolio. Link out, don't mirror them in a public page.
- **Verified credentials.** Credly's verification works because issuers sign badges. HackMate can store and
  share certificates, but cannot verify them.
- **Moving money.** Stripe moves payouts; HackMate only tracks prize status.
- **A slide editor.** Pitch.com's editor is a product of its own. HackMate writes scripts, roasts decks made
  elsewhere, and can add a presenter/rehearsal view.
- **Web-wide answers.** Perplexity searches the web; HackMate's Ask AI must stay inside the rules on purpose.
- **Brand assets.** Airbnb's map pin style, Duolingo's mascot and sounds, Linear's and Notion's look, any
  licensed font. Patterns only, with HackMate's own tokens.
- **Map tiles.** Commercial tiles (Google, Mapbox) need licences and keys; keep OpenStreetMap with attribution.
- **Defunct references.** Read.cv and Polywork are gone; their pages can't be checked any more.

## Size

Screens 25 (19 exist, 6 new), flows 12, entities 21 existing + 3 new tables and 6 column changes.
Hard parts:
1. **Ask AI citations**: the model has to return offsets or quotes that really occur in `source_text`,
   validated server-side, inside Groq's 8k tokens/min budget.
2. **Accessible drag and drop + keyboard map on the tracker**, with optimistic updates and undo, without
   a drag library (none is installed today).
3. **Public portfolio page**: HackMate is local-first SQLite. A public `/u/<handle>` needs a deploy plus a
   read-only, opt-in export, and must not leak private notes.

Also notable: map-bounds filtering in Leaflet with 200+ markers, a live countdown that doesn't re-render
the whole board, presenter mode timing.

Size: **M** (a few weeks) for every should row; **S** (a weekend) for the 3 open musts plus the top 6
shoulds: citations, tracker drag + keys, check summary bar + tracker badge, removable filter chips,
hover sync on the map, practice result screen.
