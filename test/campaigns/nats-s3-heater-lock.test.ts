/**
 * r8-s03-F2 (phase 33, D13): S3's blizzard outpaces the VT-01 feed heater.
 * With the heater on the ice settles toward 10 - melt x 12 dB, so the authored
 * melt rate decides when Vermont loses the carrier. At 0.4 dB/min lock went
 * about 13 min in, before a steady player finished the handover. At 0.5 dB/min
 * the C/N falls under the 4.7 dB reacquire point about 15 min in and the modem
 * holds lock until about 3.4-3.5 dB of ice, about 22 min in.
 *
 * Flown on the real S3 VT-01 chain (antenna, RF front end, receiver) with the
 * real WeatherManager integrating the scenario's own weather event on the
 * SimClock; the heater comes on at 60 s, as a player does after the brief.
 */
import { describe, expect, it, vi } from 'vitest';

let simNowMs = Date.UTC(2026, 1, 3, 15, 45, 0);
vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => simNowMs,
  getSimulatedNow: () => new Date(simNowMs),
}));
let simSatellites: import('@app/equipment/satellite/satellite').Satellite[] = [];
let simGroundStations: { state: { id: string }; antennas: unknown[] }[] = [];
vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      satellites: simSatellites,
      getSatByNoradId: (noradId: number) => simSatellites.find((sat) => sat.noradId === noradId) ?? null,
      isDeveloperMode: false,
      groundStations: simGroundStations,
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    destroy: () => undefined,
  },
}));
vi.mock('@app/scenario-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/scenario-manager')>();
  const { scenario3Data: s3 } = await import('@app/campaigns/nats/scenario3');

  return {
    ...actual,
    ScenarioManager: {
      ...actual.ScenarioManager,
      getInstance: () => ({ settings: s3.settings }),
    },
  };
});

import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { scenario3Data } from '@app/campaigns/nats/scenario3';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { createAntenna } from '@app/equipment/antenna/antenna-factory';
import { Receiver } from '@app/equipment/receiver/receiver';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import type { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Rng } from '@app/simulation/rng';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';
import { WeatherManager } from '@app/weather/weather-manager';

interface Sample {
  tS: number;
  ice: number;
  cn: number;
  locked: boolean;
  iceSeverity: string | null;
}

describe('S3 VT-01 keeps lock past the handover with the heater on (phase 33, D13)', () => {
  it('holds lock at 18 min, warns ICE ON FEED on the way, and loses lock only after the reacquire point', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    EventBus.destroy();
    WeatherManager.destroy();
    SimClock.reset();
    Rng.setSeed(1234);
    document.body.innerHTML = '<div id="h3-fe"></div><div id="h3-rx"></div>';
    const gs = (scenario3Data.settings.groundStations as GroundStationConfig[]).find((s) => s.id === 'VT-01') as GroundStationConfig;
    simSatellites = scenario3Data.settings.satellites as Satellite[];
    for (const s of simSatellites) {
      s.rxSignal = [];
    }
    const antenna = createAntenna('h3-ant', 'headless', gs.antennas[0], { ...(gs.antennasState?.[0] ?? {}), isPowered: true }, 1) as AntennaCore;
    antenna.attachStationLocation(gs.location.latitude, gs.location.longitude, gs.location.elevation);
    const fe = createRFFrontEnd('h3-fe', gs.rfFrontEnds[0], 'standard');
    fe.connectAntenna(antenna);
    antenna.attachRfFrontEnd(fe);
    const txState = { modems: JSON.parse(JSON.stringify(gs.transmitters?.[0]?.modems)) };
    fe.connectTransmitter({ state: txState, isModemInIntermittentDropout: () => false } as never);
    const receiver = new Receiver('h3-rx', [antenna], gs.receivers?.[0], 1);
    receiver.connectRfFrontEnd(fe);
    const modem = receiver.state.modems[0];
    simGroundStations = [{ state: { id: 'VT-01' }, antennas: [antenna] }];
    // The real manager on the scenario's own weather event, ticked by Events.UPDATE
    WeatherManager.getInstance();

    const samples: Sample[] = [];
    const totalS = 26 * 60;
    for (let i = 0; i < totalS * 60; i++) {
      simNowMs += FIXED_STEP_MS;
      SimClock.step();
      if (i === 60 * 60) {
        antenna.handleHeaterToggle(true);
      }
      for (const sat of simSatellites) {
        sat.update();
      }
      EventBus.getInstance().emit(Events.UPDATE, FIXED_STEP_MS);
      receiver.update();
      if (i % 60 === 0) {
        const info = receiver.getSignalsInBandwidth(modem);
        const iceAlarm = antenna.getStatusAlarms().find((a) => a.message.startsWith('ICE ON FEED'));
        samples.push({ tS: i / 60, ice: antenna.state.iceAccumulation_dB, cn: info.cnRatio_dB, locked: info.hasLock, iceSeverity: iceAlarm?.severity ?? null });
      }
    }
    WeatherManager.destroy();
    EventBus.destroy();

    const at = (tS: number) => samples.find((s) => s.tS >= tS) as Sample;
    const firstUnlock = samples.find((s) => s.tS > 120 && !s.locked);
    const firstUnderReacquire = samples.find((s) => s.tS > 120 && s.cn < 4.7);
    console.log(
      `S3 heater probe: ice@15m ${at(900).ice.toFixed(2)} C/N ${at(900).cn.toFixed(2)}; ice@18m ${at(1080).ice.toFixed(2)} C/N ${at(1080).cn.toFixed(2)} locked ${at(1080).locked}; ` +
        `C/N<4.7 at ${firstUnderReacquire ? (firstUnderReacquire.tS / 60).toFixed(1) : '-'} min; lock lost at ${firstUnlock ? `${(firstUnlock.tS / 60).toFixed(1)} min, ice ${firstUnlock.ice.toFixed(2)} dB` : '-'}`
    );

    // Locked with traffic before the storm bites
    expect(at(60).locked).toBe(true);
    // ICE ON FEED reaches warning (2 dB) on the way
    expect(samples.some((s) => s.tS <= 1080 && s.iceSeverity === 'warning')).toBe(true);
    // The handover window: still locked 18 min in, with the heater on from 60 s
    expect(at(1080).locked, `ice ${at(1080).ice.toFixed(2)} dB, C/N ${at(1080).cn.toFixed(2)} dB at 18 min`).toBe(true);
    expect(samples.filter((s) => s.tS >= 60 && s.tS <= 1080).every((s) => s.locked)).toBe(true);
    // The brief: C/N under the 4.7 dB reacquire point about fifteen minutes out
    expect(firstUnderReacquire, 'C/N never fell under 4.7 dB').toBeDefined();
    expect((firstUnderReacquire as Sample).tS / 60).toBeGreaterThan(12);
    expect((firstUnderReacquire as Sample).tS / 60).toBeLessThan(18);
    // ...and still loses it before the storm is over: the handover is needed
    expect(firstUnlock, 'VT-01 never lost lock').toBeDefined();
    expect((firstUnlock as Sample).ice).toBeGreaterThan(3.2);
    expect((firstUnlock as Sample).ice).toBeLessThan(3.7);
    // The heater buys time, not the link: ice heads for 10 - 0.5 x 12 = 4.0 dB
    expect(at(totalS - 1).ice).toBeGreaterThan(3.5);
    expect(at(totalS - 1).ice).toBeLessThan(4.0);
  }, 60_000);
});
