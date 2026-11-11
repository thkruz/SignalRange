import { badgeText, formatClock, formatSampleValue } from '@app/pages/mission-control/tabs/field-service-panel';
import type { ServiceModel } from '@app/physical/service-model';
import type { SampleMetric, ServiceLayer, ServiceSample } from '@app/physical/service-types';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import './laptop-apps.css';

/**
 * NetProbe - The laptop's network diagnostic tool (local-probe evidence).
 *
 * The player picks a host on the left (each service's local network and the far side of its
 * terminal) and runs a command from the toolbar. The command prints into a console like a real
 * ping or speed tool, each result block carrying when it was taken and whether it still counts.
 * A monitor pane on the right keeps the event log the probe has seen (status changes, outages).
 * Every reading goes through the panel's `check`, so time cost, provenance and freshness are the
 * same rules as everywhere else.
 */

type Check = (serviceId: string, layer: ServiceLayer, metric: SampleMetric) => ServiceSample | null;

interface Command {
  id: string;
  label: string;
  /** What the console echoes; `%h` is the host address */
  echo: string;
  metrics: SampleMetric[];
}

const COMMANDS: Record<'local' | 'registration', Command[]> = {
  local: [{ id: 'ping', label: 'Ping', echo: 'ping %h', metrics: ['status'] }],
  registration: [
    { id: 'status', label: 'Link status', echo: 'linkstat %h', metrics: ['status'] },
    { id: 'ping', label: 'Ping', echo: 'ping %h -n 20', metrics: ['rttMs', 'lossPct'] },
    { id: 'jitter', label: 'Jitter', echo: 'jitter %h -t 60', metrics: ['jitterMs'] },
    { id: 'speed', label: 'Throughput', echo: 'speed %h', metrics: ['downMbps', 'upMbps'] },
  ],
};

interface LogBlock {
  key: string;
  serviceId: string;
  echo: string;
  sampleIds: string[];
}

/** Addresses printed in the console; cosmetic, one per service path */
function addresses(serviceId: string, index: number): Record<'local' | 'registration', string> {
  return serviceId.includes('skylink') || index === 0
    ? { local: '192.168.1.1', registration: `100.64.0.${index + 1}` }
    : { local: `192.168.${100 + index}.1`, registration: `10.40.${index}.1` };
}

export class NetProbeApp {
  private selected_: { serviceId: string; layer: 'local' | 'registration' } | null = null;
  private readonly log_: LogBlock[] = [];
  private busy_ = false;
  private builtKey_ = '';
  private note_ = '';

  constructor(
    private readonly host_: HTMLElement,
    private readonly check_: Check
  ) {
    this.host_.addEventListener('click', this.onClick_);
  }

  destroy(): void {
    this.host_.removeEventListener('click', this.onClick_);
  }

  setNote(note: string): void {
    this.note_ = note;
  }

  sync(model: ServiceModel, nowS: number): void {
    const ids = model.getServiceIds();
    if (!this.selected_ || !ids.includes(this.selected_.serviceId)) this.selected_ = ids[0] ? { serviceId: ids[0], layer: 'registration' } : null;
    const key = `${ids.join('|')}#${this.selected_?.serviceId}:${this.selected_?.layer}`;
    if (key !== this.builtKey_) {
      this.build_(model);
      this.builtKey_ = key;
    }
    this.patch_(model, nowS);
  }

  private hostAddress_(model: ServiceModel, serviceId: string, layer: 'local' | 'registration'): string {
    return addresses(serviceId, model.getServiceIds().indexOf(serviceId))[layer];
  }

  private build_(model: ServiceModel): void {
    const sel = this.selected_;
    const hosts = model
      .getServiceIds()
      .map((id) => {
        const label = escapeHtml(model.getPath(id)?.label ?? id);
        const row = (layer: 'local' | 'registration', name: string) => {
          const on = sel?.serviceId === id && sel.layer === layer;
          return `<li><button type="button" class="np-host" data-np-host="${escapeHtml(id)}" data-np-layer="${layer}" aria-pressed="${on}">
              <span class="np-host-dot" data-np="dot-${escapeHtml(id)}-${layer}"></span>
              <span class="np-host-name">${name}</span>
              <span class="np-host-addr">${this.hostAddress_(model, id, layer)}</span>
            </button></li>`;
        };
        return `<li class="np-group"><div class="np-group-title">${label}</div><ul>${row('local', 'Local network')}${row('registration', 'Through the terminal')}</ul></li>`;
      })
      .join('');
    const commands = sel
      ? COMMANDS[sel.layer].map((c) => `<button type="button" class="np-cmd" data-np-cmd="${c.id}" data-np-metrics="${c.metrics.join(' ')}">${c.label}</button>`).join('')
      : '';
    const target = sel ? `${escapeHtml(model.getPath(sel.serviceId)?.label ?? sel.serviceId)} · ${sel.layer === 'local' ? 'Local network' : 'Through the terminal'}` : '';
    this.host_.innerHTML = `
      <div class="np" data-laptop-surface="netprobe">
        <aside class="np-hosts" aria-label="Hosts"><div class="np-pane-title">Hosts</div><ul>${hosts}</ul></aside>
        <section class="np-main" aria-label="Console">
          <div class="np-toolbar" role="toolbar" aria-label="Commands">
            <span class="np-target">${target}</span>
            <span class="np-cmds">${commands}</span>
          </div>
          <div class="np-console" data-np="console" aria-live="polite"></div>
          <div class="np-statusbar"><span data-np="status"></span><span data-np="note"></span></div>
        </section>
        <aside class="np-monitor" aria-label="Monitor">
          <div class="np-pane-title">Monitor</div>
          <div data-np="monitor"></div>
        </aside>
      </div>`;
  }

  private patch_(model: ServiceModel, nowS: number): void {
    const samples = new Map<string, ServiceSample>();
    for (const id of model.getServiceIds()) for (const s of model.samplesFor(id)) samples.set(s.id, s);

    // Host dots: the latest probe reading of that host, never the hidden truth
    for (const id of model.getServiceIds()) {
      for (const layer of ['local', 'registration'] as const) {
        const last = model
          .samplesFor(id)
          .filter((s) => s.provenance === 'local-probe' && s.layer === layer)
          .at(-1);
        const dot = this.host_.querySelector<HTMLElement>(`[data-np="dot-${CSS.escape(id)}-${layer}"]`);
        const cls = `np-host-dot${last ? ` np-${model.freshness(last) === 'current' ? (typeof last.value === 'number' ? 'up' : last.value) : 'old'}` : ''}`;
        if (dot && dot.className !== cls) dot.className = cls;
      }
    }

    const consoleEl = this.host_.querySelector<HTMLElement>('[data-np="console"]');
    if (consoleEl) {
      const html =
        this.log_.length === 0
          ? `<p class="np-banner">NetProbe 4.2 · field edition<br>Pick a host, then run a command. Each command takes time on the clock.</p>`
          : this.log_
              .map((block) => {
                const lines = block.sampleIds
                  .map((sid) => samples.get(sid))
                  .filter((s): s is ServiceSample => !!s)
                  .map((s) => `<div class="np-out np-v-${typeof s.value === 'number' ? 'num' : s.value}">${escapeHtml(formatSampleValue(s))}</div>`)
                  .join('');
                const first = block.sampleIds.map((sid) => samples.get(sid)).find((s): s is ServiceSample => !!s);
                const freshness = first ? model.freshness(first) : null;
                const why = first && freshness === 'invalidated' ? model.invalidation(first) : null;
                const badge = first
                  ? badgeText({
                      sample: first,
                      freshness,
                      invalidatedWhy: why
                        ? why.kind === 'event'
                          ? `${why.label} at ${formatClock(why.atS)}`
                          : `equipment or settings changed at ${formatClock(why.atS)}`
                        : undefined,
                    })
                  : '';
                return `<div class="np-block" data-np-block="${escapeHtml(block.key)}">
                  <div class="np-echo"><span class="np-prompt">probe&gt;</span> ${escapeHtml(block.echo)}<span class="np-time">${first ? formatClock(first.tS) : ''}</span></div>
                  ${lines}
                  <div class="np-fresh np-f-${freshness ?? 'none'}">${escapeHtml(badge)}</div>
                </div>`;
              })
              .join('');
      const sig = `${html}${this.busy_}`;
      if (consoleEl.dataset.sig !== sig) {
        consoleEl.dataset.sig = sig;
        consoleEl.innerHTML = html + (this.busy_ ? '<div class="np-running">running<span>.</span><span>.</span><span>.</span></div>' : '');
        consoleEl.scrollTop = consoleEl.scrollHeight;
      }
    }

    for (const btn of this.host_.querySelectorAll<HTMLButtonElement>('.np-cmd')) btn.disabled = this.busy_;
    this.setText_('status', this.busy_ ? 'Running…' : 'Ready');
    this.setText_('note', this.note_);

    const monitor = this.host_.querySelector<HTMLElement>('[data-np="monitor"]');
    if (monitor) {
      const html = model
        .getServiceIds()
        .map((id) => {
          const history = model
            .history(id)
            .slice(-12)
            .reverse()
            .map(
              (h) =>
                `<li><span class="np-time">${formatClock(h.tS)}</span> ${escapeHtml(`${h.layer === 'registration' ? 'Terminal link' : h.layer[0].toUpperCase() + h.layer.slice(1)}: ${h.from} → ${h.to}`)}</li>`
            )
            .join('');
          const intervals = model
            .intervals(id)
            .map((rec) => {
              const span = (k: 'restoration' | 'response' | 'startup') => {
                const v = model.intervalSpanS(rec.id, k);
                return v === null ? 'open' : `${Math.round(v * 10) / 10} s`;
              };
              const at = (v: number | null) => (v === null ? '—' : formatClock(v));
              return `<li class="np-outage"><b>Outage</b> ${at(rec.startS)}<br>Operator activated ${at(rec.activationS)} (${span('response')})<br>Terminal registered ${at(rec.registeredS)} (${span('startup')})<br>Service usable ${at(rec.usableS)}<br>Time to restore: <b>${span('restoration')}</b></li>`;
            })
            .join('');
          return `<div class="np-mon-svc"><div class="np-group-title">${escapeHtml(model.getPath(id)?.label ?? id)}</div><ul>${intervals}${history || '<li class="np-quiet">No changes seen.</li>'}</ul></div>`;
        })
        .join('');
      if (monitor.dataset.sig !== html) {
        monitor.dataset.sig = html;
        monitor.innerHTML = html;
      }
    }
    void nowS;
  }

  private setText_(key: string, text: string): void {
    const el = this.host_.querySelector<HTMLElement>(`[data-np="${key}"]`);
    if (el && el.textContent !== text) el.textContent = text;
  }

  /** Run a command on the selected host; returns the samples it took */
  run(commandId: string, model: ServiceModel): ServiceSample[] {
    const sel = this.selected_;
    const cmd = sel ? COMMANDS[sel.layer].find((c) => c.id === commandId) : undefined;
    if (!sel || !cmd) return [];
    const taken = cmd.metrics.map((m) => this.check_(sel.serviceId, sel.layer, m)).filter((s): s is ServiceSample => !!s);
    this.log_.push({
      key: `${this.log_.length}`,
      serviceId: sel.serviceId,
      echo: cmd.echo.replace('%h', this.hostAddress_(model, sel.serviceId, sel.layer)),
      sampleIds: taken.map((s) => s.id),
    });
    if (this.log_.length > 40) this.log_.shift();

    return taken;
  }

  selectHost(serviceId: string, layer: 'local' | 'registration'): void {
    this.selected_ = { serviceId, layer };
  }

  /** Set by the owner so a click can reach the live model */
  modelForClick: (() => ServiceModel | null) | null = null;
  afterRun: (() => void) | null = null;

  private readonly onClick_ = (e: Event): void => {
    const t = e.target as HTMLElement;
    const host = t.closest<HTMLElement>('[data-np-host]');
    if (host) {
      this.selectHost(host.dataset.npHost!, host.dataset.npLayer as 'local' | 'registration');
      this.builtKey_ = '';
      this.afterRun?.();
      return;
    }
    const cmd = t.closest<HTMLButtonElement>('[data-np-cmd]');
    const model = this.modelForClick?.();
    if (!cmd || !model || this.busy_) return;
    this.busy_ = true;
    this.afterRun?.();
    window.setTimeout(() => {
      this.busy_ = false;
      this.run(cmd.dataset.npCmd!, model);
      this.afterRun?.();
    }, 450);
  };
}
