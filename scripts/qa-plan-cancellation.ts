/** Real HTTP + local PostgreSQL acceptance. Creates and removes only its own accounts. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { PlanRequestDto } from "../lib/api/v1/plans-service";
const dbURL = new URL(process.env.DATABASE_URL!);
assert(["127.0.0.1", "localhost"].includes(dbURL.hostname));
const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:3033";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const db = new PrismaClient();
const suffix = randomUUID().slice(0,8);
const users: string[] = [];
const tokens: string[] = [];
const passed: string[] = [];
async function api(who: number, path: string, method = "GET", body?: unknown, expected = 200, key = randomUUID()) {
 const response = await fetch(base+path, {method, headers: {"Content-Type":"application/json", ...(tokens[who] ? {Authorization:`Bearer ${tokens[who]}`} : {}), "Idempotency-Key":key}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
 const result = await response.json();
 assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
 return result.data;
}
const window = (hours = 24) => ({startTime:new Date(Date.now()+hours*3600000).toISOString(), endTime:new Date(Date.now()+(hours+1)*3600000).toISOString()});
async function intention(who: number, hours = 24) {
 const time = window(hours);
 return api(who,"/api/v1/me/weekly-intents","POST",{topic:"COFFEE",activityText:"Campus coffee",timeWindows:[{startAt:time.startTime,endAt:time.endTime}],timeZone:"Europe/Berlin",exploreVisible:true,note:"Meet at the campus cafe"},201);
}
async function main() {
 try {
  for(let i=0;i<3;i++) {
   const username=`cancelqa_${suffix}_${i}`;
   const user=await db.user.create({data:{username,nickname:`Cancel QA ${i}`,hashedPassword:await bcrypt.hash("LocalQa123!",10),school:"TUM",onboardingComplete:true,verifiedStudent:true,productTutorialDismissedAt:new Date(),userLanguages:{create:{tag:"ENGLISH",proficiency:"FLUENT"}}}});
   users.push(user.id);
   const login=await api(i,"/api/v1/auth/login","POST",{identifier:username,password:"LocalQa123!",device:{id:`cancel-${suffix}-${i}`,name:"Local QA",appVersion:"1.0.0",platformVersion:"26.5"}});
   tokens.push(login.tokens.accessToken);
  }
  await intention(0);
  const peer=await intention(1);
  const explore=await api(0,"/api/v1/explore/intents?limit=24");
  assert(JSON.stringify(explore).includes(peer.intent.id),"Peer's public intention appears in exploration");
  const opp=await api(0,`/api/v1/explore/intents/${peer.intent.id}/contact`,"POST",{});
  const interact=(who:number,action:string,body?:string)=>api(who,`/api/v1/me/mutual-opportunities/${opp.id}/interaction`,"POST",{action,...(body?{body}:{})});
  assert.equal((await interact(0,"BOOKMARK")).isBookmarked,true);
  await interact(0,"SEND","Hello, may I join?");
  const reply=await interact(1,"REPLY","Yes, let's meet!");
  const connection=reply.coordination.connectionId;
  passed.push("intention → exploration → bookmark → greeting → reply → chat");
  async function proposal(hours=24) {
   return (await api(0,`/api/v1/connections/${connection}/plans`,"POST",{title:"Cancellation QA coffee",planType:"CUSTOM",...window(hours)},201)).plan;
  }
  async function bindCommitment(plan: PlanRequestDto) {
   if(plan.commitmentId) return plan;
   await db.$transaction(async tx=>{
    const c=await tx.planCommitment.create({data:{connectionId:connection,participantAId:users[0],participantBId:users[1],status:"NEGOTIATING"}});
    await tx.planRequest.update({where:{id:plan.id},data:{commitmentId:c.id,revisionKind:"INITIAL"}});
    await tx.planCommitment.update({where:{id:c.id},data:{status:"CONFIRMED",currentAcceptedRevisionId:plan.id,confirmedAt:new Date()}});
    await tx.calendarEntry.updateMany({where:{planRequestId:plan.id},data:{planCommitmentId:c.id}});
   });
   return (await api(0,`/api/v1/plans/${plan.id}`)).plan;
  }
  let plan=await proposal();
  await api(1,`/api/v1/plans/${plan.id}/accept`,"POST");
  plan=await bindCommitment(plan);
  assert.equal(await db.calendarEntry.count({where:{planRequestId:plan.id,projectionStatus:"ACTIVE"}}),2);
  await api(2,`/api/v1/plans/${plan.id}/cancel`,"POST",{},404);
  const results=await Promise.all([api(1,`/api/v1/plans/${plan.id}/cancel`,"POST",{reasonCode:"SCHEDULE_CHANGED",note:"Sorry, another time!"}),api(1,`/api/v1/plans/${plan.id}/cancel`,"POST",{reasonCode:"SCHEDULE_CHANGED",note:"Sorry, another time!"})]);
  assert(results.every(r=>r.plan.status==="CANCELED"));
  assert.equal(await db.calendarEntry.count({where:{planRequestId:plan.id,projectionStatus:"ACTIVE"}}),0);
  assert.equal(await db.planCancellationNotice.count({where:{planId:plan.id}}),1);
  for (const who of [0,1]) assert.equal((await api(who,`/api/v1/plans/${plan.id}`)).plan.status,"CANCELED");
  const notices=await api(0,"/api/v1/me/plan-cancellations");
  assert.equal(notices.notices.length,1);assert.equal(notices.notices[0].plan.id,plan.id);
  assert.equal((await api(1,"/api/v1/me/plan-cancellations")).notices.length,0);
  await api(2,`/api/v1/me/plan-cancellations/${notices.notices[0].id}`,"PATCH",undefined,404);
  await api(0,`/api/v1/me/plan-cancellations/${notices.notices[0].id}`,"PATCH");
  assert.equal((await api(0,"/api/v1/me/plan-cancellations")).notices.length,0);
  await api(0,`/api/v1/plans/${plan.id}/outcome`,"POST",{value:"OCCURRED"},422);
  await api(0,`/api/v1/connections/${connection}/messages`,"POST",{type:"TEXT",body:"No problem, we can still chat."},201);
  const messages=await api(1,`/api/v1/connections/${connection}/messages`);
  assert(messages.messages.some((m:{body?:string})=>m.body==="No problem, we can still chat."));
  assert(messages.messages.some((m:{planRequest?:{cancellation?:{note?:string}}})=>m.planRequest?.cancellation?.note==="Sorry, another time!"));
  passed.push("receiver cancels confirmed plan → both calendars clear → one durable notice → acknowledge → no repeat → chat preserved");
  plan=await proposal(1);
  await api(1,`/api/v1/plans/${plan.id}/accept`,"POST");
  await api(0,`/api/v1/plans/${plan.id}/cancel`,"POST",{},422);
  assert.equal(await db.calendarEntry.count({where:{planRequestId:plan.id,projectionStatus:"ACTIVE"}}),2);
  await api(0,`/api/v1/plans/${plan.id}/cancel`,"POST",{reasonCode:"UNWELL"});
  assert.equal((await api(1,"/api/v1/me/plan-cancellations")).notices[0].isLate,true);
  passed.push("late cancellation requires reason; validation failure leaves plan/calendar intact");
  plan=await proposal(48);
  await api(1,`/api/v1/plans/${plan.id}/cancel`,"POST",{},409);
  await api(0,`/api/v1/plans/${plan.id}/cancel`,"POST",{});
  passed.push("pending proposal can only be withdrawn by its proposer");
  // Confirmed plan plus unaccepted reschedule: withdrawing the revision preserves both old calendar entries.
  plan=await proposal(72);
  await api(1,`/api/v1/plans/${plan.id}/accept`,"POST");
  plan=await bindCommitment(plan);
  // The v1 counter endpoint handles pending offers only. Seed a valid V2 reschedule revision to exercise cancellation of that supported state.
  const counter=await db.$transaction(async tx=>{
    const time=window(73);
    const revision=await tx.planRequest.create({data:{connectionId:connection,commitmentId:plan.commitmentId,counterOfId:plan.id,revisionKind:"RESCHEDULE",proposerUserId:users[0],receiverUserId:users[1],status:"PENDING",title:plan.title,planType:"CUSTOM",startTime:new Date(time.startTime),endTime:new Date(time.endTime)}});
    await tx.planCommitment.update({where:{id:plan.commitmentId},data:{currentPendingRevisionId:revision.id}});
    return revision;
  });
  await api(0,`/api/v1/plans/${counter.id}/cancel`,"POST",{});
  assert.equal((await api(0,`/api/v1/plans/${plan.id}`)).plan.status,"ACCEPTED");
  assert.equal(await db.calendarEntry.count({where:{planRequestId:plan.id,projectionStatus:"ACTIVE"}}),2);
  passed.push("withdraw reschedule preserves the confirmed plan");
  // Completion branch uses a controlled clock shift only; outcomes still go through authenticated HTTP.
  await db.$transaction(async tx=>{
   await tx.planRequest.update({where:{id:plan.id},data:{startTime:new Date(Date.now()-7200000),endTime:new Date(Date.now()-3600000)}});
   await tx.calendarEntry.updateMany({where:{planRequestId:plan.id},data:{startAt:new Date(Date.now()-7200000),endAt:new Date(Date.now()-3600000)}});
  });
  await api(0,`/api/v1/plans/${plan.id}/cancel`,"POST",{},409);
  for(const who of [0,1]) await api(who,`/api/v1/plans/${plan.id}/outcome`,"POST",{value:"OCCURRED"});
  assert.equal(await db.sharedEncounter.count({where:{planId:plan.id}}),1);
  await api(1,`/api/v1/connections/${connection}/messages`,"POST",{type:"TEXT",body:"Thanks for meeting!"},201);
  const fresh=await intention(0,96);const nextPeer=await intention(2,96);
  assert.notEqual(fresh.intent.id,peer.intent.id);
  const next=await api(0,`/api/v1/explore/intents/${nextPeer.intent.id}/contact`,"POST",{});
  assert.notEqual(next.id,opp.id);
  assert.equal((await db.connection.findUniqueOrThrow({where:{id:connection}})).status,"ACTIVE");
  passed.push("complete plan → bilateral outcomes → shared encounter → continue chat → new intention → new companion");
  console.log(JSON.stringify({result:"PASS",passed},null,2));
 } finally { await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
