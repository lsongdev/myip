import { request } from '../lib/http.js';

const endpoint = (path, bytes) => {
  const url = new URL(path, 'https://speed.cloudflare.com');
  url.searchParams.set('bytes', bytes);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return url;
};

export const cloudflare = {
  id: 'cloudflare',
  name: 'Cloudflare edge',
  async ping({ signal }) {
    const url = endpoint('/__down', 0);
    const started = performance.now();
    await request(url, { signal, timeout: 5000 }, (response) =>
      response.arrayBuffer(),
    );
    const elapsed = performance.now() - started;
    const entry = performance.getEntriesByName(String(url)).at(-1);
    const measured =
      entry?.requestStart > 0 && entry?.responseStart > 0
        ? entry.responseStart - entry.requestStart
        : elapsed;
    performance.clearResourceTimings?.();
    return measured;
  },
  async download({ signal, bytes, onBytes }) {
    await request(
      endpoint('/__down', bytes),
      { signal, timeout: 15000 },
      async (response) => {
        if (!response.body)
          throw new Error(
            'Streaming downloads are unavailable in this browser.',
          );
        const reader = response.body.getReader();
        let received = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            onBytes(value.byteLength);
          }
        } finally {
          reader.releaseLock();
        }
        if (!received)
          throw new Error('The download endpoint returned an empty response.');
      },
    );
  },
  async upload({ signal, bytes }) {
    // Count acknowledged bodies, never XMLHttpRequest progress or local proxy buffering.
    await request(
      endpoint('/__up', bytes),
      {
        signal,
        timeout: 15000,
        method: 'POST',
        body: new Uint8Array(bytes),
      },
      (response) => response.arrayBuffer(),
    );
  },
};
