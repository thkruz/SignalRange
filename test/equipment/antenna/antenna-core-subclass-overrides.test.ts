import { Degrees } from 'ootk';
import { vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../../src/equipment/antenna/antenna-config-keys';
import { AntennaCore, AntennaState } from '../../../src/equipment/antenna/antenna-core';
import type { RfAntennaPort } from '../../../src/simulation/rf-narrowing';
import { Hertz } from '../../../src/types';

const captured = vi.hoisted(() => ({ port: null as unknown }));

vi.mock('../../../src/simulation/rf-narrowing', () => ({
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

const SCAN_LOSS_DB = 2.5;
const F = 4e9 as Hertz;

class Plain extends AntennaCore {
  constructor(initialState: Partial<AntennaState> = {}) {
    super(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, initialState, 1, 1);
    this.stationLocation_ = { latitude: 10, longitude: 20, elevationM: 5 };
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
  port(): RfAntennaPort {
    captured.port = null;
    (this as unknown as { rfSelector_: unknown }).rfSelector_ = null;
    (this as unknown as { rfSelectorFor_: () => unknown }).rfSelectorFor_();

    return captured.port as RfAntennaPort;
  }
}

/** Folds a fixed scan loss into the boresight gain, as a phased array would. */
class Scanned extends Plain {
  protected override antennaGain_dBi(f: Hertz): number {
    return super.antennaGain_dBi(f) - SCAN_LOSS_DB;
  }
}

/** Overrides the pattern and off-axis hooks directly. */
/** Overrides the beamwidth hook. */
class Wide extends Plain {
  protected override beamwidth3dB_deg_(f: number): number {
    return super.beamwidth3dB_deg_(f) * 2;
  }
}

class Shaped extends Plain {
  protected override patternGain_dBi_(theta: number, f: number): number {
    return super.patternGain_dBi_(theta, f) - SCAN_LOSS_DB;
  }
  protected override effectiveOffAxisDeg_(az: number, el: number): number {
    return super.effectiveOffAxisDeg_(az, el) + 1;
  }
}

function metrics(a: Plain): number {
  a.state.isPowered = true;
  a.state.isOperational = true;
  a.state.elevation = 45 as Degrees;
  a.update();

  return a.state.rfMetrics!.gain_dBi;
}

describe('AntennaCore protected gain hooks', () => {
  it('a subclass antennaGain_dBi override changes the link-budget gain', () => {
    expect(metrics(new Plain()) - metrics(new Scanned())).toBeCloseTo(SCAN_LOSS_DB, 6);
  });

  it('antennaGain_dBi reaches the RfAntennaPort pattern gain through this', () => {
    expect(new Plain().port().patternGainDbi(0, F) - new Scanned().port().patternGainDbi(0, F)).toBeCloseTo(SCAN_LOSS_DB, 6);
  });

  it('pattern, beamwidth and off-axis overrides reach the RfAntennaPort callbacks', () => {
    const base = new Plain().port();
    const shaped = new Shaped().port();

    expect(base.patternGainDbi(1, F) - shaped.patternGainDbi(1, F)).toBeCloseTo(SCAN_LOSS_DB, 6);
    expect(new Wide().port().beamwidth3dBDeg(F)).toBeCloseTo(base.beamwidth3dBDeg(F) * 2, 6);
    expect(shaped.offAxisDeg(10, 20)).toBeGreaterThan(base.offAxisDeg(10, 20));
  });
});
