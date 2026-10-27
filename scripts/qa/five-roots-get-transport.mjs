// Returns a Response only. Callers own HTTP, JSON and business assertions.
export const qaGETTransportPolicy = Object.freeze({ method: 'GET', timeoutMS: 30_000, maxTransportRetries: 1, backoffMS: 750 });

const networkCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
  'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'ENETDOWN', 'EHOSTDOWN', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_ABORTED']);
const staticSegments = new Set(['api', 'v1', 'me', 'profile', 'languages', 'contacts', 'inbox', 'time-polls',
  'weekly-intents', 'connections', 'messages', 'home', 'schedule']);
const queryKeys = new Set(['limit', 'cursor', 'windowStart', 'windowEnd', 'query', 'search']);
const safeIdentifier = value => typeof value === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(value) ? value : null;
const safeScope = value => typeof value === 'string' && /^[a-z][a-z-]{0,79}$/.test(value) ? value : 'unknown';

function endpointForReport(url) {
  const parsed = new URL(url);
  const pathname = parsed.pathname.split('/').map(segment => !segment || staticSegments.has(segment) ? segment : '[redacted]').join('/');
  const keys = [...parsed.searchParams.keys()];
  return pathname + (keys.length ? '?' + keys.map(key => `${queryKeys.has(key) ? key : '[redacted]'}=[redacted]`).join('&') : '');
}
function networkCause(error) {
  const candidates = [error, error?.cause, ...(Array.isArray(error?.cause?.errors) ? error.cause.errors : [])];
  return candidates.find(candidate => networkCodes.has(candidate?.code));
}
function retryableFetchFailure(error) {
  return (error instanceof TypeError && /^fetch failed$/i.test(error.message))
    || ['AbortError', 'TimeoutError'].includes(error?.name) || Boolean(networkCause(error));
}

export async function fetchQAGet(url, options = {}) {
  if (options.method !== undefined || options.body !== undefined) throw new TypeError('QA GET transport does not accept a method or request body.');
  const { headers, onRetry, role, phase } = options;
  const endpoint = endpointForReport(url);
  for (let attempt = 0; attempt <= qaGETTransportPolicy.maxTransportRetries; attempt++) {
    try {
      // A new timeout belongs to each actual GET attempt; no observer signal is reused.
      return await fetch(url, { method: 'GET', redirect: 'error', headers, signal: AbortSignal.timeout(qaGETTransportPolicy.timeoutMS) });
    } catch (error) {
      if (attempt === qaGETTransportPolicy.maxTransportRetries || !retryableFetchFailure(error)) throw error;
      const cause = networkCause(error) ?? error?.cause ?? error;
      await onRetry?.({ method: 'GET', endpoint, role: safeScope(role), phase: safeScope(phase), retry: 1,
        failedAttempt: 1, nextAttempt: 2, backoffMS: qaGETTransportPolicy.backoffMS, timeoutMS: qaGETTransportPolicy.timeoutMS,
        errorName: safeIdentifier(error?.name), cause: { name: safeIdentifier(cause?.name), code: safeIdentifier(cause?.code) },
        at: new Date().toISOString() });
      await new Promise(resolve => setTimeout(resolve, qaGETTransportPolicy.backoffMS));
    }
  }
}
