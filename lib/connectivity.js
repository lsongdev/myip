import { wait } from './http.js';

/** Measure time to an HTTP response. Opaque responses prove a response, not a 2xx status. */
export async function probeEndpoint({ url, signal, timeout = 5000 }) {
  signal?.throwIfAborted();
  const resource = new URL(url);
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new DOMException('Probe timed out.', 'TimeoutError')),
    timeout,
  );
  const combined = signal
    ? AbortSignal.any([signal, deadline.signal])
    : deadline.signal;
  resource.searchParams.set('_myip', `${Date.now()}-${Math.random()}`);
  const started = performance.now();
  try {
    const response = await fetch(resource, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: combined,
    });
    combined.throwIfAborted();
    if (response.type === 'error') throw new Error('No HTTP response.');
    return performance.now() - started;
  } finally {
    clearTimeout(timer);
  }
}

/** Each target owns probe({signal}); HTTP endpoints and service details stay outside the runner. */
export async function runConnectivity({
  targets,
  signal,
  samples = 3,
  concurrency = 4,
  interval = 500,
  onUpdate = () => {},
}) {
  if (!Number.isInteger(samples) || samples < 1 || samples > 12)
    throw new TypeError('Use 1–12 samples.');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new TypeError('Use 1–8 concurrent probes.');
  const owned = new AbortController();
  const combined = signal
    ? AbortSignal.any([signal, owned.signal])
    : owned.signal;
  const results = new Map();
  const report = (reading) => {
    combined.throwIfAborted();
    onUpdate({ ...reading });
  };
  try {
    for (let sample = 0; sample < samples; sample++) {
      combined.throwIfAborted();
      let next = 0;
      const workers = Array.from(
        { length: Math.min(concurrency, targets.length) },
        async () => {
          while (next < targets.length) {
            combined.throwIfAborted();
            const target = targets[next++];
            report({ id: target.id, status: 'checking', ms: null, sample });
            let reading;
            try {
              const ms = await target.probe({ signal: combined });
              if (!Number.isFinite(ms) || ms < 0)
                throw new TypeError('Invalid probe timing.');
              reading = { id: target.id, status: 'responded', ms, sample };
            } catch (error) {
              combined.throwIfAborted();
              reading = {
                id: target.id,
                status:
                  error.name === 'TimeoutError' ? 'timeout' : 'unavailable',
                ms: null,
                sample,
              };
            }
            combined.throwIfAborted();
            results.set(target.id, reading);
            report(reading);
          }
        },
      );
      // An observer failure also cancels the remaining work before the runner rejects.
      try {
        await Promise.all(workers);
      } catch (error) {
        owned.abort(error);
        await Promise.allSettled(workers);
        throw error;
      }
      if (sample < samples - 1) await wait(interval, combined);
    }
    return [...results.values()];
  } finally {
    owned.abort();
  }
}
