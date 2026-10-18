// Isolated rendering checks. The continuous phone journey separately exercises real APIs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('package.json'));
const { chromium, webkit, expect } = require('@playwright/test');
const base = process.argv[2] ?? 'http://127.0.0.1:3099';
const out = path.resolve('docs/qa/evidence/2026-10-18-plans116');
fs.mkdirSync(out, { recursive: true });
const checks = [];
function fixture() {
  const dates = Array.from({ length: 7 }, (_, i) => `2026-10-${20 + i}`);
  const slots = dates.flatMap((date, day) => Array.from({ length: 8 }, (_, row) => ({ id: day * 8 + row, date, row, label: `09:${String(row * 15 % 60).padStart(2, '0')}`, start: new Date(Date.parse(date + 'T07:00:00Z') + row * 900000).toISOString(), end: new Date(Date.parse(date + 'T07:00:00Z') + (row + 1) * 900000).toISOString() })));
  slots.forEach(s => s.label = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(s.start)));
  return { token: 'layout116', title: '周末一起自习', timeZone: 'Europe/Berlin', dates, slots, participants: [], invitations: [], mySlotIds: [], myDisplayName: '', didRespond: false, viewerId: null, location: '大学图书馆', durationMinutes: 60, expectedCount: 2, planningMode: 'COLLECT', phase: 'COLLECTING', invitationVersion: 0, chosenStart: null, chosenEnd: null, summary: { counts: slots.map(() => 0), participantCount: 0, maximum: 0, common: false, windows: [] } };
}
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  try {
    for (const width of [320, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: engineName === 'webkit' ? 'dark' : 'light' });
      const page = await context.newPage();
      let poll = fixture();
      await page.route('**/api/public/time-polls/**', async route => {
        const req = route.request(), body = req.method() === 'GET' ? null : req.postDataJSON();
        if (req.url().endsWith('/participant') && req.method() === 'POST') {
          poll.viewerId = 'guest'; poll.myDisplayName = body.displayName;
          poll.participants = [{ id: 'guest', displayName: body.displayName, slotIds: poll.mySlotIds, isMe: true, isGuest: true }];
          if (poll.phase === 'INVITING') poll.invitations = [{ id: 'guest', displayName: body.displayName, selected: true, status: 'INVITED', isMe: true, isGuest: true }];
        } else if (req.url().endsWith('/response')) {
          poll.mySlotIds = body.slotIds; poll.didRespond = true; poll.participants[0].slotIds = body.slotIds;
          poll.summary.participantCount = 1;
        } else if (req.url().endsWith('/invitation-response')) {
          poll.invitations[0].status = body.status; poll.phase = 'CONFIRMED';
        }
        await route.fulfill({ json: { data: poll } });
      });
      const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engineName}/${width} page overflow`);
      await page.goto(base + '/time-polls/layout116');
      const next = page.getByRole('button', { name: '下一步：选择我的空闲', exact: true });
      await expect(next).toBeVisible();
      assert((await next.boundingBox()).y + (await next.boundingBox()).height < 844, 'first next step must be above the fold');
      await expect(page.getByTestId('time-poll-grid')).toHaveCount(0);
      await noOverflow();
      if (width === 390) await page.screenshot({ path: `${out}/web-${engineName}-01-name.png`, fullPage: true });
      await page.getByLabel('你的名字', { exact: true }).fill('小林'); await next.click();
      const done = page.getByRole('button', { name: '保存并继续', exact: true });
      await expect(done).toBeDisabled();
      await expect.poll(async () => (await page.getByTestId('time-poll-cell-2').boundingBox()).y + 44).toBeLessThan((await done.boundingBox()).y);
      await page.getByTestId('time-poll-cell-0').click(); await page.getByTestId('time-poll-cell-2').click();
      await expect(page.getByRole('status')).toHaveText('已自动保存');
      assert.deepEqual(poll.mySlotIds, [0, 1, 2, 3]);
      await noOverflow();
      if (width === 390) await page.screenshot({ path: `${out}/web-${engineName}-02-free-time.png`, fullPage: true });
      await done.click(); await expect(page.getByTestId('availability-next-step')).toBeVisible();
      await expect(page.getByRole('button', { name: '确认参加', exact: true })).toHaveCount(0);
      if (width === 390) await page.screenshot({ path: `${out}/web-${engineName}-03-wait.png`, fullPage: true });
      await page.getByRole('button', { name: '修改我的空闲', exact: true }).click();
      await expect(page.getByTestId('time-poll-cell-0')).toHaveAttribute('aria-pressed', 'true');
      for (const desktop of [1024, 1440]) {
        await page.setViewportSize({ width: desktop, height: 1000 }); await noOverflow();
        const grid = await page.getByTestId('time-poll-grid').evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
        if (desktop === 1440) assert(grid.scroll <= grid.client + 1, 'desktop shows all seven days');
      }
      await page.setViewportSize({ width, height: 844 });
      poll.phase = 'INVITING'; poll.chosenStart = poll.slots[0].start; poll.chosenEnd = poll.slots[3].end; poll.invitationVersion = 1;
      poll.invitations = [{ id: 'guest', displayName: '小林', status: 'INVITED', selected: true, isMe: true, isGuest: true }];
      await page.reload();
      await expect(page.getByRole('heading', { name: '最后一步：确认最终时间' })).toBeVisible();
      const confirm = page.getByRole('button', { name: '确认参加', exact: true });
      await expect(confirm).toBeVisible(); await noOverflow();
      if (width === 390) await page.screenshot({ path: `${out}/web-${engineName}-04-invitation.png`, fullPage: true });
      await confirm.click(); await expect(page.getByRole('heading', { name: '计划已确定', exact: true })).toBeVisible();
      checks.push(`${engineName}/${width}: name → availability → wait → final invitation → explicit confirmation; mobile and desktop layout`);
      poll = fixture(); poll.planningMode = 'FIXED'; poll.phase = 'INVITING'; poll.chosenStart = poll.slots[0].start; poll.chosenEnd = poll.slots[3].end; poll.invitationVersion = 1;
      await page.reload(); await page.getByLabel('你的名字', { exact: true }).fill('小林'); await page.getByRole('button', { name: '继续查看邀请', exact: true }).click();
      assert.equal(poll.phase, 'INVITING', 'name entry must not auto-accept');
      await expect(page.getByTestId('time-poll-grid')).toHaveCount(0);
      await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm participation', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Plan confirmed', exact: true })).toBeVisible();
      checks.push(`${engineName}/${width}: fixed time skips availability; English explicit confirmation`);
      await context.close();
    }
  } finally { await browser.close(); }
}
fs.writeFileSync(`${out}/web-layout.json`, JSON.stringify({ base, syntheticNetwork: true, checkedAt: new Date().toISOString(), checks, passed: checks.length, failed: 0 }, null, 2) + '\n');
console.log(`${checks.length} isolated web flow/layout groups passed`);
