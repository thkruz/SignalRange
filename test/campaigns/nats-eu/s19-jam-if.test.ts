/**
 * Phase 35 C5 (s19-F3, D13): the S19 uplink jam is transponded by TP-CMD and
 * comes back at 11780 MHz RF = 1320 MHz IF (LO 13100), outside the 1370 / 60 MHz
 * window of the video look. The Call the NAK objective therefore names the
 * 1320 MHz / 10 MHz analyzer look.
 */

import { describe, expect, it, vi } from 'vitest';

const simNowMs = Date.UTC(2027, 3, 16, 13, 25, 0);

vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => simNowMs,
  getSimulatedNow: () => new Date(simNowMs),
}));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => ({ satellites: [], getSatByNoradId: () => null, isDeveloperMode: false, groundStations: [] }), destroy: () => undefined },
}));

import { natsEuScenario19Data } from '@app/campaigns/nats-eu/scenario19';
import type { Satellite } from '@app/equipment/satellite/satellite';
import { SignalOrigin } from '@app/signal-origin';
import type { dBm, Hertz, RfFrequency } from '@app/types';

const LNB_LO_HZ = 13100e6;

describe('S19 jam on the command uplink', () => {
  it('returns at 1320 MHz IF through TP-CMD', () => {
    const settings = natsEuScenario19Data.settings as unknown as {
      satellites: Satellite[];
      interferenceEvents: Array<{ frequency: number; bandwidth: number; power: number; polarization: 'H' | 'V' }>;
    };
    const sat = settings.satellites.find((s) => s.noradId === 61702) as Satellite;
    const jam = settings.interferenceEvents[0];

    sat.rxSignal = [];
    sat.externalSignal = [
      {
        signalId: 'sar2-uplink-jam',
        serverId: 1,
        noradId: 61702,
        frequency: jam.frequency as RfFrequency,
        power: jam.power as dBm,
        bandwidth: jam.bandwidth as Hertz,
        polarization: jam.polarization,
        origin: SignalOrigin.TRANSMITTER,
        modulation: 'QPSK',
        fec: '3/4',
      } as never,
    ];
    sat.update();

    const relayed = sat.txSignal.find((s) => s.signalId === 'sar2-uplink-jam');
    expect(relayed).toBeDefined();
    expect(Math.round((LNB_LO_HZ - (relayed?.frequency as number)) / 1e6)).toBe(1320);
  });
});
