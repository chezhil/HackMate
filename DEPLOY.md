# Deploying HackMate

HackMate is one Node server that keeps its data in SQLite files and runs background jobs (reminder emails every
5 minutes, feed refresh every 30). So it needs:

- **one always-on machine** (not serverless: Vercel and Netlify lose the files and can't run the jobs), and
- **a persistent volume mounted at `/app/data`**: the shared database, one file per account, and uploads.

Run exactly **one** instance. SQLite lives on one volume, so two machines would each have their own data.

The Docker image turns on **public mode** (`HACKMATE_REQUIRE_LOGIN=1`): visitors can browse hackathons and
people, but need an account for anything personal. Each account has its own tracker, ideas and results, and a
limited number of AI calls per hour and per day.

## Environment variables

| Variable | Needed | What it's for |
| --- | --- | --- |
| `GROQ_API_KEY` | yes | Chat, ideas, critiques, pitch, Q&A |
| `GEMINI_API_KEY` | yes | Reading hackathon pages, voice notes, screenshot checks |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | for email | Reminder emails. Without them, reminders only go to the outbox on Settings |
| `TZ` | recommended | Time zone for dates in emails, e.g. `Asia/Kolkata` |
| `AI_LIMIT_PER_HOUR` / `AI_LIMIT_PER_DAY` | optional | AI calls per account (default 60 / 300). Cached answers don't count |
| `AI_LIMIT_ANON_PER_HOUR` | optional | AI calls per address for signed-out visitors (default 10) |
| `HACKMATE_REQUIRE_LOGIN` | already on | Set to `0` only for a private instance that just you use |

Keep the keys in the host's secrets, never in the repo (`.env*` is git-ignored).

## Fly.io

```bash
fly launch --copy-config --no-deploy        # pick a unique app name; fly.toml is already set up
fly volumes create hackmate_data --size 1 --region bom
fly secrets set GROQ_API_KEY=... GEMINI_API_KEY=... TZ=Asia/Kolkata
fly deploy
```

`fly.toml` keeps one machine running (so reminders keep firing), forces HTTPS and checks `/api/health`.
Change `primary_region` to the one nearest you, and create the volume in that same region.

## Railway

1. New project → Deploy from GitHub repo → pick this repo. `railway.json` tells it to build the Dockerfile.
2. On the service: **Settings → Volumes → Add volume**, mount path `/app/data`.
3. **Variables**: add `GROQ_API_KEY`, `GEMINI_API_KEY`, `TZ` (and the SMTP ones for email).
4. **Settings → Networking → Generate domain**. Keep replicas at 1.

## After the first deploy

- Open the site and **create your account**. The first account gets a copy of anything in the
  signed-out data (a fresh deploy has none).
- Calendar subscriptions (Settings → Calendar) use the site's own address, so they work once it's deployed.
- **Back up `/app/data`** now and then: `fly ssh sftp get /app/data/hackmate.db`, or Railway's volume backups.
  The per-account files are in `/app/data/users/`.

## Try the image locally

```bash
docker build -t hackmate .
docker run --rm -p 3100:3000 -v hackmate-data:/app/data --env-file .env.local hackmate
```

Then open http://localhost:3100. Note that `--env-file .env.local` also passes your local settings.
