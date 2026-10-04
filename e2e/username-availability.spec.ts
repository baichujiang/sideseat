import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { REFRESH_COOKIE_NAME } from '../lib/constants/app';
import { assertLocalTestDatabase } from './helpers/local-test-database';

assertLocalTestDatabase();
const db = new PrismaClient();

test('username availability normalizes names and registration still rejects a taken name', async ({ request }) => {
  const username = `qa_name_${randomUUID().slice(0,8)}`;
  const owner = await db.user.create({data:{username,hashedPassword:'unused-test-only'}});
  try {
    const check = await request.post('/api/auth/username-availability',{data:{username:`  ${username.toUpperCase()}  `}});
    expect(check.status()).toBe(200);
    expect(check.headers()['cache-control']).toBe('no-store');
    expect((await check.json()).data).toEqual({username,available:false});
    const free = await request.post('/api/auth/username-availability',{data:{username:username+'_new'}});
    expect((await free.json()).data.available).toBe(true);
    const invalid = await request.post('/api/auth/username-availability',{data:{username:'guest_reserved'}});
    expect(invalid.status()).toBe(422);
    const signup = await request.post('/api/auth/signup',{data:{username,password:'Unused-test-password',displayName:'QA name',school:'TUM',studentStatus:'CURRENT_STUDENT',degreeLevel:'MASTER',semester:1}});
    expect(signup.status()).toBe(409);
  } finally { await db.user.delete({where:{id:owner.id}}); }
});

test('share signup checks before submission, ignores old results, and keeps a failed check recoverable', async ({ page }) => {
  const username = `qa_name_${randomUUID().slice(0,8)}`;
  const owner = await db.user.create({data:{username,hashedPassword:'unused-test-only',onboardingComplete:true}});
  const token = randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','').slice(0,16);
  let guestId: string | undefined;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await db.weeklyIntent.create({data:{userId:owner.id,topic:'COFFEE',activityText:'Username QA',timeWindows:[{startAt:new Date(Date.now()+86400000).toISOString(),endAt:new Date(Date.now()+90000000).toISOString()}],timePreference:{kind:'EXACT'},timeZone:'Europe/Berlin',shareToken:token}});
    await page.goto(`/share/intent/${token}?lang=zh-CN`);
    await page.getByRole('button',{name:'添加到我的日程',exact:true}).click();
    const dialog = page.getByRole('dialog');
    const name = dialog.getByLabel('用户名',{exact:true});
    const password = dialog.getByLabel('设置密码 · 至少 8 位',{exact:true});
    const status = page.locator('#share-username-status');
    const submit = dialog.getByRole('button',{name:'注册并继续',exact:true});
    const guest = await page.request.get(`/api/public/intent-share/${token}`);
    const cookie = (await page.context().cookies()).find(c=>c.name===REFRESH_COOKIE_NAME);
    guestId = (await db.session.findUnique({where:{tokenHash:createHash('sha256').update(cookie!.value).digest('hex')},select:{userId:true}}))?.userId;
    expect((await guest.json()).data.isGuest).toBe(true);
    await name.fill(username.toUpperCase());
    await password.fill('Username-QA-password');
    await expect(status).toHaveText('这个用户名已被使用，请换一个');
    await expect(submit).toBeDisabled();
    await page.screenshot({path:'/tmp/sideseat-username-20261004/share-taken.png'});

    let releaseOld!: () => void;
    const oldResponse = new Promise<void>(resolve => { releaseOld = resolve; });
    let started!: () => void;
    const oldStarted = new Promise<void>(resolve => { started = resolve; });
    await page.route('**/api/auth/username-availability',async route => {
      if (route.request().postDataJSON().username === username+'_slow') {
        started(); await oldResponse;
        await route.fulfill({json:{success:true,data:{username:username+'_slow',available:false}}});
      } else await route.continue();
    });
    await name.fill(username+'_slow');
    await oldStarted;
    await expect(status).toHaveText('正在检查用户名…');
    await expect(submit).toBeDisabled();
    await name.fill(username+'_new');
    await password.focus();
    await expect(status).toHaveText('这个用户名可以使用');
    releaseOld();
    await expect(status).toHaveAttribute('data-state','available');
    await expect(submit).toBeEnabled();
    await page.screenshot({path:'/tmp/sideseat-username-20261004/share-available.png'});
    await page.unroute('**/api/auth/username-availability');

    await name.fill('guest_reserved');
    await expect(status).toHaveText('这个用户名为系统保留，请换一个');
    await expect(submit).toBeDisabled();
    await page.route('**/api/auth/username-availability',route=>route.fulfill({status:503,json:{success:false}}));
    await name.fill(username+'_retry');
    await expect(status).toHaveAttribute('data-state','failed');
    await expect(submit).toBeEnabled();
    await page.unroute('**/api/auth/username-availability');
    await password.focus();
    await expect(status).toHaveAttribute('data-state','available');
    await submit.click();
    await expect(dialog.getByRole('heading',{name:'给这件事留个时间'})).toBeVisible();
    expect((await db.user.findUnique({where:{username:username+'_retry'},select:{id:true}}))?.id).toBe(guestId);
    expect(errors).toEqual([]);
  } finally {
    if (guestId) await db.user.delete({where:{id:guestId}});
    await db.user.delete({where:{id:owner.id}});
  }
});

test.afterAll(async () => { await db.$disconnect(); });
