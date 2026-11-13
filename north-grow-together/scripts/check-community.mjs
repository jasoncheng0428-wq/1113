// Integration checks against the built Worker and disposable LOCAL D1 database only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const base='http://127.0.0.1:5180';
const ids={owner:'test-admin',a:'test-member-a',b:'test-member-b',c:'test-member-c'};
let checks=0;
async function call(who,body,expected=200,origin=base){
 if(body?.action==='profile')body={consent:true,consentVersion:'2026-11-13',...body};
 const headers={Connection:"close"};if(who){headers['oai-authenticated-user-id']=ids[who];headers['oai-authenticated-user-email']=who+'@example.test';}
 if(body){headers['Content-Type']='application/json';headers.Origin=origin;}
 const r=await fetch(base+'/api/community',{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});const raw=await r.text();let d;try{d=JSON.parse(raw);}catch{throw Error(`${who} ${body?.action||"GET"}: ${r.status} ${raw}`);}assert.equal(r.status,expected,JSON.stringify(d));checks++;return d;
}
const tiny='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=';
const profile=(name,branch)=>({name,title:'會員',branch,company:name+'測試公司',industry:'製造與包裝',city:'臺北市',area:'全臺灣',services:'測試服務',offer:'包裝服務',need:'設計夥伴',phone:'0900000000',line:'',email:'test@example.test',website:'',photo:tiny,pictures:[tiny],showPhone:false,showLine:false,showEmail:true});
function localSQL(sql){execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',sql],{stdio:'pipe'});}
localSQL("DELETE FROM members WHERE id IN ('test-member-a','test-member-b','test-member-c') OR id LIKE 'test-bulk-%'; DELETE FROM admins WHERE id IN ('test-admin','test-member-a','test-member-b','test-member-c'); INSERT INTO admins (id,branch) VALUES ('test-admin',NULL)");
assert.equal((await call(null)).user,null);
await call(null,{action:'bootstrap'},401);
await call('owner',{action:'bootstrap'},403);
await call('owner',{action:'settings',expiry:'2026-12-31',branches:(await call('owner')).branches});
await call('a',{action:'bootstrap'},403);
await call('a',{action:'profile',profile:profile('測試甲','第 1 分會')});
await call('b',{action:'profile',profile:profile('測試乙','第 2 分會')});
await call('c',{action:'profile',profile:profile('測試丙','第 1 分會')});
assert.equal((await call('a')).members.length,0,'pending member must not see directory');
await call('b',{action:'status',id:ids.a,status:'approved'},403);
for(const id of [ids.a,ids.b,ids.c])await call('owner',{action:'status',id,status:'approved'});
const a=await call('a');assert.equal(a.members.length,3);assert.equal(a.members.find(m=>m.id===ids.b).profile.phone,'');assert.equal(a.members.find(m=>m.id===ids.b).profile.email,'test@example.test');
await call('owner',{action:'role',id:ids.a,branch:'第 1 分會'});
const manager=await call('a');assert.equal(manager.managed.length,2);assert(manager.managed.every(m=>m.branch==='第 1 分會'));
await call('a',{action:'status',id:ids.b,status:'disabled'},403);
await call('a',{action:'settings',expiry:'2027-12-31',branches:a.branches},403);
await call('a',{action:'role',id:ids.c,branch:'第 1 分會'},403);
await call('owner',{action:'settings',expiry:'2027-12-31',branches:a.branches});
await call('a',{action:'renew',ids:[ids.a]},403);
await call('a',{action:'renew',ids:[ids.c,ids.b]},403);
await call('a',{action:'status',id:ids.a,status:'approved'},403);
await call('owner',{action:'renew',ids:[ids.a]});
await call('a',{action:'renew',ids:[ids.c]});
assert.equal((await call('a')).me.expires,'2027-12-31');assert.equal((await call('b')).me.expires,'2026-12-31','cross-branch batch renewal must not modify other branches');
await call('a',{action:'status',id:ids.c,status:'disabled'});
assert.equal((await call('c')).members.length,0);assert.equal((await call('b')).members.length,2);
await call('c',{action:'profile',profile:profile('測試丙','第 1 分會')},403);
await call('b',{action:'profile',profile:profile('測試乙','第 2 分會')},403,'https://invalid.example');
await call('b',{action:'profile',profile:{...profile('測試乙','第 2 分會'),website:'javascript:alert(1)'}},400);
// No data reaches production. This CLI explicitly targets the preview database.
execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',"UPDATE members SET expires='2020-01-01' WHERE id='test-member-b'"],{stdio:'pipe'});
assert.equal((await call('b')).members.length,0,'expired membership must not expose directory');
await call('owner',{action:'status',id:ids.b,status:'approved'});
await call('b',{action:'profile',profile:profile('測試乙','第 3 分會')});
const changed=await call('b');assert.equal(changed.me.status,'pending');assert.equal(changed.me.expires,null);assert.equal(changed.members.length,0);
async function read(who,query,expected=200){const headers={};if(who){headers['oai-authenticated-user-id']=ids[who];headers['oai-authenticated-user-email']=who+'@example.test';}const r=await fetch(base+'/api/community?'+query,{headers});const d=await r.json();assert.equal(r.status,expected,JSON.stringify(d));checks++;return d;}
await read(null,'id='+ids.a,401);await read(null,'backup=1',401);
await read('b','id='+ids.a,403);await read('b','backup=1',403);
await read(null,'photo='+ids.a,401);await read('b','photo='+ids.a,403);
await read('a','id='+ids.b,403);
const detail=await read('owner','id='+ids.b);assert.equal(detail.member.profile.pictures.length,1);
const image=await fetch(base+'/api/community?photo='+ids.b,{headers:{'oai-authenticated-user-id':ids.owner,'oai-authenticated-user-email':'owner@example.test'}});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.equal(image.headers.get('x-content-type-options'),'nosniff');assert((await image.arrayBuffer()).byteLength>0);checks++;
assert.deepEqual((await call('a')).members[0].profile.pictures,[],'directory should omit product images');
await call('b',{action:'profile',profile:profile('測試乙','第 3 分會'),consent:false},400);
await call('owner',{action:'settings',expiry:'2027-02-30',branches:a.branches},400);
localSQL("UPDATE members SET expires='2020-01-01' WHERE id='test-member-a'");
const expiredAdmin=await call('a');assert.equal(expiredAdmin.admin,null);assert.equal(expiredAdmin.managed.length,0);assert.equal(expiredAdmin.members.length,0);
await call('a',{action:'status',id:ids.c,status:'approved'},403);
await call('owner',{action:'status',id:ids.a,status:'approved'});
const bulk=Array.from({length:500},(_,i)=>({id:`test-bulk-${String(i).padStart(3,'0')}`,p:profile(`測試會員${i}`,'第 1 分會')}));
fs.mkdirSync('outputs',{recursive:true});
fs.writeFileSync('outputs/members-test-fixture.sql',bulk.map(({id,p})=>`INSERT INTO members (id,branch,profile,status,expires,updated) VALUES ('${id}','第 1 分會','${JSON.stringify(p).replaceAll("'","''")}','approved','2026-12-31','2026-11-13');`).join('\n'));
execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file','outputs/members-test-fixture.sql'],{stdio:'pipe'});
const large=await call('a');assert.equal(large.members.length,501);assert(large.members.every(m=>m.profile.pictures.length===0&&m.profile.photo===''));assert(JSON.stringify(large).length<2000000);
await call('a',{action:'renew',ids:bulk.slice(0,81).map(m=>m.id)},400);
for(let i=0;i<bulk.length;i+=80)await call('a',{action:'renew',ids:bulk.slice(i,i+80).map(m=>m.id)});
const renewed=await call('a');assert(renewed.members.filter(m=>m.id.startsWith('test-bulk-')).every(m=>m.expires==='2027-12-31'));
assert(renewed.audit.length>0);assert(renewed.audit.every(a=>a.branch==='第 1 分會'));
const backup=await read('a','backup=1');assert.equal(backup.members.length,502);assert.equal(backup.includesPhotos,false);assert(backup.members.every(m=>m.branch==='第 1 分會'&&m.profile.pictures.length===0));
await call('owner',{action:'status',id:ids.a,status:'disabled'});assert.equal((await call('a')).admin,null);await read('a','backup=1',403);
console.log(`PASS: ${checks} API checks, including 500-member listing and renewal, disabled bootstrap, anonymous/detail/export protection, consent, administrator expiry, branch isolation and privacy.`);


