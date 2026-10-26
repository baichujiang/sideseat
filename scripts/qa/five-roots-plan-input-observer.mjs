// Read-only production oracle for the owned physical date/cross-day case.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fromZonedTime } from 'date-fns-tz';
import { base, privatePath, readFixture, call, route, calendars, assertCalendarRows, persist } from './plan-six-participant-phone.mjs';
const [logPath] = process.argv.slice(2);
const appBuild = Number(process.env.SIDESEAT_QA_UI_BUILD || '238');
assert(Number.isSafeInteger(appBuild) && appBuild > 0);
const root = '/tmp/sideseat-five-roots-private';
assert.equal(base, 'https://api.sideseat.de');
assert.equal(privatePath, root + '/plan-tmp/sideseat-plan-six-private.json');
assert(logPath?.startsWith(root + '/plan-input-') && logPath.endsWith('.log'));
const out = process.env.SIDESEAT_QA_OUTPUT;
assert(out?.startsWith(root + '/plan-input-'));
await fs.mkdir(out, { recursive: true, mode: 0o700 });
const f = await readFixture();
assert.equal(f.kind, 'five-roots-plans-live'); assert.equal(f.schemaVersion, 1);
assert.equal(f.baseURL, base); assert(/^[a-f0-9]{8}$/.test(f.runID)); assert.equal(f.accounts.length, 6);
assert(f.accounts.every(a => a.identifier === `pqa_six_${a.role}_${f.runID}`));
assert(f.pollToken && f.tokens.includes(f.pollToken));
const owner = f.accounts.find(a => a.role === 'owner');
const title = f.edgePrefix + ' 日期跨月';
const phases = ['dates-cleared', 'dates-repeated', 'dates-cross-month', 'created', 'final-cross-day-selected', 'invited', 'published', 'calendar-verified'];
const sha = v => createHash('sha256').update(v).digest('hex');
const stable = p => JSON.stringify({ phase: p.phase, invitationVersion: p.invitationVersion,
  chosenStart: p.chosenStart, chosenEnd: p.chosenEnd,
  people: p.participants.map(x => ({ id: x.id, slots: x.slotIds })),
  invitations: p.invitations.map(x => ({ id: x.id, selected: x.selected, status: x.status })) });
const main = await call(route({token:f.pollToken}), owner);
assert.equal(main.phase, 'CANCELLED', 'Finish the main mixed flow before this case.');
const mainBefore = stable(main);
const checks = []; let token, range, failure, completed = false;
const report = () => fs.writeFile(path.join(out, 'input-real-flow.json'), JSON.stringify({
  passed: completed && !failure, appBuild, physicalDevice:'default iPhone14Plus',
  phases, checks, businessWrites:'Physical App UI only; this observer uses GET and local fixture bookkeeping',
  mainPlanUnchanged:true, runSHA256:sha(f.runID),
  failure:failure ? {message:'Failed input boundary; private diagnostics retained.'}:null,
},null,2)+'\n', {mode:0o600});
async function verify(phase) {
  assert.equal(stable(await call(route({token:f.pollToken}), owner)), mainBefore, 'Do not change the main plan.');
  const own = (await call('/api/v1/time-polls',owner)).polls;
  assert(own.every(p => p.token===f.pollToken || p.title===title), 'Do not create an unrelated plan.');
  const matching=own.filter(p=>p.isOwner&&p.title===title);
  if(phases.indexOf(phase)<phases.indexOf('created')){
    assert.equal(matching.length,0,'Date changes remain an unsubmitted creation draft.');
    return {phase,ownedInputPlans:0,mainPlanUnchanged:true};
  }
  assert.equal(matching.length,1,'Native creation must create exactly one owned plan.');
  if(!token){token=matching[0].token;if(!f.tokens.includes(token))f.tokens.push(token);await persist(f);}
  assert.equal(matching[0].token,token);
  const p=await call(route({token}),owner);
  assert.equal(p.title,title);assert.equal(p.location,'日期跨月验证');assert.equal(p.timeZone,'Europe/Berlin');
  assert.equal(p.summary.participantCount,0);assert.equal(p.participants.length,0);assert.deepEqual(p.mySlotIds,[]);
  assert(range,'Native expected range marker is required.');
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
  const dateKey=iso=>{const parts=Object.fromEntries(fmt.formatToParts(new Date(iso)).map(x=>[x.type,x.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
  assert.deepEqual([...new Set(p.slots.map(s=>dateKey(s.start)))].sort(),range.dates);
  const expectedStart=fromZonedTime(range.dates[0]+'T23:00:00','Europe/Berlin').getTime();
  const expectedEnd=fromZonedTime(range.dates[1]+'T01:00:00','Europe/Berlin').getTime();
  assert.equal(expectedEnd-expectedStart,2*60*60*1000);
  const invited=phases.indexOf(phase)>=phases.indexOf('invited');
  if(invited){
    assert.equal(Date.parse(p.chosenStart),expectedStart);assert.equal(Date.parse(p.chosenEnd),expectedEnd);
    assert.equal(p.invitationVersion,1);assert.equal(p.expectedCount,2);
    const selected=p.invitations.filter(x=>x.selected);assert.equal(selected.length,1);
    assert.equal(selected[0].displayName,owner.displayName);assert.equal(selected[0].isGuest,false);assert.equal(selected[0].status,'ACCEPTED');
  }else{assert.equal(p.phase,'COLLECTING');assert.equal(p.invitationVersion,0);assert.equal(p.chosenStart,null);assert.equal(p.chosenEnd,null);}
  const published=phases.indexOf(phase)>=phases.indexOf('published');
  assert.equal(p.phase,published?'CONFIRMED':invited?'INVITING':'COLLECTING');
  const calendar=await calendars(p,f.accounts);assertCalendarRows(p,f.accounts,calendar,published?['owner']:[]);
  if(published){
    for(const a of f.accounts){const search=await call('/api/v1/calendar/search?q='+encodeURIComponent(title),a);assert.equal(search.results.filter(x=>x.timePollToken===token).length,a.role==='owner'?1:0);}
  }
  return {phase,actualPhase:p.phase,submissions:0,invitationVersion:p.invitationVersion,
    exactCrossDayRangeChecked:invited,calendarCounts:Object.fromEntries(f.accounts.map((a,i)=>[a.role,calendar.rows[i].length])),mainPlanUnchanged:true};
}
try{
 const deadline=Date.now()+30*60_000;
 while(Date.now()<deadline){
  const log=await fs.readFile(logPath,'utf8').catch(()=> '');
  const marker=log.match(/PLAN_INPUT_EXPECTED_RANGE (\d{4}-\d\d-\d\d)T23:00 (\d{4}-\d\d-\d\d)T01:00 Europe\/Berlin/);
  if(marker&&!range){range={dates:[marker[1],marker[2]]};assert.notEqual(marker[1].slice(0,7),marker[2].slice(0,7));assert.equal(Date.parse(marker[2])-Date.parse(marker[1]),86_400_000);}
  for(const [,phase]of log.matchAll(/PLAN_INPUT_PHASE ([a-z-]+)/g)){
   assert(phases.includes(phase));if(checks.some(x=>x.phase===phase))continue;assert.equal(phase,phases[checks.length]);
   checks.push(await verify(phase));await report();console.log('PLAN_INPUT_API verified '+phase);
  }
  if(log.includes('** TEST EXECUTE FAILED **')||/Test Case .*FiveRootPlanInputPhoneUITests.* failed/.test(log)||/xcodebuild: error:/.test(log))throw Error('Native input run failed.');
  if(log.includes('** TEST EXECUTE SUCCEEDED **')){assert(/Executed 1 test, with 0 failures/.test(log));assert.equal(checks.length,phases.length);completed=true;break;}
  await new Promise(r=>setTimeout(r,250));
 }
 assert(completed,'The full physical case must execute and pass.');
}catch(e){failure=e;await fs.writeFile(path.join(out,'private-failure.txt'),String(e?.stack),{mode:0o600});}
await report();if(failure){console.error('Plan input boundary failed; inspect private diagnostics.');process.exitCode=1;}
