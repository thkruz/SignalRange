import { afterEach, describe, expect, it } from 'vitest';
import type { HamAction, HamStationManager } from '../../../src/ham/ham-station-manager';
import type { HamDeviceKind } from '../../../src/ham/ham-types';
import { AnalyzerPanel } from '../../../src/ham/ui/panels/analyzer-panel';
import { AntennaPanel } from '../../../src/ham/ui/panels/antenna-panel';
import { BoardPanel } from '../../../src/ham/ui/panels/board-panel';
import { DcPanel } from '../../../src/ham/ui/panels/dc-panel';
import { MeterPanel } from '../../../src/ham/ui/panels/meter-panel';
import { PacketPanel } from '../../../src/ham/ui/panels/packet-panel';
import { SatellitePanel } from '../../../src/ham/ui/panels/satellite-panel';
import { SwrPanel } from '../../../src/ham/ui/panels/swr-panel';
import type { PanelContext, StationPanel } from '../../../src/ham/ui/station-panel';
import { baseConfig, baseConnections, baseDevices, conn, harness, packetConfig } from '../manager/harness';

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

const setSel = (e: HTMLElement, v: string): void => {
  (e as HTMLSelectElement).value = v;
  e.dispatchEvent(new Event('change'));
};

afterEach(() => {
  for (const p of mounted.splice(0)) p.dispose();
  document.body.replaceChildren();
});

const boardDevices = () => [
  ...baseDevices(),
  { id: 'dmm1', kind: 'multimeter' as HamDeviceKind, label: 'DMM', location: 'bench' },
  { id: 'board', kind: 'circuit-board' as HamDeviceKind, label: 'Practice board', location: 'bench', board: true as const, powered: true },
];

describe('MeterPanel', () => {
  it('reads 12 V DC across the supply on the board', () => {
    const h = harness(baseConfig({ devices: boardDevices() }));
    const p = new MeterPanel();
    expect(p.isRelevant(h.m)).toBe(true);
    const { q } = mount(p, h.m);
    q('ham-meter-dmm1-mode-DCV').click();
    setSel(q('ham-meter-dmm1-target'), 'board');
    setSel(q('ham-meter-dmm1-red'), 'tp-supply+');
    setSel(q('ham-meter-dmm1-black'), 'tp-supply-');
    q('ham-meter-dmm1-read').click();
    expect(q('ham-meter-dmm1-display').textContent).toMatch(/12\.0/u);
    expect(q('ham-meter-dmm1-mode-DCV').classList.contains('active')).toBe(true);
  });

  it('refuses current measured across the source', () => {
    const h = harness(baseConfig({ devices: boardDevices() }));
    const { q } = mount(new MeterPanel(), h.m);
    setSel(q('ham-meter-dmm1-target'), 'board');
    q('ham-meter-dmm1-mode-DCA').click();
    setSel(q('ham-meter-dmm1-socket'), 'A');
    setSel(q('ham-meter-dmm1-red'), 'tp-supply+');
    setSel(q('ham-meter-dmm1-black'), 'tp-supply-');
    q('ham-meter-dmm1-read').click();
    const d = q('ham-meter-dmm1-display');
    expect(d.classList.contains('is-refused')).toBe(true);
    expect(d.textContent?.length).toBeGreaterThan(8);
    expect(h.m.lastMeasurement({ instrument: 'multimeter' })).toBeUndefined();
  });
});

describe('AnalyzerPanel and AntennaPanel', () => {
  it('sweep renders the plot with a minimum marker and flags an uncalibrated run', () => {
    const devices = [
      ...baseDevices(),
      { id: 'an1', kind: 'analyzer' as HamDeviceKind, label: 'Antenna analyzer', location: 'bench' },
      {
        id: 'dp1',
        kind: 'antenna' as HamDeviceKind,
        label: 'Adjustable dipole',
        location: 'bench',
        antenna: { kind: 'adjustable-dipole' as const, overrides: { elementLengthsM: [0.55, 0.55] as [number, number] } },
      },
      { id: 'an-coax', kind: 'coax' as HamDeviceKind, label: 'Analyzer jumper', location: 'bench', coax: { type: 'rg8x' as const, length: 1, unit: 'm' as const } },
    ];
    const connections = [...baseConnections(), conn('a1', 'an1', 'rf', 'an-coax', 'a'), conn('a2', 'an-coax', 'b', 'dp1', 'in')];
    const h = harness(baseConfig({ devices, connections }));
    const p = new AnalyzerPanel();
    expect(p.isRelevant(h.m)).toBe(true);
    const { q } = mount(p, h.m);
    (q('ham-analyzer-an1-start') as HTMLInputElement).value = '120';
    (q('ham-analyzer-an1-stop') as HTMLInputElement).value = '160';
    (q('ham-analyzer-an1-points') as HTMLInputElement).value = '41';
    q('ham-analyzer-an1-sweep').click();
    expect(q('ham-analyzer-an1-plot').getAttribute('data-points')).toBe('41');
    expect(q('ham-analyzer-an1-plot').querySelector('polyline')).not.toBeNull();
    expect(q('ham-analyzer-an1-plot').querySelector('circle.min')).not.toBeNull();
    expect(q('ham-analyzer-an1-min').textContent).toMatch(/Minimum SWR/u);
    expect(q('ham-analyzer-an1-flag').textContent).toMatch(/Uncalibrated/u);
    setSel(q('ham-analyzer-an1-cal-ref'), 'an-coax');
    q('ham-analyzer-an1-calibrate').click();
    q('ham-analyzer-an1-sweep').click();
    expect(q('ham-analyzer-an1-flag').textContent).toBe('');

    const ap = new AntennaPanel();
    expect(ap.isRelevant(h.m)).toBe(true);
    const a = mount(ap, h.m);
    expect((a.q('ham-antenna-dp1-len-a') as HTMLInputElement).value).toBe('55');
    a.q('ham-antenna-dp1-shorten-1').click();
    expect((a.q('ham-antenna-dp1-len-a') as HTMLInputElement).value).toBe('54');
    expect((a.q('ham-antenna-dp1-len-b') as HTMLInputElement).value).toBe('54');
    a.q('ham-antenna-dp1-apply').click();
    expect(h.m.device('dp1')?.antenna?.elementLengthsM[0]).toBeCloseTo(0.54, 3);
  });
});

describe('PacketPanel', () => {
  it('connect shows SABM and UA, then delivery is acknowledged by the node', () => {
    const h = harness(packetConfig());
    const p = new PacketPanel();
    expect(p.isRelevant(h.m)).toBe(true);
    const { q } = mount(p, h.m);
    setSel(q('ham-packet-mobile-input-device'), 'interface');
    setSel(q('ham-packet-mobile-ptt'), 'rts');
    q('ham-packet-mobile-connect').click();
    h.advance(20);
    p.update(h.m);
    const log = q('ham-packet-mobile-frames').textContent ?? '';
    expect(log).toMatch(/TX SABM/u);
    expect(log).toMatch(/RX UA/u);
    expect(q('ham-packet-mobile-link').textContent).toMatch(/connected/u);
    (q('ham-packet-mobile-send-text') as HTMLInputElement).value = 'HELLO';
    q('ham-packet-mobile-send').click();
    expect(q('ham-packet-mobile-delivery').textContent).toMatch(/waiting for KD0RLY/u);
    h.advance(30);
    p.update(h.m);
    expect(q('ham-packet-mobile-delivery').textContent).toMatch(/acknowledged by KD0RLY/u);
  });
});

describe('Other instrument panels', () => {
  it('are irrelevant without their devices', () => {
    const h = harness(baseConfig());
    for (const p of [new BoardPanel(), new AnalyzerPanel(), new AntennaPanel(), new PacketPanel(), new SatellitePanel(), new SwrPanel()]) expect(p.isRelevant(h.m)).toBe(false);
    expect(new DcPanel().isRelevant(h.m)).toBe(true);
  });

  it('board and dc panels mount and drive the station', () => {
    const h = harness(baseConfig({ devices: boardDevices() }));
    const b = mount(new BoardPanel(), h.m);
    b.q('ham-board-board-sw1').click();
    expect(h.m.board('board')?.state.sw1On).toBe(true);
    expect(b.q('ham-board-board-part-LED1').querySelector('svg')).not.toBeNull();
    const d = mount(new DcPanel(), h.m);
    expect(d.q('ham-dc-psu-volts').textContent).toMatch(/13\./u);
    expect(d.q('ham-dc-psu-brownout').classList.contains('d-none')).toBe(true);
  });
});
