import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertLocalTestDatabase } from './helpers/local-test-database';

assertLocalTestDatabase();
const db = new PrismaClient();

test('shared invitation follows each visitor language and remembers only their manual choice', async ({ browser, baseURL }) => {
  const owner = await db.user.create({data:{username:`share_locale_${randomUUID().slice(0,8)}`, hashedPassword:'unused-test-only', onboardingComplete:true}});
  const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '').slice(0,16);
  const path = `/share/intent/${token}`;
  try {
    await db.weeklyIntent.create({data:{userId:owner.id, topic:'COFFEE', activityText:'Language QA', timeWindows:[{
      startAt:new Date(Date.now()+86400000).toISOString(), endAt:new Date(Date.now()+90000000).toISOString(),
    }],timePreference:{kind:'EXACT'},timeZone:'Europe/Berlin',shareToken:token}});
    for (const [system, expected, contact] of [['zh-CN','zh-CN','联系我'],['de-DE','de','Kontakt aufnehmen'],['en-US','en','Contact me'],['fr-FR','en','Contact me']]) {
      const context = await browser.newContext({baseURL,locale:system});
      try {
        // An old web-app preference must not override the share visitor's system language.
        await context.addCookies([{name:'NEXT_LOCALE',value:expected==='en'?'zh-CN':'en',url:baseURL!}]);
        const page = await context.newPage();
        const response = await page.goto(path);
        expect(await response!.text()).toContain(`<main lang="${expected}"`);
        await expect(page.getByRole('combobox',{name:'Language'})).toHaveValue(expected);
        await expect(page.getByRole('button',{name:contact,exact:true})).toBeVisible();
      } finally { await context.close(); }
    }

    const context = await browser.newContext({baseURL,locale:'de-DE',permissions:['clipboard-read','clipboard-write']});
    try {
      const page = await context.newPage();
      await page.goto(`${path}?lang=zh-CN`);
      await expect(page.getByRole('button',{name:'联系我',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'复制链接',exact:true}).click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(new URL(copied).searchParams.has('lang')).toBe(false);
      await page.getByRole('combobox',{name:'Language'}).selectOption('en');
      expect(new URL(page.url()).searchParams.has('lang')).toBe(false);
      await expect(page.getByRole('main')).toHaveAttribute('lang','en');
      await page.reload();
      await expect(page.getByRole('combobox',{name:'Language'})).toHaveValue('en');

      const recipient = await browser.newContext({baseURL,locale:'zh-TW'});
      try {
        const other = await recipient.newPage();
        await other.goto(copied);
        await expect(other.getByRole('button',{name:'联系我',exact:true})).toBeVisible();
        await other.goto('/share/intent/locale-qa-missing');
        await expect(other.getByRole('main')).toHaveAttribute('lang','zh-CN');
        await expect(other.getByRole('heading',{level:1})).not.toBeEmpty();
      } finally { await recipient.close(); }
    } finally { await context.close(); }
  } finally {
    await db.user.delete({where:{id:owner.id}});
    await db.$disconnect();
  }
});
