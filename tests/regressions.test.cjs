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
const submission = require('../src/lib/submission.ts');
const settings = require('../src/lib/settings.ts');
const { matches, parseFilters, DEFAULTS } = require('../src/app/discoverFilters.ts');
const { deadlineEvent, hackathonEvent } = require('../src/lib/ics.ts');
const event = { id:'unstop:regression', source:'unstop', title:'Regression hackathon', tagline:null, url:'https://example.com', image:null, mode:'online', city:null, state:null, country:null, venue:null, lat:null, lng:null, startsAt:'2030-01-01T00:00:00Z', endsAt:'2030-01-02T00:00:00Z', regStartsAt:'2029-12-01T00:00:00Z', regEndsAt:'2029-12-31T00:00:00Z', prizeText:null, prizeUsd:null, entryFee:'free', themes:[], organizer:null, teamMin:2, teamMax:4 };
before(async () => { await repo.upsertHackathons([event], new Date().toISOString()); await repo.trackHackathon(event.id); });
after(async () => { await closeDb(); process.chdir(original); rmSync(temp, { recursive:true, force:true }); });
const ctx = (key, value) => ({params: Promise.resolve({[key]:String(value)})});
const request = (body, method='PATCH') => new Request('http://localhost/api/test', {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
test('checklist checkbox changes preserve label and required flag', async () => {
  const item = (await submission.listChecklist(event.id)).find(i=>i.required);
  const {PATCH} = require('../src/app/api/checklist/[itemId]/route.ts');
  const res = await PATCH(request({done:true}),ctx('itemId',item.id));
  assert.equal(res.status,200);
  const updated=(await res.json()).items.find(i=>i.id===item.id);
  assert.equal(updated.done,true); assert.equal(updated.required,true); assert.equal(updated.label,item.label);
});
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
test('registration filter excludes events before registration opens', async () => assert.equal(matches(event,{...DEFAULTS,when:'reg'},new Date('2029-11-01').getTime()),false));
test('upcoming filter excludes finished events', async () => assert.equal(matches(event,{...DEFAULTS,when:'7'},new Date('2030-01-05').getTime()),false));
test('upcoming filter excludes events with no dates', async () => assert.equal(matches({...event,startsAt:null,endsAt:null},{...DEFAULTS,when:'7'},new Date('2030-01-01').getTime()),false));
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
test('clearing an attachment clears stale duration and preserves requirements', async () => {
  await submission.addChecklistItem(event.id,'Video','file',true);
  const item=(await submission.listChecklist(event.id)).find(i=>i.label==='Video');
  await submission.updateChecklistItem(item.id,{file:'test.mp4',mime:'video/mp4',meta:{accept:'video',limitSec:120,durationSec:180}});
  await submission.updateChecklistItem(item.id,{file:null,mime:null,done:false});
  const updated=(await submission.listChecklist(event.id)).find(i=>i.id===item.id);
  assert.equal(updated.meta.durationSec,undefined); assert.equal(updated.meta.limitSec,120);
});

for (const [name, route, method, body, params] of [
  ['settings rejects non-array leads','settings','PUT',{leadMinutes:'60'},{}],
  ['settings rejects negative leads','settings','PUT',{leadMinutes:[-60]},{}],
  ['settings rejects invalid provider','settings','PUT',{calendarProvider:'invalid'},{}],
  ['settings rejects invalid email','settings','PUT',{email:123},{}],
  ['tracker rejects prototype results','tracker/[id]','PATCH',{result:'toString'},{id:event.id}],
  ['tracker rejects null status','tracker/[id]','PATCH',{status:null},{id:event.id}],
  ['tracker rejects script URLs','tracker/[id]','PATCH',{submissionUrl:'javascript:alert(1)'},{id:event.id}],
  ['deadline rejects prototype kinds','deadlines','POST',{hackathonId:event.id,kind:'constructor',dueAt:event.endsAt},{}],
  ['deadline rejects non-boolean completion','deadlines/[id]','PATCH',{done:'false'},{id:1}],
  ['project rejects non-string names','h/[id]/project','PUT',{name:123},{id:event.id}],
  ['project rejects script URLs','h/[id]/project','PUT',{demoUrl:'javascript:alert(1)'},{id:event.id}],
  ['retro rejects invalid rating','h/[id]/wrapup','PUT',{rating:6},{id:event.id}],
  ['retro rejects non-string notes','h/[id]/wrapup','PUT',{wentWell:{}},{id:event.id}],
  ['team rejects non-string names','h/[id]/team','POST',{name:{}},{id:event.id}],
  ['profile rejects object values','profile','PUT',{headline:{}},{}],
  ['prizes reject negative amounts','prizes','POST',{hackathonId:event.id,amount:-1},{}],
  ['prizes reject nonnumeric amounts','prizes','POST',{hackathonId:event.id,amount:'many'},{}],
  ['prizes reject invalid status','prizes','POST',{hackathonId:event.id,status:'broken'},{}],
  ['ideas reject object text','h/[id]/ideas','POST',{action:'create',text:{}},{id:event.id}],
  ['pitch rejects object scripts','h/[id]/pitch','POST',{kind:'roast',script:{}},{id:event.id}],
  ['chat rejects object questions','h/[id]/chat','POST',{question:{}},{id:event.id}],
  ['qa rejects object answers','h/[id]/qa','POST',{action:'answer',turnId:1,answer:{}},{id:event.id}],
  ['standups reject non-string notes','h/[id]/standups','POST',{note:{}},{id:event.id}],
  ['checklist rejects non-boolean required','h/[id]/checklist','POST',{label:'Bad',required:'no'},{id:event.id}],
]) test(name, async()=>{
  const handler=require(`../src/app/api/${route}/route.ts`)[method];
  const response=await handler(request(body,method),{params:Promise.resolve(params)});
  assert.equal(response.status,400); assert.equal(typeof (await response.json()).error,'string');
});
for(const body of [null,[],5,'plain text']) test(`settings rejects non-object JSON: ${JSON.stringify(body)}`,async()=>{
  const {PUT}=require('../src/app/api/settings/route.ts');assert.equal((await PUT(request(body,'PUT'))).status,400);
});
test('malformed JSON returns a readable 400',async()=>{
  const {PUT}=require('../src/app/api/settings/route.ts');
  const response=await PUT(new Request('http://localhost/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{broken'}));
  assert.equal(response.status,400);assert.match((await response.json()).error,/JSON/);
});
test('unknown hackathons cannot create checklist or project records',async()=>{
  for(const [route,method,body] of [['checklist','POST',{label:'test'}],['project','PUT',{name:'test'}]]){
    const response=await require(`../src/app/api/h/[id]/${route}/route.ts`)[method](request(body,method),ctx('id','unstop:missing'));
    assert.equal(response.status,404);
  }
});
test('new project can be saved and trimmed with partial updates preserved',async()=>{
  const {PUT}=require('../src/app/api/h/[id]/project/route.ts');
  await PUT(request({name:'  Test Project  ',demoUrl:'https://example.com'},'PUT'),ctx('id',event.id));
  const response=await PUT(request({solution:'  Useful app  '},'PUT'),ctx('id',event.id));
  const p=(await response.json()).project;
  assert.equal(p.name,'Test Project'); assert.equal(p.solution,'Useful app');assert.equal(p.demoUrl,'https://example.com');
});
test('checklist links can be saved without losing the label or required flag',async()=>{
  await submission.addChecklistItem(event.id,'Submission URL','link',true);
  const item=(await submission.listChecklist(event.id)).find(i=>i.label==='Submission URL');
  const {PATCH}=require('../src/app/api/checklist/[itemId]/route.ts');
  const response=await PATCH(request({value:'  https://example.com/demo  '}),ctx('itemId',item.id));
  const saved=(await response.json()).items.find(i=>i.id===item.id);
  assert.equal(saved.value,'https://example.com/demo');assert.equal(saved.label,item.label);assert.equal(saved.done,true);assert.equal(saved.required,true);
});
test('checking an empty link never substitutes for required proof',async () =>{
  const {checklistComplete}=require('../src/lib/checklist.ts');
  assert.equal(checklistComplete({kind:'link',done:true,value:null,file:null}),false);
  assert.equal(checklistComplete({kind:'file',done:true,value:'https://example.com',file:null}),false);
  assert.equal(checklistComplete({kind:'check',done:true}),true);
});
test('replacing a video clears old duration while keeping its time limit',async () =>{
  const item=(await submission.listChecklist(event.id)).find(i=>i.label==='Video');
  await submission.updateChecklistItem(item.id,{file:'old.mp4',mime:'video/mp4',meta:{durationSec:180,limitSec:120,accept:'video'}});
  await submission.updateChecklistItem(item.id,{file:'new.mp4',mime:'video/mp4'});
  const updated=(await submission.listChecklist(event.id)).find(i=>i.id===item.id);
  assert.equal(updated.meta.durationSec,undefined);assert.equal(updated.meta.limitSec,120);
});
test('submission checks enforce minimum team size and reject invalid links',async()=>{
  await submission.addChecklistItem(event.id,'Invalid demo link','link',true);
  const item=(await submission.listChecklist(event.id)).find(i=>i.label==='Invalid demo link');
  await submission.updateChecklistItem(item.id,{value:'not-a-url'});
  const fetch=global.fetch;
  global.fetch=async()=>new Response('ok',{status:200});
  let result;
  try { result=await submission.verifySubmission(event.id); } finally { global.fetch=fetch; }
  assert.ok(result.checks.some(c=>c.label==='Team size'&&c.status==='fail'&&c.detail.includes('at least 2')));
  assert.ok(result.checks.some(c=>c.itemId===item.id&&c.status==='fail'&&c.detail.includes('valid http')));
});
test('simultaneous reminder checks share a single delivery',async()=>{
  await settings.saveSettings({email:'tester@example.com',remindersEnabled:true,leadMinutes:[1440]});
  const reminders=require('../src/lib/reminders.ts');
  const before=Number((await get('SELECT count(*) AS n FROM email_log')).n);
  await Promise.all([reminders.runReminders(new Date('2029-12-30T12:00:00Z')),reminders.runReminders(new Date('2029-12-30T12:00:00Z'))]);
  const after=Number((await get('SELECT count(*) AS n FROM email_log')).n);
  assert.equal(after-before,1);
});
test('an unsupported upload returns 400 without saving a file',async()=>{
  const item=(await submission.listChecklist(event.id)).find(i=>i.label==='Video');
  const form=new FormData();form.append('file',new Blob(['bad'],{type:'text/html'}),'bad.html');
  const {POST}=require('../src/app/api/checklist/[itemId]/route.ts');
  const response=await POST(new Request('http://localhost/api/test',{method:'POST',body:form}),ctx('itemId',item.id));
  assert.equal(response.status,400);
});
test('uploading the wrong proof type is rejected',async()=>{
  const item=(await submission.listChecklist(event.id)).find(i=>i.label==='Video');
  const form=new FormData();form.append('file',new Blob(['pdf'],{type:'application/pdf'}),'test.pdf');
  const {POST}=require('../src/app/api/checklist/[itemId]/route.ts');
  const response=await POST(new Request('http://localhost/api/test',{method:'POST',body:form}),ctx('itemId',item.id));assert.equal(response.status,400);
});
test('empty settings patches preserve all saved preferences',async()=>{
  const before=await settings.getSettings();const {PUT}=require('../src/app/api/settings/route.ts');
  const response=await PUT(request({},'PUT'));assert.deepEqual((await response.json()).settings,before);
});
test('HTTP helper preserves a non-JSON error status',async()=>{
  const fetch=global.fetch;global.fetch=async()=>new Response('Bad Gateway',{status:502});
  try{await assert.rejects(()=>require('../src/lib/client.ts').call('/api/test'),/502/);}finally{global.fetch=fetch;}
});

for (const [route,method,body] of [['ideas/[ideaId]','POST',{text:{}}],['ideas/[ideaId]','PATCH',{title:{}}],['h/[id]/team/post','POST',{aboutMe:{}}]]) test(`${route} ${method} rejects invalid text`,async()=>{
  const response=await require(`../src/app/api/${route}/route.ts`)[method](request(body,method),{params:Promise.resolve({id:event.id,ideaId:'1'})});
  assert.equal(response.status,400);
});
test('a GitHub profile cannot pass as a repository submission',async()=>{
  await submission.addChecklistItem(event.id,'GitHub profile used as repo','link',true);
  const item=(await submission.listChecklist(event.id)).find(i=>i.label==='GitHub profile used as repo');
  await submission.updateChecklistItem(item.id,{value:'https://github.com/username'});
  const fetch=global.fetch;global.fetch=async()=>new Response('ok',{status:200});
  let result;try{result=await submission.verifySubmission(event.id)}finally{global.fetch=fetch;}
  assert.ok(result.checks.some(c=>c.itemId===item.id&&c.status==='fail'&&c.detail.includes('repository link')));
});
test('a lookalike GitHub hostname is checked as its own website',async()=>{
  await submission.addChecklistItem(event.id,'Lookalike GitHub','link',true);
  const item=(await submission.listChecklist(event.id)).find(i=>i.label==='Lookalike GitHub');
  const target='https://github.com.example.com/owner/repo';await submission.updateChecklistItem(item.id,{value:target});
  const fetch=global.fetch;const visited=[];global.fetch=async url=>{visited.push(url);return new Response('ok',{status:200})};
  try{await submission.verifySubmission(event.id)}finally{global.fetch=fetch;}
  assert.ok(visited.includes(target));assert.ok(!visited.some(url=>url.startsWith('https://api.github.com')));
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
