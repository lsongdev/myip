import {
  CONNECTIVITY_SAMPLES,
  runConnectivity,
} from '../lib/connectivity.js?v=9';
import { median } from '../lib/statistics.js';

const HISTORY = CONNECTIVITY_SAMPLES;
const statusText = {
  responded: 'Responded',
  timeout: 'Timed out',
  unavailable: 'Unavailable',
  checking: 'Checking…',
};
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const describe = (reading) =>
  reading.status === 'responded'
    ? `Responded in ${Math.round(reading.ms)} ms`
    : statusText[reading.status];

export function mountConnectivity({ root, targets }) {
  const grid = root.querySelector('.connectivity-grid');
  const action = root.querySelector('#check-sites');
  const summary = root.querySelector('#connectivity-status');
  const cards = new Map();
  const histories = new Map(targets.map((target) => [target.id, []]));
  let active;
  let suspended = false;
  let started = false;
  let pendingAuto = false;

  function render(id, reading) {
    const card = cards.get(id);
    const history = histories.get(id);
    const responses = history.filter((point) => point.status === 'responded');
    const ms = median(responses.map((point) => point.ms));
    card.button.dataset.status = reading?.status ?? 'idle';
    card.time.textContent = ms === null ? '—' : Math.round(ms);
    card.time.title = responses.length
      ? `Median of ${responses.length} ${responses.length === 1 ? 'response' : 'responses'}`
      : 'No responses yet';
    card.status.textContent = reading
      ? statusText[reading.status]
      : 'Not checked';
    card.history.replaceChildren();
    for (let index = 0; index < HISTORY; index++) {
      const point = history[index];
      const dot = element('span', 'history-dot');
      dot.dataset.status = point?.status ?? 'empty';
      if (point) {
        dot.title = describe(point);
        if (point.ms >= 800) dot.dataset.slow = 'true';
      }
      card.history.append(dot);
    }
    card.history.setAttribute(
      'aria-label',
      history.length
        ? `Recent checks: ${history.map(describe).join('; ')}`
        : 'No checks yet',
    );
    card.button.setAttribute(
      'aria-label',
      `Check ${card.name}. ${ms === null ? 'No responses yet' : `Median response ${Math.round(ms)} ms from ${responses.length} ${responses.length === 1 ? 'response' : 'responses'}`}. Latest check: ${reading ? describe(reading) : 'Not checked'}`,
    );
  }

  const lock = (value) => {
    for (const card of cards.values()) card.button.disabled = value;
  };
  function cancel(reason) {
    active?.abort(reason);
  }

  async function check(selected = targets) {
    if (suspended) return;
    cancel();
    const controller = (active = new AbortController());
    started = true;
    action.textContent = 'Stop';
    lock(true);
    root.setAttribute('aria-busy', 'true');
    let finished = 0;
    const total = selected.length * CONNECTIVITY_SAMPLES;
    for (const target of selected) {
      histories.set(target.id, []);
      render(target.id);
    }
    summary.textContent = `Checking 0 / ${total}…`;
    try {
      await runConnectivity({
        targets: selected,
        samples: CONNECTIVITY_SAMPLES,
        signal: controller.signal,
        onUpdate(reading) {
          if (active !== controller || controller.signal.aborted) return;
          if (reading.status !== 'checking') {
            const history = histories.get(reading.id);
            history.push(reading);
            if (history.length > HISTORY) history.shift();
            summary.textContent = `Checking ${++finished} / ${total}…`;
          }
          render(reading.id, reading);
        },
      });
      if (active === controller) {
        const responded = selected.filter(
          (target) => histories.get(target.id).at(-1)?.status === 'responded',
        ).length;
        summary.textContent = `${responded} / ${selected.length} ${selected.length === 1 ? 'site' : 'sites'} responded · ${CONNECTIVITY_SAMPLES} checks per site complete`;
      }
    } catch (error) {
      if (active === controller)
        summary.textContent = controller.signal.aborted
          ? `Check stopped${controller.signal.reason === 'tab hidden' ? ' (tab hidden)' : ''} · ${finished} / ${total} completed.`
          : 'Could not complete the check. Try again.';
    } finally {
      if (active === controller) {
        active = null;
        action.textContent = 'Check again ↻';
        action.disabled = suspended;
        lock(suspended);
        root.setAttribute('aria-busy', 'false');
        for (const target of selected)
          render(target.id, histories.get(target.id).at(-1));
        if (suspended) summary.textContent = 'Paused during the speed test.';
      }
    }
  }

  for (const target of targets) {
    const item = element('li', 'site-item');
    const button = element('button', 'site-card');
    button.type = 'button';
    const heading = element('span', 'site-heading');
    const icon = element('img', `site-icon site-icon-${target.id}`);
    icon.src = target.icon;
    icon.alt = '';
    icon.width = icon.height = 20;
    icon.addEventListener(
      'error',
      () => {
        icon.replaceWith(element('span', 'site-initial', target.name[0]));
      },
      { once: true },
    );
    heading.append(icon, element('span', 'site-name', target.name));
    const region = element(
      'span',
      `site-region ${target.region}`,
      target.region === 'mainland' ? 'CN' : 'Global',
    );
    heading.append(region);
    const reading = element('span', 'site-reading');
    const value = element('span', 'site-duration');
    const time = element('strong', 'site-time', '—');
    value.append(time, element('span', 'site-unit', 'ms'));
    const status = element('span', 'site-status', 'Not checked');
    reading.append(value, status);
    const history = element('span', 'site-history');
    history.setAttribute('role', 'img');
    button.append(heading, reading, history);
    item.append(button);
    grid.append(item);
    cards.set(target.id, { button, time, status, history, name: target.name });
    render(target.id);
    button.addEventListener('click', () => check([target]));
  }
  action.addEventListener('click', () => (active ? cancel() : check()));
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            if (started) return;
            if (suspended) pendingAuto = true;
            else check();
          },
          { threshold: 0.15 },
        )
      : null;
  observer?.observe(root);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancel('tab hidden');
  });

  return {
    cancel,
    setSuspended(value) {
      suspended = value;
      if (value) cancel();
      action.disabled = value;
      lock(value || !!active);
      if (value) summary.textContent = 'Paused during the speed test.';
      else if (pendingAuto) {
        pendingAuto = false;
        check();
      } else if (!active)
        summary.textContent = started
          ? 'Ready to check again.'
          : 'Checks start when this section is in view.';
    },
  };
}
