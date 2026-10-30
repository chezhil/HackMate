# HackMate — submission text

Drafts for the **No Hands: The Wispr Challenge** form (Builders track). Replace the `[…]` bits before you
submit.

## Short description (a few lines)

> **Problem:** I enter a lot of hackathons, and keeping track of them is the hard part. Events are spread across
> Unstop, Devfolio, Devpost, Hack2skill and six more sites. Deadlines clash, the rules hide gotchas like "max 2-minute
> video" or "solo only", and every event needs a pitch, a checklist and a wrap-up.
>
> **Who it's for:** students and builders who do hackathons regularly.
>
> **What it does:** HackMate pulls hackathons from 10 sites into one Discover page with filters and a map. It
> reads each event's rules with AI, so you can ask questions with cited answers. It tracks your entries on a
> board with deadlines, clash warnings and email and calendar reminders. It helps with ideas, the pitch and mock
> judge Q&A, checks your submission against the rules, and keeps your results, prizes and certificates on a
> public profile.
>
> **How I used Wispr:** I built HackMate entirely by voice. Every spec, feature request, bug report and design
> note went to an AI coding agent through Wispr Flow, as did these docs. I didn't type a single prompt.
> [My Wispr usage card: N words dictated, see the screenshot.]

## Longer version (if there's room)

**What it is.** HackMate is one place for everything around a hackathon, before, during and after:

- **Discover:** around 470 upcoming hackathons from Unstop, Devfolio, MLH, WeMakeDevs, Devpost, lablab.ai,
  HackerEarth, Hack2skill, Devsemble and Devnovate. The same event listed on several sites shows up once. You can
  filter by format, city, prize, dates, length and theme, see at a glance whether AI is allowed, and use the map
  or a near-me view. Any event that isn't listed can be added from its link or typed in by hand.
- **Understand it:** the AI reads the rules once and pulls out deliverables, judging, team size, prizes and
  dates. A rule scanner flags gotchas with the exact quote. Ask AI answers questions only from the rules, and
  every answer cites the passage it came from.
- **Plan it:** a drag-and-drop tracker from Pinned to Expecting results. Deadlines come from each hackathon's own
  dates. Clashes are ranked by how much they matter (two in-person events on the same day is critical) and can
  be marked resolved. Email reminders, calendar subscriptions and standups (voice or text) are built in.
- **Build and pitch it:** idea suggestions based on the tracks and past winners, idea critiques with version
  history, a pitch script timed to the judging criteria, a demo-video storyboard, a deck roaster and mock judge
  Q&A that grades your answers.
- **Submit it:** a checklist built from that hackathon's own rules, which checks that links work, that the repo
  is public, the video's length and the screenshots.
- **After it:** results, prizes (claimed and paid), a certificate vault, retro notes, and a public profile that
  shows everything you've done.
- **With other people:** accounts, a People directory with skills and "looking for a team", and each person's
  public profile.

**How it's built.** Next.js 16 and React 19 on Vercel, with Postgres on Supabase. Row-level security keeps each
account's data private, and the database enforces it, not just the app. Groq handles the frequent AI calls and
Gemini the long reads. A shared AI cache means the same question is only paid for once, and each account has an AI
allowance. It has 151 automated tests, including a fuzz test that sends broken and hostile input to every API
route.

**How I used Wispr Flow.** I'm the only builder, and every instruction went through Wispr:
- **Specs:** "make it so I can drag the hackathons in the tracker like tiles", "rank clashes by importance".
- **Bug reports:** "Mergetober is still in my tracking when I unpinned it", "the Hack2skill import shows just
  'Hack2skill'".
- **Design feedback:** "why are the next months on the calendar a lower shade?", "make dark mode easier on the
  eyes".
- **Decisions:** "migrate to Vercel and Supabase on a branch, then deploy it".

Speaking instead of typing made it easy to describe what I wanted the way I'd tell a teammate: what's wrong, why
it matters, and what good looks like. [Add one line from your own experience, e.g. how many hours or prompts.]

## Links and login for judges

- Live app: https://hackmate-pied.vercel.app
- Test login: email `[judge email]`, password `[password]` (an account with some demo data pinned)
- Demo video (≤ 2 min): [link]
- Wispr usage card: [screenshot]
- Code: [https://github.com/chezhil/HackMate, if you make it public]
