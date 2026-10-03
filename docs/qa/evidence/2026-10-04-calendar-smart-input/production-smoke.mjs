import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const mode=process.argv[2],candidate=process.argv[3],origin='https://api.sideseat.de';
assert(['candidate','production','cleanup'].includes(mode));
const fixtureFile='/tmp/sideseat-smart-production-fixture-private.json';
const checks=[],accounts=[];
let completed=false,qaAccountsRemoved=false;
const pass=name=>{checks.push(name);console.log(`PASS ${name}`)};
async function call(route,{method='GET',body,token,expected=200,deployment}={}) {
 const headers={'Content-Type':'application/json','Accept':'application/json','x-sideseat-platform':'ios','Idempotency-Key':randomUUID()};
 if(token)headers.Authorization=`Bearer ${token}`;
 let status,payload;
 if(deployment){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sideseat-smart-request-'));
  try{
   fs.writeFileSync(path.join(tmp,'headers'),Object.entries(headers).map(([k,v])=>`${k}: ${v}`).join('\n'),{mode:0o600});
   const args=['curl',route,'--deployment',deployment,'--','--silent','--show-error','--request',method,'--header',`@${tmp}/headers`,'--output',`${tmp}/response`,'--write-out','%{http_code}'];
   if(body){fs.writeFileSync(path.join(tmp,'body'),JSON.stringify(body),{mode:0o600});args.push('--data-binary',`@${tmp}/body`)}
   status=Number(execFileSync('vercel',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000}));
   payload=JSON.parse(fs.readFileSync(path.join(tmp,'response'),'utf8'));
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
 }else{
  const response=await fetch(origin+route,{method,headers,body:body?JSON.stringify(body):undefined});status=response.status;payload=await response.json();
 }
 assert.equal(status,expected,`${method} ${route}: ${payload.error?.code||status}`);
 return payload.data??payload;
}
async function cleanup(){
 for(const account of accounts){
  if(!account.token){
   const login=await call('/api/v1/auth/login',{method:'POST',body:{identifier:account.username,password:account.password,device:{id:randomUUID(),name:'Smart input QA cleanup',appVersion:'89',platformVersion:'26'}}});account.token=login.tokens.accessToken;
  }
  await call('/api/v1/me',{method:'DELETE',token:account.token,body:{confirmUsername:account.username}});
 }
 qaAccountsRemoved=true;
 if(fs.existsSync(fixtureFile))fs.unlinkSync(fixtureFile);
}
const berlin=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
try{
 if(mode==='candidate'){
  assert(candidate?.startsWith('https://sideseat-'));
  for(let i=0;i<2;i++){
   const suffix=randomBytes(6).toString('hex'),username=`qa_smart_${suffix}`,password=randomBytes(24).toString('base64url');
   const user=await call('/api/auth/signup',{method:'POST',expected:201,body:{username,password,displayName:`QA ${suffix}`,school:'TUM',studentStatus:'CURRENT_STUDENT',degreeLevel:'MASTER',semester:1}});
   const account={username,password,id:user.userId};accounts.push(account);
   fs.writeFileSync(fixtureFile,JSON.stringify({accounts}),{mode:0o600});
   const login=await call('/api/v1/auth/login',{method:'POST',body:{identifier:username,password,device:{id:`smart-release-${suffix}`,name:'Preview 89 release QA',appVersion:'89',platformVersion:'26'}}});account.token=login.tokens.accessToken;
   await call('/api/profile/privacy',{method:'PATCH',token:account.token,body:{hideFromDiscovery:true,hideFromCourseMembers:true}});
   fs.writeFileSync(fixtureFile,JSON.stringify({accounts}),{mode:0o600});
  }
  pass('two temporary QA accounts authenticated and hidden');
 }else{accounts.push(...JSON.parse(fs.readFileSync(fixtureFile,'utf8')).accounts)}
 if(mode!=='cleanup'){
  const deployment=mode==='candidate'?candidate:undefined;
  const scheduleRoute='/api/v1/home/schedule?'+new URLSearchParams({windowStart:new Date(Date.now()-86400000).toISOString(),windowEnd:new Date(Date.now()+7*86400000).toISOString()});
  await call('/api/v1/calendar/parse-natural',{method:'POST',body:{text:'取充电线'},expected:401,deployment});pass('anonymous parsing still requires authentication');
  for(const [index,account] of accounts.entries()){
   const before=await call(scheduleRoute,{token:account.token,deployment});
   const reference=berlin(new Date());
   const expectedDay=Number(reference.slice(11,13))<4?reference.slice(0,10):berlin(Date.now()+86400000).slice(0,10);
   const parsed=await call('/api/v1/calendar/parse-natural',{method:'POST',token:account.token,deployment,body:{text:'明天上午10:00取充电线，地点是A楼大厅',locale:'zh-CN'}});
   assert.equal(parsed.events.length,1);assert.deepEqual(parsed.warnings,[]);
   const draft=parsed.events[0];
   assert.equal(berlin(draft.startAt),expectedDay+' 10:00');assert.equal(Date.parse(draft.endAt)-Date.parse(draft.startAt),15*60000);
   assert.equal(draft.location,'A楼大厅','real provider should extract the explicitly supplied location');
   pass(`account ${index+1}: live extraction, 15-minute end and colloquial date ${expectedDay}`);
   const after=await call(scheduleRoute,{token:account.token,deployment});assert.equal(after.studyEntries.length,before.studyEntries.length);
   pass(`account ${index+1}: parsing creates no calendar event`);
   const generic=await call('/api/v1/calendar/parse-natural',{method:'POST',token:account.token,deployment,body:{text:'明天10点办事',locale:'zh-CN'}});
   assert.equal(Date.parse(generic.events[0].endAt)-Date.parse(generic.events[0].startAt),30*60000);pass(`account ${index+1}: generic default is 30 minutes`);
   const title=`[QA] Smart input ${mode} ${index}`;
   const endAt=new Date(Date.parse(draft.startAt)+20*60000).toISOString();
   await call('/api/v1/calendar/events/batch',{method:'POST',token:account.token,deployment,expected:201,body:{events:[{...draft,title,endAt}]}});
   const saved=await call(scheduleRoute,{token:account.token,deployment});
   const event=saved.studyEntries.find(e=>e.title===title);assert(event);assert.equal(event.endISO,endAt);assert.equal(event.eventParticipants.length,0);
   pass(`account ${index+1}: 20-minute edit persisted without inviting anyone`);
  }
 }
 completed=true;
}finally{
 if(mode!=='candidate'||!completed)await cleanup();
 fs.writeFileSync(`/tmp/sideseat-smart-${mode}-smoke.json`,JSON.stringify({mode,origin:mode==='candidate'?candidate:origin,checks,completed,qaAccountsRemoved,at:new Date().toISOString()},null,2)+'\n');
}
