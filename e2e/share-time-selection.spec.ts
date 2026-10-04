import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertLocalTestDatabase } from './helpers/local-test-database';

assertLocalTestDatabase();
const db = new PrismaClient();

test('changed shared times keep the greeting and require an explicit new choice', async ({page}) => {
  const ids: string[] = [];
  const windows = [24, 26].map(hours => ({
    startAt: new Date(Date.now() + hours * 3600000).toISOString(),
    endAt: new Date(Date.now() + (hours + 1) * 3600000).toISOString(),
  }));
  try {
    const owner = await db.user.create({data:{username:`share_time_${randomUUID().slice(0,8)}`, hashedPassword:'unused-test-only', onboardingComplete:true, isGuest:false}});
    ids.push(owner.id);
    const token = randomUUID().replaceAll('-','') + randomUUID().replaceAll('-','').slice(0,16);
    const intent = await db.weeklyIntent.create({data:{userId:owner.id, topic:'COFFEE', activityText:'Timing handoff', timeWindows:windows, timePreference:{kind:'EXACT'}, timeZone:'America/New_York', shareToken:token}});
    await page.goto(`/share/intent/${token}?lang=zh-CN`);
    await page.getByRole('button',{name:'联系我',exact:true}).click();
    const field = page.getByRole('textbox',{name:'打个招呼，或聊聊想约的时间…'});
    await field.fill('A custom greeting with no time in its text');
    const guest = await db.user.findFirstOrThrow({where:{isGuest:true},orderBy:{createdAt:'desc'}}); ids.push(guest.id);
    // Make the displayed version stale after contact has opened.
    await expect(page.getByText('消息自动更新',{exact:true})).toBeVisible();
    await db.weeklyIntent.update({where:{id:intent.id},data:{version:{increment:1},timeWindows:[windows[1]!]}});
    await page.getByRole('button',{name:'发送',exact:true}).click();
    await expect(page.getByText('时间已变更或过期，请重新选择；你写的消息已保留。',{exact:true})).toBeVisible();
    await expect(field).toHaveValue('A custom greeting with no time in its text');
    expect(await db.mutualOpportunityMessageRequest.count({where:{senderId:guest.id}})).toBe(0);
    const time = new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'America/New_York'});
    const label = `${time.format(new Date(windows[1]!.startAt))} – ${time.format(new Date(windows[1]!.endAt))}`;
    await page.getByRole('button',{name:new RegExp(label)}).click();
    await page.getByRole('button',{name:'发送',exact:true}).click();
    await expect(page.getByText('招呼已送达，对方回复后会显示在这里。')).toBeVisible();
    const opportunity = await db.mutualOpportunity.findFirstOrThrow({where:{intentAId:intent.id}});
    expect(opportunity.contextSnapshot).toMatchObject({startsAt:windows[1]!.startAt,endsAt:windows[1]!.endAt,sharedTimeSelection:{intentVersion:2,...windows[1]}});
  } finally {
    await db.user.deleteMany({where:{id:{in:ids}}});
    await db.$disconnect();
  }
});
