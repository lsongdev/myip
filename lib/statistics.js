export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function jitter(values) {
  if (values.length < 2) return null;
  return (
    values
      .slice(1)
      .reduce(
        (total, value, index) => total + Math.abs(value - values[index]),
        0,
      ) /
    (values.length - 1)
  );
}

export function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

/** Trim bursts and stalls after warm-up; use the trailing five seconds. */
export function sustained(samples) {
  const end = samples.at(-1)?.elapsed ?? 0;
  const values = samples
    .filter((sample) => sample.elapsed >= 1500 && sample.elapsed > end - 5000)
    .map((sample) => sample.mbps);
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const trim = Math.floor(values.length * 0.1);
  return mean(values.slice(trim, values.length - trim));
}

export function isStable(samples) {
  const end = samples.at(-1)?.elapsed ?? 0;
  if (end < 7000) return false;
  const recent = samples
    .filter((sample) => sample.elapsed > end - 3000)
    .map((sample) => sample.mbps);
  if (recent.length < 8) return false;
  const average = mean(recent);
  return (
    average > 0 &&
    Math.sqrt(mean(recent.map((value) => (value - average) ** 2))) / average <
      0.08
  );
}
