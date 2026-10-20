import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,webkit,request as playwrightRequest} from '@playwright/test';

const phase=process.argv[2],base=process.env.GUEST_QA_BASE_URL,privateDir=process.env.GUEST_QA_PRIVATE_DIR;
assert(['candidate','production'].includes(phase));assert(base?.startsWith('https://'));assert(privateDir?.includes('sideseat-guest-identity-'));
const fixturePath=path.join(privateDir,'fixture.json'),state=JSON.parse(await fs.readFile(fixturePath));
const share=process.env.GUEST_QA_SHARE_FILE?JSON.parse(await fs.readFile(process.env.GUEST_QA_SHARE_FILE)).url:null;
const results=[];
const bootstrap=async context=>{if(share){const r=await context.get(share);assert(r.status()<400,'Protected deployment authentication failed');}};
const api=await playwrightRequest.newContext({baseURL:base,extraHTTPHeaders:{'x-sideseat-platform':'ios'}});await bootstrap(api);
async function call(client,route,method='GET',data,owner=false,expected=200){
 const response=await client.fetch(route,{method,data,headers:{'Idempotency-Key':randomUUID(),...(owner?{Authorization:'Bearer '+state.accessToken}:{})}});
 assert.equal(response.status(),expected,method+' '+route+' status '+response.status());return (await response.json()).data;
}
const persist=()=>fs.writeFile(fixturePath,JSON.stringify(state),{mode:0o600});
const key=url=>new URLSearchParams(new URL(url).hash.slice(1)).get('recover');
const localLink=url=>phase==='production'?url:new URL(url).pathname+new URL(url).hash;
const artifactDir=process.env.GUEST_QA_EVIDENCE_DIR;assert(artifactDir?.includes('guest-private-identity'));await fs.mkdir(artifactDir,{recursive:true});
async function enter(page,name){await page.getByLabel('你的名字',{exact:true}).fill(name);await page.getByRole('button',{name:'下一步：选择我的空闲',exact:true}).click();await page.getByRole('button',{name:'编辑昵称',exact:true}).waitFor();}
async function save(page,id){await page.getByTestId('time-poll-cell-'+id).click();const response=page.waitForResponse(r=>r.url().endsWith('/response')&&r.request().method()==='PUT');await page.getByTestId('availability-submit').click();assert.equal((await response).status(),200);await page.getByText('已提交空闲',{exact:true}).waitFor();}
async function recovery(page){const panel=page.getByTestId('guest-recovery-panel');if(await panel.getAttribute('open')===null)await panel.locator('summary').click();const response=page.waitForResponse(r=>r.url().includes('/participant/recovery?'));await page.getByTestId('guest-recovery-copy').click();const r=await response;assert.equal(r.status(),200);return (await r.json()).data.recoveryUrl;}
try{
 for(const [engineName,engine]of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch(),contexts=await Promise.all([0,1,2].map(()=>browser.newContext({baseURL:base,viewport:{width:390,height:844},isMobile:true,hasTouch:true})));
  await Promise.all(contexts.map(c=>bootstrap(c.request)));
  try{
   const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
   const poll=await call(api,'/api/v1/time-polls','POST',{title:'[QA] '+phase+' private identity '+engineName,timeZone:'Europe/Berlin',dates:[date],startMinute:540,endMinute:720,durationMinutes:60,expectedCount:3},true,201);
   state.plans.push({phase,engine:engineName+'-new',token:poll.token});await persist();
   const publicPath='/api/public/time-polls/'+poll.token,nativePath='/api/v1/time-polls/'+poll.token;
   await call(api,nativePath+'/response','PUT',{displayName:'Host',slotIds:[0,1]},true);
   let a=await contexts[0].newPage();const b=await contexts[1].newPage();
   await a.goto('/time-polls/'+poll.token);await enter(a,'同名游客');const link=await recovery(a);
   assert.equal(new URL(link).origin,'https://www.sideseat.de');assert.equal(new URL(link).search,'');
   await save(a,0);const first=await call(contexts[0].request,publicPath);
   assert.deepEqual(first.mySlotIds,[0,1]);assert(contexts[0]!==contexts[1]);
   const responseId=first.participants.find(p=>p.isMe).id;
   await a.close();a=await contexts[0].newPage();await a.goto('/time-polls/'+poll.token);
   await a.getByTestId('time-poll-cell-0').waitFor();assert.equal((await call(contexts[0].request,publicPath)).viewerId,first.viewerId);
   await save(a,2);
   await b.goto('/time-polls/'+poll.token);await enter(b,'同名游客');await save(b,4);
   const second=await call(contexts[1].request,publicPath);assert.notEqual(second.viewerId,first.viewerId);assert.deepEqual(second.mySlotIds,[4,5]);assert.equal(second.participants.length,3);
   await call(contexts[1].request,publicPath+'/response','PUT',{participantId:first.viewerId,displayName:'同名游客',slotIds:[]},false,401);
   await call(contexts[1].request,publicPath+'/participant','PATCH',{participantId:first.viewerId,displayName:'Other'},false,401);
   await call(contexts[1].request,publicPath+'/participant/recovery?participantId='+first.viewerId,'GET',undefined,false,401);
   await contexts[0].clearCookies();await a.evaluate(()=>localStorage.clear());await bootstrap(contexts[0].request);await a.reload();await a.getByLabel('你的名字',{exact:true}).waitFor();
   assert.equal((await call(contexts[0].request,publicPath)).viewerId,null);
   const urls=[];a.on('request',r=>urls.push(r.url()));await a.goto(localLink(link));await a.getByText('已恢复你的填写，可以继续修改。',{exact:true}).waitFor();
   assert.equal(new URL(a.url()).hash,'');assert(!urls.some(url=>url.includes(key(link))));
   const recovered=await call(contexts[0].request,publicPath);assert.equal(recovered.viewerId,first.viewerId);assert.deepEqual(recovered.mySlotIds,[0,1,2,3]);assert.equal(recovered.participants.find(p=>p.isMe).id,responseId);
   await contexts[2].request.post(publicPath+'/participant/recovery',{data:{credential:key(link)}}).then(r=>assert.equal(r.status(),200));
   assert.equal((await call(contexts[2].request,publicPath)).viewerId,first.viewerId);
   await save(a,2);assert.deepEqual((await call(contexts[1].request,publicPath)).mySlotIds,[4,5]);
   await a.getByTestId('plan-collection-timetable').screenshot({path:path.join(artifactDir,phase+'-'+engineName+'-restored.png')});
   const roster=await call(api,nativePath,'GET',undefined,true);assert.equal(roster.participants.filter(p=>p.isGuest).length,2);
   await call(api,nativePath+'/invitations','POST',{version:0,start:poll.slots[0].start,attendeeIds:roster.participants.map(p=>p.id)},true);
   await call(contexts[1].request,publicPath+'/invitation-response','PUT',{participantId:first.viewerId,status:'ACCEPTED',version:1},false,401);
   for(const page of[a,b]){await page.reload();const response=page.waitForResponse(r=>r.url().endsWith('/invitation-response')&&r.request().method()==='PUT');await page.getByRole('button',{name:'确认参加',exact:true}).click();assert.equal((await response).status(),200);}
   await call(api,nativePath+'/publish','POST',{version:1},true);
   const confirmed=await call(api,nativePath,'GET',undefined,true);assert.equal(confirmed.phase,'CONFIRMED');assert.equal(confirmed.invitations.filter(p=>p.isGuest&&p.status==='ACCEPTED').length,2);
   const schedule=await call(api,'/api/v1/home/schedule?windowStart='+date+'T00:00:00.000Z&windowEnd='+date+'T23:59:59.000Z','GET',undefined,true);
   assert.equal(schedule.studyEntries.filter(p=>p.timePollToken===poll.token).length,1);
   await a.reload();await a.getByRole('heading',{name:'计划已确定',exact:true}).waitFor();await a.getByTestId('plan-invitation').screenshot({path:path.join(artifactDir,phase+'-'+engineName+'-confirmed.png')});
   results.push({engine:engineName,flow:'first fill → return → same-name isolation → clear browser data → private recovery → independent invitation replies → organizer Calendar',passed:true});
   // This record was created against the previous production build, before staging.
   const legacy=state.plans.find(p=>p.phase===phase&&p.engine===engineName),oldPath='/api/public/time-polls/'+legacy.token,oldNative='/api/v1/time-polls/'+legacy.token;
   await contexts[2].clearCookies();await bootstrap(contexts[2].request);
   await contexts[2].addCookies([{name:'sideseat_poll_participant',value:legacy.guestId,domain:new URL(base).hostname,path:oldPath,httpOnly:true,secure:true,sameSite:'Lax'}]);
   const noProof=await call(contexts[2].request,oldPath);assert.equal(noProof.viewerId,null);assert(noProof.legacyGuestNeedsRecovery);
   await call(contexts[2].request,oldPath+'/response','PUT',{participantId:legacy.guestId,displayName:'旧游客',slotIds:[]},false,401);
   const oldPage=await contexts[2].newPage();await oldPage.goto('/time-polls/'+legacy.token);await oldPage.getByTestId('legacy-guest-recovery').waitFor();
   const sameName=await call(contexts[1].request,oldPath+'/participant','POST',{displayName:'旧游客'});assert.notEqual(sameName.viewerId,legacy.guestId);
   await call(contexts[2].request,oldNative+'/guest-recovery','POST',{participantId:legacy.responseId},false,401);
   const issued=await call(api,oldNative+'/guest-recovery','POST',{participantId:legacy.responseId},true);
   await oldPage.goto(localLink(issued.recoveryUrl));await oldPage.getByText('已恢复你的填写，可以继续修改。',{exact:true}).waitFor();
   const restored=await call(contexts[2].request,oldPath);assert.equal(restored.viewerId,legacy.guestId);assert.deepEqual(restored.mySlotIds,[0,1]);assert.equal(restored.participants.find(p=>p.isMe).id,legacy.responseId);
   await call(api,oldNative+'/guest-recovery','POST',{participantId:legacy.responseId},true,409);
   await oldPage.getByTestId('plan-collection-timetable').screenshot({path:path.join(artifactDir,phase+'-'+engineName+'-legacy-restored.png')});
   results.push({engine:engineName,flow:'real old-format row → unsigned cookie denied → same name creates independent guest → organizer reissues → old response restored in place → organizer reset denied after claim',passed:true});
  }finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();}
 }
 await fs.writeFile(path.join(artifactDir,phase+'-browser-results.json'),JSON.stringify({phase,base,passed:true,results,at:new Date().toISOString()},null,2)+'\n');
 console.log(phase+': '+results.length+' browser/data flows passed. Private links omitted from evidence.');
}catch(error){await fs.writeFile(path.join(artifactDir,phase+'-browser-results.json'),JSON.stringify({phase,base,passed:false,results,error:String(error.message).replace(/#recover=\S+/g,'#recover=[redacted]'),at:new Date().toISOString()},null,2)+'\n');throw new Error('Guest identity flow stopped at a failed boundary; see private log and redacted evidence.');}
finally{await api.dispose();}
