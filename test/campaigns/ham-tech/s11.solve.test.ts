import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS11Data } from '../../../src/campaigns/ham-sdr/tech/s11-a-contact-through-space';
import { s11Station } from '../../../src/campaigns/ham-sdr/tech/s11-station';
import { evaluateWith } from '../../../src/ham/ham-conditions';
import type { HamStationConfig } from '../../../src/ham/ham-station-config';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import type { TxIntent } from '../../../src/ham/ham-types';
import type { SatGeometry } from '../../../src/ham/ops/satellite-link';
import { harness } from '../../ham/manager/harness';
import { allTrue, objective, practical, quizLocalIds } from './scn-c-util';

afterEach(() => HamStationManager.destroy());

/** Scripted pass: high in the east, Doppler swinging from +23 ppm (rising) to -23 ppm (setting) over 500 s */
const doppler = (t: number): number => 1 + 23e-6 * (1 - 2 * Math.min(Math.max(t / 500, 0), 1));
const pass = (_id: number, t: number): SatGeometry => ({ az: 90, el: 40, rangeKm: 900, dopplerFactor: doppler(t), isAboveHorizon: true });

const cfgWith = (patch: (c: HamStationConfig) => HamStationConfig = (c) => c): HamStationConfig => patch(structuredClone(s11Station));

const downlinkAt = (t: number): number => Math.round(145.9 * doppler(t) * 1e5) / 1e5;
const uplinkAt = (t: number): number => Math.round((435.9 / doppler(t)) * 1e5) / 1e5;

function setup(config = cfgWith()) {
  const h = harness(config, { geometry: pass });
  const retuneDown = () => h.actOk({ type: 'radio.set', deviceId: 'sdr', patch: { vfoMHz: downlinkAt(h.m.nowS) } });
  const prepare = () => {
    h.actOk({ type: 'inspect', targetId: 'duplexer' });
    h.actOk({ type: 'radio.set', deviceId: 'ht', patch: { vfoMHz: 435.9, txToneHz: 67, txPowerW: 2.5 } });
    h.actOk({ type: 'radio.set', deviceId: 'sdr', patch: { vfoMHz: 145.9, mode: 'FM' } });
  };
  const aim = () => h.actOk({ type: 'antenna.adjust', deviceId: 'yagi', azDeg: 90, elDeg: 40 });
  const key = (intent: TxIntent) => {
    h.actOk({ type: 'radio.set', deviceId: 'ht', patch: { vfoMHz: uplinkAt(h.m.nowS), txToneHz: 67 } });
    retuneDown();
    h.actOk({ type: 'ptt', deviceId: 'ht', intent, holdS: 2 });
  };

  return { h, retuneDown, prepare, aim, key };
}

describe('S11 solve: a contact through space', () => {
  it('has the pass worksheets answerable and exactly ten quiz items used once', () => {
    const ids = quizLocalIds(hamTechS11Data);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect(ids.slice().sort()).toEqual(['S11-A1', 'S11-A2', 'S11-Q1', 'S11-Q2', 'S11-Q3', 'S11-Q4', 'S11-Q5', 'S11-Q6', 'S11-Q7', 'S11-Q8']);
    for (const o of hamTechS11Data.objectives ?? []) {
      if (o.id === 'review-mission-brief') continue;
      expect(practical(o).length, o.id).toBeGreaterThan(0);
    }
  });

  it('prepare, acquire the beacon receive-only, uplink with Doppler correction and complete the exchange', () => {
    const { h, retuneDown, prepare, aim, key } = setup();
    const m = h.m;
    const prep = objective(hamTechS11Data, 'prepare-paths');
    const acq = objective(hamTechS11Data, 'acquire-downlink');
    const first = objective(hamTechS11Data, 'first-uplink');
    const dop = objective(hamTechS11Data, 'follow-doppler');
    const ex = objective(hamTechS11Data, 'grid-exchange');

    expect(allTrue(prep, m)).toBe(false);
    prepare();
    expect(allTrue(prep, m)).toBe(true);

    // receive-only: nothing has been transmitted, the Yagi still points north at the horizon
    expect(allTrue(acq, m)).toBe(false);
    h.advance(60, 1);
    expect(m.satelliteState()?.beaconHeard).toBe(false);
    aim();
    for (let i = 0; i < 6; i += 1) {
      retuneDown();
      h.advance(10, 1);
    }
    expect(allTrue(acq, m)).toBe(true);
    expect(m.events('txOk:ht')).toHaveLength(0);

    // first uplink, corrected for Doppler
    expect(allTrue(first, m)).toBe(false);
    key({ kind: 'cq' });
    h.advance(3, 1);
    expect(m.events('sat:relayed').length).toBeGreaterThan(0);
    for (let i = 0; i < 4; i += 1) {
      retuneDown();
      h.advance(2, 1);
    }
    expect(allTrue(first, m)).toBe(true);
    expect(allTrue(dop, m)).toBe(false);

    // later in the pass the shift has changed; a second corrected key-up proves the player followed it
    h.advance(120, 5);
    key({ kind: 'cq' });
    h.advance(3, 1);
    expect(allTrue(dop, m)).toBe(true);

    // grid exchange: the ground station answers, the player hears it and replies and identifies
    expect(allTrue(ex, m)).toBe(false);
    key({ kind: 'cq' });
    for (let i = 0; i < 10; i += 1) {
      retuneDown();
      h.advance(2, 1);
    }
    key({ kind: 'reply', item: 'grid' });
    h.advance(3, 1);
    key({ kind: 'identify' });
    for (let i = 0; i < 6; i += 1) {
      retuneDown();
      h.advance(2, 1);
    }
    expect(allTrue(ex, m)).toBe(true);

    // paper objectives
    for (const [id, values] of [
      ['s11-pass', { uplink: 435.9, tone: 67, shift: 3.36, direction: 'Above 145.900 MHz, then lower as it passes' }],
      ['s11-fading', { cause: 'The satellite spins, so its antenna turns relative to your linear antenna', fix: 'Rotate or tilt your antenna to follow the polarization' }],
      ['s11-log', { entry: 'Date, time, CUBEHOP-UV, W0GRD, grid EN34, uplink and downlink frequencies, signal report' }],
    ] as const) {
      h.actOk({ type: 'worksheet.answer', id, values: values as never });
    }
    for (const o of ['read-pass-card', 'explain-fading', 'log-the-pass']) expect(allTrue(objective(hamTechS11Data, o), m)).toBe(true);
  });

  it('negative: the uplink on the nominal frequency misses the satellite receiver while the shift is large', () => {
    const { h, prepare, aim } = setup();
    prepare();
    aim();
    h.advance(5, 1);
    h.actOk({ type: 'ptt', deviceId: 'ht', intent: { kind: 'cq' }, holdS: 2 });
    h.advance(3, 1);
    expect(h.m.events('sat:out-of-window')).toHaveLength(1);
    expect(
      evaluateWith(
        practical(objective(hamTechS11Data, 'first-uplink')).find((c) => c.description.includes('relayed')) ?? practical(objective(hamTechS11Data, 'first-uplink'))[0],
        h.m
      )
    ).toBe(false);
    expect(allTrue(objective(hamTechS11Data, 'first-uplink'), h.m)).toBe(false);
  });

  it('negative: a plain splitter instead of the duplexer blocks keying and never reaches the satellite', () => {
    const config = cfgWith((c) => ({ ...c, devices: c.devices.map((d) => (d.id === 'duplexer' ? { ...d, isolationDb: 6 } : d)) }));
    const { h, prepare, aim } = setup(config);
    prepare();
    aim();
    h.advance(5, 1);
    h.actOk({ type: 'radio.set', deviceId: 'ht', patch: { vfoMHz: uplinkAt(h.m.nowS), txToneHz: 67, txPowerW: 5 } });
    h.actOk({ type: 'ptt', deviceId: 'ht', intent: { kind: 'cq' }, holdS: 2 });
    h.advance(3, 1);
    expect(h.m.events('sat:unsafe').length).toBeGreaterThan(0);
    expect(h.m.events('sat:relayed')).toHaveLength(0);
    expect(allTrue(objective(hamTechS11Data, 'first-uplink'), h.m)).toBe(false);
  });

  it('negative: a missing access tone is ignored by the satellite', () => {
    const { h, prepare, aim } = setup();
    prepare();
    aim();
    h.advance(5, 1);
    h.actOk({ type: 'radio.set', deviceId: 'ht', patch: { vfoMHz: uplinkAt(h.m.nowS), txToneHz: null } });
    h.actOk({ type: 'ptt', deviceId: 'ht', intent: { kind: 'cq' }, holdS: 2 });
    h.advance(3, 1);
    expect(h.m.events('sat:wrong-tone')).toHaveLength(1);
    expect(h.m.events('sat:relayed')).toHaveLength(0);
  });
});
