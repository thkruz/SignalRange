/**
 * Station tab gaps closed in P3: fuse pull/inspect/refit, live meter state, analyzer persistence
 * across remounts, staged hints, and "Not inspected yet" rows.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { HamAction, HamStationManager } from '../../../src/ham/ham-station-manager';
import type { HamDeviceKind } from '../../../src/ham/ham-types';
import { AnalyzerPanel } from '../../../src/ham/ui/panels/analyzer-panel';
import { DcPanel } from '../../../src/ham/ui/panels/dc-panel';
import { MeterPanel } from '../../../src/ham/ui/panels/meter-panel';
import type { PanelContext, StationPanel } from '../../../src/ham/ui/station-panel';
import { baseConfig, baseConnections, baseDevices, conn, harness } from '../manager/harness';

const mounted: StationPanel[] = [];

function mount(p: StationPanel, m: HamStationManager): { host: HTMLElement; q: (id: string) => HTMLElement; feedback: string[] } {
  const host = document.createElement('div');
  document.body.append(host);
  const feedback: string[] = [];
  const ctx: PanelContext = {
    manager: m,
    act: (a: HamAction) => {
      const r = m.act(a);
      p.update(m);

      return r;
    },
    feedback: (msg) => {
      feedback.push(msg);
    },
  };
  p.mount(host, ctx);
  mounted.push(p);

  return { host, q: (id) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement, feedback };
}

afterEach(() => {
  for (const p of mounted.splice(0)) p.dispose();
  document.body.replaceChildren();
});

const spareFuse = (id: string, ratingA: number) => ({ id, kind: 'fuse' as HamDeviceKind, label: `${ratingA} A fuse`, location: 'bench', spare: true, fuseRatingA: ratingA });

describe('DC panel fuse actions', () => {
  it('pulls the fuse, de-energizes the radio, inspects it, and refits it', () => {
    const h = harness(baseConfig());
    const { q } = mount(new DcPanel(), h.m);
    expect(q('ham-dc-psu-fuse').textContent).toBe('15 A ok');
    expect(h.m.energized('mobile')).toBe(true);
    q('ham-dc-psu-fuse-inspect').click();
    expect(h.m.events('fuse.inspect:psu')).toHaveLength(1);
    q('ham-dc-psu-fuse-pull').click();
    expect(h.m.energized('mobile')).toBe(false);
    expect(q('ham-dc-psu-fuse').textContent).toContain('pulled');
    expect(q('ham-dc-psu-radio').textContent).toBe('no power');
    q('ham-dc-psu-fuse-refit').click();
    expect(h.m.energized('mobile')).toBe(true);
    expect(q('ham-dc-psu-fuse').textContent).toBe('15 A ok');
  });

  it('refuses a wrong-rated spare with an explanation and accepts the specified one', () => {
    const h = harness(baseConfig({ devices: [...baseDevices(), spareFuse('f30', 30), spareFuse('f15', 15)] }));
    const { q, feedback } = mount(new DcPanel(), h.m);
    q('ham-dc-psu-fuse-pull').click();
    q('ham-dc-psu-install-f30').click();
    expect(feedback.at(-1)).toMatch(/original 15 A rating/u);
    expect(h.m.energized('mobile')).toBe(false);
    q('ham-dc-psu-install-f15').click();
    expect(h.m.energized('mobile')).toBe(true);
    expect(q('ham-dc-psu-fuse').textContent).toBe('15 A ok');
  });
});

describe('Meter panel live state', () => {
  const devices = [...baseDevices(), { id: 'dmm1', kind: 'multimeter' as HamDeviceKind, label: 'DMM', location: 'bench' }];

  it('follows manager mode changes made outside the panel and marks old readings stale', () => {
    const h = harness(baseConfig({ devices }));
    const panel = new MeterPanel();
    const { q } = mount(panel, h.m);
    q('ham-meter-dmm1-mode-DCV').click();
    q('ham-meter-dmm1-read').click();
    const display = q('ham-meter-dmm1-display');
    expect(display.classList.contains('is-stale')).toBe(false);
    h.actOk({ type: 'meter.mode', mode: 'OHM' });
    expect(h.m.meterState().mode).toBe('OHM');
    panel.update(h.m);
    expect(q('ham-meter-dmm1-mode-OHM').classList.contains('active')).toBe(true);
    expect(q('ham-meter-dmm1-mode-DCV').classList.contains('active')).toBe(false);
    expect(display.classList.contains('is-stale')).toBe(true);
  });
});

describe('Analyzer persistence', () => {
  it('redraws the last sweep after the panel is remounted', () => {
    const devices = [
      ...baseDevices(),
      { id: 'an1', kind: 'analyzer' as HamDeviceKind, label: 'Antenna analyzer', location: 'bench' },
      { id: 'an-coax', kind: 'coax' as HamDeviceKind, label: 'Analyzer jumper', location: 'bench', coax: { type: 'rg8x' as const, length: 1, unit: 'm' as const } },
    ];
    const connections = [...baseConnections(), conn('a1', 'an1', 'rf', 'an-coax', 'a'), conn('a2', 'an-coax', 'b', 'mob-ant', 'in')];
    const h = harness(baseConfig({ devices, connections }));
    const first = new AnalyzerPanel();
    const a = mount(first, h.m);
    a.q('ham-analyzer-an1-sweep').click();
    expect(a.q('ham-analyzer-an1-plot').getAttribute('data-points')).toBe('41');
    first.dispose();
    const b = mount(new AnalyzerPanel(), h.m);
    expect(b.q('ham-analyzer-an1-plot').getAttribute('data-points')).toBe('41');
    expect(b.q('ham-analyzer-an1-plot').querySelector('polyline')).not.toBeNull();
  });
});

describe('Not inspected yet rows', () => {
  it('shows a placeholder until inspected, without revealing the fault', () => {
    const cfg = baseConfig({
      faults: [{ id: 'f1', target: 'psu', kind: 'high-resistance-lead', inspectClue: 'The lead is hot and thin.', clearedBy: { action: 'repair' } }],
    });
    const h = harness(cfg);
    const dc = mount(new DcPanel(), h.m);
    expect(dc.q('ham-dc-psu-not-inspected').textContent).toBe('Not inspected yet');
    expect(dc.host.textContent).not.toContain('hot and thin');
    dc.q('ham-dc-psu-inspect').click();
    expect(dc.host.querySelector('[data-testid="ham-dc-psu-not-inspected"]')).toBeNull();
    expect(dc.host.textContent).toContain('hot and thin');
  });
});

describe('Staged hints', () => {
  it('reveals one stage per request, logs hint:<id>:<n>, and keeps the last stage on repeat', () => {
    const h = harness(baseConfig({ hints: { obj1: ['subsystem', 'measurement', 'interpretation'], obj2: 'single hint' } }));
    const r1 = h.m.act({ type: 'hint', objectiveId: 'obj1' });
    expect(r1.message).toBe('subsystem');
    expect(r1.data).toMatchObject({ stage: 1, of: 3 });
    expect(h.m.act({ type: 'hint', objectiveId: 'obj1' }).message).toBe('measurement');
    expect(h.m.act({ type: 'hint', objectiveId: 'obj1' }).message).toBe('interpretation');
    expect(h.m.act({ type: 'hint', objectiveId: 'obj1' }).message).toBe('interpretation');
    expect(h.m.events('hint:obj1:1')).toHaveLength(1);
    expect(h.m.events('hint:obj1:3')).toHaveLength(2);
    expect(h.m.events('hint:obj1')).toHaveLength(4);
    expect(h.m.act({ type: 'hint', objectiveId: 'obj2' }).message).toBe('single hint');
    expect(h.m.events('hint:obj2:1')).toHaveLength(1);
  });
});
