/** Keep the deadline active until the response body has been consumed. */
export async function request(
  url,
  { signal, timeout = 8000, ...init } = {},
  consume = (response) => response.json(),
) {
  const deadline = AbortSignal.timeout(timeout);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const response = await fetch(url, {
    mode: 'cors',
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    ...init,
    signal: combined,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Request failed (HTTP ${response.status}).`);
  }
  return consume(response);
}

export function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
