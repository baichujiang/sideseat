import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { REFRESH_COOKIE_NAME } from '../lib/constants/app';
import { assertLocalTestDatabase } from './helpers/local-test-database';

assertLocalTestDatabase();
// Browser timezone deliberately differs from the SSR server.
test.use({ timezoneId: 'Asia/Shanghai' });
const db = new PrismaClient();
const password = 'Local-guide-password';

async function withShare(page: Page, request: APIRequestContext, run: (data: {
  ownerId: string; intentId: string; token: string; username: string; startAt: string; endAt: string;
  headers: Record<string, string>;
}) => Promise<void>) {
  const suffix = randomUUID().slice(0, 8), username = `qa_guide_${suffix}`;
  // Each simulated visitor has its own local test IP; repeated runs must not share the hourly guest quota.
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `2001:db8:${suffix.slice(0,4)}:${suffix.slice(4)}::1` });
  const owner = await db.user.create({ data: { username, hashedPassword: await bcrypt.hash(password, 10), nickname: 'Alex', verifiedStudent: true, school: 'TUM', onboardingComplete: true } });
  const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '').slice(0, 16);
  const startAt = new Date(Date.now() + 86400000).toISOString(), endAt = new Date(Date.now() + 90000000).toISOString();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    const intent = await db.weeklyIntent.create({ data: { userId: owner.id, topic: 'COFFEE', activityText: '一起喝杯咖啡', timeWindows: [{ startAt, endAt }], timePreference: { kind: 'EXACT' }, timeZone: 'Europe/Berlin', shareToken: token, expiresAt: new Date(endAt) } });
    const login = await request.post('/api/v1/auth/login', { data: { identifier: username, password, device: { id: randomUUID(), name: 'App guide QA', appVersion: '96', platformVersion: '26' } } });
    expect(login.status()).toBe(200);
    const headers = { Authorization: `Bearer ${(await login.json()).data.tokens.accessToken}`, 'Idempotency-Key': randomUUID() };
    await page.goto(`/share/intent/${token}?lang=zh-CN`);
    await run({ ownerId: owner.id, intentId: intent.id, token, username: username + '_new', startAt, endAt, headers });
    expect(errors).toEqual([]);
  } finally {
    const cookie = (await page.context().cookies().catch(() => [])).find(c => c.name === REFRESH_COOKIE_NAME);
    const guest = cookie ? await db.session.findUnique({ where: { tokenHash: createHash('sha256').update(cookie.value).digest('hex') }, select: { userId: true } }) : null;
    await page.goto('about:blank').catch(() => {});
    await db.user.deleteMany({ where: { id: { in: [owner.id, ...(guest && guest.userId !== owner.id ? [guest.userId] : [])] } } });
  }
}
async function greet(page: Page) {
  await page.getByRole('button', { name: '联系我', exact: true }).click();
  await page.getByRole('textbox', { name: '打个招呼，或聊聊想约的时间…' }).fill('你好，明天一起喝咖啡吗？');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('招呼已送达，对方回复后会显示在这里。')).toBeVisible();
}
async function register(page: Page, username: string, accept = false) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('用户名', { exact: true }).fill(username.toUpperCase());
  await dialog.getByLabel('设置密码 · 至少 8 位', { exact: true }).fill(password);
  await expect(page.locator('#share-username-status')).toHaveText('这个用户名可以使用');
  await dialog.getByRole('button', { name: accept ? '注册并接受邀请' : '注册并继续', exact: true }).click();
}
async function guide(page: Page, username: string, target: string) {
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '注册成功' })).toBeVisible();
  await expect(dialog.getByText(username, { exact: true })).toBeVisible();
  await expect(dialog.getByText('用此账号和刚设置的密码登录 App。')).toBeVisible();
  await expect(dialog.getByRole('link', { name: '打开 SideSeat', exact: true })).toHaveAttribute('href', target);
  await expect(dialog.getByRole('link', { name: '打开 SideSeat', exact: true })).toHaveAttribute('aria-disabled', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  return dialog;
}

test('waiting for a reply → register → app guide → browser continuation survives reload', async ({ page, request }) => {
  await withShare(page, request, async ({ username, token, ownerId, intentId }) => {
    await expect(page.getByRole('button', { name: '添加到我的日程', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '时间可以一起商量', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: '/tmp/sideseat-share-focus-20261004/invitation.png', fullPage: true });
    await greet(page);
    const opportunity = await db.mutualOpportunity.findFirstOrThrow({ where: { intentAId: intentId } });
    expect(opportunity.contextSnapshot).toMatchObject({ startsAt: null, endsAt: null, timeContext: { kind: 'UNDECIDED' } });
    await page.screenshot({ path: '/tmp/sideseat-share-focus-20261004/guest-chat.png', fullPage: true });
    await page.getByRole('button', { name: '注册并继续', exact: true }).click();
    await register(page, username);
    const dialog = await guide(page, username, 'sideseat://inbox');
    await expect(dialog.getByText('对话已保存。')).toBeVisible();
    await expect(dialog.getByRole('heading')).toBeFocused();
    await page.screenshot({ path: '/tmp/sideseat-share-focus-20261004/registered-waiting.png' });
    await dialog.getByText('App 没有打开？', { exact: true }).click();
    await expect(dialog.getByText(/还没安装/)).toBeVisible();
    await dialog.getByRole('button', { name: '留在网页' }).click();
    await page.reload();
    await expect(page.getByText('你好，明天一起喝咖啡吗？', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '在 App 中继续' }).getByRole('link', { name: '打开 SideSeat' })).toHaveAttribute('href', 'sideseat://inbox');
    await page.screenshot({ path: '/tmp/sideseat-share-focus-20261004/registered-chat.png', fullPage: true });
    const conversation = (await (await page.request.get(`/api/public/intent-share/${token}`)).json()).data;
    expect(conversation.state).toBe('WAITING'); expect(conversation.isGuest).toBe(false);
    expect(await db.calendarEntry.count({ where: { OR: [{ userId: ownerId }, { user: { username } }] } })).toBe(0);
    await page.getByLabel('Language').selectOption('en');
    await expect(page.getByRole('region', { name: 'Continue in the app' })).toBeVisible();
    await page.getByLabel('Language').selectOption('de');
    await expect(page.getByRole('region', { name: 'In der App fortsetzen' })).toBeVisible();
  });
});

for (const registerFirst of [false, true]) test(`plan consent (${registerFirst ? 'existing account' : 'register and accept'}) uses proposal times and creates both calendars only after acceptance`, async ({ page, request }) => {
  await withShare(page, request, async ({ ownerId, intentId, username, headers, startAt, endAt }) => {
    const time = (raw: string) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(raw));
    const date = (raw: string) => new Intl.DateTimeFormat('zh-CN', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date(raw));
    await page.getByRole('button', { name: new RegExp(`${time(startAt)} – ${time(endAt)}`) }).click();
    await greet(page);
    const intro = await db.mutualOpportunityMessageRequest.findFirstOrThrow({ where: { opportunity: { intentAId: intentId } } });
    const participantIds = [ownerId, intro.senderId];
    const calendarCount = () => db.calendarEntry.count({ where: { userId: { in: participantIds } } });
    const opportunity = await db.mutualOpportunity.findUniqueOrThrow({ where: { id: intro.opportunityId } });
    expect(opportunity.contextSnapshot).toMatchObject({ sharedTimeSelection: { startAt, endAt } });
    expect(await calendarCount()).toBe(0);
    const reply = await request.post(`/api/v1/me/mutual-opportunities/${intro.opportunityId}/interaction`, { headers, data: { action: 'REPLY', body: '可以呀，我们改成晚一点，给你发个计划。' } });
    expect(reply.status()).toBe(200);
    const connection = await db.connection.findFirstOrThrow({ where: { OR: [{ userAId: ownerId, userBId: intro.senderId }, { userBId: ownerId, userAId: intro.senderId }] } });
    // The negotiated proposal differs from the availability and crosses midnight in the source timezone.
    const proposedStart = new Date(startAt); proposedStart.setUTCHours(21, 30, 0, 0);
    const planStart = proposedStart.toISOString(), planEnd = new Date(+proposedStart + 2 * 3600000).toISOString();
    const proposal = await request.post(`/api/v1/connections/${connection.id}/plans`, { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: { title: '咖啡计划', startTime: planStart, endTime: planEnd, origin: { kind: 'MUTUAL_OPPORTUNITY', id: intro.opportunityId } } });
    expect(proposal.status(), await proposal.text()).toBe(201);
    const plan = (await proposal.json()).data.plan;
    const card = page.getByRole('article', { name: '计划邀请' }).first();
    const proposedLabel = `${date(planStart)} · ${time(planStart)} – ${date(planEnd)} · ${time(planEnd)}`;
    await expect(card.getByText(proposedLabel, { exact: false })).toBeVisible();
    expect(await calendarCount()).toBe(0);
    await card.getByRole('button', { name: '注册并接受邀请' }).click();
    await expect(page.getByRole('dialog').getByText(proposedLabel, { exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '先继续聊' }).click();
    expect(await calendarCount()).toBe(0);
    expect((await db.planRequest.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe('PENDING');
    if (registerFirst) {
      await page.getByRole('button', { name: '注册并继续', exact: true }).click();
      await register(page, username);
      const dialog = await guide(page, username, `sideseat://connections/${connection.id}`);
      expect(await calendarCount()).toBe(0);
      expect((await db.planRequest.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe('PENDING');
      await dialog.getByRole('button', { name: '留在网页' }).click();
      await card.getByRole('button', { name: '接受邀请并加入日程' }).click();
    } else {
      await card.getByRole('button', { name: '注册并接受邀请' }).click();
      await register(page, username, true);
      const dialog = await guide(page, username, `sideseat://connections/${connection.id}`);
      await expect(dialog.getByText('已接受邀请，已加入双方日程。')).toBeVisible();
      await dialog.getByRole('button', { name: '留在网页' }).click();
    }
    await expect(card.getByText('已确认', { exact: true })).toBeVisible();
    const entries = await db.calendarEntry.findMany({ where: { userId: { in: participantIds } } });
    expect(entries).toHaveLength(2);
    expect(entries.map(entry => entry.userId).sort()).toEqual(participantIds.sort());
    for (const entry of entries) {
      expect(entry.planRequestId).toBe(plan.id);
      expect(entry.startAt.toISOString()).toBe(planStart);
      expect(entry.endAt.toISOString()).toBe(planEnd);
    }
    await page.reload();
    await expect(page.getByRole('article', { name: '计划邀请' }).first().getByText('已确认', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '打开 SideSeat' })).toHaveAttribute('href', `sideseat://connections/${connection.id}`);
    expect(await calendarCount()).toBe(2);
    await page.screenshot({ path: `/tmp/sideseat-share-plan-consent-20261004/${registerFirst ? 'registered' : 'guest'}-accepted.png`, fullPage: true });
  });
});

test('successful registration is not lost when the following conversation refresh fails', async ({ page, request }) => {
  await withShare(page, request, async ({ username, token }) => {
    await greet(page);
    await page.getByRole('button', { name: '注册并继续', exact: true }).click();
    let upgraded = false;
    await page.route(`**/api/public/intent-share/${token}`, async route => {
      if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'REGISTER') {
        const response = await route.fetch(); upgraded = response.ok(); await route.fulfill({ response });
      } else if (upgraded && route.request().method() === 'GET') await route.abort();
      else await route.continue();
    });
    await register(page, username);
    const dialog = await guide(page, username, 'sideseat://inbox');
    expect((await db.user.findUniqueOrThrow({ where: { username } })).isGuest).toBe(false);
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByLabel('设置密码 · 至少 8 位')).toHaveCount(0);
    await page.unroute(`**/api/public/intent-share/${token}`);
  });
});

test.afterAll(() => db.$disconnect());
