/* eslint-disable @typescript-eslint/no-require-imports -- Node tests use the TypeScript test bootstrap. */
const {test,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
require('../tests-setup.cjs');
const {sameHackathon,deduplicateHackathons}=require('../src/lib/deduplicate.ts');
const {matches,DEFAULTS}=require('../src/app/discoverFilters.ts');
const fixture={id:'unstop:first',source:'unstop',title:'Future Builders Hackathon 2030',url:'https://unstop.com/hackathons/future-builders',tagline:null,image:null,mode:'online',city:null,state:null,country:null,venue:null,lat:null,lng:null,startsAt:'2030-10-01T00:00:00.000Z',endsAt:'2030-10-03T12:00:00.000Z',regStartsAt:null,regEndsAt:null,prizeText:null,prizeUsd:null,entryFee:null,themes:[],organizer:null,teamMin:null,teamMax:null};
const alias={...fixture,id:'devpost:second',source:'devpost',title:'Future Builders — 2030',url:'https://futurebuilders.devpost.com/',endsAt:'2030-10-03T23:59:59.999Z'};
test('same cross-platform event is displayed once with all platform links',()=>{const rows=deduplicateHackathons([fixture,alias]);assert.equal(rows.length,1);assert.equal(rows[0].sourceListings.length,2);assert.deepEqual(new Set(rows[0].sourceListings.map(s=>s.source)),new Set(['unstop','devpost']))});
test('normalizing tracking URLs removes only tracking parameters',()=>assert.equal(sameHackathon(fixture,{...alias,url:fixture.url+'/?utm_source=x&fbclid=y#top'}),true));
test('different event query IDs stay separate',()=>assert.equal(sameHackathon({...fixture,title:'One',url:'https://events.example.com/?id=1'},{...alias,title:'Two',url:'https://events.example.com/?id=2'}),false));
test('same city events with distinct editions are not merged',()=>assert.equal(sameHackathon(fixture,{...alias,title:'Future Builders Hackathon 2031'}),false));
test('same-name events months apart stay separate',()=>assert.equal(sameHackathon(fixture,{...alias,endsAt:'2030-12-03T12:00:00Z'}),false));
test('different city editions stay separate',()=>assert.equal(deduplicateHackathons([{...fixture,mode:'offline',city:'Delhi'},{...alias,mode:'offline',city:'Mumbai'}]).length,2));
test('different city names in the title stay separate even if the city field is missing',()=>assert.equal(sameHackathon({...fixture,title:'Paytm Build for India Delhi'},{...alias,title:'Paytm Build for India Mumbai'}),false));
test('generic names do not merge unrelated hackathons',()=>assert.equal(sameHackathon({...fixture,title:'AI Hackathon'},{...alias,title:'AI Hackathon'}),false));
test('unknown dates do not merge unrelated same-name listings',()=>assert.equal(sameHackathon({...fixture,startsAt:null,endsAt:null},{...alias,startsAt:null,endsAt:null}),false));
test('shared organizer homepage does not establish event identity',()=>assert.equal(sameHackathon({...fixture,title:'One',url:'https://devpost.com/'},{...alias,title:'Two',url:'https://devpost.com/'}),false));
test('a reused event domain cannot merge different years',()=>assert.equal(sameHackathon(fixture,{...alias,title:'Future Builders',url:fixture.url,endsAt:'2031-10-03T12:00:00Z'}),false));
test('pinned IDs are kept even when another source has richer details',()=>{const h=deduplicateHackathons([fixture,{...alias,tagline:'Rich summary',prizeUsd:1000}],new Set([fixture.id]))[0];assert.equal(h.id,fixture.id);assert.equal(h.tagline,'Rich summary');assert.equal(h.prizeUsd,1000)});
test('source filtering matches every platform on a grouped event',()=>{const h=deduplicateHackathons([fixture,alias])[0];for(const source of ['unstop','devpost'])assert.equal(matches(h,{...DEFAULTS,sources:[source]},0),true)});
test('sparse data cannot transitively merge different city editions',()=>assert.equal(deduplicateHackathons([{...fixture,mode:'offline',city:'Delhi'},{...alias,mode:'offline',city:null},{...alias,id:'hack2skill:third',source:'hack2skill',mode:'offline',city:'Mumbai'}]).length,2));
test('deduplication is deterministic and does not mutate the source records',()=>{const a=structuredClone(fixture),b=structuredClone(alias);const first=deduplicateHackathons([a,b])[0],second=deduplicateHackathons([b,a])[0];assert.equal(first.id,second.id);assert.deepEqual(a,fixture);assert.deepEqual(b,alias)});
const original=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'hackmate-dedupe-'));process.chdir(temp);
const {db,setSetting}=require('../src/lib/db.ts');const repo=require('../src/lib/repo.ts');
after(()=>{db().close();process.chdir(original);fs.rmSync(temp,{recursive:true,force:true})});
test('repository groups listings while preserving raw records and pinned notes',()=>{
 repo.upsertHackathons([fixture,alias],new Date().toISOString());repo.trackHackathon(fixture.id);repo.updateTracked(fixture.id,{notes:'Keep my work'});
 const list=repo.listHackathons();assert.equal(list.length,1);assert.equal(list[0].id,fixture.id);assert.equal(db().prepare('SELECT count(*) AS n FROM hackathons').get().n,2);assert.equal(repo.listTracked()[0].notes,'Keep my work');
});
test('pinning the alternate source never creates a second tracker entry',()=>{repo.trackHackathon(alias.id);assert.equal(repo.listTracked().length,1);assert.equal(repo.listTracked()[0].hackathonId,fixture.id)});
test('installations with only old source reports request an initial refresh',()=>{
 const sync=require('../src/lib/sync.ts');const {SOURCE_LABELS}=require('../src/lib/types.ts');setSetting('lastSync',JSON.stringify({at:new Date().toISOString(),sources:{unstop:{ok:true,count:1}}}));assert.equal(sync.needsInitialSync(),true);
 setSetting('lastSync',JSON.stringify({at:new Date().toISOString(),sources:Object.fromEntries(Object.keys(SOURCE_LABELS).map(s=>[s,{ok:true,count:0}]))}));assert.equal(sync.needsInitialSync(),false);assert.equal(sync.isStale(),false);
});

test('matching event addresses reconcile suburb versus parent-city listings',()=>{
 assert.equal(sameHackathon({...fixture,mode:'offline',city:'Bangalore',venue:'Acharya Institute of Technology'},{...alias,mode:'offline',city:'Soladevanahalli',venue:'Acharya Institute of Technology, Soladevanahalli, Bengaluru, Karnataka, India'}),true);
});
