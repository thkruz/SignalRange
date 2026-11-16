import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS04Data } from '../../src/campaigns/ham-sdr/tech/s04-i-can-hear-them';
import { DIAL_DWELL_S, evaluateWith, radioSetting } from '../../src/ham/ham-conditions';
import { HamStationManager } from '../../src/ham/ham-station-manager';
import { harness } from './manager/harness';

afterEach(() => HamStationManager.destroy());

const config = () => structuredClone(hamTechS04Data.settings.hamStation) as NonNullable<typeof hamTechS04Data.settings.hamStation>;
const set = (h: ReturnType<typeof harness>, vfoMHz: number) => h.actOk({ type: 'radio.set', deviceId: 'ht', patch: { vfoMHz } } as never);

describe('radioSetting dwell', () => {
  const target = (s: { vfoMHz: number }) => Math.abs(s.vfoMHz - 146.52) < 0.0005;

  it('credits only after the detent has held for the dwell', () => {
    const h = harness(config());
    const c = radioSetting('ht', target, 'target', 'target', DIAL_DWELL_S);
    set(h, 146.52);
    expect(h.m.radio('ht')?.vfoMHz).toBeCloseTo(146.52, 4); // the radio acts at once
    expect(evaluateWith(c, h.m)).toBe(false);
    h.advance(DIAL_DWELL_S * 0.5);
    expect(evaluateWith(c, h.m)).toBe(false);
    h.advance(DIAL_DWELL_S * 0.6);
    expect(evaluateWith(c, h.m)).toBe(true);
  });

  it('a sweep past the value earns nothing, and leaving restarts the wait', () => {
    const h = harness(config());
    const c = radioSetting('ht', target, 'target', 'target', DIAL_DWELL_S);
    set(h, 146.52);
    expect(evaluateWith(c, h.m)).toBe(false);
    h.advance(DIAL_DWELL_S * 0.6);
    set(h, 146.535);
    expect(evaluateWith(c, h.m)).toBe(false);
    set(h, 146.52);
    expect(evaluateWith(c, h.m)).toBe(false);
    h.advance(DIAL_DWELL_S * 0.6);
    expect(evaluateWith(c, h.m)).toBe(false);
    h.advance(DIAL_DWELL_S * 0.6);
    expect(evaluateWith(c, h.m)).toBe(true);
  });

  it('without a dwell the condition is immediate', () => {
    const h = harness(config());
    set(h, 146.52);
    expect(evaluateWith(radioSetting('ht', target, 'target'), h.m)).toBe(true);
  });
});
