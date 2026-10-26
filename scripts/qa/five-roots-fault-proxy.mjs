// Local transport-failure boundary only. Successful requests are piped unchanged to the real QA API.
import http from 'node:http';
import assert from 'node:assert/strict';
let fault = null;
let injected = 0;
const server = http.createServer(async (request, response) => {
  const json = (status, data) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
  };
  if (request.url === '/__qa/fault') {
    try {
      assert.equal(request.method, 'POST');
      let body = '';
      for await (const chunk of request) { body += chunk; assert(body.length <= 4096); }
      const value = JSON.parse(body);
      assert.equal(value.method, 'POST');
      assert.equal(value.path, '/api/v1/me/weekly-intents');
      assert.equal(value.status, 503);
      assert.equal(value.times, 1);
      assert.equal(fault, null, 'A prior failure must be consumed before arming another.');
      fault = value;
      json(200, { armed: true });
    } catch { json(400, { error: { message: 'Unsupported local failure boundary.' } }); }
    return;
  }
  if (request.url === '/__qa/state') {
    json(200, { pending: fault !== null, injected }); return;
  }
  if (fault && request.method === fault.method && request.url?.split('?')[0] === fault.path) {
    fault = null; injected++;
    request.resume();
    json(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'Controlled QA transport failure. Please retry.' } });
    return;
  }
  if (!request.url?.startsWith('/api/')) { json(404, { error: { message: 'API routes only.' } }); return; }
  const upstream = http.request({ hostname: '127.0.0.1', port: 3344, path: request.url,
    method: request.method, headers: { ...request.headers, host: '127.0.0.1:3344' } }, incoming => {
    response.writeHead(incoming.statusCode ?? 502, incoming.headers);
    incoming.pipe(response);
  });
  upstream.on('error', () => { if (!response.headersSent) json(502, { error: { message: 'Owned local upstream unavailable.' } }); else response.end(); });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
});
server.listen(3345, '127.0.0.1', () => console.log('Local QA transport proxy ready on3345; successful traffic uses real3344.'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
