import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
const url=process.env.DATABASE_URL;
if (!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.includes('intent_share_test')) throw new Error('Use the isolated local intention-share database.');
const db=new PrismaClient();
async function main(){
 const user=await db.user.upsert({where:{username:'share_preview_host'},update:{},create:{username:'share_preview_host',nickname:'Alex · 体验账号',hashedPassword:await bcrypt.hash('SharePreview123!',12),onboardingComplete:true,verifiedStudent:true,school:'TUM'}});
 const old=await db.weeklyIntent.findFirst({where:{userId:user.id,exploreResponseToId:null}});
 const base=new Date();base.setDate(base.getDate()+1);base.setHours(15,0,0,0);
 const windows=[0,1].map(i=>({startAt:new Date(base.getTime()+i*86400000).toISOString(),endAt:new Date(base.getTime()+i*86400000+3600000).toISOString()}));
 const data={activityText:'下课后，一起喝杯咖啡',note:'想找个人聊聊最近的生活，也可以一起安静地坐一会儿。地点我们再商量。',timeWindows:windows,timePreference:{kind:'EXACT'},expiresAt:new Date(base.getTime()+2*86400000)};
 const intent=old?await db.weeklyIntent.update({where:{id:old.id},data}):await db.weeklyIntent.create({data:{...data,userId:user.id,topic:'COFFEE',exploreVisible:true,shareToken:randomBytes(24).toString('hex')}});
 console.log(JSON.stringify({intentId:intent.id,url:`http://localhost:3106/share/intent/${intent.shareToken}?lang=zh-CN`}));
}
main().finally(()=>db.$disconnect());
