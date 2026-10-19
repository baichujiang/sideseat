// The phone performs all interactions; this process checks real data and cleans disposable accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
const base = 'https://api.sideseat.de', mode = process.argv[2];
const privatePath = path.join(os.tmpdir(), 'sideseat-activity-phone-private.json');
const evidencePath = path.join(os.tmpdir(), 'sideseat-activity-phone-api.json');
async function api(route, account, method = 'GET', body, status = 200) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), 'x-sideseat-platform': 'ios', ...(account ? { Authorization: `Bearer ${account.accessToken}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(r.status, status, `${method} ${route}: ${r.status}`);
  return [200, 201].includes(status) ? (await r.json()).data : null;
}
async function login(account) {
  account.accessToken = (await api('/api/v1/auth/login', null, 'POST', { identifier: account.identifier, password: account.password, device: { id: randomUUID(), name: 'Activity plan physical verification', appVersion: '1.0.0', platformVersion: '26.6.1' } })).tokens.accessToken;
}
if (mode === 'prepare') {
  await assert.rejects(fs.access(privatePath));
  const fixture = { title: `Weekend ideas ${randomBytes(4).toString('hex')}`, bundle: 'app.sideseat.mobile.preview', accounts: [] };
  await fs.writeFile(privatePath, JSON.stringify(fixture), { mode: 0o600 });
  for (const role of ['owner', 'participant']) {
    const account = { role, identifier: `planqa_i133_${role === 'owner' ? 'host' : 'peer'}_${randomBytes(4).toString('hex')}`, password: randomBytes(22).toString('base64url') };
    await api('/api/auth/signup', null, 'POST', { username: account.identifier, password: account.password, displayName: role === 'owner' ? 'Host Ming' : 'Peer Lin', school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
    fixture.accounts.push(account); await fs.writeFile(privatePath, JSON.stringify(fixture), { mode: 0o600 });
    await login(account); await fs.writeFile(privatePath, JSON.stringify(fixture), { mode: 0o600 });
  }
  console.log('Two fresh activity-plan accounts prepared.');
} else {
  const fixture = JSON.parse(await fs.readFile(privatePath, 'utf8'));
  for (const a of fixture.accounts) { assert(a.identifier.startsWith('planqa_i133_')); if (!a.accessToken) await login(a); }
  const owner = fixture.accounts.find(a => a.role === 'owner'), peer = fixture.accounts.find(a => a.role === 'participant');
  async function poll() {
    const item = (await api('/api/v1/time-polls', owner)).polls.find(p => p.activitySelection?.topic === fixture.title);
    assert(item, 'The phone must create this activity plan.'); fixture.pollToken = item.token;
    await fs.writeFile(privatePath, JSON.stringify(fixture), { mode: 0o600 });
    return api(`/api/v1/time-polls/${item.token}`, owner);
  }
  async function calendar(p, account) {
    const day = (p.chosenStart || p.slots[0].start).slice(0, 10);
    return (await api(`/api/v1/home/schedule?windowStart=${day}T00:00:00Z&windowEnd=${day}T23:59:59Z`, account)).studyEntries.filter(e => e.timePollToken === fixture.pollToken);
  }
  async function verify(phase) {
    const p = await poll(), a = p.activitySelection;
    const [mine, calendars] = await Promise.all([api(`/api/v1/time-polls/${p.token}`, peer), Promise.all([calendar(p, owner), calendar(p, peer)])]);
    assert.equal(a.topic, fixture.title);
    const afterChoice = ['inviting','peer-review','peer-confirmed','all-confirmed','calendar-verified'].includes(phase);
    assert.equal(a.isOpen, !afterChoice);
    if (afterChoice) { assert.equal(p.title, 'Hotpot'); assert.equal(p.location, 'Town centre'); assert(a.selectedIdeaId); }
    else { assert.equal(p.title, fixture.title); assert.equal(a.selectedIdeaId, null); }
    const expectedIdeas = phase === 'created' ? 0 : phase === 'owner-suggested' ? 1 : ['peer-interested','peer-filled'].includes(phase) ? 2 : 3;
    assert.equal(a.ideas.length, expectedIdeas);
    if (!['created','owner-suggested'].includes(phase)) {
      assert(mine.activitySelection.hasParticipated);
      assert.equal(a.ideas.filter(i => i.interestedBy.some(x => x.displayName === 'Peer Lin')).length, 2);
      assert((await api('/api/v1/time-polls', peer)).polls.some(x => x.token === p.token));
    }
    if (['guest-interested','guest-filled',...['activity-chosen','owner-ready','inviting','peer-review','peer-confirmed','all-confirmed','calendar-verified']].includes(phase)) {
      assert.equal(a.ideas.filter(i => i.interestedBy.some(x => x.displayName === 'Guest Lin')).length, 2);
    }
    const peerFilled = !['created','owner-suggested','peer-interested'].includes(phase);
    assert.deepEqual(mine.mySlotIds, peerFilled ? [0,1,2,3] : []);
    if (phase === 'peer-interested') assert.equal(mine.didRespond, false);
    const guestFilled = ['guest-filled','choice-draft','activity-chosen','owner-ready','inviting','peer-review','peer-confirmed','all-confirmed','calendar-verified'].includes(phase);
    const ownerFilled = ['owner-ready','choice-draft','inviting','peer-review','peer-confirmed','all-confirmed','calendar-verified'].includes(phase);
    assert.equal(p.participants.length, Number(peerFilled) + Number(guestFilled) + Number(ownerFilled));
    for (const person of p.participants) assert.deepEqual(person.slotIds,[0,1,2,3]);
    const complete = ['all-confirmed','calendar-verified'].includes(phase), inviting = ['inviting','peer-review','peer-confirmed'].includes(phase);
    assert.equal(p.phase, complete ? 'CONFIRMED' : inviting ? 'INVITING' : 'COLLECTING');
    assert.equal(p.invitationVersion, complete || inviting ? 1 : 0);
    const accepted = p.invitations.filter(i => i.selected && i.status === 'ACCEPTED').length;
    assert.equal(accepted, complete ? 3 : phase === 'peer-confirmed' ? 2 : inviting ? 1 : 0);
    for (const rows of calendars) { assert.equal(rows.length, complete ? 1 : 0); if (complete) assert.equal(rows[0].title,'Hotpot'); }
    if (complete) assert.equal(Date.parse(p.chosenEnd)-Date.parse(p.chosenStart),3600000);
    return { phase, ideaCount:a.ideas.length, activityChosen:afterChoice, participants:p.participants.length, accepted, phaseOnServer:p.phase, calendarCounts:calendars.map(x=>x.length), passed:true };
  }
  if (mode === 'observe') {
    const checks=[],seen=new Set(),deadline=Date.now()+18*60*1000;
    try {
      while(Date.now()<deadline) {
        const log=await fs.readFile(process.argv[3],'utf8').catch(()=> '');
        for(const [,phase] of log.matchAll(/ACTIVITY_PLAN_PHASE ([a-z-]+)/g)) {
          if(!seen.has(phase)){checks.push(await verify(phase));seen.add(phase);console.log(`Verified activity-plan boundary: ${phase}`);}
        }
        if(/\*\* TEST (?:EXECUTE )?(?:SUCCEEDED|FAILED) \*\*/.test(log))break;
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      assert(seen.has('calendar-verified'),'The activity flow must reach Calendar.');
    } finally {await fs.writeFile(evidencePath,JSON.stringify({checks},null,2));}
  } else if(mode==='cleanup') {
    const known=new Set(fixture.pollToken?[fixture.pollToken]:[]);
    for(const item of (await api('/api/v1/time-polls',owner)).polls) {
      known.add(item.token);let p=await api(`/api/v1/time-polls/${item.token}`,owner);assert(p.isOwner);
      if(['INVITING','CONFIRMED'].includes(p.phase))await api(`/api/v1/time-polls/${item.token}/cancel`,owner,'POST',{version:p.invitationVersion});
      await api(`/api/v1/time-polls/${item.token}`,owner,'DELETE');
    }
    for(const account of fixture.accounts){await api('/api/v1/me',account,'DELETE',{confirmUsername:account.identifier});await api('/api/v1/me',account,'GET',undefined,401);}
    for(const token of known)await api(`/api/public/time-polls/${token}`,null,'GET',undefined,404);
    const receipt={temporaryAccountsDeleted:fixture.accounts.length,remainingPlans:0,oldTokens401:fixture.accounts.length,links404:known.size};
    await fs.writeFile(path.join(os.tmpdir(),'sideseat-activity-phone-cleanup.json'),JSON.stringify(receipt,null,2));await fs.unlink(privatePath);console.log(receipt);
  } else throw Error('Use prepare, observe <log>, or cleanup.');
}
