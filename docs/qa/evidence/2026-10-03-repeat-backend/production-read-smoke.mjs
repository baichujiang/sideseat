import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const mode=process.argv[2],candidate=process.argv[3],origin='https://api.sideseat.de';
assert(['candidate','production'].includes(mode));
const fixtureFile='/tmp/sideseat-repeat-production-fixture-private-20261003.json';
const resultFile=`/tmp/sideseat-repeat-${mode}-smoke-20261003.json`;
const checks=[],accounts=[];
let connectionId,planId,completed=false,qaAccountsRemoved=false;
const pass=name=>{checks.push(name);console.log(`PASS ${name}`)};
async function call(route,{method='GET',body,token,expected=200,deployment}={}) {
 const headers={'Content-Type':'application/json','Accept':'application/json','x-sideseat-platform':'ios','Idempotency-Key':randomUUID()};
 if(token)headers.Authorization=`Bearer ${token}`;
 let status,payload;
 if(deployment){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sideseat-release-request-'));
  try {
   fs.writeFileSync(path.join(tmp,'headers'),Object.entries(headers).map(([k,v])=>`${k}: ${v}`).join('\n'),{mode:0o600});
   const args=['vercel','curl',route,'--deployment',deployment,'--','--silent','--show-error','--request',method,'--header',`@${tmp}/headers`,'--output',`${tmp}/response`,'--write-out','%{http_code}'];
   if(body){fs.writeFileSync(path.join(tmp,'body'),JSON.stringify(body),{mode:0o600});args.push('--data-binary',`@${tmp}/body`)}
   status=Number(execFileSync('npx',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000}));
   payload=JSON.parse(fs.readFileSync(path.join(tmp,'response'),'utf8'));
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
 }else{
  const response=await fetch(origin+route,{method,headers,body:body?JSON.stringify(body):undefined});status=response.status;payload=await response.json();
 }
 assert.equal(status,expected,`${method} ${route}: ${payload.error?.code||payload.error?.message||status}`);
 return payload.data??payload;
}
async function cleanup(){
 for(const account of accounts){
  if(!account.token){
   const login=await call('/api/v1/auth/login',{method:'POST',body:{identifier:account.username,password:account.password,device:{id:randomUUID(),name:'Release QA cleanup',platform:'ios',appVersion:'86',platformVersion:'26'}}});account.token=login.tokens.accessToken;
  }
  await call('/api/v1/me',{method:'DELETE',token:account.token,body:{confirmUsername:account.username}});
 }
 qaAccountsRemoved=true;
 if(fs.existsSync(fixtureFile))fs.unlinkSync(fixtureFile);
}
try{
 if(mode==='candidate'){
  assert(candidate?.startsWith('https://sideseat-'));
  for(let i=0;i<2;i++){
   const suffix=randomBytes(6).toString('hex'),username=`qa_repeat_${suffix}`,password=randomBytes(24).toString('base64url');
   const user=await call('/api/auth/signup',{method:'POST',expected:201,body:{username,password,displayName:`QA ${suffix}`,school:'TUM',studentStatus:'CURRENT_STUDENT',degreeLevel:'MASTER',semester:1}});
   const account={username,password,id:user.userId};accounts.push(account);
   fs.writeFileSync(fixtureFile,JSON.stringify({accounts}),{mode:0o600});
   const login=await call('/api/v1/auth/login',{method:'POST',body:{identifier:username,password,device:{id:`release-${suffix}`,name:'Preview 86 release QA',platform:'ios',appVersion:'86',platformVersion:'26'}}});account.token=login.tokens.accessToken;
   await call('/api/profile/privacy',{method:'PATCH',token:account.token,body:{hideFromDiscovery:true,hideFromCourseMembers:true}});
   fs.writeFileSync(fixtureFile,JSON.stringify({accounts}),{mode:0o600});
  }
  pass('two isolated QA accounts registered, authenticated and hidden');
  const connection=await call('/api/v1/connections/open',{method:'POST',expected:201,token:accounts[0].token,body:{peerId:accounts[1].id}});connectionId=connection.connectionId;
  const start=new Date(Date.now()+48*3600000),end=new Date(start.getTime()+3600000);
  const created=await call(`/api/v1/connections/${connectionId}/plans`,{method:'POST',expected:201,token:accounts[0].token,body:{title:'[QA] Preview 86 scoped plan',startTime:start.toISOString(),endTime:end.toISOString(),location:'[QA] Release verification'}});planId=created.plan.id;
  fs.writeFileSync(fixtureFile,JSON.stringify({accounts,connectionId,planId}),{mode:0o600});
  pass('isolated conversation and plan created through production API');
 }else{
  const data=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));accounts.push(...data.accounts);connectionId=data.connectionId;planId=data.planId;
 }
 const deployment=mode==='candidate'?candidate:undefined;
 await call(`/api/v1/plans?connectionId=${connectionId}`,{expected:401,deployment});pass('anonymous scoped read rejected');
 for(const [i,account] of accounts.entries()){
  const result=await call(`/api/v1/plans?connectionId=${connectionId}`,{token:account.token,deployment});
  assert(Object.hasOwn(result,'nextCursor'));assert.equal(result.nextCursor,null);assert.equal(result.plans.length,1);assert.equal(result.plans[0].id,planId);assert.equal(result.plans[0].connectionId,connectionId);
  pass(`participant ${i+1} receives scoped plan and explicit null nextCursor`);
  const overview=await call('/api/v1/plans',{token:account.token,deployment});assert(overview.plans.some(p=>p.id===planId));
  pass(`participant ${i+1} existing plan overview remains compatible`);
 }
 completed=true;
}finally{
 if(mode==='production'||!completed)await cleanup();
 fs.writeFileSync(resultFile,JSON.stringify({mode,origin:mode==='candidate'?candidate:origin,checks,completed,qaAccountsRemoved,at:new Date().toISOString()},null,2)+'\n');
}
