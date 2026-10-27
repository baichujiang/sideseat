import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';

const root = '/tmp/sideseat-five-roots-private/';
const bundle = 'app.sideseat.fiverootscalendarqa.xctrunner';
async function scope(t) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const dir = await fs.mkdtemp(root + 'read-barrier-offline-unit-');
  const nonce = randomBytes(16).toString('hex');
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  t.after(() => fs.rm(path.join(root, 'read-barrier-nonces', nonce + '.json'), { force: true }));
  const copies = [];
  const options = { expectedRunnerBundle: bundle, outputDir: dir, nonce,
    transfer: async value => { copies.push(value); } };
  return { dir, copies, options };
}
test('Mac /tmp system alias is accepted; marker releases only the exact owned runner phase', async t => {
  const { dir, copies, options } = await scope(t);
  const nonce = options.nonce;
  const barrier = await createQAReadBarrier(options);
  await barrier.acknowledge('event-created');
  assert.equal(copies.length, 1); assert.equal(copies[0].runner, bundle);
  assert.equal(copies[0].destination, `Documents/sideseat-qa-read-barrier-${nonce}-event-created.json`);
  assert.deepEqual(JSON.parse(await fs.readFile(copies[0].source, 'utf8')),
    { kind: 'sideseat-five-roots-read-barrier', schemaVersion: 1, nonce, phase: 'event-created' });
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'read-barrier.json'), 'utf8'));
  assert.deepEqual(manifest.records.map(r => r.phase), ['event-created']);
  assert.equal((await fs.stat(copies[0].source)).mode & 0o777, 0o600);
});
test('refuses ordinary Preview and unknown test runner containers', async t => {
  const { options } = await scope(t);
  for (const expectedRunnerBundle of ['app.sideseat.mobile.preview', 'app.sideseat.mobile', 'app.sideseat.other.xctrunner']) {
    await assert.rejects(createQAReadBarrier({ ...options, expectedRunnerBundle }));
  }
});
test('requires a fresh bounded nonce', async t => {
  const { options } = await scope(t);
  for (const invalid of ['', 'a'.repeat(31), 'a'.repeat(33), '../' + 'a'.repeat(29), undefined]) {
    await assert.rejects(createQAReadBarrier({ ...options, nonce: invalid }));
  }
});
test('refuses output outside owned evidence root or traversal spelling', async t => {
  const { options } = await scope(t);
  for (const outputDir of ['/tmp/ordinary', root + '../elsewhere', root.slice(0, -1), root + './probe']) {
    await assert.rejects(createQAReadBarrier({ ...options, outputDir }));
  }
});
test('refuses child symlink redirection', async t => {
  const { dir, options } = await scope(t);
  const target = path.join(dir, 'target'), link = path.join(dir, 'link');
  await fs.mkdir(target); await fs.symlink(target, link);
  await assert.rejects(createQAReadBarrier({ ...options, outputDir: link }));
});
test('phase cannot escape the runner Documents marker namespace', async t => {
  const { options, copies } = await scope(t); const barrier = await createQAReadBarrier(options);
  for (const phase of ['../event', 'event/created', '', 'a'.repeat(81), 'EVENT']) {
    await assert.rejects(barrier.acknowledge(phase));
  }
  assert.equal(copies.length, 0);
});
test('copy failure never records a release', async t => {
  const { dir, options } = await scope(t);
  const barrier = await createQAReadBarrier({ ...options, transfer: async () => { throw Error('offline copy failure'); } });
  await assert.rejects(barrier.acknowledge('event-created'));
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'read-barrier.json'), 'utf8'));
  assert.deepEqual(manifest.records, []);
});
test('duplicate phase and reuse of an evidence directory are refused', async t => {
  const { options, copies } = await scope(t); const barrier = await createQAReadBarrier(options);
  await barrier.acknowledge('event-created');
  await assert.rejects(barrier.acknowledge('event-created'));
  assert.equal(copies.length, 1);
  await assert.rejects(createQAReadBarrier(options));
});
test('same nonce cannot be reused in a different output directory', async t => {
  const first = await scope(t), second = await scope(t);
  await createQAReadBarrier(first.options);
  await assert.rejects(createQAReadBarrier({ ...second.options, nonce: first.options.nonce }));
});
