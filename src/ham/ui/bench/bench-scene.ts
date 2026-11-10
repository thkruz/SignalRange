/**
 * @file bench-scene - Clickable drawing of the equipment at the current location
 * @description Draws every visible device with bench-shapes, its ports as connector dots and each
 * connection as a cable. Click a device or a cable to select it (the close-up shows what you can
 * do with it). Click a free port to pick up that plug, then click another port to plug it in;
 * click the same port again or press Escape to put it down. A cable is only drawn as loose after
 * the player has inspected that connection, so the drawing never gives the fault away.
 *
 * Test ids: ham-bench-scene, ham-bench-dev-<deviceId>, ham-port-<deviceId>-<portId>,
 * ham-bench-conn-<connectionId>.
 */

import type { HamStationManager } from '../../ham-station-manager';
import type { DeviceRuntime } from '../../station/station-devices';
import type { PanelContext } from '../station-panel';
import { h, PASSIVE_KINDS, PORTABLE_KINDS, tid } from '../ui-kit';
import { cableMid, cablePath, layoutBench, portKey } from './bench-layout';
import { deviceShape } from './bench-shapes';
import { jobTags } from './job-tags';

export type BenchSelection = { kind: 'device'; id: string } | { kind: 'conn'; id: string } | null;

const SVG_NS = 'http://www.w3.org/2000/svg';
const esc = (s: string): string => s.replace(/[&<>"]/gu, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);

export function benchDevices(m: HamStationManager): Readonly<DeviceRuntime>[] {
  return m.devices().filter((d) => !d.removed && !d.spare && (d.location === m.location || PORTABLE_KINDS.includes(d.kind)));
}

/** The SDR (if any) whose USB plug is in this laptop */
export function sdrOnLaptop(m: HamStationManager, laptopId: string): string | null {
  for (const c of m.connections()) {
    const ends = [c.a, c.b];
    const lap = ends.find((e) => e.deviceId === laptopId);
    const other = ends.find((e) => e.deviceId !== laptopId);
    if (lap && other && m.device(other.deviceId)?.kind === 'sdr') return other.deviceId;
  }

  return null;
}

/** Small job-tag text under a device's name, when the learner has tagged it */
function tagLabel(m: HamStationManager, deviceId: string, b: { x: number; y: number; w: number; h: number }): string {
  const text = jobTags.deviceTagText(m, deviceId);

  return text
    ? `<text class="bd-tag" fill="#79c0ff" font-size="11" font-family="system-ui, sans-serif" x="${(b.x + b.w / 2).toFixed(1)}" y="${(b.y + b.h + 30).toFixed(1)}" text-anchor="middle" pointer-events="none">${esc(text)}</text>`
    : '';
}

export class BenchScene {
  readonly el: HTMLElement;
  private readonly svg_: SVGSVGElement;
  private readonly ctx_: PanelContext;
  private readonly onSelect_: (s: BenchSelection) => void;
  private selection_: BenchSelection = null;
  private armed_: { deviceId: string; portId: string } | null = null;
  private sig_ = '';
  private readonly boundKey_: (e: KeyboardEvent) => void;

  constructor(ctx: PanelContext, onSelect: (s: BenchSelection) => void) {
    this.ctx_ = ctx;
    this.onSelect_ = onSelect;
    this.svg_ = document.createElementNS(SVG_NS, 'svg');
    this.svg_.setAttribute('class', 'ham-bench-svg');
    this.svg_.setAttribute('role', 'group');
    this.svg_.setAttribute('aria-label', 'Equipment on the bench. Click a device or cable to look at it; click a connector to pick up the plug.');
    this.svg_.addEventListener('click', (e) => this.onClick_(e));
    this.svg_.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onClick_(e);
      }
    });
    this.el = h('div', { class: 'ham-bench', id: 'ham-bench-scene', 'data-testid': 'ham-bench-scene' });
    this.el.append(this.svg_ as unknown as Node);
    this.boundKey_ = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.armed_) {
        this.armed_ = null;
        this.ctx_.feedback('', 'info');
        this.render(this.ctx_.manager, true);
      }
    };
    document.addEventListener('keydown', this.boundKey_);
  }

  get selection(): BenchSelection {
    return this.selection_;
  }

  select(s: BenchSelection): void {
    this.selection_ = s;
    this.render(this.ctx_.manager, true);
    this.onSelect_(s);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.boundKey_);
    this.el.remove();
  }

  render(m: HamStationManager, force = false): void {
    const devs = benchDevices(m);
    const conns = m.connections();
    const sig = JSON.stringify([
      m.location,
      devs.map((d) => [d.id, d.powered, d.location, m.energized(d.id)]),
      conns.map((c) => [c.id, c.seated, c.a, c.b, m.events(`inspect:${c.id}`).length > 0]),
      this.selection_,
      this.armed_,
      jobTags.version(m),
    ]);
    if (!force && sig === this.sig_) return;
    this.sig_ = sig;
    // Drop a selection whose target is gone (moved away, unplugged)
    if (this.selection_?.kind === 'device' && !devs.some((d) => d.id === this.selection_?.id)) this.selection_ = null;
    if (this.selection_?.kind === 'conn' && !conns.some((c) => c.id === this.selection_?.id)) this.selection_ = null;

    const layout = layoutBench(devs, (id) => m.ports(id), m.config.connections ?? []);
    const vb = layout.bounds;
    this.svg_.setAttribute('viewBox', `${vb.x.toFixed(0)} ${vb.y.toFixed(0)} ${vb.w.toFixed(0)} ${vb.h.toFixed(0)}`);
    const parts: string[] = [];
    // Devices
    for (const d of devs) {
      const b = layout.boxes.get(d.id);
      if (!b) continue;
      const passive = PASSIVE_KINDS.includes(d.kind);
      const sdr = d.kind === 'laptop' ? sdrOnLaptop(m, d.id) : null;
      const sel = this.selection_?.kind === 'device' && this.selection_.id === d.id;
      const shape = deviceShape(b, {
        powered: m.energized(d.id) || (d.kind === 'laptop' && d.powered),
        passive,
        screenActive: !!sdr && m.energized(sdr),
        display: d.kind === 'laptop' ? (sdr ? 'SDR app' : 'Desktop') : (m.radio(d.id)?.vfoMHz.toFixed(3) ?? (d.kind === 'power-supply' ? '13.8 V' : undefined)),
      });
      const id = tid('ham-bench-dev', d.id);
      parts.push(
        `<g class="bench-dev${sel ? ' is-selected' : ''}" data-dev="${esc(d.id)}" data-kind="${esc(d.kind)}" id="${id}" data-testid="${id}" role="button" tabindex="0" aria-label="${esc(d.label)}" aria-pressed="${sel}">` +
          `<rect class="bench-hit" x="${b.x - 6}" y="${b.y - 6}" width="${b.w + 12}" height="${b.h + 12}" rx="8"/>` +
          shape +
          `<text class="bd-label" x="${(b.x + b.w / 2).toFixed(1)}" y="${(b.y + b.h + 16).toFixed(1)}" text-anchor="middle">${esc(d.label)}</text>` +
          tagLabel(m, d.id, b) +
          `<title>${esc(d.label)}</title></g>`
      );
    }
    // Cables (connections)
    const usedPorts = new Set<string>();
    for (const c of conns) {
      const a = layout.ports.get(portKey(c.a.deviceId, c.a.portId));
      const b = layout.ports.get(portKey(c.b.deviceId, c.b.portId));
      if (!a || !b) continue;
      usedPorts.add(portKey(c.a.deviceId, c.a.portId));
      usedPorts.add(portKey(c.b.deviceId, c.b.portId));
      const looseKnown = !c.seated && m.events(`inspect:${c.id}`).length > 0;
      const sel = this.selection_?.kind === 'conn' && this.selection_.id === c.id;
      const role = m.ports(c.a.deviceId).find((p) => p.id === c.a.portId)?.role ?? 'rf';
      const label = `${m.device(c.a.deviceId)?.label ?? c.a.deviceId} ${c.a.portId} to ${m.device(c.b.deviceId)?.label ?? c.b.deviceId} ${c.b.portId}`;
      const id = tid('ham-bench-conn', c.id);
      const d = cablePath(a, b);
      const mid = cableMid(a, b);
      parts.push(
        `<g class="bench-conn role-${role}${looseKnown ? ' is-loose' : ''}${sel ? ' is-selected' : ''}" data-conn="${esc(c.id)}" id="${id}" data-testid="${id}" role="button" tabindex="0" aria-label="Connection: ${esc(label)}" aria-pressed="${sel}">` +
          `<circle class="bench-conn-grip" cx="${mid.x.toFixed(1)}" cy="${mid.y.toFixed(1)}" r="10"/><path class="bench-conn-hit" d="${d}"/><path class="bench-conn-line" d="${d}"/><title>${esc(label)}</title></g>`
      );
    }
    // Ports (drawn last so they sit on top of cables)
    const showLabelsFor = new Set<string>();
    const labels: string[] = [];
    if (this.selection_?.kind === 'device') showLabelsFor.add(this.selection_.id);
    for (const p of layout.ports.values()) {
      const def = m.ports(p.deviceId).find((x) => x.id === p.portId);
      if (!def) continue;
      const key = portKey(p.deviceId, p.portId);
      const used = usedPorts.has(key);
      const armed = this.armed_?.deviceId === p.deviceId && this.armed_.portId === p.portId;
      const devLabel = m.device(p.deviceId)?.label ?? p.deviceId;
      const id = tid('ham-port', p.deviceId, p.portId);
      const showLabel = armed || showLabelsFor.has(p.deviceId) || (this.armed_ !== null && !used);
      // On a large box (laptop, rig) side labels go inside it so they do not cover the neighbour's name
      const inside = (layout.boxes.get(p.deviceId)?.w ?? 0) >= 120 && (p.side === 'left' || p.side === 'right');
      const lx = p.side === 'left' ? p.x + (inside ? 12 : -10) : p.side === 'right' ? p.x + (inside ? -12 : 10) : p.x;
      const ly = p.side === 'top' ? p.y - 10 : p.side === 'bottom' ? p.y + 20 : p.y + 4;
      const anchor = p.side === 'left' ? (inside ? 'start' : 'end') : p.side === 'right' ? (inside ? 'end' : 'start') : 'middle';
      parts.push(
        `<g class="bench-port role-${def.role}${used ? ' is-used' : ''}${armed ? ' is-armed' : ''}" data-dev="${esc(p.deviceId)}" data-port="${esc(p.portId)}" id="${id}" data-testid="${id}" role="button" tabindex="0" aria-label="${esc(`${devLabel}: ${def.label}${used ? ' (in use)' : ''}`)}" aria-pressed="${armed}">` +
          `<circle class="bench-port-hit" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="12"/>` +
          `<circle class="bench-port-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6"/>` +
          `<title>${esc(`${devLabel}: ${def.label}`)}</title></g>`
      );
      // Labels go in a separate top layer so they never cover a cable or another connector
      if (showLabel) labels.push(`<text class="bench-port-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${esc(def.label)}</text>`);
    }
    this.svg_.innerHTML = parts.join('') + labels.join('');
    this.svg_.classList.toggle('is-arming', this.armed_ !== null);
  }

  private onClick_(e: Event): void {
    const t = e.target as Element | null;
    const port = t?.closest('[data-port]');
    if (port) {
      e.stopPropagation();
      this.clickPort_(port.getAttribute('data-dev') ?? '', port.getAttribute('data-port') ?? '');

      return;
    }
    const conn = t?.closest('[data-conn]');
    if (conn) {
      this.armed_ = null;
      this.select({ kind: 'conn', id: conn.getAttribute('data-conn') ?? '' });

      return;
    }
    const dev = t?.closest('[data-dev]');
    if (dev) {
      this.armed_ = null;
      this.select({ kind: 'device', id: dev.getAttribute('data-dev') ?? '' });

      return;
    }
    if (this.armed_) {
      this.armed_ = null;
      this.ctx_.feedback('', 'info');
      this.render(this.ctx_.manager, true);
    }
  }

  /** Public so the close-up's port list can pick up a plug the same way a click on the drawing does */
  clickPort(deviceId: string, portId: string): void {
    this.clickPort_(deviceId, portId);
  }

  private clickPort_(deviceId: string, portId: string): void {
    const m = this.ctx_.manager;
    const label = (d: string, p: string): string => `${m.device(d)?.label ?? d} ${m.ports(d).find((x) => x.id === p)?.label ?? p}`;
    if (this.armed_ && this.armed_.deviceId === deviceId && this.armed_.portId === portId) {
      this.armed_ = null;
      this.ctx_.feedback('', 'info');
      this.render(m, true);

      return;
    }
    if (!this.armed_) {
      const existing = m.connectionAt(deviceId, portId);
      if (existing) {
        this.select({ kind: 'conn', id: existing.id });

        return;
      }
      this.armed_ = { deviceId, portId };
      this.ctx_.feedback(`Holding the ${label(deviceId, portId)}. Click the connector to plug it into, or Esc to put it down.`, 'info');
      this.render(m, true);

      return;
    }
    const a = this.armed_;
    this.armed_ = null;
    const r = this.ctx_.act({ type: 'connect', a, b: { deviceId, portId } });
    if (r.ok) {
      const c = m.connectionAt(deviceId, portId);
      if (c) this.selection_ = { kind: 'conn', id: c.id };
      this.onSelect_(this.selection_);
    }
    this.render(m, true);
  }
}
