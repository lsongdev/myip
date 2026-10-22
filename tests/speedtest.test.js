import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSpeedtest } from '../lib/speedtest.js';
import { wait } from '../lib/http.js';
import { median, jitter, sustained, isStable } from '../lib/statistics.js';

test('statistics ignore warm-up and single bursts without mutating input', () => {
  assert.equal(median([90, 10, 20, 30]), 25);
  assert.equal(jitter([10, 20, 15]), 7.5);
  assert.equal(jitter([10]), null);
  const samples = Array.from({ length: 32 }, (_, index) => ({
    elapsed: (index + 1) * 250,
    mbps: index < 5 ? 1000 : 100,
  }));
  assert.equal(sustained(samples), 100);
  assert.equal(isStable(samples), true);
  assert.equal(samples[0].mbps, 1000);
  assert.equal(sustained([]), null);
});

test('cancelled run rejects, closes transfers and never reports again', async () => {
  const controller = new AbortController();
  let updates = 0;
  let active = 0;
  const transport = {
    ping: async () => 10,
    download: async ({ signal }) => {
      active++;
      try {
        await wait(1000, signal);
      } finally {
        active--;
      }
    },
  };
  const running = runSpeedtest({
    transport,
    signal: controller.signal,
    onUpdate: () => updates++,
  });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(running, { name: 'AbortError' });
  assert.equal(active, 0);
  const stoppedAt = updates;
  await wait(40);
  assert.equal(updates, stoppedAt);
});

test('failed download fails the run and never starts upload', async () => {
  let uploaded = false;
  const transport = {
    ping: async () => 10,
    download: async () => {
      throw new Error('Download rejected');
    },
    upload: async () => {
      uploaded = true;
    },
  };
  await assert.rejects(runSpeedtest({ transport }), /Download rejected/);
  assert.equal(uploaded, false);
});

test('completed run counts bytes, measures acknowledged uploads, and returns immutable snapshots', async () => {
  const states = [];
  let concurrent = 0;
  let maximum = 0;
  const transport = {
    ping: async () => 10,
    download: async ({ signal, onBytes }) => {
      concurrent++;
      maximum = Math.max(maximum, concurrent);
      try {
        await wait(30, signal);
        onBytes(65536);
      } finally {
        concurrent--;
      }
    },
    upload: async ({ signal }) => {
      await wait(35, signal);
    },
  };
  const result = await runSpeedtest({
    transport,
    streams: 1,
    duration: 2000,
    onUpdate: (state) => states.push(state),
  });
  assert.equal(maximum, 1);
  assert.equal(result.phase, 'done');
  assert.ok(result.download.bytes > 0);
  assert.ok(result.upload.bytes > 0);
  assert.ok(result.upload.mbps > 0);
  assert.equal(result.latency, 10);
  assert.equal(result.jitter, 0);
  assert.equal(states[0].download, null);
  const partial = states.find((state) => state.download?.samples.length);
  assert.ok(partial.download.samples.length < result.download.samples.length);
});

test('download-only provider skips upload', async () => {
  const phases = [];
  const result = await runSpeedtest({
    transport: {
      ping: async () => 1,
      download: async ({ signal, onBytes }) => {
        await wait(25, signal);
        onBytes(1024);
      },
    },
    duration: 2000,
    onUpdate: (state) => phases.push(state.phase),
  });
  assert.equal(result.upload, null);
  assert.equal(result.phase, 'done');
  assert.ok(!phases.includes('upload'));
});
