import { runConnectivity } from '../lib/connectivity.js?v=8';

const HISTORY = 12;
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
    card.button.dataset.status = reading?.status ?? 'idle';
    card.time.textContent =
      reading?.status === 'responded' ? Math.round(reading.ms) : '—';
    card.status.textContent = reading
      ? statusText[reading.status]
      : 'Not checked';
    const history = histories.get(id);
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
      `Check ${card.name}. ${reading ? describe(reading) : 'Not checked'}`,
    );
  }

  const lock = (value) => {
    for (const card of cards.values()) card.button.disabled = value;
  };
  function cancel() {
    active?.abort();
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
    const total = selected.length * 3;
    summary.textContent = `Checking 0 / ${total}…`;
    try {
      await runConnectivity({
        targets: selected,
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
        summary.textContent = `${responded} / ${selected.length} ${selected.length === 1 ? 'site' : 'sites'} responded · just checked`;
      }
    } catch (error) {
      if (active === controller)
        summary.textContent = controller.signal.aborted
          ? 'Check stopped.'
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
    if (document.hidden) cancel();
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
