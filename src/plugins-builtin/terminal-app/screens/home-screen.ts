/**
 * @file home-screen - SkyLink Home: hero status, alerts, uptime and current speeds (phase 40, WP3)
 */
import { formatAge, tr } from '../strings';
import type { TerminalView } from '../terminal-app-model';
import { escapeHtml, type TerminalScreen, type TerminalScreenFactory } from './terminal-screen';

const HERO_CLASS: Record<string, string> = {
  online: 'bg-success',
  searching: 'bg-warning',
  booting: 'bg-warning',
  sleeping: 'bg-secondary',
  offline: 'bg-danger',
};

function metric(id: string, label: string): string {
  return `<div class="col-6 col-md-3"><div class="card h-100"><div class="card-body"><div class="text-secondary small">${label}</div><div class="h2 mb-0 font-monospace" id="home-${id}">${tr('home.noValue')}</div><div class="text-secondary small skylink-pending" id="home-${id}-pending"></div></div></div></div>`;
}

export const createHomeScreen: TerminalScreenFactory = (): TerminalScreen => {
  let root: HTMLElement | null = null;

  const q = (id: string): HTMLElement | null => root?.querySelector(`#home-${id}`) ?? null;
  const setText = (id: string, text: string): void => {
    const el = q(id);
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  };

  return {
    id: 'home',
    mount(container) {
      root = container;
      container.innerHTML = `
        <div class="card mb-3"><div class="card-body d-flex align-items-center gap-3">
          <span id="home-dot" class="badge bg-secondary" style="width:1rem;height:1rem;padding:0"></span>
          <div><div class="text-secondary small">${tr('home.status')}</div>
          <div class="h1 mb-0" id="home-hero">${tr('home.noValue')}</div>
          <div class="text-secondary" id="home-message"></div></div>
        </div></div>
        <div class="row g-3 mb-3">
          ${metric('down', tr('home.download'))}${metric('up', tr('home.upload'))}${metric('latency', tr('home.latency'))}${metric('uptime', tr('home.uptime'))}
        </div>
        <p class="text-secondary small" id="home-capacity-note">${tr('home.capacityNote')}</p>
        <div class="card"><div class="card-header"><h3 class="card-title">${tr('home.alerts')}</h3></div>
          <div class="card-body"><ul class="list-unstyled mb-0" id="home-alerts"></ul></div></div>`;
    },
    sync(view: TerminalView) {
      const d = view.data;
      if (!d) {
        return;
      }
      setText('hero', d.heroText);
      setText('message', d.message ?? '');
      const dot = q('dot');
      if (dot) {
        dot.className = `badge ${HERO_CLASS[d.hero] ?? 'bg-secondary'}`;
      }
      const pending = !d.measured;
      const pendingHint = pending ? tr('home.measuring') : '';
      setText('down', pending ? tr('home.pendingValue') : tr('home.unitMbps', { value: d.downMbps.toFixed(0) }));
      setText('up', pending ? tr('home.pendingValue') : tr('home.unitMbps', { value: d.upMbps.toFixed(0) }));
      setText('latency', pending ? tr('home.pendingValue') : d.latencyMs === null ? tr('home.noValue') : tr('home.unitMs', { value: Math.round(d.latencyMs) }));
      setText('down-pending', pendingHint);
      setText('up-pending', pendingHint);
      setText('latency-pending', pendingHint);
      setText('uptime', formatAge(d.uptimeS));
      const alerts = q('alerts');
      if (alerts) {
        const html = d.alerts.length
          ? d.alerts.map((a) => `<li class="mb-1"><span class="badge bg-warning me-2"></span>${escapeHtml(a.text)}</li>`).join('')
          : `<li class="text-secondary">${tr('home.noAlerts')}</li>`;
        if (alerts.innerHTML !== html) {
          alerts.innerHTML = html;
        }
      }
    },
    dispose() {
      root = null;
    },
  };
};
