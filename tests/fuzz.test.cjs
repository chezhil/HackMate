/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests load TypeScript through the test bootstrap. */
// Every API route, every method, with broken and hostile input: nothing may crash or answer 500.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const root = require('../tests-setup.cjs');
process.chdir(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'hackmate-fuzz-')));
process.env.HACKMATE_PG_MEMORY = '1'; delete process.env.DATABASE_URL;
for (const k of ['SMTP_HOST','GROQ_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY']) delete process.env[k];
const fs = require('fs'), path = require('path');
const realFetch = global.fetch;
// No outside network: every external call gets an empty 404, so routes must cope.
global.fetch = async (u) => (String(u).startsWith('http://localhost') ? realFetch(u) : new Response('{}', { status: 404 }));
// Outside a real Next request, stand in for the request-only helpers.
const Module = require('module'); const origLoad = Module._load;
Module._load = function (req) {
  const m = origLoad.apply(this, arguments);
  if (req === 'next/server') return { ...m, connection: async () => {}, after: (fn) => { void Promise.resolve().then(fn); } };
  if (req === 'next/headers') return { ...m, cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) };
  return m;
};
const repo = require(root + '/src/lib/repo.ts');
const event = { id:'unstop:fuzz', source:'unstop', title:'Fuzz', tagline:null, url:'https://example.com', image:null, mode:'online', city:null, state:null, country:null, venue:null, lat:null, lng:null, startsAt:'2030-01-01T00:00:00Z', endsAt:'2030-01-02T00:00:00Z', regStartsAt:null, regEndsAt:null, prizeText:null, prizeUsd:null, entryFee:'free', themes:[], organizer:null, teamMin:2, teamMax:4 };
const routes = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f === 'route.ts') routes.push(p); } })(root + '/src/app/api');
const bodies = [undefined, '{broken', 'null', '[]', '"text"', '{}',
  JSON.stringify({ action: 'nope' }), JSON.stringify({ action: 'create', draft: {} }), JSON.stringify({ action: 'preview', url: 'javascript:alert(1)' }),
  JSON.stringify({ hackathonId: 123, title: {}, amount: 'x', status: [], dueAt: 'never', kind: '__proto__', label: 'x'.repeat(100000) }),
  JSON.stringify({ question: 'x'.repeat(50000) }), JSON.stringify({ key: 5, resolved: 'yes' }), JSON.stringify({ email: 'a@b', password: 1, username: '../..' })];
const ids = ['unstop:fuzz', 'nope:missing', '999999', 'abc', '-1', '1e309', "'; DROP TABLE users; --", '%E0%A4%A'];
test('no API route crashes or answers 500 on bad input', async () => {
  await repo.upsertHackathons([event], new Date().toISOString()); await repo.trackHackathon(event.id);
  let calls = 0; const bad = [];
  for (const file of routes) {
    const mod = require(file);
    const params = [...file.matchAll(/\[(\w+)\]/g)].map((m) => m[1]);
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      if (typeof mod[method] !== 'function') continue;
      for (const id of params.length ? ids : ['-']) {
        for (const body of method === 'GET' || method === 'DELETE' ? [undefined] : bodies) {
          const ctx = { params: Promise.resolve(Object.fromEntries(params.map((p) => [p, id]))) };
          const req = new Request('http://localhost/api/x?token=bad&refresh=1', { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body });
          calls++;
          try {
            const res = await mod[method](req, ctx);
            if (!(res instanceof Response)) bad.push(`${method} ${file} id=${id}: returned ${typeof res}`);
            else if (res.status >= 500 && !(res.status === 503 && /AI|provider|rate/i.test(await res.clone().text())) && !(res.status === 502 && /winners|fetch|HTTP/i.test(await res.clone().text()))) bad.push(`${method} ${file} id=${id} body=${String(body).slice(0, 40)}: ${res.status} ${(await res.text()).slice(0, 140)}`);
          } catch (e) {
            bad.push(`${method} ${file} id=${id} body=${String(body).slice(0, 40)}: THREW ${e.message.slice(0, 140)}`);
          }
        }
      }
    }
  }
  await require(root + '/src/lib/db.ts').closeDb();
  assert.ok(calls > 1000, `only ${calls} calls`);
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} of ${calls} calls failed`);
});
