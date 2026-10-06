/**
 * Satellite relay through the phase 19.3 transponder: what reaches a
 * transponder, what it relays, and the stand-in / handover rules.
 */

import { Satellite, type TransponderConfig } from '@app/equipment/satellite/satellite';
import { fluxToIsoPowerDbm, outputBackoffDb } from '@app/equipment/satellite/transponder-model';
import { SignalOrigin } from '@app/signal-origin';
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency, RfSignal } from '@app/types';
import type { Degrees } from 'ootk';

const UPLINK_HZ = 5943e6;
const SFD = -88;

const carrier = (over: Partial<RfSignal> = {}): RfSignal => ({
  signalId: 'c',
  serverId: 1,
  noradId: 1,
  frequency: UPLINK_HZ as RfFrequency,
  power: 0 as dBm,
  bandwidth: 36e6 as Hertz,
  modulation: 'QPSK' as ModulationType,
  fec: '3/4' as FECType,
  polarization: 'H',
  feed: '',
  isDegraded: false,
  origin: SignalOrigin.ANTENNA_TX,
  noiseFloor: null,
  gainInPath: 0 as dBi,
  ...over,
});

/** The isotropic input that sits `iboDb` under single-carrier saturation */
const isoAt = (iboDb: number): dBm => (fluxToIsoPowerDbm(SFD, UPLINK_HZ) - iboDb) as dBm;

function makeSat(external: RfSignal[] = [], physics: TransponderConfig['physics'] = {}, standIns?: Record<string, string>): Satellite {
  const sat = new Satellite('TEST', 1, external, [], {
    az: 180 as Degrees,
    el: 40 as Degrees,
    rotation: 0 as Degrees,
    frequencyOffset: 2.225e9 as Hertz,
    degradationConfig: { powerVariation: false, randomDropout: false },
    standIns,
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: UPLINK_HZ as RfFrequency,
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz,
        polarization: 'H',
        physics: { sfdDbwM2: SFD, gOverTDbK: 0, satEirpDbw: 30, amplifier: 'twta', gainMode: 'fgm', ...physics },
      },
    ],
  });
  return sat;
}

const relayed = (sat: Satellite) => sat.txSignal.filter((s) => s.upstreamCn0DbHz !== undefined);

describe('transponder relay (phase 19.3)', () => {
  it('relays a ground uplink at saturated EIRP less the output back-off, translated and with its upstream C/N0', () => {
    const sat = makeSat();
    sat.rxSignal = [carrier({ power: isoAt(3) })];
    sat.update();

    const out = relayed(sat);
    expect(out).toHaveLength(1);
    expect(out[0].frequency).toBe(3718e6);
    expect(out[0].polarization).toBe('V');
    expect(out[0].power - 30).toBeCloseTo(30 - outputBackoffDb('twta', 3), 1);
    expect(out[0].upstreamCn0DbHz).toBeGreaterThan(90);
  });

  it('fixed gain passes an uplink fade through; ALC levels it while the fade is inside its range', () => {
    const fgm = makeSat();
    const alc = makeSat([], { gainMode: 'alc', alcOboDb: 1, alcRangeDb: 20 });
    for (const sat of [fgm, alc]) {
      sat.rxSignal = [carrier({ power: isoAt(3) })];
      sat.update();
    }
    const fgmClear = relayed(fgm)[0].power;
    const alcClear = relayed(alc)[0].power;

    for (const sat of [fgm, alc]) {
      sat.rxSignal = [carrier({ power: isoAt(13) })];
      sat.update();
    }
    expect(fgmClear - relayed(fgm)[0].power).toBeGreaterThan(5);
    // Held to within the share the (now larger) relayed uplink noise takes
    expect(Math.abs(alcClear - relayed(alc)[0].power)).toBeLessThan(0.2);
    // ...but the uplink C/N still pays the fade
    expect(relayed(alc)[0].upstreamCn0DbHz).toBeLessThan((relayed(fgm)[0].upstreamCn0DbHz as number) + 0.01);
  });

  it('a carrier under the uplink noise by more than 10 dB in its bandwidth loads the transponder but is not relayed', () => {
    const sat = makeSat();
    // k - G/T over 36 MHz is about -123 dBm at the isotropic plane
    sat.rxSignal = [carrier({ power: -140 as dBm })];
    sat.update();
    expect(relayed(sat)).toHaveLength(0);
    expect(sat.operatingPoint('TP-1')).not.toBeNull();
  });

  it('two stations radiating the same carrier are one carrier (the stronger arrival), not a collision', () => {
    const sat = makeSat();
    sat.rxSignal = [carrier({ power: isoAt(3) }), carrier({ power: isoAt(9) })];
    sat.update();
    expect(relayed(sat)).toHaveLength(1);
    expect(sat.operatingPoint('TP-1')?.iboDb).toBeCloseTo(3, 1);
  });

  it('an authored stand-in steps aside while the ground carrier it stands in for is on the air', () => {
    const standIn = carrier({ signalId: 'composite', power: 100 as dBm, origin: SignalOrigin.SATELLITE_RX });
    const sat = makeSat([standIn], {}, { composite: 'teleport' });
    sat.update();
    expect(relayed(sat).map((s) => s.signalId)).toEqual(['composite']);

    sat.rxSignal = [carrier({ signalId: 'teleport', power: isoAt(3) })];
    sat.update();
    expect(relayed(sat).map((s) => s.signalId)).toEqual(['teleport']);

    sat.rxSignal = [];
    sat.update();
    expect(relayed(sat).map((s) => s.signalId)).toEqual(['composite']);
  });

  it('authored uplinks are EIRP put through the free-space loss from the reference range', () => {
    const sat = makeSat([carrier({ signalId: 'composite', power: 100 as dBm, origin: SignalOrigin.SATELLITE_RX })]);
    sat.update();
    const rangeKm = sat.uplinkReferenceRangeKm();
    expect(rangeKm).toBeGreaterThan(37_000);
    expect(rangeKm).toBeLessThan(39_000);
    const fspl = 32.45 + 20 * Math.log10(rangeKm) + 20 * Math.log10(UPLINK_HZ / 1e6);
    const iboDb = sat.operatingPoint('TP-1')?.iboDb as number;
    expect(iboDb).toBeCloseTo(fluxToIsoPowerDbm(SFD, UPLINK_HZ) - (100 - fspl), 1);
  });

  it('two carriers share the output and make intermodulation', () => {
    const sat = makeSat();
    sat.rxSignal = [
      carrier({ signalId: 'a', power: isoAt(4), bandwidth: 10e6 as Hertz }),
      carrier({ signalId: 'b', frequency: (UPLINK_HZ + 15e6) as RfFrequency, power: isoAt(10), bandwidth: 10e6 as Hertz }),
    ];
    sat.update();
    const [a, b] = relayed(sat);
    expect(a.power - b.power).toBeCloseTo(6, 1);
    const point = sat.operatingPoint('TP-1');
    expect(point?.carrierToImDb).toBeGreaterThan(5);
    expect(point?.carrierToImDb).toBeLessThan(30);
    // IM rides on each carrier's upstream C/N0, below its thermal uplink C/N0
    expect(point?.carriers[0].upstreamCn0DbHz).toBeLessThan(point?.carriers[0].cn0UpDbHz as number);
  });
});
