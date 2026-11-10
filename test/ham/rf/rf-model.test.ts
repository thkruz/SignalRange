import type { HamConnection, PortDef } from '@app/ham/ham-types';
import { antennaGainDbi, antennaPolarization, antennaSwr, createAntenna, dipoleResonanceMHz, polarizationLossDb } from '@app/ham/rf/antenna-model';
import { cxAbs } from '@app/ham/rf/complex';
import { type CoaxFault, coaxDcTest, coaxLossPer100ftDb, createCoax } from '@app/ham/rf/feedline';
import { analyzerSweep, createDummyLoad, dummyLoadHeat, minSwrFrequency, readInlineSwrMeter, stepDummyLoad, transmitterRefusal } from '@app/ham/rf/instruments';
import { adapterDevice, coaxDevice, type RfDevice, resolveRfPath, swrMeterDevice, terminalDevice, validateConnection } from '@app/ham/rf/rf-path';
import { foldbackFactor, txOutputPowerW, txPowerThroughPath } from '@app/ham/rf/tx-protection';
import { describe, expect, it } from 'vitest';

const port = (id: string, family: PortDef['family'], gender: PortDef['gender']): PortDef => ({ id, label: id, family, gender, role: 'rf' });
const radio: RfDevice = { id: 'radio', kind: 'radio', ports: [port('ant', 'UHF', 'jack')] };
const conn = (id: string, a: string, b: string, seated = true): HamConnection => {
  const [ad, ap] = a.split('.');
  const [bd, bp] = b.split('.');
  return { id, a: { deviceId: ad, portId: ap }, b: { deviceId: bd, portId: bp }, seated };
};
const world = (...devs: RfDevice[]): Record<string, RfDevice> => Object.fromEntries(devs.map((d) => [d.id, d]));
const F = 146.55;
const PLUG = { family: 'UHF', gender: 'plug' } as const;

const coax = (id: string, type: 'rg58' | 'rg8x' | 'lmr400', ft: number, fault: CoaxFault | null = null): RfDevice => coaxDevice(id, createCoax(type, ft, 'ft', fault), PLUG);
const ant = (id: string, a = createAntenna('adjustable-dipole', { elementLengthsM: [0.488, 0.488] })) => terminalDevice(id, 'antenna', 'UHF', 'jack', a);

describe('SWR meter, dummy load, crushed coax', () => {
  it('dummy load at the radio reads SWR 1.0 and full forward power', () => {
    const devs = world(radio, swrMeterDevice('m'), terminalDevice('dl', 'dummy-load', 'UHF', 'plug'));
    const path = resolveRfPath(devs, [conn('c1', 'radio.ant', 'm.tx'), conn('c2', 'm.ant', 'dl.in')], { startDeviceId: 'radio', freqMHz: F });
    const r = readInlineSwrMeter(path, 50);
    expect(r.swr).toBeCloseTo(1, 1);
    expect(r.forwardW).toBeGreaterThan(49);
    expect(path.safeToTransmit).toBe(true);
    expect(path.termination).toBe('dummy-load');
    expect(txOutputPowerW(50, path.swrAtStart)).toBeCloseTo(50, 0);
  });

  it('crushed coax plus antenna gives high SWR and foldback; dummy load past the bad coax still looks bad; good coax is fine', () => {
    const bad = coax('x', 'rg8x', 25, { kind: 'crushed-coax' });
    const good = coax('g', 'rg8x', 25);
    const mk = (cable: RfDevice, term: RfDevice) =>
      resolveRfPath(
        world(radio, swrMeterDevice('m'), cable, term),
        [conn('c1', 'radio.ant', 'm.tx'), conn('c2', 'm.ant', `${cable.id}.a`), conn('c3', `${cable.id}.b`, `${term.id}.in`)],
        { startDeviceId: 'radio', freqMHz: F }
      );
    const withAnt = mk(bad, ant('a'));
    expect(withAnt.swrMeter?.swr ?? 0).toBeGreaterThan(2.2);
    expect(foldbackFactor(withAnt.swrAtStart)).toBeLessThan(1);
    const dlBad = mk(bad, terminalDevice('dl', 'dummy-load', 'UHF', 'jack'));
    expect(dlBad.swrMeter?.swr ?? 0).toBeGreaterThan(2.2);
    const dlGood = mk(good, terminalDevice('dl', 'dummy-load', 'UHF', 'jack'));
    expect(dlGood.swrMeter?.swr ?? 99).toBeLessThan(1.1);
    const goodAnt = mk(good, ant('a'));
    expect(goodAnt.swrMeter?.swr ?? 99).toBeLessThan(2);
    const tp = txPowerThroughPath(50, withAnt);
    expect(tp.foldedBack).toBe(true);
    expect(tp.outputW).toBeLessThan(50);
  });

  it('long lossy RG-58 hides a bad antenna at the radio but not at the antenna', () => {
    const badAnt = createAntenna('adjustable-dipole', { elementLengthsM: [0.7, 0.7] });
    const mk = (cable: RfDevice) =>
      resolveRfPath(world(radio, cable, ant('a', badAnt)), [conn('c1', 'radio.ant', `${cable.id}.a`), conn('c2', `${cable.id}.b`, 'a.in')], { startDeviceId: 'radio', freqMHz: F });
    const shortP = mk(coax('s', 'lmr400', 3));
    const longP = mk(coax('l', 'rg58', 100));
    expect(longP.swrAtStart).toBeLessThan(shortP.swrAtStart - 1);
    expect(cxAbs(longP.loadGamma)).toBeCloseTo(cxAbs(shortP.loadGamma), 6);
    expect(antennaSwr(badAnt, F)).toBeGreaterThan(5);
    expect(longP.totalLossDb).toBeGreaterThan(5);
  });

  it('coax loss scales with frequency and DC tests distinguish faults', () => {
    expect(coaxLossPer100ftDb('rg58', 150)).toBeCloseTo(6.1, 1);
    expect(coaxLossPer100ftDb('rg58', 450)).toBeCloseTo(10.5, 1);
    expect(coaxLossPer100ftDb('lmr400', 28)).toBeLessThan(1);
    expect(coaxDcTest(createCoax('rg58', 25)).centreShieldOhm).toBeNull();
    expect(coaxDcTest(createCoax('rg58', 25, 'ft', { kind: 'short' })).centreShieldOhm).toBeLessThan(5);
    expect(coaxDcTest(createCoax('rg58', 25, 'ft', { kind: 'open-centre' })).centreOhm).toBeNull();
  });
});

describe('dipole and analyzer', () => {
  const sweepFor = (lengths: [number, number], cal = { done: true, referenceDeviceId: null as string | null }, cable = true) => {
    const a = createAntenna('adjustable-dipole', { elementLengthsM: lengths });
    const devs = world(terminalDevice('an', 'analyzer', 'UHF', 'jack'), coax('tc', 'rg58', 50), ant('a', a));
    const conns = cable ? [conn('c1', 'an.rf', 'tc.a'), conn('c2', 'tc.b', 'a.in')] : [];
    return analyzerSweep(devs, conns, 'an', { startMHz: 135, stopMHz: 160, points: 251, calibration: cal });
  };

  it('starting kit resonates below 146.55 and shortening moves it up', () => {
    const start = createAntenna('adjustable-dipole');
    expect(dipoleResonanceMHz(start.elementLengthsM[0] + start.elementLengthsM[1])).toBeLessThan(146.55);
    const f1 = minSwrFrequency(sweepFor([0.5, 0.5], { done: true, referenceDeviceId: 'tc' }))!;
    const f2 = minSwrFrequency(sweepFor([0.488, 0.488], { done: true, referenceDeviceId: 'tc' }))!;
    expect(f1).toBeCloseTo(143, 0);
    expect(f2).toBeGreaterThan(f1 + 2);
    expect(f2).toBeCloseTo(146.5, 0);
  });

  it('calibration state changes the reading and the reference plane matters', () => {
    const lengths: [number, number] = [0.5, 0.5];
    const atCable = sweepFor(lengths, { done: true, referenceDeviceId: 'tc' });
    const atPort = sweepFor(lengths, { done: true, referenceDeviceId: null });
    const uncal = sweepFor(lengths, { done: false, referenceDeviceId: null });
    expect(uncal.uncalibrated).toBe(true);
    expect(uncal.flags).toContain('uncalibrated');
    expect(minSwrFrequency(uncal)).not.toBeCloseTo(minSwrFrequency(atCable)!, 0);
    // cable loss makes the antenna look better at the analyzer port than at the cable end
    expect(atPort.minSwr!.swr).toBeLessThan(atCable.minSwr!.swr);
  });

  it('refuses to sweep into a transmitter', () => {
    const devs = world(terminalDevice('an', 'analyzer', 'UHF', 'jack'), { id: 'radio', kind: 'radio', ports: [port('ant', 'UHF', 'plug')] });
    const s = analyzerSweep(devs, [conn('c', 'an.rf', 'radio.ant')], 'an', { startMHz: 140, stopMHz: 150, points: 5 });
    expect(s.refusal).toMatch(/refused/u);
    expect(s.points).toHaveLength(0);
  });
});

describe('polarization and gain', () => {
  it('V vs H is a deep cross-pol loss, V vs V none, circular vs linear 3 dB', () => {
    const v = antennaPolarization(createAntenna('quarter-wave-vertical'));
    const h = antennaPolarization(createAntenna('adjustable-dipole', { orientation: 'horizontal' }));
    expect(polarizationLossDb(v, v)).toBeCloseTo(0, 6);
    expect(polarizationLossDb(v, h)).toBe(20);
    expect(polarizationLossDb({ kind: 'rhcp' }, v)).toBe(3);
    expect(polarizationLossDb({ kind: 'linear', angleDeg: 45 }, v)).toBeCloseTo(3, 0);
  });

  it('yagi gain drops off boresight and peaks per band', () => {
    const y = createAntenna('dual-band-yagi', { azDeg: 90, elDeg: 30 });
    expect(antennaGainDbi(y, 146, 90, 30)).toBeCloseTo(7, 5);
    expect(antennaGainDbi(y, 436, 90, 30)).toBeCloseTo(10, 5);
    expect(antennaGainDbi(y, 146, 270, 30)).toBeLessThan(0);
    expect(antennaGainDbi(createAntenna('rubber-duck'), 146, 0, 0)).toBeCloseTo(-3, 5);
  });
});

describe('connectors, cal load, loose seating', () => {
  it('refuses incompatible and allows adapted mating', () => {
    expect(validateConnection(port('a', 'SMA', 'jack'), port('b', 'UHF', 'plug')).ok).toBe(false);
    expect(validateConnection(port('a', 'UHF', 'plug'), port('b', 'UHF', 'plug')).ok).toBe(false);
    expect(validateConnection(port('a', 'UHF', 'plug'), port('b', 'UHF', 'jack')).ok).toBe(true);
    const ht: RfDevice = { id: 'ht', kind: 'radio', ports: [port('ant', 'SMA', 'jack')] };
    const dl = terminalDevice('dl', 'dummy-load', 'UHF', 'jack');
    const direct = resolveRfPath(world(ht, dl), [conn('c', 'ht.ant', 'dl.in')], { startDeviceId: 'ht', freqMHz: F });
    expect(direct.valid).toBe(false);
    expect(direct.safeToTransmit).toBe(false);
    const ad = adapterDevice('ad', { family: 'SMA', gender: 'plug' }, { family: 'UHF', gender: 'plug' });
    const adapted = resolveRfPath(world(ht, ad, dl), [conn('c1', 'ht.ant', 'ad.a'), conn('c2', 'ad.b', 'dl.in')], { startDeviceId: 'ht', freqMHz: F });
    expect(adapted.valid).toBe(true);
    expect(adapted.termination).toBe('dummy-load');
  });

  it('cal load terminates unsafely with refusal text', () => {
    const cal = terminalDevice('cl', 'cal-load', 'UHF', 'plug');
    const p = resolveRfPath(world(radio, cal), [conn('c', 'radio.ant', 'cl.in')], { startDeviceId: 'radio', freqMHz: F });
    expect(p.termination).toBe('cal-load');
    expect(p.safeToTransmit).toBe(false);
    expect(p.refusal).toMatch(/0\.5 W/u);
    expect(transmitterRefusal('cal-load')).toBeTruthy();
    expect(transmitterRefusal('dummy-load')).toBeNull();
  });

  it('a partly seated connector adds loss and reflection', () => {
    const dl = terminalDevice('dl', 'dummy-load', 'UHF', 'plug');
    const run = (seated: boolean) => resolveRfPath(world(radio, dl), [conn('c', 'radio.ant', 'dl.in', seated)], { startDeviceId: 'radio', freqMHz: F });
    expect(run(true).totalLossDb).toBe(0);
    const loose = run(false);
    expect(loose.totalLossDb).toBeGreaterThanOrEqual(6);
    expect(loose.totalLossDb).toBeLessThanOrEqual(15);
    expect(loose.swrAtStart).toBeGreaterThan(1.5);
  });
});

describe('dummy load heat and foldback', () => {
  it('heats under power, cools with time, warns', () => {
    let s = createDummyLoad(100, 300);
    s = stepDummyLoad(s, 100, 300);
    expect(dummyLoadHeat(s).state).not.toBe('cool');
    expect(dummyLoadHeat(s).warning).not.toBeNull();
    const hot = s.heatJ;
    s = stepDummyLoad(s, 0, 1800);
    expect(s.heatJ).toBeLessThan(hot / 4);
    expect(dummyLoadHeat(s).state).toBe('cool');
  });

  it('foldback is full to SWR 2 and 25 percent by 3', () => {
    expect(foldbackFactor(1.5)).toBe(1);
    expect(foldbackFactor(2.5)).toBeCloseTo(0.625, 5);
    expect(foldbackFactor(5)).toBe(0.25);
  });
});
