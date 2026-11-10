import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS04Data } from '../../../src/campaigns/ham-sdr/tech/s04-i-can-hear-them';
import { evaluateWith } from '../../../src/ham/ham-conditions';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { harness } from '../../ham/manager/harness';
import { practical, quizIds } from './solve-utils-a';

afterEach(() => HamStationManager.destroy());

const config = () => structuredClone(hamTechS04Data.settings.hamStation) as NonNullable<typeof hamTechS04Data.settings.hamStation>;
type H = ReturnType<typeof harness>;
const act = (h: H, a: Record<string, unknown>) => h.actOk(a as never);
const cq = (h: H) => {
  act(h, { type: 'ptt', deviceId: 'ht', intent: { kind: 'cq' }, holdS: 3 });
  h.advance(8);
};
const FREQ = { type: 'radio.set', deviceId: 'ht', patch: { offset: 'minus', offsetKHz: 600 } };
const TONE = { type: 'radio.set', deviceId: 'ht', patch: { txToneHz: 100 } };

describe('S4 I Can Hear Them solve', () => {
  it('uses exactly its ten quiz items, each once', () => {
    const ids = quizIds(hamTechS04Data);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect([...ids].sort()).toEqual(['S04-A1', 'S04-A2', 'S04-Q1', 'S04-Q2', 'S04-Q3', 'S04-Q4', 'S04-Q5', 'S04-Q6', 'S04-Q7', 'S04-Q8']);
  });

  it('solves every objective in order', () => {
    const h = harness(config());
    const ok = (id: string) => practical(hamTechS04Data, id).every((c) => evaluateWith(c, h.m));
    h.advance(3);

    expect(ok('read-repeater-entry')).toBe(false);
    act(h, { type: 'worksheet.answer', id: 's04-directory', values: { output: 146.94, offset: '-600 kHz', tone: 100 } });
    expect(ok('read-repeater-entry')).toBe(true);

    expect(ok('check-transmit-frequency')).toBe(false);
    cq(h); // simplex: wrong frequency
    expect(ok('check-transmit-frequency')).toBe(false); // offset not fixed yet
    act(h, FREQ);
    expect(ok('check-transmit-frequency')).toBe(true);

    expect(ok('correct-access-tone')).toBe(false);
    cq(h); // right input, wrong tone
    expect(ok('correct-access-tone')).toBe(false);
    act(h, TONE);
    cq(h);
    expect(ok('correct-access-tone')).toBe(true);

    expect(ok('save-and-recall-channel')).toBe(false);
    act(h, { type: 'radio.store', deviceId: 'ht', slot: 3, name: 'CLUBRPT' });
    act(h, { type: 'radio.set', deviceId: 'ht', patch: { vfoMHz: 146.52, offset: 'simplex', txToneHz: null } });
    act(h, { type: 'radio.recall', deviceId: 'ht', slot: 3 });
    cq(h);
    expect(ok('save-and-recall-channel')).toBe(true);

    expect(ok('complete-repeater-contact')).toBe(false);
    act(h, { type: 'ptt', deviceId: 'ht', intent: { kind: 'call', target: 'N0CLB' }, holdS: 3 });
    h.advance(8);
    act(h, { type: 'ptt', deviceId: 'ht', intent: { kind: 'reply', item: 'name' }, holdS: 3 });
    h.advance(8);
    act(h, { type: 'ptt', deviceId: 'ht', intent: { kind: 'identify' }, holdS: 3 });
    h.advance(8);
    expect(ok('complete-repeater-contact')).toBe(true);

    expect(ok('explore-digital-memory')).toBe(false);
    act(h, { type: 'worksheet.answer', id: 's04-dmr', values: { cc: 1, slot: 2, tg: 31337 } });
    for (const index of [0, 1, 2]) {
      act(h, { type: 'radio.dmrChannel', deviceId: 'dmr-ht', index });
      act(h, { type: 'ptt', deviceId: 'dmr-ht', intent: { kind: 'call', target: 'KD0RLY' }, holdS: 2 });
      h.advance(index === 2 ? 14 : 4);
    }
    expect(ok('explore-digital-memory')).toBe(true);
  });

  it('negative: fixing only the frequency does not satisfy the tone objective', () => {
    const h = harness(config());
    h.advance(3);
    act(h, FREQ);
    cq(h);
    expect(practical(hamTechS04Data, 'correct-access-tone').every((c) => evaluateWith(c, h.m))).toBe(false);
  });

  it('negative: storing a memory without recalling it is not enough', () => {
    const h = harness(config());
    h.advance(3);
    act(h, FREQ);
    act(h, TONE);
    act(h, { type: 'radio.store', deviceId: 'ht', slot: 3, name: 'CLUBRPT' });
    cq(h);
    expect(practical(hamTechS04Data, 'save-and-recall-channel').every((c) => evaluateWith(c, h.m))).toBe(false);
  });

  it('negative: the good digital channel alone skips the failure lessons', () => {
    const h = harness(config());
    h.advance(3);
    act(h, { type: 'worksheet.answer', id: 's04-dmr', values: { cc: 1, slot: 2, tg: 31337 } });
    act(h, { type: 'radio.dmrChannel', deviceId: 'dmr-ht', index: 2 });
    act(h, { type: 'ptt', deviceId: 'dmr-ht', intent: { kind: 'call', target: 'KD0RLY' }, holdS: 2 });
    h.advance(14);
    expect(practical(hamTechS04Data, 'explore-digital-memory').every((c) => evaluateWith(c, h.m))).toBe(false);
  });
});
