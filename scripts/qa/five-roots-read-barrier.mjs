// Test-runner sandbox acknowledgement only. All business API calls stay in the
// GET observer. Failed reads never acknowledge; a failed copy rejects the run.
// Copy completion can be uncertain after a timeout, so it is never acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const device = 'D906CC6D-3EC6-50A2-8D93-A6602521362A';
const root = '/tmp/sideseat-five-roots-private/';
const runnerPattern = /^app\.sideseat\.fiveroots(calendar|calendarshare|calendaradvanced|calendarconnections|messages|me)qa\.xctrunner$/;
const phasePattern = /^[a-z][a-z0-9-]{0,79}$/;

async function copyMarker({ source, destination, runner, resultPath, logPath }) {
  await execute('xcrun', ['devicectl', 'device', 'copy', 'to', '--device', device,
    '--source', source, '--destination', destination, '--domain-type', 'appDataContainer',
    '--domain-identifier', runner, '--timeout', '15', '--json-output', resultPath,
    '--log-output', logPath], { timeout: 20_000, maxBuffer: 64 * 1024 });
  const result = JSON.parse(await fs.readFile(resultPath, 'utf8'));
  assert.equal(result.info?.outcome, 'success', 'The owned runner acknowledgement copy must actually succeed.');
}

export async function createQAReadBarrier({ expectedRunnerBundle, outputDir,
  nonce = process.env.SIDESEAT_QA_READ_BARRIER_NONCE, transfer = copyMarker }) {
  assert(runnerPattern.test(expectedRunnerBundle), 'Only the closed set of owned QA runners is allowed.');
  assert(typeof nonce === 'string' && /^[a-f0-9]{32}$/.test(nonce), 'Provide the same fresh32hex nonce to runner and observer.');
  assert(typeof outputDir === 'string' && path.resolve(outputDir) === outputDir
    && outputDir.startsWith(root), 'Write acknowledgements only below this task private evidence directory.');
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const canonicalRoot = await fs.realpath(root);
  assert.equal(await fs.realpath(outputDir), path.join(canonicalRoot, path.relative(root, outputDir)),
    'The acknowledgement output cannot redirect through a child symlink.');
  const registry = path.join(root, 'read-barrier-nonces');
  await fs.mkdir(registry, { recursive: true, mode: 0o700 });
  assert.equal(await fs.realpath(registry), path.join(canonicalRoot, 'read-barrier-nonces'));
  await fs.writeFile(path.join(registry, nonce + '.json'), JSON.stringify({ nonce,
    runner: expectedRunnerBundle, outputDir, registeredAt: new Date().toISOString() }) + '\n',
  { mode: 0o600, flag: 'wx' });
  const records = [], seen = new Set();
  const manifest = path.join(outputDir, 'read-barrier.json');
  const report = () => JSON.stringify({ kind: 'sideseat-five-roots-read-barrier', schemaVersion: 1,
    runner: expectedRunnerBundle, device: 'default iPhone14Plus', nonce, records,
    scope: 'Owned QA runner Documents only; never Preview or ordinary App data. Acknowledged after independent GET verification.' }, null, 2) + '\n';
  await fs.writeFile(manifest, report(), { mode: 0o600, flag: 'wx' });
  return {
    async acknowledge(phase) {
      assert(typeof phase === 'string' && phasePattern.test(phase), 'Use a bounded phase identifier.');
      assert(!seen.has(phase), 'A phase may be released only once in this observer run.');
      const name = `sideseat-qa-read-barrier-${nonce}-${phase}.json`;
      const source = path.join(outputDir, name), destination = 'Documents/' + name;
      const marker = { kind: 'sideseat-five-roots-read-barrier', schemaVersion: 1, nonce, phase };
      await fs.writeFile(source, JSON.stringify(marker) + '\n', { mode: 0o600, flag: 'wx' });
      await transfer({ source, destination, runner: expectedRunnerBundle,
        resultPath: path.join(outputDir, `${phase}-ack-copy.json`),
        logPath: path.join(outputDir, `${phase}-ack-copy.log`) });
      seen.add(phase);
      records.push({ phase, acknowledgedAt: new Date().toISOString() });
      await fs.writeFile(manifest, report(), { mode: 0o600 });
    },
  };
}
