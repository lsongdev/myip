const WIDTH = 960;
const HEIGHT = 200;

/** Plot absolute Mbps on a shared scale; below-axis upload values are not negative speeds. */
export function buildThroughputChart({
  phase,
  download,
  upload,
  duration = 12000,
}) {
  const samples = (reading) =>
    (reading?.samples ?? []).filter(
      (sample) =>
        Number.isFinite(sample.mbps) &&
        sample.mbps >= 0 &&
        Number.isFinite(sample.elapsed) &&
        sample.elapsed >= 0,
    );
  const series = { download: samples(download), upload: samples(upload) };
  const mirrored =
    phase === 'done' ||
    (phase === 'stopped' &&
      series.download.length > 0 &&
      series.upload.length > 0);
  const visible = mirrored
    ? series
    : {
        download:
          phase === 'download' || (phase === 'stopped' && !series.upload.length)
            ? series.download
            : [],
        upload:
          phase === 'upload' ||
          (phase === 'stopped' && series.upload.length > 0)
            ? series.upload
            : [],
      };
  const all = [...visible.download, ...visible.upload];
  const end = Math.max(duration, ...all.map((sample) => sample.elapsed));
  const maximum = Math.max(1, ...all.map((sample) => sample.mbps)) * 1.15;
  const baseline = mirrored || !all.length ? HEIGHT / 2 : HEIGHT - 8;
  const amplitude = mirrored ? HEIGHT / 2 - 12 : HEIGHT - 20;
  const path = (direction) => {
    const points = visible[direction].map((sample) => {
      const x = (sample.elapsed / end) * WIDTH;
      const offset = (sample.mbps / maximum) * amplitude;
      const y =
        baseline + (mirrored && direction === 'upload' ? offset : -offset);
      return [x.toFixed(2), y.toFixed(2)];
    });
    if (points.length < 2) return { line: '', area: '' };
    return {
      line: `M${points.map((point) => point.join(',')).join(' L')}`,
      area: `M${points[0][0]},${baseline} L${points.map((point) => point.join(',')).join(' L')} L${points.at(-1)[0]},${baseline} Z`,
    };
  };
  return {
    baseline,
    grid:
      mirrored || !all.length
        ? 'M0 50H960 M0 150H960'
        : 'M0 48H960 M0 96H960 M0 144H960',
    axis: `M0 ${baseline}H960`,
    download: path('download'),
    upload: path('upload'),
    caption: mirrored
      ? 'Download above · Upload below · Mbps'
      : phase === 'download'
        ? 'Download speed over time · Mbps'
        : phase === 'upload'
          ? 'Upload speed over time · Mbps'
          : 'Speed over time · Mbps',
    ticks: Array.from(
      { length: 5 },
      (_, index) => `${Math.round(((end / 1000) * index) / 4)}s`,
    ),
  };
}
