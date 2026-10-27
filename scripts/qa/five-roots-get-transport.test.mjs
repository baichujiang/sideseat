import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';

const url = 'https://api.sideseat.de/api/v1/connections/c123456789012345678901234/messages?limit=100&cursor=private-cursor';
const networkFailure = () => new TypeError('fetch failed', { cause: Object.assign(new Error('do not record private details'), { code: 'ECONNRESET' }) });

test('one transport retry uses two GETs, fresh 30s signals and a safe transparent record', async t => {
  const calls = [], records = [], timeouts = [];
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, 'timeout', ms => { timeouts.push(ms); return timeout(ms); });
  t.mock.method(globalThis, 'fetch', async (request, options) => {
    calls.push({ request, options });
    if (calls.length === 1) throw networkFailure();
    return Response.json({ data: { complete: true } });
  });
  const response = await fetchQAGet(url, { headers: { Authorization: 'Bearer never-record-this' }, role: 'owner', phase: 'owner-sent',
    onRetry: record => records.push(record) });
  assert.deepEqual(await response.json(), { data: { complete: true } });
  assert.equal(calls.length, 2); assert(calls.every(call => call.options.method === 'GET' && call.options.redirect === 'error'));
  assert.deepEqual(timeouts, [30_000, 30_000]); assert.notEqual(calls[0].options.signal, calls[1].options.signal);
  assert.equal(records.length, 1); assert.equal(records[0].retry, 1); assert.equal(records[0].backoffMS, 750);
  assert.equal(records[0].endpoint, '/api/v1/connections/[redacted]/messages?limit=[redacted]&cursor=[redacted]');
  assert.equal(records[0].role, 'owner'); assert.equal(records[0].phase, 'owner-sent');
  assert.deepEqual(records[0].cause, { name: 'Error', code: 'ECONNRESET' });
  assert(!/never-record-this|private-cursor|c123456789012345678901234|do not record/.test(JSON.stringify(records)));
});

for (const boundary of ['HTTP503', 'JSON', 'business']) {
  test(`${boundary} failure outside fetch is never retried`, async t => {
    let calls = 0; const retries = [];
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return boundary === 'HTTP503' ? new Response('unavailable', { status: 503 })
        : boundary === 'JSON' ? new Response('invalid json') : Response.json({ data: { count: 2 } });
    });
    await assert.rejects(async () => {
      const response = await fetchQAGet(url, { onRetry: record => retries.push(record) });
      assert.equal(response.status, 200);
      const body = await response.json(); assert.equal(body.data.count, 1);
    });
    assert.equal(calls, 1); assert.equal(retries.length, 0);
  });
}

test('a second transport failure stops after two attempts and one retry record', async t => {
  let calls = 0; const records = [], failure = networkFailure();
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw failure; });
  await assert.rejects(fetchQAGet(url, { onRetry: record => records.push(record) }), error => error === failure);
  assert.equal(calls, 2); assert.equal(records.length, 1);
});

for (const name of ['AbortError', 'TimeoutError', 'network-cause']) {
  test(`${name} from fetch permits only the bounded GET retry`, async t => {
    let calls = 0;
    const failure = name === 'network-cause' ? new Error('network', { cause: Object.assign(new Error('socket'), { code: 'UND_ERR_SOCKET' }) })
      : new DOMException('private message', name);
    t.mock.method(globalThis, 'fetch', async () => { if (++calls === 1) throw failure; return new Response(null, { status: 200 }); });
    assert.equal((await fetchQAGet(url)).status, 200); assert.equal(calls, 2);
  });
}

test('non-network TypeError and arbitrary exceptions are not retried', async t => {
  for (const failure of [new TypeError('invalid request'), new Error('business assertion')]) {
    let calls = 0;
    const mocked = t.mock.method(globalThis, 'fetch', async () => { calls++; throw failure; });
    await assert.rejects(fetchQAGet(url), error => error === failure); assert.equal(calls, 1); mocked.mock.restore();
  }
});

test('callers cannot turn the helper into POST or supply a body', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(); });
  await assert.rejects(fetchQAGet(url, { method: 'POST' }), /does not accept/);
  await assert.rejects(fetchQAGet(url, { body: '{}' }), /does not accept/);
  assert.equal(calls, 0); assert.equal(qaGETTransportPolicy.maxTransportRetries, 1);
});
