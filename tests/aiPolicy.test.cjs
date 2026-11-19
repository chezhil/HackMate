/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests load TypeScript through the test bootstrap. */
// The AI-tools badge on Discover: read from each hackathon's description and stored with it.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const root = require('../tests-setup.cjs');
process.env.HACKMATE_PG_MEMORY = '1'; delete process.env.DATABASE_URL;
for (const k of ['SMTP_HOST', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']) delete process.env[k];
const Module = require('module'); const origLoad = Module._load;
Module._load = function (req) {
  return req === 'server-only' ? {} : origLoad.apply(this, arguments);
};
const repo = require(root + '/src/lib/repo.ts');
const { closeDb } = require(root + '/src/lib/db.ts');
after(() => closeDb());

const event = (description) => ({ id: 'devpost:policy-badge', source: 'devpost', title: 'Policy badge', tagline: null, url: 'https://example.com/policy', image: null, mode: 'online', city: null, state: null, country: null, venue: null, lat: null, lng: null, startsAt: '2030-02-01T00:00:00Z', endsAt: '2030-02-02T00:00:00Z', regStartsAt: null, regEndsAt: null, prizeText: null, prizeUsd: null, entryFee: 'free', themes: [], organizer: null, teamMin: 1, teamMax: 4, description });
const badge = async () => (await repo.listHackathons()).find((h) => h.id === 'devpost:policy-badge').aiPolicy;

test('the AI-tools badge comes from the description and follows it when the feed changes', async () => {
  await repo.upsertHackathons([event('Build something great in 48 hours.')], new Date().toISOString());
  assert.equal(await badge(), null, 'no policy stated');
  await repo.upsertHackathons([event('Using AI tools is allowed for this event.')], new Date().toISOString());
  assert.equal((await badge()).kind, 'allowed');
  await repo.upsertHackathons([event('Use of AI tools is strictly prohibited and leads to disqualification.')], new Date().toISOString());
  assert.equal((await badge()).kind, 'banned');
});
