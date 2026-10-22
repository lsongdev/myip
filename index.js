import { runSpeedtest } from './lib/speedtest.js';
import { cloudflare } from './providers/cloudflare.js';
import {
  getPublicIP,
  lookupLocation,
  resolveDNS,
  ipVersion,
} from './providers/network.js';

const $ = (id) => document.getElementById(id);
const targets = [cloudflare];
const addresses = new Map();
let hidden = false;
let run;
let result;
let ipRequest;
let geoRequest;
let dnsRequest;
let theme = 'system';
try {
  theme = localStorage.getItem('myip-theme') || 'system';
} catch {
  /* Storage may be unavailable. */
}

function applyTheme() {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  $('theme').textContent = `${theme[0].toUpperCase()}${theme.slice(1)} theme`;
}
applyTheme();
$('theme').addEventListener('click', () => {
  theme = ['system', 'light', 'dark'][
    (['system', 'light', 'dark'].indexOf(theme) + 1) % 3
  ];
  try {
    localStorage.setItem('myip-theme', theme);
  } catch {
    /* Optional preference. */
  }
  applyTheme();
});

const number = (value) =>
  Number.isFinite(value) ? value.toFixed(value >= 100 ? 0 : 1) : '—';
const size = (bytes) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MiB`
    : bytes >= 1024
      ? `${(bytes / 1024).toFixed(0)} KiB`
      : `${bytes} B`;
const announce = (message) => {
  $('announcement').textContent = message;
};
const setStatus = (id, message, error = false) => {
  $(id).textContent = message;
  $(id).classList.toggle('error', error);
};
const errorMessage = (error) =>
  error.name === 'TimeoutError'
    ? 'The request timed out. Please try again.'
    : error instanceof TypeError && /fetch|network|load/i.test(error.message)
      ? 'Could not reach the service. Check your connection or try another provider.'
      : error.message || 'The request failed. Please try again.';

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    announce('Copied to clipboard.');
  } catch {
    announce('Clipboard unavailable. Select and copy the text manually.');
  }
}

function renderAddresses() {
  for (const version of [4, 6]) {
    const value = addresses.get(version);
    $(`ipv${version}`).textContent =
      hidden && value
        ? '••••••••••••'
        : value || (ipRequest ? 'Checking…' : 'Unavailable');
    $(`ipv${version}`).disabled = !value || hidden;
  }
}
for (const version of [4, 6])
  $(`ipv${version}`).addEventListener('click', () => {
    if (!hidden) copy(addresses.get(version));
  });
$('privacy').addEventListener('click', () => {
  hidden = !hidden;
  document.body.classList.toggle('hide-details', hidden);
  $('privacy').setAttribute('aria-pressed', hidden);
  $('privacy').textContent = hidden ? 'Show IP details ◉' : 'Hide IP details ◉';
  $('ip-address').type = hidden ? 'password' : 'text';
  $('geo-results').hidden = hidden;
  for (const button of $('dns-results').querySelectorAll('[data-ip]')) {
    button.textContent = hidden ? '••••••••' : button.dataset.ip;
    button.disabled = hidden;
  }
  $('connection-location').textContent = hidden
    ? 'Details hidden'
    : connectionDescription;
  renderAddresses();
});

let connectionDescription = 'Looking up your network…';
async function refreshAddresses() {
  ipRequest?.abort();
  const controller = (ipRequest = new AbortController());
  addresses.clear();
  renderAddresses();
  connectionDescription = 'Looking up your network…';
  if (!hidden) $('connection-location').textContent = connectionDescription;
  const pending = [4, 6].map(async (version) => {
    try {
      let ip;
      try {
        ip = await getPublicIP({ version, signal: controller.signal });
      } catch {
        controller.signal.throwIfAborted();
        ip = await getPublicIP({
          version,
          provider: 'icanhazip',
          signal: controller.signal,
        });
      }
      controller.signal.throwIfAborted();
      addresses.set(version, ip);
      renderAddresses();
    } catch {
      if (!controller.signal.aborted)
        $(`ipv${version}`).textContent =
          version === 6 ? 'IPv6 unavailable' : 'Lookup unavailable';
    }
  });
  await Promise.allSettled(pending);
  if (ipRequest !== controller) return;
  // Keep a useful IPv6-specific failure label after both requests finish.
  renderAddresses();
  if (!addresses.has(6)) $('ipv6').textContent = 'IPv6 unavailable';
  const ip = addresses.get(4) || addresses.get(6);
  if (!ip) {
    connectionDescription = 'Network details unavailable';
  } else {
    if (!$('ip-address').value) $('ip-address').value = ip;
    try {
      const location = await lookupLocation({ ip, signal: controller.signal });
      controller.signal.throwIfAborted();
      connectionDescription =
        [location.city, location.country, location.provider]
          .filter(Boolean)
          .join(' · ') || 'Location unavailable';
    } catch {
      if (controller.signal.aborted) return;
      connectionDescription = 'Location unavailable · IP lookup succeeded';
    }
  }
  if (!hidden) $('connection-location').textContent = connectionDescription;
  if (ipRequest === controller) {
    ipRequest = null;
    renderAddresses();
    if (!addresses.has(6)) $('ipv6').textContent = 'IPv6 unavailable';
  }
}
$('refresh-ip').addEventListener('click', refreshAddresses);

for (const target of targets)
  $('target').add(new Option(target.name, target.id));

function chart(direction, samples) {
  const values = samples.map((sample) => sample.mbps);
  const maximum = Math.max(1, ...values) * 1.15;
  const points = values.map(
    (value, index) =>
      `${((index / Math.max(values.length - 1, 1)) * 480).toFixed(1)},${(108 - (value / maximum) * 100).toFixed(1)}`,
  );
  $(`${direction}-line`).setAttribute(
    'd',
    points.length > 1 ? `M${points.join(' L')}` : '',
  );
  $(`${direction}-area`).setAttribute(
    'd',
    points.length > 1 ? `M0,112 L${points.join(' L')} L480,112 Z` : '',
  );
}

function renderSpeed(state) {
  $('latency').textContent = number(state.latency);
  $('jitter').textContent = number(state.jitter);
  for (const direction of ['download', 'upload']) {
    const reading = state[direction];
    const active = state.phase === direction;
    const phaseTag = active
      ? 'MEASURING'
      : reading
        ? state.phase === 'done' ||
          (direction === 'download' && state.phase === 'upload')
          ? 'COMPLETE'
          : 'PARTIAL'
        : 'WAITING';
    $(`${direction}-panel`).classList.toggle('active', active);
    $(`${direction}-state`).textContent = phaseTag;
    $(`${direction}-speed`).textContent = number(reading?.mbps);
    $(`${direction}-latency`).textContent = `${number(reading?.latency)} ms`;
    $(`${direction}-bytes`).textContent = size(reading?.bytes ?? 0);
    chart(direction, reading?.samples ?? []);
  }
}

$('start').addEventListener('click', async () => {
  if (run) {
    run.abort();
    return;
  }
  const controller = (run = new AbortController());
  result = null;
  $('copy-result').disabled = true;
  $('target').disabled = $('streams').disabled = true;
  $('start').classList.add('running');
  $('start-icon').textContent = '□';
  $('start-label').textContent = 'Stop test';
  renderSpeed({ phase: 'latency' });
  let latest;
  try {
    const state = await runSpeedtest({
      transport: targets.find((target) => target.id === $('target').value),
      streams: Number($('streams').value),
      signal: controller.signal,
      onUpdate(state) {
        latest = state;
        renderSpeed(state);
        setStatus(
          'test-status',
          {
            latency: 'Measuring idle latency…',
            download: 'Measuring download…',
            upload: 'Measuring upload…',
            done: 'Test complete.',
          }[state.phase],
        );
      },
    });
    result = {
      ...state,
      target: $('target').selectedOptions[0].textContent,
      streams: Number($('streams').value),
    };
    $('copy-result').disabled = false;
  } catch (error) {
    setStatus(
      'test-status',
      controller.signal.aborted
        ? 'Test stopped. Run again anytime.'
        : errorMessage(error),
      !controller.signal.aborted,
    );
    renderSpeed({ ...latest, phase: 'stopped' });
  } finally {
    run = null;
    $('target').disabled = $('streams').disabled = false;
    $('start').classList.remove('running');
    $('start-icon').textContent = '↗';
    $('start-label').textContent = 'Test again';
  }
});

$('copy-result').addEventListener('click', () => {
  if (!result) return;
  const lines = [
    'MyIP · lsong.org/myip',
    result.target,
    `${result.streams} concurrent stream(s)`,
    `Download: ${number(result.download?.mbps)} Mbps`,
    `Upload: ${number(result.upload?.mbps)} Mbps`,
    `Latency: ${number(result.latency)} ms · Jitter: ${number(result.jitter)} ms`,
    `Loaded latency: ↓ ${number(result.download?.latency)} ms · ↑ ${number(result.upload?.latency)} ms`,
    `Transferred: ↓ ${size(result.download?.bytes ?? 0)} · ↑ ${size(result.upload?.bytes ?? 0)}`,
  ];
  if (!hidden) {
    for (const [version, ip] of addresses) lines.push(`IPv${version}: ${ip}`);
    lines.push(connectionDescription);
  }
  copy(lines.join('\n'));
});

function showLocation(location) {
  const list = document.createElement('dl');
  list.className = 'location-data';
  for (const [key, value] of Object.entries(location)) {
    if (!value) continue;
    const term = document.createElement('dt');
    term.textContent =
      key === 'ip' || key === 'asn'
        ? key.toUpperCase()
        : key[0].toUpperCase() + key.slice(1);
    const definition = document.createElement('dd');
    definition.textContent = value;
    list.append(term, definition);
  }
  $('geo-results').replaceChildren(list);
}

async function locate() {
  geoRequest?.abort();
  const controller = (geoRequest = new AbortController());
  $('geo-results').replaceChildren();
  setStatus('geo-status', 'Looking up location…');
  const button = $('geo-form').querySelector('button');
  button.disabled = true;
  try {
    const location = await lookupLocation({
      ip: $('ip-address').value.trim(),
      provider: $('geo-provider').value,
      signal: controller.signal,
    });
    controller.signal.throwIfAborted();
    showLocation(location);
    setStatus(
      'geo-status',
      'Approximate location. This may be your VPN or proxy exit.',
    );
  } catch (error) {
    if (!controller.signal.aborted)
      setStatus('geo-status', errorMessage(error), true);
  } finally {
    if (geoRequest === controller) button.disabled = false;
  }
}
$('geo-form').addEventListener('submit', (event) => {
  event.preventDefault();
  locate();
});

$('dns-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  dnsRequest?.abort();
  const controller = (dnsRequest = new AbortController());
  $('dns-results').replaceChildren();
  setStatus('dns-status', 'Resolving records…');
  const button = $('dns-form').querySelector('button');
  button.disabled = true;
  try {
    const records = await resolveDNS({
      hostname: $('hostname').value,
      type: $('record-type').value,
      signal: controller.signal,
    });
    controller.signal.throwIfAborted();
    setStatus(
      'dns-status',
      !records.exists
        ? 'This hostname does not exist (NXDOMAIN).'
        : records.answers.length
          ? `${records.answers.length} record(s). Select an IP address to look up its location.`
          : `No ${records.type} records found.`,
    );
    if (!records.answers.length) return;
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const label of ['Type', 'TTL', 'Value']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      head.append(th);
    }
    const body = table.createTBody();
    for (const answer of records.answers) {
      const row = body.insertRow();
      row.insertCell().textContent = answer.type;
      row.insertCell().textContent = `${answer.ttl}s`;
      const cell = row.insertCell();
      if (ipVersion(answer.value)) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'address-action';
        action.textContent = answer.value;
        action.dataset.ip = answer.value;
        if (hidden) {
          action.textContent = '••••••••';
          action.disabled = true;
        }
        action.title = 'Look up this IP address';
        action.addEventListener('click', () => {
          $('ip-address').value = answer.value;
          locate();
        });
        cell.append(action);
      } else cell.textContent = answer.value;
    }
    $('dns-results').replaceChildren(table);
  } catch (error) {
    if (!controller.signal.aborted)
      setStatus('dns-status', errorMessage(error), true);
  } finally {
    if (dnsRequest === controller) button.disabled = false;
  }
});

window.addEventListener('pagehide', () => {
  run?.abort();
  ipRequest?.abort();
  geoRequest?.abort();
  dnsRequest?.abort();
});
refreshAddresses();
