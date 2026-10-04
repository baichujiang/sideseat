/** Real browser/native acquisition QA. Only seeds the owner; all business writes use UI. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert(["/sideseat_preview93_share_20261004", "/sideseat_preview93_share_final_20261004", "/sideseat_preview93_share_pass_20261004", "/sideseat_preview93_share_complete_20261004"].includes(url.pathname));
const db = new PrismaClient();
const title = "[share93] Coffee after class";
async function main() {
 const mode = process.argv[2];
 if (mode === "seed") {
  assert.equal(await db.user.count(), 0);
  assert(process.env.SIDESEAT_QA_PASSWORD);
  await db.user.create({ data: { username: "share93_owner", nickname: "Share Alex", nicknameKey: "share alex",
   hashedPassword: await bcrypt.hash(process.env.SIDESEAT_QA_PASSWORD, 10), school: "TUM", avatarUrl: "p02",
   studentStatus: "CURRENT_STUDENT", degreeLevel: "BACHELOR", major: "Informatics", semester: 2,
   onboardingComplete: true, verifiedStudent: true, studentVerificationStatus: "VERIFIED",
   productTutorialDismissedAt: new Date(), userLanguages: { create: { tag: "ENGLISH", proficiency: "FLUENT" } } } });
  console.log(JSON.stringify({ result: "PASS", mode, users: 1, intentions: 0, plans: 0 })); return;
 }
 const owner = await db.user.findUniqueOrThrow({ where: { username: "share93_owner" } });
 const intent = await db.weeklyIntent.findFirstOrThrow({ where: { userId: owner.id, activityText: title } });
 assert(intent.shareToken);
 const windows = intent.timeWindows as {startAt: string;endAt: string}[];
 assert.equal(windows.length, 1);
 assert.equal((intent.timePreference as {kind: string}).kind, "EXACT");
 assert(new Date(windows[0]!.endAt) > new Date(windows[0]!.startAt));
 if (mode === "shared") {
  assert.equal(intent.status,"ACTIVE"); assert(intent.expiresAt && intent.expiresAt > new Date());
  assert.equal(await db.user.count(), 1); assert.equal(await db.planRequest.count(), 0);
  if (process.env.SIDESEAT_QA_BRIDGE_FILE) writeFileSync(process.env.SIDESEAT_QA_BRIDGE_FILE, JSON.stringify({
   sharePath: `/share/intent/${intent.shareToken}?lang=zh-CN`, intentId: intent.id, ownerId: owner.id, title, windows, timeZone: intent.timeZone,
  }), {mode: 0o600});
  console.log(JSON.stringify({result:"PASS",mode,intentId:intent.id,title,windows,timeZone:intent.timeZone,users:1,plans:0},null,2)); return;
 }
 assert(["verify","verify-web-fallback"].includes(mode));
 const nativeContinuation = mode === "verify";
 const guest = await db.user.findUniqueOrThrow({where:{username:"share93_guest"}});
 assert.equal(guest.isGuest,false); assert.equal(await db.user.count(),2);
 const plan = await db.planRequest.findFirstOrThrow({where:{title,status:"ACCEPTED"}});
 assert.equal(plan.proposerUserId,owner.id); assert.equal(plan.receiverUserId,guest.id);
 assert.equal(plan.originKind,"MUTUAL_OPPORTUNITY"); assert.equal(await db.planRequest.count(),1);
 assert.equal(await db.connection.count(),1); assert.equal(intent.status,"ENDED");
 const entries=await db.calendarEntry.findMany({where:{planRequestId:plan.id}});
 assert.equal(entries.length,2);assert.deepEqual(new Set(entries.map(e=>e.userId)),new Set([owner.id,guest.id]));
 assert(entries.every(e=>e.projectionStatus==="ACTIVE"&&e.startAt.getTime()===plan.startTime.getTime()&&e.endAt.getTime()===plan.endTime.getTime()));
 for(const body of ["[share93] Hello from the shared link","[share93] Yes, I will invite you",nativeContinuation?"[share93] Continuing in the app":"[share93] Continuing from the browser","[share93] We can keep chatting here"]){
  assert.equal(await db.message.count({where:{connectionId:plan.connectionId,body}}),1,body);
 }
 const intro=await db.mutualOpportunityMessageRequest.findFirstOrThrow({where:{senderId:guest.id}});
 assert.equal(intro.senderId,guest.id);
 console.log(JSON.stringify({result:nativeContinuation?"PASS":"PASS_WEB_FALLBACK",nativeContinuationVerified:nativeContinuation,mode,ownerId:owner.id,guestId:guest.id,guestUpgradedInPlace:true,users:2,
  connectionId:plan.connectionId,acceptedPlans:1,calendarEntries:2,sourceIntention:intent.status,planId:plan.id,
  sharedWindows:windows,confirmedPlan:{startAt:plan.startTime.toISOString(),endAt:plan.endTime.toISOString()},
  planMatchesOriginalWindow:windows.some(w=>w.startAt===plan.startTime.toISOString()&&w.endAt===plan.endTime.toISOString()),
  greetingReplyAndContinuationPreservedExactlyOnce:true},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
