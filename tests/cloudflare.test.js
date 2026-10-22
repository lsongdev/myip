import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cloudflare } from '../providers/cloudflare.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('download reports actual bytes read and rejects an empty response', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url.searchParams.get('bytes'), '100');
    assert.equal(init.mode, 'cors');
    assert.equal(init.cache, 'no-store');
    return new Response(new Uint8Array(37));
  };
  let bytes = 0;
  await cloudflare.download({
    bytes: 100,
    onBytes: (count) => (bytes += count),
  });
  assert.equal(bytes, 37);
  globalThis.fetch = async () => new Response(new Uint8Array(0));
  await assert.rejects(
    cloudflare.download({ bytes: 100, onBytes() {} }),
    /empty response/,
  );
});

test('upload waits for a successful server response and rejects failed responses', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url.pathname, '/__up');
    assert.equal(init.method, 'POST');
    assert.equal(init.body.byteLength, 1024);
    return new Response('Rejected', { status: 429 });
  };
  await assert.rejects(cloudflare.upload({ bytes: 1024 }), /HTTP 429/);
});
