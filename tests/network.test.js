import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPublicIP,
  ipVersion,
  lookupLocation,
  resolveDNS,
} from '../providers/network.js';
import { request } from '../lib/http.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const respond = (data) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
  });

test('IP parsing rejects invalid input and distinguishes families', () => {
  assert.equal(ipVersion('203.0.113.4'), 4);
  assert.equal(ipVersion('999.1.1.1'), null);
  assert.equal(ipVersion('2001:db8::1'), 6);
  assert.equal(ipVersion('hello:world'), null);
  assert.equal(ipVersion('2001::db8::1'), null);
});

test('IPv6 lookup uses IPv6-only endpoint and rejects IPv4 fallback responses', async () => {
  globalThis.fetch = async (url) => {
    assert.match(String(url), /api6\.ipify\.org/);
    return respond({ ip: '203.0.113.4' });
  };
  await assert.rejects(getPublicIP({ version: 6 }), /IPv6 address/);
});

test('DNS sends the selected type and retains multiple answers and CNAMEs', async () => {
  globalThis.fetch = async (url) => {
    assert.equal(url.searchParams.get('type'), 'AAAA');
    assert.equal(url.searchParams.get('name'), 'example.org');
    return respond({
      Status: 0,
      Answer: [
        { name: 'example.org.', type: 5, TTL: 60, data: 'alias.example.org.' },
        { name: 'alias.example.org.', type: 28, TTL: 30, data: '2001:db8::1' },
        { name: 'alias.example.org.', type: 28, TTL: 30, data: '2001:db8::2' },
      ],
    });
  };
  const result = await resolveDNS({ hostname: 'example.org.', type: 'AAAA' });
  assert.equal(result.answers.length, 3);
  assert.equal(result.answers[0].type, 'CNAME');
});

test('DNS handles NXDOMAIN and no matching records without crashing', async () => {
  globalThis.fetch = async () => respond({ Status: 3 });
  assert.deepEqual(
    (await resolveDNS({ hostname: 'missing.example' })).answers,
    [],
  );
  assert.equal(
    (await resolveDNS({ hostname: 'missing.example' })).exists,
    false,
  );
  globalThis.fetch = async () => respond({ Status: 0 });
  assert.equal((await resolveDNS({ hostname: 'example.org' })).exists, true);
});

test('DNS validates hostname and converts international domain names', async () => {
  await assert.rejects(
    resolveDNS({ hostname: 'https://example.org/path' }),
    /hostname/,
  );
  await assert.rejects(resolveDNS({ hostname: '-invalid.org' }), /hostname/);
  await assert.rejects(
    resolveDNS({ hostname: 'example.org', type: 'constructor' }),
    /Unsupported/,
  );
  globalThis.fetch = async (url) => {
    assert.equal(url.searchParams.get('name'), 'xn--bcher-kva.de');
    return respond({ Status: 0 });
  };
  await resolveDNS({ hostname: 'bücher.de' });
});

test('geolocation rejects service error payloads instead of displaying success', async () => {
  globalThis.fetch = async () =>
    respond({ error: true, reason: 'Rate limited' });
  await assert.rejects(lookupLocation({ ip: '203.0.113.1' }), /Rate limited/);
});

test('HTTP rejects non-2xx bodies, and caller cancellation reaches fetch', async () => {
  globalThis.fetch = async () => new Response('failure', { status: 503 });
  await assert.rejects(request('https://example.org'), /HTTP 503/);
  const controller = new AbortController();
  globalThis.fetch = async (url, { signal }) => {
    signal.throwIfAborted();
  };
  controller.abort();
  await assert.rejects(
    request('https://example.org', { signal: controller.signal }),
    { name: 'AbortError' },
  );
});

test('deadline also covers a stalled response body', async () => {
  globalThis.fetch = async (url, { signal }) => ({
    ok: true,
    json: () =>
      new Promise((resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        }),
      ),
  });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(request('https://example.org', { timeout: 20 }), {
      name: 'TimeoutError',
    });
  } finally {
    clearTimeout(keepAlive);
  }
});
