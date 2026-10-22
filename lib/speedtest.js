import { wait } from './http.js';
import { median, jitter, sustained, isStable } from './statistics.js';

/**
 * A transport exposes ping({signal}), download({signal, bytes, onBytes}), and
 * optionally upload({signal, bytes}). It owns URLs, wire formats and HTTP details.
 * Downloads report bytes read; uploads resolve only after server acknowledgement.
 * onUpdate receives immutable snapshots. A cancelled run rejects and stops reporting.
 */
export async function runSpeedtest({
  transport,
  streams = 3,
  signal,
  onUpdate = () => {},
  duration = 12000,
}) {
  if (!Number.isInteger(streams) || streams < 1 || streams > 6)
    throw new TypeError('Use between 1 and 6 streams.');
  if (!Number.isFinite(duration) || duration < 2000)
    throw new TypeError('Test duration must be at least 2000 ms.');
  const parent = signal ?? new AbortController().signal;
  parent.throwIfAborted();
  let state = {
    phase: 'latency',
    latency: null,
    jitter: null,
    download: null,
    upload: null,
  };
  const report = (patch) => {
    parent.throwIfAborted();
    state = { ...state, ...patch };
    onUpdate(structuredClone(state));
  };
  report({});
  // Discard the first request: it may include DNS, TCP and TLS setup.
  await transport.ping({ signal: parent });
  const pings = [];
  for (let index = 0; index < 8; index++) {
    pings.push(await transport.ping({ signal: parent }));
    report({ latency: median(pings), jitter: jitter(pings) });
  }

  for (const direction of ['download', 'upload']) {
    if (!transport[direction]) continue;
    parent.throwIfAborted();
    report({ phase: direction });
    const phase = new AbortController();
    const stop = () => phase.abort(parent.reason);
    parent.addEventListener('abort', stop, { once: true });
    const started = performance.now();
    const deadline = setTimeout(() => phase.abort(), duration);
    let bytes = 0;
    let failure;
    const uploadRates = Array(streams).fill(0);
    const samples = [];
    const loadedPings = [];
    const snapshot = () => ({
      mbps: sustained(samples),
      bytes,
      latency: median(loadedPings),
      samples: [...samples],
    });
    const workers = Array.from({ length: streams }, async (_, index) => {
      let size = direction === 'download' ? 4 * 1024 * 1024 : 256 * 1024;
      try {
        while (!phase.signal.aborted) {
          const begin = performance.now();
          if (direction === 'download') {
            await transport.download({
              signal: phase.signal,
              bytes: size,
              onBytes: (count) => {
                bytes += count;
              },
            });
          } else {
            await transport.upload({ signal: phase.signal, bytes: size });
            bytes += size;
            const seconds = Math.max((performance.now() - begin) / 1000, 0.01);
            uploadRates[index] = (size * 8) / seconds / 1e6;
            size = Math.round(
              Math.min(4 * 1024 * 1024, Math.max(64 * 1024, size / seconds)),
            );
          }
        }
      } catch (error) {
        if (!phase.signal.aborted) {
          failure = error;
          phase.abort(error);
        }
      }
    });
    const pinger = (async () => {
      while (!phase.signal.aborted) {
        try {
          await wait(400, phase.signal);
          loadedPings.push(await transport.ping({ signal: phase.signal }));
        } catch {
          /* Loaded latency may be unavailable on a saturated link. */
        }
      }
    })();
    let previousBytes = 0;
    let previousTime = started;
    try {
      while (!phase.signal.aborted) {
        try {
          await wait(250, phase.signal);
        } catch {
          break;
        }
        const now = performance.now();
        const mbps =
          direction === 'upload'
            ? uploadRates.reduce((total, rate) => total + rate, 0)
            : ((bytes - previousBytes) * 8) / (now - previousTime) / 1000;
        samples.push({ elapsed: now - started, mbps });
        previousBytes = bytes;
        previousTime = now;
        report({ [direction]: snapshot() });
        if (isStable(samples)) break;
      }
    } finally {
      clearTimeout(deadline);
      phase.abort();
      parent.removeEventListener('abort', stop);
      await Promise.allSettled([...workers, pinger]);
    }
    parent.throwIfAborted();
    if (failure) throw failure;
    if (!bytes || !samples.length)
      throw new Error(
        `No ${direction} data received. Try another network or test again.`,
      );
    report({ [direction]: snapshot() });
  }
  report({ phase: 'done' });
  return state;
}
