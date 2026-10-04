import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { assertLocalTestDatabase } from './helpers/local-test-database';
assertLocalTestDatabase();
const db = new PrismaClient();

test.use({trace:'retain-on-failure'});

test('native share → browser guest → native invitation → registration → native continuity', async ({page, browser}, testInfo) => {
 test.setTimeout(900_000);
 const dir=process.env.SIDESEAT_SHARE_QA_DIR;
 expect(dir, 'Set the isolated run directory and native runner').toBeTruthy();
 const bridge=JSON.parse(readFileSync(join(dir!, 'bridge.json'),'utf8')) as {
  sharePath:string;intentId:string;ownerId:string;title:string;windows:{startAt:string;endAt:string}[];timeZone:string;
 };
 const password=process.env.SIDESEAT_QA_PASSWORD!;expect(password).toBeTruthy();
 const resume=process.env.SIDESEAT_SHARE_RESUME_ACCEPTED==='1';
 const summary:Record<string,unknown>=resume?JSON.parse(readFileSync(join(dir!,'browser-summary.json'),'utf8')):{};
 summary.resumedAfterRegistration=resume;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 async function native(name:string,method:string,env:Record<string,string>={}) {
  const log=createWriteStream(join(dir!,name+'-driver.log'));
  try {
   await new Promise<void>((resolve,reject)=>{
    const child=spawn('python3',[join(process.cwd(),'scripts/run-share-acquisition-native.py'),name,'SideSeatUITests/SocialLiveUITests/'+method],{env:{...process.env,...env}});
    child.stdout.pipe(log);child.stderr.pipe(log);
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${name} native UI failed (${code})`)));
   });
  } finally {log.end();}
  const result=JSON.parse(readFileSync(join(dir!,name+'-summary.json'),'utf8'));
  expect(result.passedTests).toBe(1);expect(result.failedTests).toBe(0);expect(result.skippedTests).toBe(0);
 }
 try {
  const copied=readFileSync(join(dir!, 'copied-share-url.txt'),'utf8').trim();
  expect(new URL(copied).pathname).toBe(bridge.sharePath.split('?')[0]);
  const destination=new URL(copied);destination.searchParams.set('lang','zh-CN');
  if(resume) await page.context().addCookies(JSON.parse(readFileSync(join(dir!,'browser-state-private.json'),'utf8')).cookies);
  await page.goto(destination.href);
  if(!resume) {
  await expect(page.getByRole('heading',{name:bridge.title,exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'我有空的时间',exact:true})).toBeVisible();
  const timeFormat=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:bridge.timeZone});
  const times=`${timeFormat.format(new Date(bridge.windows[0]!.startAt))} – ${timeFormat.format(new Date(bridge.windows[0]!.endAt))}`;
  await expect(page.getByRole('button',{name:new RegExp(times)})).toBeVisible();
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content',new RegExp(bridge.title.replace(/[\[\]]/g,'\\$&')));
  expect(await db.user.count()).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:join(dir!,'browser-01-public.png'),fullPage:true});
  await page.getByRole('button',{name:'联系我',exact:true}).click();
  const field=page.getByRole('textbox',{name:'打个招呼，或聊聊想约的时间…'});
  await field.fill('[share93] Hello from the shared link');await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect(page.getByText('招呼已送达，对方回复后会显示在这里。')).toBeVisible();
  const intro=await db.mutualOpportunityMessageRequest.findFirstOrThrow({where:{opportunity:{intentAId:bridge.intentId}}});
  const guestId=intro.senderId;expect((await db.user.findUniqueOrThrow({where:{id:guestId}})).isGuest).toBe(true);
  await page.screenshot({path:join(dir!,'browser-02-guest-greeting.png'),fullPage:true});
  const token=bridge.sharePath.split('?')[0]!.split('/').at(-1)!;
  await page.route(`**/api/public/intent-share/${token}`,route=>route.request().method()==='GET'?route.abort():route.continue());
  await expect(page.getByText('消息自动更新',{exact:true})).toBeVisible();
  const replySeen=expect(page.getByText('[share93] Yes, I will invite you',{exact:true})).toBeVisible({timeout:180_000}).then(()=>Date.now());
  const card=page.getByRole('article',{name:'计划邀请'});
  const inviteSeen=expect(card.getByRole('heading',{name:bridge.title,exact:true})).toBeVisible({timeout:180_000}).then(()=>Date.now());
  const [,replyAt,inviteAt]=await Promise.all([native('native-02','testShareAcquisition02ReplyAndInvite'),replySeen,inviteSeen]);
  const reply=await db.message.findFirstOrThrow({where:{body:'[share93] Yes, I will invite you'}});
  const plan=await db.planRequest.findFirstOrThrow({where:{title:bridge.title}});
  expect(plan.status).toBe('PENDING');expect(await db.calendarEntry.count()).toBe(0);
  summary.replyVisibleAfterDatabaseWriteMs=replyAt-reply.createdAt.getTime();summary.invitationVisibleAfterDatabaseWriteMs=inviteAt-plan.createdAt.getTime();
  summary.sseOnlyDelivery=true;
  await expect(card.getByText('Library cafe',{exact:true})).toBeVisible();
  await card.scrollIntoViewIfNeeded();await page.screenshot({path:join(dir!,'browser-03-invitation.png'),fullPage:true});
  await page.unroute(`**/api/public/intent-share/${token}`);
  await card.getByRole('button',{name:'注册并接受邀请',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByText(bridge.title,{exact:true})).toBeVisible();
  await expect(page.getByLabel('用户名',{exact:true})).not.toHaveValue('');
  await page.getByLabel('用户名',{exact:true}).fill('share93_guest');
  await page.getByLabel('设置密码 · 至少 8 位').fill(password);
  await page.screenshot({path:join(dir!,'browser-04-register.png'),fullPage:true});
  await dialog.getByRole('button',{name:'注册并接受邀请',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  }
  const intro=await db.mutualOpportunityMessageRequest.findFirstOrThrow({where:{opportunity:{intentAId:bridge.intentId}}});
  const guestId=intro.senderId;
  const plan=await db.planRequest.findFirstOrThrow({where:{title:bridge.title}});
  const card=page.getByRole('article',{name:'计划邀请'});
  const token=bridge.sharePath.split('?')[0]!.split('/').at(-1)!;
  await expect(card.first().getByText('已确认',{exact:true})).toBeVisible();
  await expect.poll(()=>db.calendarEntry.count({where:{planRequestId:plan.id}})).toBe(2);
  const registered=await db.user.findUniqueOrThrow({where:{username:'share93_guest'}});
  expect(registered.id).toBe(guestId);expect(registered.isGuest).toBe(false);expect(await db.user.count()).toBe(2);
  const appLink=page.getByRole('link',{name:'打开 SideSeat',exact:true});
  await expect(appLink).toHaveAttribute('href',`sideseat://connections/${plan.connectionId}`);
  await expect(page.getByText('用这个账号登录 App，即可继续聊天、查看日程。',{exact:true})).toBeVisible();
  await page.screenshot({path:join(dir!,'browser-05-accepted.png'),fullPage:true});
  const extra={SIDESEAT_SHARE_CHAT_URL:(await appLink.getAttribute('href'))!,SIDESEAT_SHARE_GUEST_NAME:registered.nickname!};
  await native('native-03','testShareAcquisition03RegisteredGuestDeepLinkAndCalendar',extra);
  await expect(page.getByText('[share93] Continuing in the app',{exact:true})).toBeVisible();
  await native('native-04','testShareAcquisition04OwnerSeesAcceptanceAndContinues',extra);
  await expect(page.getByText('[share93] We can keep chatting here',{exact:true})).toBeVisible();
  await native('native-05','testShareAcquisition05GuestReloginKeepsConversation',extra);
  await page.reload();await expect(page.getByText('[share93] We can keep chatting here',{exact:true})).toBeVisible();
  await expect(page.getByText('这份意愿已结束，你们的对话和计划仍然保留。',{exact:true})).toBeVisible();
  await page.screenshot({path:join(dir!,'browser-06-retained-conversation.png'),fullPage:true});
  const outsider=await browser.newContext();
  expect((await outsider.request.get(`/api/public/intent-share/${token}`)).status()).toBe(404);await outsider.close();
  expect(errors).toEqual([]);
  Object.assign(summary,{result:'PASS',guestUpgradedInPlace:true,guestId,connectionId:plan.connectionId,planId:plan.id,calendarEntries:2,nativeDeepLinkAfterLogin:true,nativeBothWayContinuation:true,browserReloadRetainsChat:true});
 } finally {
  await page.context().storageState({path:join(dir!,'browser-state-private.json')});
  writeFileSync(join(dir!,'browser-summary.json'),JSON.stringify({...summary,pageErrors:errors},null,2)+'\n');
  await testInfo.attach('share-acquisition-summary',{body:JSON.stringify(summary),contentType:'application/json'});
  await db.$disconnect();
 }
});

// Secondary verification after the primary flow exposes the native setup gate.
// Passing this test does not mean the acquisition loop or guest native access passed.
test('registered web fallback retains owner calendar and conversation', async ({page,browser}) => {
 test.skip(process.env.SIDESEAT_SHARE_WEB_FALLBACK!=='1','Run explicitly after preserving the primary failure');
 test.setTimeout(300_000);
 const dir=process.env.SIDESEAT_SHARE_QA_DIR!;
 const bridge=JSON.parse(readFileSync(join(dir,'bridge.json'),'utf8'));
 await page.context().addCookies(JSON.parse(readFileSync(join(dir,'browser-state-private.json'),'utf8')).cookies);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  const guest=await db.user.findUniqueOrThrow({where:{username:'share93_guest'},include:{userLanguages:true}});
  expect(guest.isGuest).toBe(false);expect(guest.school).toBeNull();expect(guest.verifiedStudent).toBe(false);expect(guest.userLanguages).toHaveLength(0);
  const plan=await db.planRequest.findFirstOrThrow({where:{title:bridge.title}});
  expect(plan.status).toBe('ACCEPTED');expect(await db.calendarEntry.count({where:{planRequestId:plan.id}})).toBe(2);
  await page.goto(bridge.sharePath);
  await expect(page.getByRole('article',{name:'计划邀请'}).first().getByText('已确认',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'打个招呼，或聊聊想约的时间…'}).fill('[share93] Continuing from the browser');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect(page.getByText('[share93] Continuing from the browser',{exact:true})).toBeVisible();
  const name='native-owner-fallback';const log=createWriteStream(join(dir,name+'-driver.log'));
  try {
   await new Promise<void>((resolve,reject)=>{
    const child=spawn('python3',[join(process.cwd(),'scripts/run-share-acquisition-native.py'),name,'SideSeatUITests/SocialLiveUITests/testShareAcquisitionOwnerCalendarAndWebFallback'],{env:{...process.env,SIDESEAT_SHARE_GUEST_NAME:guest.nickname!}});
    child.stdout.pipe(log);child.stderr.pipe(log);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Owner native verification failed (${code})`)));
   });
  } finally { log.end(); }
  const native=JSON.parse(readFileSync(join(dir,name+'-summary.json'),'utf8'));expect(native.passedTests).toBe(1);expect(native.failedTests).toBe(0);expect(native.skippedTests).toBe(0);
  await expect(page.getByText('[share93] We can keep chatting here',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText('[share93] We can keep chatting here',{exact:true})).toBeVisible();
  await expect(page.getByText('这份意愿已结束，你们的对话和计划仍然保留。',{exact:true})).toBeVisible();
  await page.screenshot({path:join(dir,'browser-06-web-fallback-retained.png'),fullPage:true});
  const token=bridge.sharePath.split('?')[0].split('/').at(-1);
  const outsider=await browser.newContext();expect((await outsider.request.get(`/api/public/intent-share/${token}`)).status()).toBe(404);await outsider.close();
  expect(errors).toEqual([]);
  writeFileSync(join(dir,'web-fallback-summary.json'),JSON.stringify({result:'PASS_WEB_FALLBACK',primaryFlow:'BLOCKED_NATIVE_REQUIRED_SETUP',ownerCalendarVisible:true,calendarEntries:2,registeredGuestStillUnverified:true,guestNativeCalendarVerified:false,nativeOwnerAndBrowserGuestContinuity:true,refreshRetainsChat:true,endedIntentionClosedToNewVisitors:true,pageErrors:errors},null,2)+'\n');
 } finally { await db.$disconnect(); }
});
