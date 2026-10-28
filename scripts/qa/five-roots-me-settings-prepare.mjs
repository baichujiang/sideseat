// Explicit fresh-account/configuration reads only. No profile, feedback or provider writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { baseURL, privateDir, readFixture, persist } from './five-roots-live.mjs';
import { fetchQAGet } from './five-roots-get-transport.mjs';
assert.deepEqual(process.argv.slice(2), ['prepare']);
assert.equal(process.env.SIDESEAT_ME_EXECUTE, '1');
assert.equal(baseURL, 'https://api.sideseat.de');
assert(/^sideseat-five-roots-me-[A-Za-z0-9_-]+$/.test(path.basename(privateDir)));
const build = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert(Number.isSafeInteger(build) && build > 0, 'Provide the exact expected Preview build explicitly.');
const f = await readFixture();
assert(f.preparedAt && !f.me && f.accounts.length === 2);
assert(f.accounts.every(a => a.created && !a.deleted && a.accessToken && a.identifier === `e2e_roots_${a.role}_${f.runID}`));
assert(f.accounts.every(a => ['calendar', 'polls', 'contacts', 'conversations', 'messageRequests', 'intentions'].every(k => f.inventory[a.role][k].length === 0)));
async function get(a, route) {
  const res = await fetchQAGet(baseURL + route, { role: a.role, phase: 'settings-explicit-preparation', headers: {
    Authorization: `Bearer ${a.accessToken}`, Accept: 'application/json', 'accept-language': 'en',
    'x-sideseat-platform': 'ios', 'x-sideseat-persistent-intent': '1', 'x-sideseat-flexible-timing': '1',
    'x-sideseat-discovery-matching': '1', 'x-sideseat-capabilities': 'action-coordination-v2',
    'x-sideseat-app-version': '1.0.0', 'x-sideseat-build': String(build), 'x-request-id': randomUUID(),
  } });
  assert.equal(res.status, 200, 'Owned Settings preparation GET failed; no refresh fallback.');
  return (await res.json()).data;
}
const [owner, peer] = ['owner', 'peer'].map(role => f.accounts.find(a => a.role === role));
const profiles = {};
for (const a of [owner, peer]) {
  const profile = await get(a, '/api/v1/me');
  assert.equal(profile.id, a.id); assert.equal(profile.username, a.identifier);
  assert.equal(profile.verifiedStudent, false); assert.equal(profile.productTutorialDismissedAt, null);
  profiles[a.role] = profile;
}
const config = await get(owner, '/api/v1/client-config'), cities = config.discover.servedCities;
assert(Array.isArray(cities) && cities.length > 0 && cities.every(s => typeof s === 'string' && s.trim() === s && s.length > 0 && s.length <= 64 && !/[\r\n]/.test(s)));
assert.equal(new Set(cities).size, cities.length);
const localization = await Promise.all(['en', 'de', 'zh-Hans'].map(lang => fs.readFile(new URL(`../../ios-native/SideSeat/Resources/${lang}.lproj/Localizable.strings`, import.meta.url), 'utf8')));
const cityLabels = Object.fromEntries(cities.map(city => [city, [...new Set([city, ...localization.map(s => {
  const row = s.split('\n').find(line => line.startsWith(JSON.stringify(city) + ' = '));
  return row ? JSON.parse(row.slice(row.indexOf(' = ') + 3).trim().replace(/;$/, '')) : city;
})])]]));
f.me = { schemaVersion: 1, runID: f.runID, build, preparedAt: new Date().toISOString(),
  kind: 'me-settings-read-only-preparation', originalProfiles: profiles,
  settings: { appVersion: '1.0.0', servedCities: cities, cityLabels },
  explicitSetup: 'Factory auth only; no business/provider/email/verification writes.',
};
await persist(f);
console.log('Prepared only fresh owned Settings profile snapshots and public served-city configuration; no business writes.');
