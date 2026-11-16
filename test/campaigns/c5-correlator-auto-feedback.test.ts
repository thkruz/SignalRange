import { beforeEach, describe, expect, it, vi } from 'vitest';

let nowMs = 0;
let activeEvent = true;
const event = { id: 'quay-hostile', satelliteNoradId: 1, frequency: 6021e6, bandwidth: 3e6, emitter: { latitude: 1, longitude: 2, altitudeKm: 0 } };

vi.mock('@app/simulation/sim-time', () => ({ getSimulatedNowMs: () => nowMs }));
vi.mock('@app/interference/interference-manager', () => ({
  InterferenceManager: {
    getInstance: () => ({
      getEventsWithEmitters: () => [event],
      isEventActive: () => activeEvent,
      getEvent: () => event,
    }),
  },
}));
vi.mock('@app/equipment/satellite/orbital-satellite', () => ({ OrbitalSatellite: class {} }));
vi.mock('@app/events/event-bus', () => ({ EventBus: { getInstance: () => ({ on: vi.fn(), off: vi.fn() }) } }));
vi.mock('@app/scenario-manager', () => ({ ScenarioManager: {} }));
vi.mock('@app/simulation/simulation-manager', () => ({ SimulationManager: {} }));
vi.mock('@app/services/geolocation-service', () => ({
  GeolocationService: class {
    synthesizeMeasurement(_e: unknown, _t: number, _f: number, _a: number, _b: number, id: number) {
      return { id, tdoaS: 1e-6, fdoaHz: 1 };
    }
  },
  greatCircleKm: () => 0,
}));

import { GeolocationConsoleCore } from '@app/equipment/geolocation-console/geolocation-console-core';

interface Internals {
  config_: object;
  primary_: object;
  adjacents_: object[];
  stationLocation_: object;
  services_: Map<number, unknown>;
  selectedAdjacentNoradId_: number;
  measurements_: unknown[];
  update_(): void;
}

function makeCore(): GeolocationConsoleCore {
  const core = Object.create(GeolocationConsoleCore.prototype) as GeolocationConsoleCore;
  const c = core as unknown as Internals & Record<string, unknown>;
  c.config_ = { primaryNoradId: 1, adjacentNoradIds: [2], captureWindowS: 12 };
  c.primary_ = {};
  c.adjacents_ = [{ noradId: 2 }];
  c.stationLocation_ = { lat: 0, lon: 0, altKm: 0 };
  c.services_ = new Map();
  c.selectedAdjacentNoradId_ = 2;
  c.stagedFrequencyMHz_ = 6000;
  c.stagedBandwidthMHz_ = 3;
  c.captureStatus_ = 'idle';
  c.captureStartMs_ = 0;
  c.captureProgress_ = 0;
  c.captureTicks_ = 0;
  c.captureActiveTicks_ = 0;
  c.lastCaptureMessage_ = '';
  c.lastAttemptMessage_ = '';
  c.lastFailureIsTuning_ = false;
  c.autoCapture_ = false;
  c.measurements_ = [];
  return core;
}

function runWindow(core: GeolocationConsoleCore): void {
  const c = core as unknown as Internals;
  for (let i = 0; i < 12; i++) {
    nowMs += 1000;
    c.update_();
  }
}

describe('C5 correlator AUTO feedback', () => {
  beforeEach(() => {
    nowMs = 0;
    activeEvent = true;
  });

  it('AUTO stops with a clear no-correlation result when nothing is at the tuned frequency', () => {
    const core = makeCore();
    core.setStagedFrequencyMHz(6010);
    core.setAutoCapture(true);
    runWindow(core);
    const state = core.state;
    expect(state.autoCapture).toBe(false);
    expect(state.captureStatus).toBe('failed');
    expect(state.lastCaptureMessage).toMatch(/AUTO stopped: NO CORRELATION/u);
    expect(state.lastCaptureMessage).not.toMatch(/6021/u);
  });

  it('AUTO keeps retrying through an off window and shows the previous outcome', () => {
    const core = makeCore();
    core.setStagedFrequencyMHz(6021);
    activeEvent = false;
    core.setAutoCapture(true);
    runWindow(core);
    expect(core.state.autoCapture).toBe(true);
    expect(core.state.captureStatus).toBe('integrating');
    expect(core.state.lastCaptureMessage).toMatch(/last attempt: NO CORRELATION - interferer not transmitting/u);
    activeEvent = true;
    runWindow(core);
    runWindow(core);
    expect(core.pairMeasurements.length).toBeGreaterThan(0);
  });
});
