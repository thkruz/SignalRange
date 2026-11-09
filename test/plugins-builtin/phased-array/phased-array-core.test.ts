import { vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../../src/equipment/antenna/antenna-config-keys';
import { AntennaCore } from '../../../src/equipment/antenna/antenna-core';
import type { SkySource } from '../../../src/plugins-builtin/phased-array/beam-scheduler';
import { KU_PHASED_ARRAY_UT_CONFIG } from '../../../src/plugins-builtin/phased-array/phased-array-config';
import { PhasedArrayCore } from '../../../src/plugins-builtin/phased-array/phased-array-core';
import type { RfAntennaPort } from '../../../src/simulation/rf-narrowing';
import type { Hertz } from '../../../src/types';

const captured = vi.hoisted(() => ({ port: null as unknown }));

vi.mock('../../../src/simulation/rf-narrowing', () => ({
  gmstRad: () => 0,
  RfSelector: vi.fn(function (this: { scheduler: unknown; candidates: () => unknown[] }, scheduler: unknown, _index: number, port: unknown) {
    captured.port = port;
    this.scheduler = scheduler;
    this.candidates = () => [];
  }),
}));

const scheduler = { rfNarrowingActive: true, isTiered: false, stationIndexOf: () => 0 };

vi.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      update: vi.fn(),
      draw: vi.fn(),
      sync: vi.fn(),
      getSatByNoradId: vi.fn(),
      getSatsByAzEl: () => [],
      satellites: [],
      isDeveloperMode: false,
      scheduler,
    })),
    destroy: vi.fn(),
  },
}));

vi.mock('../../../src/events/event-bus', () => ({
  EventBus: { getInstance: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() })) },
}));

vi.mock('../../../src/equipment/antenna/step-track-controller', () => ({
  StepTrackController: vi.fn(function (this: Record<string, unknown>) {
    this.isActive = false;
    this.start = vi.fn();
    this.stop = vi.fn();
    this.update = vi.fn();
  }),
}));

const F = 11.7e9 as Hertz;
const CFG = KU_PHASED_ARRAY_UT_CONFIG;

function sky(sats: Record<number, { az: number; el: number }>): SkySource {
  return {
    list: () => Object.entries(sats).map(([n, p]) => ({ norad: Number(n), name: `SAT ${n}`, az: p.az, el: p.el })),
    positionOf: (n) => sats[n] ?? null,
  };
}

class TestArray extends PhasedArrayCore {
  constructor() {
    super('KU_PHASED_ARRAY_UT', {}, 1, 1);
    this.stationLocation_ = { latitude: 36, longitude: -105, elevationM: 1500 };
    this.state.isPowered = true;
    this.state.isOperational = true;
  }
  port(): RfAntennaPort {
    captured.port = null;
    (this as unknown as { rfSelector_: unknown }).rfSelector_ = null;
    (this as unknown as { rfSelectorFor_: () => unknown }).rfSelectorFor_();

    return captured.port as RfAntennaPort;
  }
  gain(f: Hertz = F): number {
    return this.antennaGain_dBi(f);
  }
  bw(f: Hertz = F): number {
    return this.beamwidth3dB_deg_(f);
  }
  pattern(theta: number, f: Hertz = F): number {
    return this.patternGain_dBi_(theta, f);
  }
}

function pointAt(a: TestArray, az: number, el: number): void {
  a.setSkySource(sky({ 1: { az, el } }));
  expect(a.lock(1)).toEqual({ ok: true });
}

// The registry resolves the id; register the config for the headless super constructor.
import { AntennaRegistry } from '../../../src/equipment/antenna/antenna-registry';

beforeAll(() => {
  AntennaRegistry.getInstance().register('KU_PHASED_ARRAY_UT', CFG, { source: 'plugin:PhasedArray' });
});

describe('PhasedArrayCore scan loss', () => {
  it('has the panel peak gain at the panel normal', () => {
    const a = new TestArray();

    pointAt(a, 0, 90);
    expect(a.scanAngleDeg).toBeCloseTo(0, 3);
    expect(a.scanLossDb).toBeCloseTo(0, 3);
  });

  it('loses 10 n log10(cos theta) off the normal', () => {
    const a = new TestArray();

    pointAt(a, 90, 45); // 45 degrees off the normal
    expect(a.scanAngleDeg).toBeCloseTo(45, 3);
    const expected = -10 * CFG.scanLossExponent * Math.log10(Math.cos(Math.PI / 4));

    expect(a.scanLossDb).toBeCloseTo(expected, 4);
    pointAt(a, 90, 90);
    const peak = a.gain();

    pointAt(a, 90, 45);
    expect(peak - a.gain()).toBeCloseTo(expected, 4);
  });

  it('scanLossDbAt matches the formula at 30, 45 and the cutoff', () => {
    const a = new TestArray();

    for (const t of [30, 45, 57]) {
      expect(a.scanLossDbAt(t)).toBeCloseTo(-13 * Math.log10(Math.cos((t * Math.PI) / 180)), 4);
    }
  });

  it('refuses targets beyond maxScanDeg', () => {
    const a = new TestArray();

    a.setSkySource(sky({ 7: { az: 120, el: 25 } })); // 65 degrees off the normal
    expect(a.lock(7)).toEqual({ ok: false, reason: 'out-of-scan' });
    a.setSkySource(sky({ 8: { az: 120, el: 40 } })); // 50 degrees
    expect(a.lock(8)).toEqual({ ok: true });
  });

  it('broadens the beam as 1 / cos(theta_s)', () => {
    const a = new TestArray();

    pointAt(a, 0, 90);
    const bw0 = a.bw();

    expect(bw0).toBeCloseTo(CFG.fixedBeamwidth3dB_deg as number, 3);
    pointAt(a, 90, 45);
    expect(a.bw() / bw0).toBeCloseTo(1 / Math.cos(Math.PI / 4), 3);
  });

  it('has a flat sidelobe floor relative to the scanned peak', () => {
    const a = new TestArray();

    pointAt(a, 90, 45);
    const peak = a.gain();

    expect(a.pattern(0)).toBeCloseTo(peak, 6);
    expect(a.pattern(60)).toBeCloseTo(peak + CFG.sidelobeFloor_dBc, 6);
    expect(a.pattern(120)).toBeCloseTo(peak + CFG.sidelobeFloor_dBc, 6);
    expect(a.pattern(a.bw() / 2)).toBeLessThan(peak);
    expect(a.pattern(a.bw() / 2)).toBeGreaterThan(peak + CFG.sidelobeFloor_dBc);
  });

  it('boresight G/T is in the 9 to 10 dB/K range', () => {
    const a = new TestArray();

    pointAt(a, 0, 90);
    a.update();
    const gt = a.getReadModel().gOverTDbK;

    expect(gt).toBeGreaterThan(8.5);
    expect(gt).toBeLessThan(10.5);
  });

  it('the RfAntennaPort sees the scan loss', () => {
    const a = new TestArray();

    pointAt(a, 0, 90);
    const g0 = a.port().patternGainDbi(0, F);
    const bw0 = a.port().beamwidth3dBDeg(F);

    pointAt(a, 90, 45);
    const port = a.port();

    expect(g0 - port.patternGainDbi(0, F)).toBeCloseTo(a.scanLossDbAt(45), 4);
    expect(port.beamwidth3dBDeg(F)).toBeGreaterThan(bw0);
  });
});

describe('PhasedArrayCore behaviour', () => {
  it('ACU-only controls are neutral', () => {
    const a = new TestArray();

    a.handleHeaterToggle(true);
    a.handleRainBlowerToggle(true);
    a.handleStepTrackToggle(true);
    a.handleAzimuthChange(123);
    a.handleElevationChange(12);
    expect(a.windDePointingDeg).toBe(0);
    a.updateIceAccumulation(5);
    expect(a.state.iceAccumulation_dB).toBe(0);
  });

  it('exposes handover outage, stow and zone methods', () => {
    const a = new TestArray();

    pointAt(a, 90, 60);
    expect(a.isInOutage).toBe(true);
    a.stow();
    expect(a.beamMode).toBe('stow');
    a.setGeoArcWidthDeg(12);
    expect(a.geoArcWidthDeg).toBe(12);
    a.setGeoArcEnabled(false);
    expect(a.geoArcEnabled).toBe(false);
  });

  it('isBeamInGeoArc is true when pointed at the GEO arc, even with the zone off', () => {
    const a = new TestArray();
    const arc = a.geoArcZone!.arc.reduce((x, y) => (y.el > x.el ? y : x));

    a.setGeoArcEnabled(false);
    a.setSkySource(sky({ 1: { az: arc.az, el: arc.el } }));
    // The arc top is about 50 degrees up: inside the cone
    expect(a.lock(1)).toEqual({ ok: true });
    expect(a.isBeamInGeoArc()).toBe(true);
    a.setGeoArcEnabled(true);
    a.setSkySource(sky({ 2: { az: 10, el: 80 } }));
    expect(a.lock(2).ok).toBe(true);
    expect(a.isBeamInGeoArc()).toBe(false);
  });

  it('refuses a lock inside an enabled GEO arc band', () => {
    const a = new TestArray();
    const arc = a.geoArcZone!.arc.reduce((x, y) => (y.el > x.el ? y : x));

    a.setSkySource(sky({ 1: { az: arc.az, el: arc.el } }));
    expect(a.lock(1)).toEqual({ ok: false, reason: 'in-exclusion' });
  });

  it('read model carries the page data', () => {
    const a = new TestArray();

    pointAt(a, 90, 60);
    const m = a.getReadModel();

    expect(m.mode).toBe('manual');
    expect(m.target?.norad).toBe(1);
    expect(m.scanAngleDeg).toBeCloseTo(30, 3);
    expect(m.scanLossDb).toBeGreaterThan(0);
    expect(m.maxScanDeg).toBe(57);
    expect(m.beamwidthDeg).toBeGreaterThan(CFG.fixedBeamwidth3dB_deg as number);
    expect(m.geoArc.enabled).toBe(true);
    expect(Array.isArray(m.visible)).toBe(true);
  });
});

describe('reflector antennas are unchanged', () => {
  class Dish extends AntennaCore {
    constructor() {
      super(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, {}, 1, 1);
    }
    protected override addListeners_(): void {
      // no DOM
    }
    syncDomWithState(): void {
      // no DOM
    }
    draw(): void {
      // no DOM
    }
  }

  it('a plain AntennaCore keeps its kind, step track and wind behaviour', () => {
    const d = new Dish();

    expect(d.config.kind ?? 'reflector').toBe('reflector');
    expect(d.config.gainModel ?? 'parabolic').toBe('parabolic');
    const spy = vi.spyOn(d, 'startStepTrack');

    d.state.isPowered = true;
    d.state.isOperational = true;
    d.state.trackingMode = 'program-track';
    d.handleStepTrackToggle(true);
    expect(spy).toHaveBeenCalled();
  });
});
