import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { branches, industries, cities, type Profile } from '../../data';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(error:string,status=400)=>json({error},status);
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function active(m:any){return m?.status==='approved'&&m.expires&&m.expires>=today();}
function parsed(m:any,privateView=false){const p=JSON.parse(m.profile);p.pictures=p.pictures||[];p.photo=p.photo||'';if(!privateView){if(!p.showPhone)p.phone='';if(!p.showLine)p.line='';if(!p.showEmail)p.email='';}return {...m,profile:p};}
const summaryColumns="id,branch,json_remove(profile,'$.photo','$.pictures') AS profile,status,expires,updated,(LENGTH(json_extract(profile,'$.photo'))>0) AS hasPhoto";
async function context(){
 const user=await getChatGPTUser();if(!user)return null;const db=env.DB!;
 const assigned=await db.prepare('SELECT * FROM admins WHERE id=?').bind(user.userId).first<any>();
 const me=await db.prepare('SELECT * FROM members WHERE id=?').bind(user.userId).first<any>();
 // Regional administrators retain recovery access. Branch administrators must have current membership.
 const admin=assigned&&(!assigned.branch||(assigned.branch===me?.branch&&active(me)))?assigned:null;
 return {user,db,admin,me};
}
async function setting(db:any,key:string,fallback:any){const s=await db.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();return s?JSON.parse(s.value):fallback;}
function auditEntry(db:D1Database,actor:string,action:string,target:string|null,branch:string|null,detail:unknown){return db.prepare('INSERT INTO audit (id,actor,action,target,branch,detail,created) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,branch,JSON.stringify(detail),new Date().toISOString());}
export async function GET(request:Request){try{
 const params=new URL(request.url).searchParams;
 const c=await context();if(!c){if(params.has('id')||params.has('photo')||params.has('backup'))return fail('請先登入。',401);return json({user:null,members:[],me:null,admin:null,managed:[],roles:[],audit:[],canBootstrap:false,branches:await setting(env.DB!,'branches',branches),today:today()});}
 const {user,db,admin,me}=c;
 const requested=params.get('id')||params.get('photo');
 if(requested){
  const columns=params.has('photo')?"id,branch,status,expires,json_object('photo',json_extract(profile,'$.photo')) AS profile":'*';
  const target=await db.prepare(`SELECT ${columns} FROM members WHERE id=?`).bind(requested).first<any>();
  const managing=!!(admin&&(!admin.branch||admin.branch===target?.branch));
  const own=requested===user.userId;
  if(!target||(!own&&!managing&&!(active(me)&&active(target))))return fail('無權查看這張會員名片。',403);
  if(params.has('photo')){const photo=JSON.parse(target.profile).photo||'';const match=photo.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);if(!match)return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});return new Response(Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)),{headers:{'Content-Type':match[1],'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
  return json({member:parsed(target,own||managing)});
 }
 if(params.has('backup')){
  if(!admin)return fail('需要管理員權限。',403);
  const columns="id,branch,json_remove(profile,'$.photo','$.pictures') AS profile,status,expires,updated";
  const result=await (admin.branch?db.prepare(`SELECT ${columns} FROM members WHERE branch=?`).bind(admin.branch):db.prepare(`SELECT ${columns} FROM members`)).all<any>();
  await auditEntry(db,user.userId,'backup',null,admin.branch,{count:result.results.length}).run();
  return new Response(JSON.stringify({format:'north-growth-members-v1',includesPhotos:false,exportedAt:new Date().toISOString(),scope:admin.branch||'北區全部分會',branches:await setting(db,'branches',branches),expiry:await setting(db,'expiry',null),members:result.results.map(m=>parsed(m,true))},null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="north-members-${today()}.json"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 const expiry=await setting(db,'expiry',`${today().slice(0,4)}-12-31`);const names=await setting(db,'branches',branches);
 const all=(active(me)||admin)?await db.prepare(`SELECT ${summaryColumns} FROM members WHERE status='approved' AND expires>=? ORDER BY updated DESC`).bind(today()).all():{results:[]};
 let managed:any[]=[];if(admin)managed=(await (admin.branch?db.prepare(`SELECT ${summaryColumns} FROM members WHERE branch=? ORDER BY updated DESC`).bind(admin.branch):db.prepare(`SELECT ${summaryColumns} FROM members ORDER BY updated DESC`)).all()).results;
 let roles:any[]=[];if(admin&&!admin.branch)roles=(await db.prepare('SELECT * FROM admins').all()).results;
 let audit:any[]=[];if(admin)audit=(await (admin.branch?db.prepare('SELECT * FROM audit WHERE branch=? ORDER BY created DESC LIMIT 100').bind(admin.branch):db.prepare('SELECT * FROM audit ORDER BY created DESC LIMIT 100')).all()).results;
 return json({user:{id:user.userId,name:user.displayName},me:me?parsed(me,true):null,admin,canBootstrap:false,members:all.results.map((m:any)=>parsed(m)),managed:managed.map(m=>parsed(m,true)),roles,audit,expiry,branches:names,today:today()});
 }catch(e){console.error('community read failed',e);return fail('暫時無法讀取資料，請稍後重試。',503);}}
function validate(raw:any,available:string[]):Profile{
 if(!raw||typeof raw!=='object')throw Error('欄位格式錯誤');
 const fields=['name','title','branch','company','industry','city','area','services','offer','need','phone','line','email','website','photo'];
 const p:any={};for(const k of fields){if(raw[k]!==undefined&&typeof raw[k]!=='string')throw Error('欄位格式錯誤');p[k]=(raw[k]||'').trim();if(p[k].length>(k==='photo'?250000:2000))throw Error('欄位內容過長');}
 for(const k of ['name','branch','company','industry','city','services','offer'])if(!p[k])throw Error('請填寫所有必填欄位');
 for(const k of ['name','title','company','area'])if(p[k].length>100)throw Error('欄位內容過長（姓名、職稱、公司及地區限 100 字）');
 if(!available.includes(p.branch)||!industries.includes(p.industry)||!cities.includes(p.city))throw Error('分類或分會不正確');
 if(p.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))throw Error('Email 格式不正確');
 if(p.website&&!/^https?:\/\/[^\s]+$/i.test(p.website))throw Error('網站請使用完整的 https:// 網址');
 const image=(s:string)=>!s||(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)&&s.length<=250000);
 if(!image(p.photo)||p.photo.length>45000)throw Error('大頭照片過大，請重新選取並上傳照片');
 p.pictures=raw.pictures||[];if(!Array.isArray(p.pictures)||p.pictures.length>3||p.pictures.some((s:any)=>typeof s!=='string'||!image(s)))throw Error('最多上傳 3 張產品照片');
 for(const k of ['showPhone','showLine','showEmail'])p[k]=raw[k]===true;return p;
}
export async function POST(request:Request){try{
 const reader=request.body?.getReader();let bytes=0,text='';const decoder=new TextDecoder();
 if(reader){while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1100000){await reader.cancel();return fail('上傳內容太大',413);}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}
 const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)return fail('請從本站操作。',403);
 const c=await context();if(!c)return fail('請先登入。',401);
 const {user,db,admin,me}=c;const body=JSON.parse(text);
 if(body.action==='bootstrap'){
  return fail('正式版已關閉首次管理員啟用功能，請聯絡北區總管理員。',403);
 }
 if(body.action==='profile'){
  if(me?.status==='disabled')return fail('帳號已停用，請聯絡分會管理員。',403);
  if(body.consent!==true||body.consentVersion!=='2026-11-13')return fail('請先同意會員資料使用說明，再送出申請。');
  const names=await setting(db,'branches',branches);const p=validate(body.profile,names);
  const changed=me&&me.branch!==p.branch;const status=changed||me?.status==='rejected'?'pending':me?.status||'pending';
  await db.batch([db.prepare('INSERT INTO members (id,branch,profile,status,expires,updated) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET branch=excluded.branch,profile=excluded.profile,status=excluded.status,expires=excluded.expires,updated=excluded.updated').bind(user.userId,p.branch,JSON.stringify(p),status,changed?null:me?.expires||null,new Date().toISOString()),auditEntry(db,user.userId,me?'profile-update':'member-apply',user.userId,p.branch,{status,branchChanged:!!changed,consentVersion:body.consentVersion})]);return json({ok:true});
 }
 if(!admin)return fail('需要管理員權限。',403);
 if(body.action==='status'){
  const target=await db.prepare('SELECT * FROM members WHERE id=?').bind(String(body.id)).first<any>();if(!target)return fail('找不到會員',404);
  if(admin.branch&&target.branch!==admin.branch)return fail('只能管理自己的分會。',403);
  if(target.id===user.userId&&admin.branch)return fail('分會管理員不能審核或變更自己的資格，請由北區總管理員處理。',403);
  const targetRole=await db.prepare('SELECT * FROM admins WHERE id=?').bind(target.id).first<any>();
  if(targetRole&&!targetRole.branch&&body.status!=='approved')return fail('不能停用北區總管理員，請先完成管理權限交接。',403);
  if(!['approved','rejected','disabled','pending'].includes(body.status))return fail('狀態錯誤');
  const expiry=await setting(db,'expiry',`${today().slice(0,4)}-12-31`);if(body.status==='approved'&&expiry<today())return fail('年度到期日已過，請北區管理員先設定新年度。');
  await db.batch([db.prepare('UPDATE members SET status=?,expires=?,updated=? WHERE id=?').bind(body.status,body.status==='approved'?expiry:target.expires,new Date().toISOString(),target.id),auditEntry(db,user.userId,'member-status',target.id,target.branch,{from:target.status,to:body.status,expires:body.status==='approved'?expiry:target.expires})]);return json({ok:true});
 }
 if(body.action==='renew'){
  const expiry=await setting(db,'expiry',`${today().slice(0,4)}-12-31`);if(expiry<today())return fail('請先設定新年度到期日。');
  if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>80)return fail('每次請選擇 1 至 80 位會員；大量續會會由介面自動分批處理。');
  if(body.ids.some((id:unknown)=>typeof id!=='string'))return fail('會員代碼格式錯誤');
  if(admin.branch&&body.ids.includes(user.userId))return fail('分會管理員不能替自己續會，請由北區總管理員處理。',403);
  const ids=[...new Set(body.ids)] as string[];
  const slots=ids.map(()=>'?').join(',');const found=(await db.prepare(`SELECT id,branch,status FROM members WHERE id IN (${slots})`).bind(...ids).all<any>()).results;
  if(found.length!==ids.length||found.some(t=>t.status!=='approved'))return fail('選取的會員資格已變更，請重新載入後再操作。',409);
  if(admin.branch&&found.some(t=>t.branch!==admin.branch))return fail('只能替所屬分會會員續會。',403);
  await db.batch([db.prepare(`UPDATE members SET expires=?,updated=? WHERE id IN (${slots}) AND status='approved'${admin.branch?' AND branch=?':''}`).bind(expiry,new Date().toISOString(),...ids,...(admin.branch?[admin.branch]:[])),auditEntry(db,user.userId,'member-renew',null,admin.branch,{ids,expires:expiry})]);return json({ok:true,updated:ids.length});
 }
 if(admin.branch)return fail('需要北區總管理員權限。',403);
 if(body.action==='settings'){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(body.expiry)||!Number.isFinite(Date.parse(body.expiry))||new Date(body.expiry).toISOString().slice(0,10)!==body.expiry||body.expiry<today())return fail('請設定有效的未來日期');
  const names=body.branches;if(!Array.isArray(names)||names.length!==10||names.some((v:any)=>typeof v!=='string'||!v.trim()||v.length>30)||new Set(names).size!==10)return fail('請填寫 10 個不重複的分會名稱');
  const previous=await setting(db,'branches',branches);const records=await db.prepare('SELECT id,branch,profile FROM members').all<any>();const roles=await db.prepare('SELECT id,branch FROM admins WHERE branch IS NOT NULL').all<any>();
  const ops:any[]=['expiry','branches'].map(k=>db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,JSON.stringify(body[k])));
  for(const m of records.results){const idx=previous.indexOf(m.branch);if(idx>=0&&m.branch!==names[idx]){const p=JSON.parse(m.profile);p.branch=names[idx];ops.push(db.prepare('UPDATE members SET branch=?,profile=? WHERE id=?').bind(names[idx],JSON.stringify(p),m.id));}}
  for(const a of roles.results){const idx=previous.indexOf(a.branch);if(idx>=0)ops.push(db.prepare('UPDATE admins SET branch=? WHERE id=?').bind(names[idx],a.id));}
  ops.push(auditEntry(db,user.userId,'settings',null,null,{expiry:body.expiry,branches:names}));await db.batch(ops);return json({ok:true});
 }
 if(body.action==='role'){
  const target=await db.prepare('SELECT * FROM members WHERE id=?').bind(String(body.id)).first<any>();if(!target)return fail('請先請對方填寫會員資料');if(body.id===user.userId)return fail('不能變更自己的管理權限');
  if(body.branch==='remove')await db.batch([db.prepare('DELETE FROM admins WHERE id=?').bind(body.id),auditEntry(db,user.userId,'admin-role',body.id,target.branch,{role:'member'})]);else {const names=await setting(db,'branches',branches);if(!names.includes(body.branch))return fail('請選擇分會');if(!active(target)||target.branch!==body.branch)return fail('請先確認對方為該分會資格有效的會員。');await db.batch([db.prepare('INSERT INTO admins (id,branch) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET branch=excluded.branch').bind(body.id,body.branch),auditEntry(db,user.userId,'admin-role',body.id,target.branch,{role:'branch-admin',branch:body.branch})]);}return json({ok:true});
 }
 return fail('不支援的操作');
 }catch(e){console.error('community write failed',e);return fail(e instanceof Error&&(/欄位|必填|分類|格式|照片|Email|網站/.test(e.message))?e.message:'儲存失敗，請稍後再試。');}}


