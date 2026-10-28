/* eslint-disable @typescript-eslint/no-require-imports -- Node tests use the TypeScript test bootstrap. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../tests-setup.cjs');
const {devpostDates,normalizeDevpost,fetchDevpost}=require('../src/lib/sources/devpost.ts');
const {parseLablab,fetchLablab}=require('../src/lib/sources/lablab.ts');
const {normalizeHackerEarth,fetchHackerEarth}=require('../src/lib/sources/hackerearth.ts');
const {normalizeHack2skill,fetchHack2skill}=require('../src/lib/sources/hack2skill.ts');
const {normalizeDevsemble,fetchDevsemble}=require('../src/lib/sources/devsemble.ts');
const {rscText,jsonObjects}=require('../src/lib/sources/shared.ts');
const mockFetch=async(fn,run)=>{const original=global.fetch;global.fetch=fn;try{await run()}finally{global.fetch=original}};
const response=body=>Response.json(body);
const rawDevpost={id:1,title:'Future Builders Hackathon',url:'https://futurebuilders.devpost.com/',submission_period_dates:'Oct 01 - Nov 12, 2030',displayed_location:{icon:'globe',location:'Online'},thumbnail_url:'//cdn.example.com/test.png',prize_amount:'$<span>50,000</span>',themes:[{name:'Machine Learning/AI'}]};
for(const [input,start,end] of [
 ['Oct 15 - 29, 2030','2030-10-15','2030-10-29'],
 ['Oct 01 - Nov 12, 2030','2030-10-01','2030-11-12'],
 ['Dec 20 - Jan 03, 2031','2030-12-20','2031-01-03'],
 ['Dec 20, 2030 - Jan 03, 2031','2030-12-20','2031-01-03'],
 ['Nov 07, 2030','2030-11-07','2030-11-07'],
])test(`Devpost date range: ${input}`,()=>{const d=devpostDates(input);assert.ok(d.startsAt.startsWith(start));assert.ok(d.endsAt.startsWith(end));assert.ok(d.endsAt.endsWith('23:59:59.999Z'))});
for(const input of ['Feb 31 - Mar 03, 2030','Not announced','Oct 30 - 01, 2030'])test(`invalid date range stays unknown: ${input}`,()=>assert.deepEqual(devpostDates(input),{startsAt:null,endsAt:null}));
test('Devpost normalizes prizes, protocol-relative images, themes, and online mode',()=>{
 const h=normalizeDevpost(rawDevpost);assert.equal(h.prizeUsd,50000);assert.equal(h.image,'https://cdn.example.com/test.png');assert.equal(h.mode,'online');assert.ok(h.themes.includes('AI / ML'));assert.equal(h.regEndsAt,null);assert.equal(h.entryFee,null);
});
test('Devpost follows the actual page size and deduplicates repeated IDs',async()=>{
 const seen=[];await mockFetch(async url=>{seen.push(url);return response({hackathons:[{...rawDevpost,id:seen.length===2?1:2}],meta:{total_count:3,per_page:1}})},async()=>{assert.equal((await fetchDevpost()).length,2)});assert.equal(seen.length,3);assert.ok(seen[2].includes('page=3'));
});
const lablabRecord={id:'ai-1',name:'Voice AI Hackathon',slug:'voice-ai',type:'HACKATHON',eventType:'HYBRID',startAt:'2030-10-01T12:00:00Z',endAt:'2030-10-03T12:00:00Z',description:'Build {useful} agents with "voice".',teamMembersMinimum:2,teamMembersLimit:4};
const rsc=records=>'<script>self.__next_f.push('+JSON.stringify([1,JSON.stringify({events:records})])+')</script>';
test('lablab decodes RSC JSON and retains team limits and hybrid mode',()=>{
 const h=parseLablab(rsc([lablabRecord,lablabRecord]))[0];assert.equal(parseLablab(rsc([lablabRecord,lablabRecord])).length,1);assert.equal(h.mode,'hybrid');assert.equal(h.teamMin,2);assert.equal(h.teamMax,4);assert.equal(h.tagline,lablabRecord.description);
});
test('lablab excludes workshops and deleted events',()=>assert.equal(parseLablab(rsc([{...lablabRecord,type:'WORKSHOP'},{...lablabRecord,deletedAt:'2030-01-01'}])).length,0));
test('RSC extraction does not execute JavaScript',()=>{global.__executed=false;assert.equal(rscText('<script>global.__executed=true</script>'),'');assert.equal(global.__executed,false);delete global.__executed});
test('balanced JSON extraction handles braces and escaped quotes in descriptions',()=>{const data={id:'x',description:'a } brace and "quote"'};assert.deepEqual(jsonObjects(JSON.stringify(data),'{"id":'),[data])});
test('HackerEarth offset-free timestamps are parsed as UTC',()=>{const h=normalizeHackerEarth({slug:'future',title:'Future Hackathon',type:'Hackathon',url:'/challenges/hackathon/future/',start:'2030-01-01T04:30:00',end:'2030-01-02T18:29:00'});assert.equal(h.startsAt,'2030-01-01T04:30:00.000Z');assert.equal(h.endsAt,'2030-01-02T18:29:00.000Z');assert.ok(h.url.startsWith('https://www.hackerearth.com/'))});
test('HackerEarth excludes coding/hiring challenges and finished hackathons',async()=>{
 const base={slug:'a',title:'A',type:'Hackathon',url:'/challenges/hackathon/a/',start:'2030-01-01T00:00:00',end:'2030-01-03T00:00:00'};
 await mockFetch(async()=>response({data:[base,{...base,type:'Hiring',slug:'h'},{...base,end:'2020-01-01T00:00:00',slug:'old'}]}),async()=>assert.equal((await fetchHackerEarth()).length,1));
});
const h2s={_id:'h2s-1',eventUrl:'builders',title:'Builders',registrationEnd:'2030-10-02T00:00:00Z',ticket:'PAID',mode:'IN_PERSON',participation:'Individual'};
test('Hack2skill preserves separate registration dates and unknown event dates',()=>{const h=normalizeHack2skill(h2s);assert.equal(h.startsAt,null);assert.equal(h.endsAt,null);assert.equal(h.regEndsAt,'2030-10-02T00:00:00.000Z');assert.equal(h.mode,'offline');assert.equal(h.entryFee,'paid');assert.equal(h.teamMax,1)});
test('Hack2skill follows pagination and removes repeat IDs',async()=>{
 const seen=[];await mockFetch(async url=>{seen.push(url);return response({success:true,data:[h2s],pages:2})},async()=>assert.equal((await fetchHack2skill()).length,1));assert.equal(seen.length,2);
});
const devsemble={_id:'ds-1',slug:'Paytm – Bengaluru-by-paytm',title:'Paytm Build for India – Bengaluru',startDate:'2030-10-30T18:30:00Z',endDate:'2030-10-30T18:30:00Z',venue:'Paytm, Bellandur, Bengaluru',mapEmbedQuery:'12.9,77.6',bannerImage:'/uploads/banner.png',teamSize:3,hostedBy:{communityName:'Paytm'},description:'<p>Build <b>AI</b></p>',rules:['Teams of three'],stages:[{name:'Finals',description:'Demo video required',deadline:'2030-10-31T12:00:00Z'}]};
test('Devsemble preserves city, coordinates, rules, and safely encoded event links',()=>{
 const h=normalizeDevsemble(devsemble);assert.equal(h.city,'Bengaluru');assert.equal(h.lat,12.9);assert.equal(h.lng,77.6);assert.ok(h.url.includes('%20'));assert.ok(h.url.includes('%E2%80%93'));assert.equal(h.image,'https://devsemble.com/uploads/banner.png');assert.match(h.description,/Teams of three[\s\S]*Demo video required/);assert.equal(h.teamMax,3);
});
test('Devsemble rejects invalid coordinates rather than creating broken map markers',()=>{const h=normalizeDevsemble({...devsemble,mapEmbedQuery:'190,500'});assert.equal(h.lat,null);assert.equal(h.lng,null)});
test('Devsemble excludes deleted/private records and deduplicates IDs',async()=>{
 await mockFetch(async()=>response({hackathons:[devsemble,devsemble,{...devsemble,_id:'hidden',isPublic:false},{...devsemble,_id:'deleted',isDeleted:true}]}),async()=>assert.equal((await fetchDevsemble()).length,1));
});
for(const [name,fetcher] of [['Devpost',fetchDevpost],['lablab',fetchLablab],['HackerEarth',fetchHackerEarth],['Hack2skill',fetchHack2skill],['Devsemble',fetchDevsemble]])test(`${name} reports an upstream schema change`,async()=>{
 await mockFetch(async()=>response({unexpected:true}),async()=>assert.rejects(fetcher,/response|data/));
});

test('Devpost venue labels are not misclassified as cities',()=>{
 const h=normalizeDevpost({...rawDevpost,displayed_location:{icon:'map-marker-alt',location:'Sheridan College Hazel McCallion Campus'}});assert.equal(h.city,null);assert.equal(h.venue,'Sheridan College Hazel McCallion Campus');assert.equal(h.mode,'offline');
});
