/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests load TypeScript through the test bootstrap. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
require('../tests-setup.cjs');
process.env.HACKMATE_PG_MEMORY = '1';
delete process.env.DATABASE_URL;
// Never call AI providers or deliver mail while testing user input and persistence.
for (const key of ['SMTP_HOST','SMTP_USER','SMTP_PASS','GROQ_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY']) delete process.env[key];
const original = process.cwd();
const temp = mkdtempSync(path.join(os.tmpdir(), 'hackmate-test-'));
process.chdir(temp);
const { closeDb, get } = require('../src/lib/db.ts');
const repo = require('../src/lib/repo.ts');
const settings = require('../src/lib/settings.ts');
const { matches, parseFilters, DEFAULTS } = require('../src/app/discoverFilters.ts');
const { deadlineEvent, hackathonEvent } = require('../src/lib/ics.ts');
const event = { id:'unstop:regression', source:'unstop', title:'Regression hackathon', tagline:null, url:'https://example.com', image:null, mode:'online', city:null, state:null, country:null, venue:null, lat:null, lng:null, startsAt:'2030-01-01T00:00:00Z', endsAt:'2030-01-02T00:00:00Z', regStartsAt:'2029-12-01T00:00:00Z', regEndsAt:'2029-12-31T00:00:00Z', prizeText:null, prizeUsd:null, entryFee:'free', themes:[], organizer:null, teamMin:2, teamMax:4 };
before(async () => { await repo.upsertHackathons([event], new Date().toISOString()); await repo.trackHackathon(event.id); });
after(async () => { await closeDb(); process.chdir(original); rmSync(temp, { recursive:true, force:true }); });
const ctx = (key, value) => ({params: Promise.resolve({[key]:String(value)})});
const request = (body, method='PATCH') => new Request('http://localhost/api/test', {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
test('changing calendar provider preserves email and reminder preferences', async () => {
  await settings.saveSettings({ email:'tester@example.com', remindersEnabled:false, leadMinutes:[60] });
  const { PUT } = require('../src/app/api/settings/route.ts');
  const res=await PUT(request({calendarProvider:'apple'},'PUT'));
  assert.equal(res.status,200);
  const prefs=(await res.json()).settings;
  assert.equal(prefs.email,'tester@example.com'); assert.equal(prefs.remindersEnabled,false); assert.deepEqual(prefs.leadMinutes,[60]);
});
test('invalid deadline date returns 400 without throwing', async () => {
  const deadline=(await repo.listTracked())[0].deadlines[0];
  const {PATCH}=require('../src/app/api/deadlines/[id]/route.ts');
  const res=await PATCH(request({dueAt:'not-a-date'}),ctx('id',deadline.id));
  assert.equal(res.status,400);
});
test('null deadline dates are rejected instead of saved as epoch', async () => {
  const {POST}=require('../src/app/api/deadlines/route.ts');
  const res=await POST(request({hackathonId:event.id,kind:'submission',dueAt:null},'POST'));
  assert.equal(res.status,400);
});
test('free filter excludes events with unknown fees', async () => assert.equal(matches({...event,entryFee:null},{...DEFAULTS,freeOnly:true},0),false));
test('URL source filters ignore prototype property names', async () => assert.deepEqual(parseFilters(new URLSearchParams('src=toString,constructor,unstop')).sources,['unstop']));
test('calendar alerts fire relative to the deadline', async () => {
  const d={id:1,hackathonId:event.id,kind:'submission',label:'Submit',dueAt:event.endsAt,auto:false,done:false};
  assert.ok(deadlineEvent(d,event,[60]).includes('TRIGGER;RELATED=END:-PT60M'));
});
test('calendar event with only a start date has positive duration', async () => {
  const lines=hackathonEvent({...event,endsAt:null});
  const start=lines.find(l=>l.startsWith('DTSTART:')).slice(8); const end=lines.find(l=>l.startsWith('DTEND:')).slice(6);
  assert.ok(end>start);
});
test('malformed JSON returns a readable 400',async()=>{
  const {PUT}=require('../src/app/api/settings/route.ts');
  const response=await PUT(new Request('http://localhost/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{broken'}));
  assert.equal(response.status,400);assert.match((await response.json()).error,/JSON/);
});
test('simultaneous reminder checks share a single delivery',async()=>{
  await settings.saveSettings({email:'tester@example.com',remindersEnabled:true,leadMinutes:[1440]});
  const reminders=require('../src/lib/reminders.ts');
  const before=Number((await get('SELECT count(*) AS n FROM email_log')).n);
  await Promise.all([reminders.runReminders(new Date('2029-12-30T12:00:00Z')),reminders.runReminders(new Date('2029-12-30T12:00:00Z'))]);
  const after=Number((await get('SELECT count(*) AS n FROM email_log')).n);
  assert.equal(after-before,1);
});
test('empty settings patches preserve all saved preferences',async()=>{
  const before=await settings.getSettings();const {PUT}=require('../src/app/api/settings/route.ts');
  const response=await PUT(request({},'PUT'));assert.deepEqual((await response.json()).settings,before);
});
test('HTTP helper preserves a non-JSON error status',async()=>{
  const fetch=global.fetch;global.fetch=async()=>new Response('Bad Gateway',{status:502});
  try{await assert.rejects(()=>require('../src/lib/client.ts').call('/api/test'),/502/);}finally{global.fetch=fetch;}
});

test('accounts never see or change each other\'s data, even by id', async () => {
  const { runAs } = require('../src/lib/db.ts');
  const wrapup = require('../src/lib/wrapup.ts');
  // Account 101 pins the event and records a prize and a deadline.
  const prizeId = await runAs(101, async () => {
    await repo.trackHackathon(event.id);
    await wrapup.addPrize(event.id, { title: 'First place', amount: 500, currency: 'USD', kind: 'cash', status: 'won', expectedBy: null, paidAt: null, notes: null });
    return (await wrapup.listPrizes())[0].id;
  });
  const deadlineId = await runAs(101, async () => (await repo.listTracked())[0].deadlines[0].id);
  // Account 102 sees none of it, and can't reach it by id.
  await runAs(102, async () => {
    assert.equal((await repo.listTracked()).length, 0);
    assert.equal((await wrapup.listPrizes()).length, 0);
    await wrapup.deletePrize(prizeId);
    await assert.rejects(() => repo.updateDeadline(deadlineId, { label: 'hijacked' }), /not found/);
    await repo.deleteDeadline(deadlineId);
  });
  // Account 101's data is untouched.
  await runAs(101, async () => {
    assert.equal((await wrapup.listPrizes()).length, 1);
    const d = (await repo.listTracked())[0].deadlines.find((x) => x.id === deadlineId);
    assert.ok(d); assert.notEqual(d.label, 'hijacked');
  });
  // Signed out (account 0) still has only its own tracker entry.
  assert.equal((await repo.listTracked()).length, 1);
});

test('a hackathon can be added by hand with no link, and a bad website is refused', async () => {
  const { POST } = require('../src/app/api/import/route.ts');
  const draft = { url: '', title: 'Campus Build Night', tagline: null, organizer: 'CS Club', mode: 'offline', city: 'Pune', country: 'India', startsAt: '2030-02-01T12:00:00.000Z', endsAt: '2030-02-02T12:00:00.000Z', regEndsAt: null, prizeText: '₹10,000 in prizes', themes: [], teamMin: 2, teamMax: 4, image: null, description: 'Build anything in 24 hours. Teams of 2-4.' };
  const res = await POST(request({ action: 'create', draft, status: 'interested' }, 'POST'));
  assert.equal(res.status, 200);
  const { id } = await res.json();
  assert.match(id, /^custom:/);
  const h = await repo.getHackathon(id);
  assert.equal(h.url, ''); assert.equal(h.title, 'Campus Build Night'); assert.equal(h.city, 'Pune'); assert.equal(h.prizeUsd > 0, true);
  assert.equal(await repo.getDescription(id), 'Build anything in 24 hours. Teams of 2-4.');
  assert.ok((await repo.listTracked()).some((t) => t.hackathonId === id));
  const bad = await POST(request({ action: 'create', draft: { ...draft, url: 'javascript:alert(1)' }, status: 'interested' }, 'POST'));
  assert.equal(bad.status, 400);
  const nameless = await POST(request({ action: 'create', draft: { ...draft, title: '  ' }, status: 'interested' }, 'POST'));
  assert.equal(nameless.status, 400);
});

test('Discover leaves out finished events and puts what happens next first', () => {
  const { isOver, sortHackathons } = require('../src/app/discoverFilters.ts');
  const now = new Date('2030-06-01T00:00:00Z').getTime();
  const at = (d) => new Date(d).toISOString();
  const mk = (id, startsAt, endsAt, regEndsAt = null) => ({ ...event, id, title: id, startsAt: startsAt && at(startsAt), endsAt: endsAt && at(endsAt), regEndsAt: regEndsAt && at(regEndsAt) });
  const finished = mk('finished', '2030-01-01', '2030-01-03');
  const regClosed = mk('reg-only-closed', null, null, '2030-05-01');
  const running = mk('running-long', '2030-03-01', '2030-12-31');
  const nextWeek = mk('next-week', '2030-06-08', '2030-06-09');
  const regSoon = mk('reg-closes-soon', '2030-07-01', '2030-07-02', '2030-06-03');
  const undated = mk('no-dates', null, null);
  assert.equal(isOver(finished, now), true); assert.equal(isOver(regClosed, now), true);
  assert.equal(isOver(running, now), false); assert.equal(isOver(undated, now), false);
  const order = sortHackathons([undated, running, nextWeek, regSoon], 'soonest', now).map((h) => h.id);
  assert.deepEqual(order, ['reg-closes-soon', 'next-week', 'running-long', 'no-dates']);
  const byReg = sortHackathons([nextWeek, regSoon, undated], 'regClosing', now).map((h) => h.id);
  assert.equal(byReg[0], 'reg-closes-soon');
});
