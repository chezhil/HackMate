/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests load TypeScript through the test bootstrap. */
// Opening a hackathon whose rules haven't been read: the page must hear "reading" from its first request.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const root = require('../tests-setup.cjs');
process.env.HACKMATE_PG_MEMORY = '1'; delete process.env.DATABASE_URL;
for (const k of ['SMTP_HOST', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']) delete process.env[k];
// Outside a real Next request, stand in for the request-only helpers; after() runs its work later, as on Vercel.
const Module = require('module'); const origLoad = Module._load;
Module._load = function (req) {
  const m = origLoad.apply(this, arguments);
  if (req === 'next/server') return { ...m, connection: async () => {}, after: (fn) => { setTimeout(fn, 0); } };
  if (req === 'next/headers') return { ...m, cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) };
  return m;
};
const repo = require(root + '/src/lib/repo.ts');
const { closeDb } = require(root + '/src/lib/db.ts');
after(() => closeDb());

test('opening a hackathon for the first time says its rules are being read, from the first answer', async () => {
  const fresh = { id: 'unstop:fresh-read', source: 'unstop', title: 'Fresh read', tagline: null, url: 'https://example.com', image: null, mode: 'online', city: null, state: null, country: null, venue: null, lat: null, lng: null, startsAt: '2030-01-01T00:00:00Z', endsAt: '2030-01-02T00:00:00Z', regStartsAt: null, regEndsAt: null, prizeText: null, prizeUsd: null, entryFee: 'free', themes: [], organizer: null, teamMin: 2, teamMax: 4 };
  await repo.upsertHackathons([fresh], new Date().toISOString());
  const fetch = global.fetch;
  // Hold the page fetch open so the read is still going when we poll.
  let release; global.fetch = () => new Promise((r) => { release = () => r(new Response('<p>rules</p>', { status: 200 })); });
  const ctx = { params: Promise.resolve({ id: fresh.id }) };
  const req = () => new Request('http://localhost/api/h/x/details');
  try {
    const { GET } = require(root + '/src/app/api/h/[id]/details/route.ts');
    const first = await (await GET(req(), ctx)).json();
    assert.equal(first.details, null);
    assert.equal(first.building, true, 'the first answer must say the rules are being read');
    await new Promise((r) => setTimeout(r, 20)); // the read has now started, after the response
    const again = await (await GET(req(), ctx)).json();
    assert.equal(again.building, true, 'polling while it reads still says so');
    release();
    for (let i = 0; i < 50 && (await (await GET(req(), ctx)).json()).building; i++) await new Promise((r) => setTimeout(r, 20));
    const done = await (await GET(req(), ctx)).json();
    assert.equal(done.building, false, 'and stops saying so once it has finished');
    assert.ok(done.details, 'with the details saved');
  } finally {
    release?.();
    global.fetch = fetch;
  }
});

test('the AI-tools badge is stored, and follows the full rules once they are read', async () => {
  const event = { id: 'devpost:policy-badge', source: 'devpost', title: 'Policy badge', tagline: null, url: 'https://example.com/policy', image: null, mode: 'online', city: null, state: null, country: null, venue: null, lat: null, lng: null, startsAt: '2030-02-01T00:00:00Z', endsAt: '2030-02-02T00:00:00Z', regStartsAt: null, regEndsAt: null, prizeText: null, prizeUsd: null, entryFee: 'free', themes: [], organizer: null, teamMin: 1, teamMax: 4, description: 'Build something great in 48 hours.' };
  await repo.upsertHackathons([event], new Date().toISOString());
  const badge = async () => (await repo.listHackathons()).find((h) => h.id === event.id).aiPolicy;
  assert.equal(await badge(), null, 'the description states no policy');

  const fetch = global.fetch;
  global.fetch = async () => new Response('<p>Use of AI tools is strictly prohibited and leads to disqualification.</p>', { status: 200 });
  try {
    await require(root + '/src/lib/details.ts').buildDetails(event.id);
  } finally {
    global.fetch = fetch;
  }
  assert.equal((await badge()).kind, 'banned', 'the rules decide once read');
  // A later feed refresh, with the old description, doesn't undo what the rules said.
  await repo.upsertHackathons([event], new Date().toISOString());
  assert.equal((await badge()).kind, 'banned');
});
