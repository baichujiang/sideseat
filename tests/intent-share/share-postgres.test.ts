import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
const resolver = Module as typeof Module & { _resolveFilename: (request:string,...args:unknown[])=>string };
const original=resolver._resolveFilename;
resolver._resolveFilename=function(request,...args) {
 if (request==='next/server') return fileURLToPath(new URL('../v2/next-server-after-test-stub.cjs',import.meta.url));
 return request==='server-only'?fileURLToPath(new URL('../v2/server-only-test-stub.cjs',import.meta.url)):original.call(this,request,...args);
};
const local=process.env.DATABASE_URL && ['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname);
test('shared intention → private anonymous greeting → native reply → guest upgrade keeps conversation', {skip:!local}, async()=>{
 const db=new PrismaClient(); const ids:string[]=[];
 const s=await import('../../lib/intent-share/service');
 const {listOpportunityMessageRequests,interactWithOpportunity}=await import('../../lib/v2/mutual-opportunities');
 try {
 const owner=await db.user.create({data:{username:`share_host_${randomUUID().slice(0,8)}`,hashedPassword:'test-only',nickname:'Alex',school:'TUM',verifiedStudent:true,onboardingComplete:true}});ids.push(owner.id);
 const intent=await db.weeklyIntent.create({data:{userId:owner.id,topic:'COFFEE',activityText:'Coffee after class',timeWindows:[],timePreference:{kind:'UNDECIDED'},exploreVisible:true}});
 assert.equal(await s.publicIntention('0'.repeat(48)),null);
 await assert.rejects(s.enableIntentionShare('other',intent.id));
 const token=await s.enableIntentionShare(owner.id,intent.id);
 assert.equal(await s.enableIntentionShare(owner.id,intent.id),token);
 const shared=await s.publicIntention(token);assert(shared);assert.equal(shared.title,'Coffee after class');assert(!('userId' in shared));assert(!('school' in shared));
 const guest=await s.createShareGuest();ids.push(guest.id);assert.equal(guest.school,null);assert(guest.isGuest);assert.equal(guest.verifiedStudent,false);
 const stranger=await s.createShareGuest();ids.push(stranger.id);
 const key=randomUUID();const sent=await s.sendShareMessage(token,guest.id,'Hi, can I join?',key);
 assert('opportunityId' in sent && sent.opportunityId);
 await s.sendShareMessage(token,guest.id,'Hi, can I join?',key);
 assert.equal(await db.mutualOpportunityMessageRequest.count({where:{senderId:guest.id}}),1);
 assert.equal((await s.sharedConversation(token,stranger.id)).state,'NEW');
 assert.equal((await s.sharedConversation(token,guest.id)).state,'WAITING');
 const inbox=await listOpportunityMessageRequests(owner.id);assert.equal(inbox.length,1);assert.equal(inbox[0]?.messageRequest?.body,'Hi, can I join?');
 const replied=await interactWithOpportunity({userId:owner.id,opportunityId:sent.opportunityId,action:'REPLY',body:'Yes! Tomorrow at 3?'});
 assert(replied.coordination);
 assert.equal((await s.sharedConversation(token,guest.id)).messages.length,2);
 await s.sendShareMessage(token,guest.id,'Perfect!',randomUUID());
 const username=`join_${randomUUID().slice(0,8)}`;
 await s.registerShareGuest(guest.id,username,'LocalTest123!');
 const upgraded=await db.user.findUniqueOrThrow({where:{id:guest.id}});assert.equal(upgraded.isGuest,false);assert.equal(upgraded.username,username);assert.equal(upgraded.school,null);
 assert.equal((await s.sharedConversation(token,guest.id)).messages.length,3);
 await db.block.create({data:{blockerId:owner.id,blockedId:guest.id}});
 await assert.rejects(s.sharedConversation(token,guest.id));await assert.rejects(s.sendShareMessage(token,guest.id,'Blocked',randomUUID()));
 await db.weeklyIntent.update({where:{id:intent.id},data:{shareToken:null}});assert.equal(await s.publicIntention(token),null);
 } finally {await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();}
});
