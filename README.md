# HackMate

HackMate keeps track of everything you need for a hackathon.

## What's here so far

**Discover**: pulls upcoming hackathons from **Unstop**, **Devfolio**, **MLH**, **WeMakeDevs**, **Devpost**, **lablab.ai**, **HackerEarth**, **Hack2skill**, and **Devsemble** into one list.
Filter by city, online / in person / hybrid, prize pool, free entry, theme, source and date. In-person events show on a map.

**Tracker**: pin a hackathon, then move it through *Pinned → Registered → Building → Submitted → Results*.
Each stage has its own action: register link, project link on submit, result and notes at the end.

**Deadlines & calendar**:
- Registration close, start and submission dates come from the feed automatically. You can edit them or add your own.
- In-app month calendar with every tracked event and deadline (optionally every discovered hackathon too).
- Clash detection flags hackathons on the same days, deadlines that land on the same day, and deadlines due
  while you're at another event. Discover also warns before you pin something that clashes.
- Calendar sync via a private iCal feed: one-click subscribe for Google, Apple and Outlook, or a one-time `.ics` download.
- Email reminders before each deadline (1 week / 3 days / 1 day / 3 hours / 1 hour — your pick), batched into one email.

**Hackathon pages**: click any hackathon to open its page:
- **Overview**: the AI reads the full rules once and pulls out the summary, team size, deliverables
  (deck, video length…), eligibility, IP terms, judges, judging criteria, tracks, prizes and key dates.
  A built-in rule scanner also flags gotchas (solo-only, video/slide limits, IP terms, students-only…)
  with the exact quote, and it works even without an AI key.
- **Ask AI**: ask questions about that hackathon. Answers come only from its rules.
- **Ideas**: guidelines and idea suggestions based on its tracks, criteria and past winners. Write your
  own idea and get a score with positives, negatives, risks and fixes, then edit and re-critique as many
  times as you like. Every version and its score are kept.
- **Past winners**: prize-winning Devfolio projects from earlier editions and similar themes.
- **Team**: add teammates (confirmed or invited) against the team-size limit, and write a "looking for
  teammates" post to share on X, LinkedIn, Reddit, WhatsApp, Discord or the platform's team finder.
- **Standups**: record voice notes; each is transcribed and split into done / next / blockers.
- **Pitch**: fill in your project once, then:
  - a timed pitch script (1–7 min) written to the judging criteria
  - a demo video storyboard (time, shot, voiceover, captions) that fits the video limit
  - a **deck roaster**: paste your script or slide text for a score, quoted weak points with fixes,
    what's missing, and a stronger opening
  - **mock judge Q&A**: five questions from AI judges (the real judges when they're listed); each answer
    is scored with what you missed and a model answer
- **Submit**: a checklist built from the rules (e.g. the usage-card screenshot and a 2-minute video),
  with links and uploads as proof. **Check submission** tests the deadline and team size, that links
  open, that the GitHub repo is public with a README, the uploaded video's length, whether screenshots
  show the right thing (Gemini), and runs an AI review against the rules. Also writes LinkedIn posts,
  X threads and dev.to blogs about your project.
- **Wrap-up**: record the result, prizes and certificates, and write retro notes (or draft them from
  your standups, idea critiques and mock Q&A).

**Profile**: after hackathons:
- **Stats**: hackathons done, win rate, prize money (won / paid / owed), certificates, monthly
  activity, results, themes, average idea and Q&A scores.
- **Portfolio**: every finished hackathon with its project, links, result, prizes and certificate.
  "Save as PDF" prints it.
- **Certificate vault**: stored certificates, plus pending ones; any finished hackathon without a
  certificate shows up automatically.
- **Prize tracker**: won → claimed → paid out, expected payout dates, and overdue flags.
- **Notes**: all your retros in one place.

## Running it

Needs Node 22.13+. Uses Postgres through `DATABASE_URL`, or an embedded PGlite database for local development.

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first load pulls all nine feeds (a few seconds). After that they refresh every 6 hours,
or on demand with **Refresh feeds**. Map coordinates are filled in from OpenStreetMap in the background.

With no `DATABASE_URL`, local Postgres data lives in `data/pg` (git-ignored). Uploads are stored in the database. See `DEPLOY.md` for hosted Postgres and deployment options.

### AI keys

Add these to `.env.local` (see `.env.example`):

- `GROQ_API_KEY`: chat answers, idea suggestions and critiques, teammate posts. Fast, with a generous
  free tier (about 8k tokens a minute, so requests are trimmed to fit).
- `GEMINI_API_KEY`: reads each hackathon's full rules once (cached) and listens to voice notes.
  Its free tier is rate-limited, so it's only used for those.

If one provider is missing, overloaded or rate-limited, the other takes over (voice notes fall back to
Groq's Whisper). Models are picked automatically from what your key can access.

### Email reminders

Copy `.env.example` to `.env.local` and fill in SMTP details (a Gmail app password works), then restart.
Without SMTP, reminders are written to the **Outbox** on the Settings page instead of being sent.
The server checks for due reminders every 5 minutes while it's running.

### Calendar sync

Google and Outlook fetch the feed from their servers, so they need HackMate at a public URL. Set
`NEXT_PUBLIC_BASE_URL` once it's deployed. Locally, Apple Calendar subscriptions and the `.ics` download both work.

## How the feeds are read

| Source | How |
| --- | --- |
| Unstop | public search API (`/api/public/opportunity/search-result`) |
| Devfolio | public search API (`api.devfolio.co/api/search/hackathons`) |
| MLH | event JSON embedded in the season events page |
| WeMakeDevs | hackathon cards embedded in the `/hackathons` page |
| Devpost | public hackathon listing JSON, with pagination and explicit date-range parsing |
| lablab.ai | hackathon records embedded in the public listing's React Server Component data |
| HackerEarth | public Compete API, limited to hackathons that have not ended |
| Hack2skill | public event listing API, with pagination |
| Devsemble | public `get-all-hackathons` API, limited to published events |

Discover groups duplicate event listings across platforms and keeps the alternate platform links.
Matching uses event URLs, normalized names, dates, and locations. City editions and different years
stay separate. Pinned identities take precedence, and adding the same event through another platform
does not create a second tracker entry. Grouping does not delete source rows, notes, or deadlines.
A new source automatically triggers an initial refresh on an existing installation.

None of these are official, documented APIs, so a site redesign can break a source. A failing source is
reported on the Discover page, and the others keep working. Adapters live in `src/lib/sources/`.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Postgres / PGlite · Leaflet + OpenStreetMap · Nodemailer · Groq + Gemini

## Regression checks

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

The regression suite uses Node's test runner and the existing TypeScript dependency.
It creates an isolated in-memory Postgres database and disables AI credentials and SMTP for the test process.
Your saved database, uploads, and environment files are not used.
The tests cover saving partial updates, request validation, discovery filters, calendar alerts,
submission proof and team limits, and concurrent reminder delivery.
