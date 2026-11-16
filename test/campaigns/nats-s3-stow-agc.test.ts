/**
 * r2-s03-F2 (phase 27): after the S3 handover VT-01 is stowed; as the dish
 * slews off TIDEMARK-1 the carrier slides out of the beam and for half a
 * second the AGC sat at max gain with a weak carrier ("AGC at max gain -
 * weak signal"). Reproduced here on the S3 VT-01 chain; the AGC limit alarms
 * are now inhibited while the antenna is stowed or repositioning.
 */
import { describe, expect, it, vi } from 'vitest';

let simNowMs = Date.UTC(2026, 1, 3, 15, 45, 0);
vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => simNowMs,
  getSimulatedNow: () => new Date(simNowMs),
}));
let simSatellites: import('@app/equipment/satellite/satellite').Satellite[] = [];
vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      satellites: simSatellites,
      getSatByNoradId: (noradId: number) => simSatellites.find((sat) => sat.noradId === noradId) ?? null,
      isDeveloperMode: false,
      groundStations: [],
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    destroy: () => undefined,
  },
}));

import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { scenario3Data } from '@app/campaigns/nats/scenario3';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { createAntenna } from '@app/equipment/antenna/antenna-factory';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import type { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Rng } from '@app/simulation/rng';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';

describe('S3 VT-01 stow after the handover (phase 27, r2-s03-F2)', () => {
  it('raises no AGC max-gain alarm while the dish slews to stow', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    const maxGainAlarms: number[] = [];
    let noiseOnlySeen = false;
    EventBus.destroy();
    SimClock.reset();
    Rng.setSeed(1234);
    document.body.innerHTML = '<div id="tv-fe"></div>';
    const gs = (scenario3Data.settings.groundStations as GroundStationConfig[]).find((s) => s.id === 'VT-01') as GroundStationConfig;
    simSatellites = scenario3Data.settings.satellites as Satellite[];
    for (const s of simSatellites) s.rxSignal = [];
    const antenna = createAntenna('tv-ant', 'headless', gs.antennas[0], { ...(gs.antennasState?.[0] ?? {}), isPowered: true }, 1) as AntennaCore;
    antenna.attachStationLocation(gs.location.latitude, gs.location.longitude, gs.location.elevation);
    const fe = createRFFrontEnd('tv-fe', gs.rfFrontEnds[0], 'standard');
    fe.connectAntenna(antenna);
    antenna.attachRfFrontEnd(fe);
    const txState = { modems: JSON.parse(JSON.stringify(gs.transmitters?.[0]?.modems)) };
    fe.connectTransmitter({ state: txState, isModemInIntermittentDropout: () => false } as never);
    const fly = (s: number, label: string) => {
      for (let i = 0; i < s * 60; i++) {
        simNowMs += FIXED_STEP_MS;
        SimClock.step();
        for (const sat of simSatellites) sat.update();
        EventBus.getInstance().emit(Events.UPDATE, FIXED_STEP_MS);
        const alarms = fe.agcModule.getAlarms();
        if (alarms.some((a) => a.includes('max gain'))) maxGainAlarms.push(i);
        if (label === 'stow' && alarms.some((a) => a.includes('noise only'))) noiseOnlySeen = true;
      }
    };
    fly(10, 'start');
    // Handover: VT-01 stops radiating
    txState.modems[0].isTransmitting = false;
    fly(5, 'tx-off');
    antenna.handleTrackingModeChange('stow');
    antenna.applyChanges();
    fly(40, 'stow');
    expect(maxGainAlarms).toEqual([]);
    // Stowed at zenith the AGC still reports the empty sky
    expect(noiseOnlySeen).toBe(true);
    expect(antenna.state.elevation).toBeGreaterThan(50);
  });
});
