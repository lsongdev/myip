import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildThroughputChart } from '../ui/throughput-chart.js';

const reading = (values, interval = 1000) => ({
  samples: values.map((mbps, index) => ({
    mbps,
    elapsed: (index + 1) * interval,
  })),
});
const points = (path) =>
  [...path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(([, x, y]) => [
    Number(x),
    Number(y),
  ]);

test('completed plot shares the time and speed scales across opposite sides of one axis', () => {
  const plot = buildThroughputChart({
    phase: 'done',
    download: reading([20, 40]),
    upload: reading([20, 40]),
  });
  const down = points(plot.download.line),
    up = points(plot.upload.line);
  assert.equal(plot.baseline, 100);
  for (let i = 0; i < down.length; i++) {
    assert.equal(down[i][0], up[i][0]);
    assert.ok(down[i][1] < plot.baseline);
    assert.ok(up[i][1] > plot.baseline);
    assert.ok(
      Math.abs(plot.baseline - down[i][1] - (up[i][1] - plot.baseline)) < 0.02,
    );
  }
  assert.equal(down[0][0], 80); // 1 second on a shared 12-second axis.
  assert.deepEqual(plot.ticks, ['0s', '3s', '6s', '9s', '12s']);
});

test('live plot highlights only the active transfer, including the upload phase', () => {
  const data = { download: reading([100, 200]), upload: reading([10, 20]) };
  const plot = buildThroughputChart({ phase: 'upload', ...data });
  assert.equal(plot.download.line, '');
  assert.ok(points(plot.upload.line).every(([, y]) => y < plot.baseline));
  assert.equal(
    buildThroughputChart({ phase: 'download', ...data }).upload.line,
    '',
  );
});

test('idle, cancelled and invalid readings never produce invalid SVG coordinates', () => {
  for (const phase of ['latency', 'stopped', 'done']) {
    const plot = buildThroughputChart({
      phase,
      download: reading([NaN, -1, Infinity]),
    });
    assert.equal(plot.download.line, '');
    assert.equal(plot.upload.line, '');
    assert.ok(!JSON.stringify(plot).includes('NaN'));
  }
  const partial = buildThroughputChart({
    phase: 'stopped',
    download: reading([10, 20]),
  });
  assert.ok(partial.download.line.length > 0);
  assert.equal(partial.upload.line, '');
});
