import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {request as playwrightRequest} from '@playwright/test';

const mode=process.argv[2];
const privateDir=process.env.GUEST_QA_PRIVATE_DIR;
assert(privateDir && (privateDir.startsWith(os.tmpdir()+'/sideseat-guest-identity-') || /^\/(?:private\/)?tmp\/sideseat-guest-identity-/.test(privateDir)), 'Use a private temporary fixture directory');
await fs.mkdir(privateDir,{recursive:true,mode:0o700});await fs.chmod(privateDir,0o700);
const fixturePath=path.join(privateDir,'fixture.json');
const base=process.env.GUEST_QA_BASE_URL??'https://www.sideseat.de';
assert(new URL(base).protocol==='https:');
const api=await playwrightRequest.newContext({baseURL:base,extraHTTPHeaders:{'x-sideseat-platform':'ios'}});
async function call(route,method='GET',body,token,expected=200){
 const r=await api.fetch(route,{method,data:body,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Idempotency-Key':randomUUID()}});
 assert.equal(r.status(),expected,method+' '+route+' status '+r.status());
 return expected===204?null:(await r.json()).data;
}
if(mode==='prepare-old'){
 assert(base==='https://www.sideseat.de');
 assert(!await fs.stat(fixturePath).catch(()=>null),'Fixture already exists; preserve it');
 const state={username:'guestqa_'+randomBytes(5).toString('hex'),password:randomBytes(24).toString('base64url'),plans:[],base};
 const save=()=>fs.writeFile(fixturePath,JSON.stringify(state),{mode:0o600});
 await save();
 await call('/api/auth/signup','POST',{username:state.username,password:state.password,displayName:'Guest identity QA',school:'TUM',studentStatus:'CURRENT_STUDENT',degreeLevel:'BACHELOR',semester:3},undefined,201);
 state.created=true;await save();
 const auth=await call('/api/v1/auth/login','POST',{identifier:state.username,password:state.password,device:{id:randomUUID(),name:'Guest identity QA',appVersion:'1.0.0',platformVersion:'26.6.1'}});state.accessToken=auth.tokens.accessToken;await save();
 const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 for(const phase of ['candidate','production'])for(const engine of ['chromium','webkit']){
  const poll=await call('/api/v1/time-polls','POST',{title:'[QA] Private guest identity '+phase+' '+engine,timeZone:'Europe/Berlin',dates:[date],startMinute:540,endMinute:720,durationMinutes:60,expectedCount:3},state.accessToken,201);
  const record={phase,engine,token:poll.token};state.plans.push(record);await save();
  const guest=await call('/api/public/time-polls/'+poll.token+'/participant','POST',{displayName:'旧游客'});record.guestId=guest.viewerId;
  const saved=await call('/api/public/time-polls/'+poll.token+'/response','PUT',{participantId:guest.viewerId,displayName:'旧游客',slotIds:[0,1]});record.responseId=saved.participants.find(p=>p.isMe).id;await save();
 }
 console.log('Prepared four old-format guest responses in disposable plans. No private credentials printed.');
}else if(mode==='prepare-candidate-retest'){
 const state=JSON.parse(await fs.readFile(fixturePath));
 const save=()=>fs.writeFile(fixturePath,JSON.stringify(state),{mode:0o600});
 const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 for(const engine of ['chromium','webkit']){
  for(const previous of state.plans.filter(p=>p.phase==='candidate'&&p.engine===engine))previous.engine+='-previous';
  const poll=await call('/api/v1/time-polls','POST',{title:'[QA] Retested old guest '+engine,timeZone:'Europe/Berlin',dates:[date],startMinute:540,endMinute:720,durationMinutes:60,expectedCount:3},state.accessToken,201);
  const record={phase:'candidate',engine,token:poll.token};state.plans.push(record);await save();
  const guest=await call('/api/public/time-polls/'+poll.token+'/participant','POST',{displayName:'旧游客'});record.guestId=guest.viewerId;
  assert(!(await api.storageState()).cookies.some(c=>c.name==='sideseat_poll_access_v2'&&c.path.endsWith(poll.token)),'Old-format fixtures must be created before private identity goes live');
  const saved=await call('/api/public/time-polls/'+poll.token+'/response','PUT',{participantId:guest.viewerId,displayName:'旧游客',slotIds:[0,1]});record.responseId=saved.participants.find(p=>p.isMe).id;await save();
 }
 console.log('Two old-format responses prepared for the rebased candidate; previous fixtures retained for cleanup.');
}else if(mode==='prepare-native'){
 const state=JSON.parse(await fs.readFile(fixturePath));
 assert(!state.plans.some(p=>p.engine==='native'),'Native legacy fixture already exists');
 const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 const poll=await call('/api/v1/time-polls','POST',{title:'[QA] Native guest recovery',timeZone:'Europe/Berlin',dates:[date],startMinute:540,endMinute:720,durationMinutes:60,expectedCount:3},state.accessToken,201);
 const record={phase:'production',engine:'native',token:poll.token};state.plans.push(record);
 const save=()=>fs.writeFile(fixturePath,JSON.stringify(state),{mode:0o600});await save();
 const guest=await call('/api/public/time-polls/'+poll.token+'/participant','POST',{displayName:'旧游客'});record.guestId=guest.viewerId;
 const saved=await call('/api/public/time-polls/'+poll.token+'/response','PUT',{participantId:guest.viewerId,displayName:'旧游客',slotIds:[0,1]});record.responseId=saved.participants.find(p=>p.isMe).id;await save();
 console.log('Prepared one disposable old-format response for native organizer recovery.');
}else if(mode==='refresh'){
 const state=JSON.parse(await fs.readFile(fixturePath));
 const auth=await call('/api/v1/auth/login','POST',{identifier:state.username,password:state.password,device:{id:randomUUID(),name:'Guest identity QA',appVersion:'1.0.0',platformVersion:'26.6.1'}});
 state.accessToken=auth.tokens.accessToken;await fs.writeFile(fixturePath,JSON.stringify(state),{mode:0o600});console.log('Disposable organizer session refreshed privately.');
}else if(mode==='cleanup'){
 const state=JSON.parse(await fs.readFile(fixturePath));
 for(const poll of state.plans){
  const route='/api/v1/time-polls/'+poll.token;
  const existing=await api.get(route,{headers:{Authorization:'Bearer '+state.accessToken}});
  if(existing.status()!==404){
   assert.equal(existing.status(),200);const data=(await existing.json()).data;
   if(['INVITING','CONFIRMED'].includes(data.phase))await call(route+'/cancel','POST',{version:data.invitationVersion},state.accessToken);
   await call(route,'DELETE',undefined,state.accessToken);
  }
  await call('/api/public/time-polls/'+poll.token,'GET',undefined,undefined,404);
 }
 await call('/api/v1/me','DELETE',{confirmUsername:state.username},state.accessToken);await call('/api/v1/me','GET',undefined,state.accessToken,401);
 await fs.writeFile(path.join(privateDir,'cleanup.json'),JSON.stringify({accountRemoved:true,plansRemoved:state.plans.length,at:new Date().toISOString()}));
 await fs.rm(fixturePath);console.log('Disposable account and all retained legacy plans removed; links and token rejected.');
}else throw new Error('Expected prepare-old or cleanup');
await api.dispose();
