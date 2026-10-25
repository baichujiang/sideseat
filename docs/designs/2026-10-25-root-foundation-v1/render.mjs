import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(directory, 'screenshots');
const source = new URL('./index.html', import.meta.url);
const pages = ['together', 'plans', 'calendar', 'messages', 'me'];
const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`);
}
const browser = await chromium.launch({ headless: true });
try {
  await mkdir(output, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2 });
  // The design must remain usable without a dev server, remote images or account.
  await context.route('**/*', route => {
    const protocol = new URL(route.request().url()).protocol;
    return protocol === 'file:' || protocol === 'data:' ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  async function open(query) {
    const url = new URL(source);
    url.search = new URLSearchParams(query).toString();
    await page.goto(url.href);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.phone').first().waitFor();
    const broken = await page.locator('img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).map(image => image.src));
    check(`assets:${JSON.stringify(query)}`, broken.length === 0, broken);
  }
  const geometry = {};
  for (const id of pages) {
    await open({ view: 'single', page: id });
    geometry[id] = await page.locator('.phone').evaluate(phone => {
      const relative = element => {
        const rect = element.getBoundingClientRect();
        const parent = phone.getBoundingClientRect();
        return { x: rect.x - parent.x, y: rect.y - parent.y, width: rect.width, height: rect.height };
      };
      const scroll = phone.querySelector('.scroll-content');
      return {
        viewport: relative(phone), header: relative(phone.querySelector('.root-header')),
        title: relative(phone.querySelector('.brand-title')),
        body: relative(phone.querySelector('.root-body')),
        tabbar: relative(phone.querySelector('.tabbar')),
        tabs: [...phone.querySelectorAll('.tab-item')].map(relative),
        gutter: relative(scroll).x + parseFloat(getComputedStyle(scroll).paddingLeft),
        rootOverflow: phone.querySelector('.root-body').scrollWidth > phone.clientWidth,
        background: getComputedStyle(phone).backgroundColor,
      };
    });
    const g = geometry[id];
    check(`${id}:shared geometry`, g.viewport.width === 428 && g.viewport.height === 926 && g.header.y === 54 && g.header.height === 58 && g.tabbar.x === 20 && g.tabbar.y === 826 && g.tabbar.height === 78 && g.gutter === 20 && !g.rootOverflow, g);
    check(`${id}:centered title`, Math.abs(g.title.x + g.title.width / 2 - 214) < .1, g.title);
    check(`${id}:five equal touch targets`, g.tabs.length === 5 && g.tabs.every(rect => rect.width >= 44 && rect.height >= 44 && Math.abs(rect.width - g.tabs[0].width) < .1), g.tabs);
    await page.locator('.phone').screenshot({ path: path.join(output, `${id}.png`), animations: 'disabled' });
    // Scroll to the end to confirm the last actual item clears the fixed footer.
    const end = await page.locator('.scroll-content').evaluate(scroll => {
      scroll.scrollTop = scroll.scrollHeight;
      const child = scroll.lastElementChild.getBoundingClientRect();
      const viewport = scroll.getBoundingClientRect();
      return { itemBottom: child.bottom, viewportBottom: viewport.bottom, padding: viewport.bottom - child.bottom };
    });
    check(`${id}:last item clears footer`, end.itemBottom <= end.viewportBottom + 1, end);
    if (id === 'me') await page.locator('.phone').screenshot({ path: path.join(output, 'me-end.png'), animations: 'disabled' });
    if (id === 'plans') {
      const dock = await page.locator('.create-dock').boundingBox();
      check('plans:dedicated action area', dock.y >= g.body.y && dock.y + dock.height <= 814, dock);
      check('plans:no duplicate inner action', await page.locator('.plan-card button,.plan-card .pill-action,.plan-card img:not(.avatar)').count() === 0, 'Whole-card entry; participant avatars retained.');
    }
  }
  check('all pages:same canvas', new Set(Object.values(geometry).map(g => g.background)).size === 1, Object.fromEntries(Object.entries(geometry).map(([id, g]) => [id, g.background])));

  for (const id of ['plans', 'messages']) {
    await open({ view: 'single', page: id, size: 'large' });
    const overflow = await page.locator('.root-body').evaluate(element => element.scrollWidth > element.clientWidth);
    check(`${id}:1.25x no horizontal root overflow`, !overflow, { browserFontScale: 1.25, nativeDynamicType: false });
    await page.locator('.phone').screenshot({ path: path.join(output, `${id}-large.png`), animations: 'disabled' });
    if (id === 'plans') {
      const end = await page.locator('.scroll-content').evaluate(scroll => {
        scroll.scrollTop = scroll.scrollHeight;
        const card = scroll.querySelector('.horizontal-rail .plan-card').getBoundingClientRect();
        const viewport = scroll.getBoundingClientRect();
        const dock = document.querySelector('.create-dock').getBoundingClientRect();
        return { cardTop: card.top, cardBottom: card.bottom, scrollTop: viewport.top, scrollBottom: viewport.bottom, dockTop: dock.top };
      });
      check('plans:1.25x complete waiting card above action area', end.cardTop >= end.scrollTop && end.cardBottom <= end.scrollBottom && end.cardBottom < end.dockTop, end);
      await page.locator('.phone').screenshot({ path: path.join(output, 'plans-large-end.png'), animations: 'disabled' });
    }
  }

  // The five real bottom-tab links switch the local draft; no backend involved.
  await open({ view: 'single', page: 'plans' });
  for (const id of pages) {
    await page.locator(`.tab-item[href$="page=${id}"]`).click();
    await page.locator(`.phone[data-page="${id}"]`).waitFor();
    check(`prototype navigation:${id}`, await page.locator('.tab-item[aria-current="page"]').count() === 1, 'Local draft only.');
  }

  await page.setViewportSize({ width: 2332, height: 1200 });
  await open({ view: 'board' });
  await page.locator('.board').screenshot({ path: path.join(output, 'overview.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1420, height: 1150 });
  await open({ view: 'foundation' });
  await page.locator('.anatomy').screenshot({ path: path.join(output, 'foundation.png'), animations: 'disabled' });
  await writeFile(path.join(directory, 'verification.json'), `${JSON.stringify({
    scope: 'Standalone browser visual prototype; no App or phone changes.',
    generatedAt: new Date().toISOString(),
    browser: await browser.version(), viewport: { width: 428, height: 926 },
    nativeDynamicTypeVerified: false, phoneInstallationPerformed: false,
    geometry, checks,
  }, null, 2)}\n`);
  console.log(`Rendered 11 screenshots. ${checks.length} prototype checks passed.`);
} finally {
  await browser.close();
}
