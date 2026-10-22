import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { probeEndpoint, runConnectivity } from '../lib/connectivity.js';
import { wait } from '../lib/http.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('HTTP probe accepts opaque responses and sends no cookies or referrer', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(init.method, 'HEAD');
    assert.equal(init.mode, 'no-cors');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.referrerPolicy, 'no-referrer');
    assert.equal(url.searchParams.get('original'), 'yes');
    assert.ok(url.searchParams.has('_myip'));
    return { type: 'opaque', status: 0, ok: false };
  };
  assert.ok(
    (await probeEndpoint({ url: 'https://example.org/icon?original=yes' })) >=
      0,
  );
});

test('a readable HTTP rejection still proves a response, not website health', async () => {
  globalThis.fetch = async () => new Response(null, { status: 403 });
  assert.ok((await probeEndpoint({ url: 'https://example.org' })) >= 0);
});

test('timeout and caller cancellation abort in-flight probes', async () => {
  globalThis.fetch = (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      });
    });
  await assert.rejects(
    probeEndpoint({ url: 'https://example.org', timeout: 15 }),
    { name: 'TimeoutError' },
  );
  const controller = new AbortController();
  const pending = probeEndpoint({
    url: 'https://example.org',
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('bounded probes keep failures independent and sample every target', async () => {
  let active = 0;
  let maximum = 0;
  const target = (id, error) => ({
    id,
    probe: async ({ signal }) => {
      maximum = Math.max(maximum, ++active);
      try {
        await wait(10, signal);
        if (error) throw error;
        return 24;
      } finally {
        active--;
      }
    },
  });
  const readings = [];
  const result = await runConnectivity({
    targets: [
      target('ok'),
      target('timeout', new DOMException('Timed out', 'TimeoutError')),
      target('error', new TypeError('Network error')),
    ],
    concurrency: 2,
    samples: 2,
    interval: 0,
    onUpdate: (reading) => readings.push(reading),
  });
  assert.equal(maximum, 2);
  assert.equal(active, 0);
  assert.equal(
    readings.filter((reading) => reading.status !== 'checking').length,
    6,
  );
  assert.deepEqual(
    result.map((reading) => [reading.id, reading.status]),
    [
      ['ok', 'responded'],
      ['timeout', 'timeout'],
      ['error', 'unavailable'],
    ],
  );
});

test('cancelled runs release workers and never publish failure samples after abort', async () => {
  const controller = new AbortController();
  let active = 0;
  const updates = [];
  const targets = ['one', 'two', 'three'].map((id) => ({
    id,
    probe: async ({ signal }) => {
      active++;
      try {
        await wait(1000, signal);
        return 1;
      } finally {
        active--;
      }
    },
  }));
  const pending = runConnectivity({
    targets,
    signal: controller.signal,
    onUpdate: (reading) => updates.push(reading),
  });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(active, 0);
  assert.ok(updates.every((reading) => reading.status === 'checking'));
  const count = updates.length;
  await wait(20);
  assert.equal(updates.length, count);
});

test('a default run records all 12 attempts per site, including failed probes', async () => {
  const attempts = new Map();
  const updates = [];
  await runConnectivity({
    targets: ['responded', 'timeout', 'unavailable'].map((id) => ({
      id,
      probe: async () => {
        attempts.set(id, (attempts.get(id) ?? 0) + 1);
        if (id === 'timeout')
          throw new DOMException('Timed out', 'TimeoutError');
        if (id === 'unavailable') throw new TypeError('Network error');
        return 42;
      },
    })),
    interval: 0,
    onUpdate: (reading) => updates.push(reading),
  });
  for (const [id, count] of attempts) {
    assert.equal(count, 12);
    const completed = updates.filter(
      (reading) => reading.id === id && reading.status !== 'checking',
    );
    assert.equal(completed.length, 12);
    assert.ok(completed.every((reading) => reading.status === id));
    assert.deepEqual(
      completed.map((reading) => reading.sample),
      Array.from({ length: 12 }, (_, index) => index),
    );
  }
});

test('invalid timings are unavailable rather than displayed as successful', async () => {
  const result = await runConnectivity({
    targets: [{ id: 'bad', probe: async () => NaN }],
    samples: 1,
  });
  assert.equal(result[0].status, 'unavailable');
  assert.equal(result[0].ms, null);
});
