/**
 * Phase 19.0 determinism gate.
 *
 * Drives the real nats-eu chain (SGP4 MERIDIAN-SAR-1 -> GW-01 program-track
 * antenna -> RF front end -> receiver), plus a C1 GEO transponder relaying a
 * carrier (the path that draws random fading and dropout), through the real
 * clock path: rendered
 * frames feed SimClock, SimClock releases fixed steps, each step emits
 * Events.UPDATE. A run must be a pure function of (seed, real time elapsed):
 *
 *   - the same at 30 fps and 144 fps, step for step, to the bit;
 *   - identical for two runs with the same seed;
 *   - different for a different seed;
 *   - free of Math.random().
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The antenna pulls satellites from the SimulationManager singleton; feed it
// the real MERIDIAN roster (same stand-in as nats-eu-rf-validation.test.ts).
let simSatellites: import('@app/equipment/satellite/orbital-satellite').OrbitalSatellite[] = [];

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      satellites: simSatellites,
      getSatsByAzEl: (az: number, el: number) => simSatellites.filter((sat) => Math.abs(sat.az - az) <= 1 && Math.abs(sat.el - el) <= 1),
      getSatByNoradId: (noradId: number) => simSatellites.find((sat) => sat.noradId === noradId) ?? null,
      isDeveloperMode: false,
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    destroy: () => undefined,
  },
}));

import { tidemark1Satellite } from '@app/campaigns/nats/satellites';
import { galwayGroundStation } from '@app/campaigns/nats-eu/ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from '@app/campaigns/nats-eu/satellites';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { AntennaUIHeadless } from '@app/equipment/antenna/antenna-ui-headless';
import { Receiver } from '@app/equipment/receiver/receiver';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { OpsLogManager } from '@app/ops-log/ops-log-manager';
import { Rng } from '@app/simulation/rng';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';

const MINUTE_MS = 60_000;
/** Real time each run covers */
const RUN_MS = 20_000;

/** One step's observables */
type Observation = number[];

/**
 * Build a fresh GW-01 station, start the nats-eu S1 clock, skip to mid-pass
 * of MERIDIAN-SAR-1 (max el T+6.7) and run RUN_MS of real time at `fps`.
 */
function run(seed: number, fps: number): Observation[] {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(seed);
  for (const sat of [...simSatellites, tidemark1Satellite]) {
    sat.health = 1;
  }

  document.body.innerHTML = '<div id="det-fe"></div><div id="det-rx"></div>';
  const antenna = new AntennaUIHeadless('det-antenna', ANTENNA_CONFIG_KEYS.KU_BAND_4M_LEO_TRACKER, galwayGroundStation.antennasState![0], 1);
  const frontEnd = createRFFrontEnd('det-fe', galwayGroundStation.rfFrontEnds[0], 'standard');
  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);
  const receiver = new Receiver('det-rx', [antenna], galwayGroundStation.receivers![0], 1);
  receiver.connectRfFrontEnd(frontEnd);

  const opsLog = OpsLogManager.initialize('14:00:00', '2027-03-15');
  opsLog.resume();
  opsLog.advanceClock(6 * MINUTE_MS);

  antenna.handleTrackingModeChange('program-track');
  antenna.handleTargetSatelliteChange(meridianSar1Satellite.noradId);

  const modem = receiver.state.modems[0];
  const trace: Observation[] = [];
  const frameMs = 1000 / fps;
  const frames = Math.round(RUN_MS / frameMs);

  for (let f = 0; f < frames; f++) {
    const steps = SimClock.consumeFrame(frameMs);
    for (let i = 0; i < steps; i++) {
      SimClock.step();
      for (const sat of simSatellites) {
        sat.update();
      }
      tidemark1Satellite.update();
      EventBus.getInstance().emit(Events.UPDATE, FIXED_STEP_MS);

      const info = receiver.getSignalsInBandwidth(modem);
      const beacon = antenna.state.rxSignalsIn[0];
      trace.push([
        SimClock.nowMs(),
        meridianSar1Satellite.az as number,
        meridianSar1Satellite.el as number,
        antenna.state.azimuth as number,
        antenna.state.elevation as number,
        info.cnRatio_dB,
        info.hasLock ? 1 : 0,
        beacon ? (beacon.power as number) : Number.NaN,
        ...tidemark1Satellite.txSignal.map((sig) => sig.power as number),
      ]);
    }
  }

  OpsLogManager.destroy();

  return trace;
}

describe('Phase 19.0 determinism', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    simSatellites = [meridianSar1Satellite, meridianSar2Satellite];
    randomSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('is identical at 30 fps and 144 fps, step for step', () => {
    const at30 = run(1, 30);
    const at144 = run(1, 144);
    const common = Math.min(at30.length, at144.length);

    // Frame boundaries may leave the last step owed at one rate and not the other
    expect(Math.abs(at30.length - at144.length)).toBeLessThanOrEqual(1);
    expect(common).toBeGreaterThan(RUN_MS / FIXED_STEP_MS - 2);
    // The pass is live: the modem is locked on a real carrier
    expect(at30[common - 1][6]).toBe(1);
    expect(at144.slice(0, common)).toEqual(at30.slice(0, common));
  });

  it('replays byte-identically for the same seed, and differs for another', () => {
    const first = JSON.stringify(run(7, 60));
    const second = JSON.stringify(run(7, 60));
    const other = JSON.stringify(run(8, 60));

    expect(second).toBe(first);
    expect(other).not.toBe(first);
  });

  it('never calls Math.random()', () => {
    run(3, 60);

    expect(randomSpy).not.toHaveBeenCalled();
  });
});
