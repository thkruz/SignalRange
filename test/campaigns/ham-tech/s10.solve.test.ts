import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS10Data } from '../../../src/campaigns/ham-sdr/tech/s10-beyond-the-local-horizon';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { harness } from '../../ham/manager/harness';
import { allTrue, anyTrue, objective, quizLocalIds } from './scn-c-util';

afterEach(() => HamStationManager.destroy());

const cfg = () => hamTechS10Data.settings.hamStation!;
const o = (id: string) => objective(hamTechS10Data, id);
const answers = (id: string) =>
  Object.fromEntries(
    cfg()
      .worksheets.find((w) => w.id === id)!
      .fields.map((f) => [f.id, f.answer])
  );

describe('S10 Beyond the Local Horizon solve path', () => {
  it('uses its ten quiz items exactly once', () => {
    expect(quizLocalIds(hamTechS10Data).sort()).toEqual(['S10-A1', 'S10-A2', 'S10-Q1', 'S10-Q2', 'S10-Q3', 'S10-Q4', 'S10-Q5', 'S10-Q6', 'S10-Q7', 'S10-Q8']);
  });

  it('solves every objective in order', () => {
    const h = harness(cfg());

    // 1 segment worksheet: a wrong answer earns nothing
    h.actOk({ type: 'worksheet.answer', id: 's10-segment', values: { ...answers('s10-segment'), maxDial: 28.5 } });
    expect(allTrue(o('check-segment'), h.m)).toBe(false);
    h.actOk({ type: 'worksheet.answer', id: 's10-segment', values: answers('s10-segment') });
    expect(allTrue(o('check-segment'), h.m)).toBe(true);

    // 2 mode and filter: LSB on the wrong frequency hears nothing
    h.advance(5);
    expect(anyTrue(o('set-mode-and-filter'), h.m)).toBe(false);
    h.actOk({ type: 'radio.set', deviceId: 'hf', patch: { vfoMHz: 28.38 } });
    h.advance(5);
    expect(allTrue(o('set-mode-and-filter'), h.m)).toBe(false); // still LSB
    h.actOk({ type: 'radio.set', deviceId: 'hf', patch: { mode: 'USB', filterHz: 2700 } });
    h.advance(5);
    expect(allTrue(o('set-mode-and-filter'), h.m)).toBe(true);

    // 3 RIT: without it the offset station is not intelligible
    expect(h.m.bestIntelligibility('s10-offset-voice', { deviceId: 'hf' })).toBeLessThan(0.6);
    h.actOk({ type: 'radio.set', deviceId: 'hf', patch: { vfoMHz: 28.42 } });
    h.advance(5);
    expect(h.m.bestIntelligibility('s10-offset-voice', { deviceId: 'hf' })).toBeLessThan(0.6);
    h.actOk({ type: 'radio.set', deviceId: 'hf', patch: { ritOn: true, ritHz: 700 } });
    h.advance(5);
    expect(allTrue(o('tune-with-rit'), h.m)).toBe(false); // heard but not yet transmitted
    h.actOk({ type: 'ptt', deviceId: 'hf', intent: { kind: 'test' }, holdS: 2 });
    h.advance(3);
    expect(allTrue(o('tune-with-rit'), h.m)).toBe(true);
    const tx = h.m.events('txOk:hf').at(-1)!;
    expect(Number(tx.data?.freqMHz)).toBeCloseTo(28.42, 5);
    h.actOk({ type: 'radio.set', deviceId: 'hf', patch: { ritOn: false, ritHz: 0, vfoMHz: 28.4 } });

    // 4 propagation
    expect(allTrue(o('read-propagation'), h.m)).toBe(false);
    h.actOk({ type: 'worksheet.answer', id: 's10-propagation', values: answers('s10-propagation') });
    expect(allTrue(o('read-propagation'), h.m)).toBe(true);

    // 5 contact: a CQ alone is not a contact
    expect(allTrue(o('make-hf-contact'), h.m)).toBe(false);
    h.actOk({ type: 'ptt', deviceId: 'hf', intent: { kind: 'cq' }, holdS: 3 });
    h.advance(12);
    expect(allTrue(o('make-hf-contact'), h.m)).toBe(false);
    h.actOk({ type: 'ptt', deviceId: 'hf', intent: { kind: 'reply', item: 'report' }, holdS: 3 });
    h.advance(12);
    h.actOk({ type: 'ptt', deviceId: 'hf', intent: { kind: 'identify' }, holdS: 3 });
    h.advance(12);
    expect(allTrue(o('make-hf-contact'), h.m)).toBe(true);

    // 6 CW and FT8
    expect(allTrue(o('compare-modes'), h.m)).toBe(false);
    h.actOk({ type: 'radio.set', deviceId: 'hf', patch: { vfoMHz: 28.06, mode: 'CW' } });
    h.advance(8);
    h.actOk({ type: 'radio.set', deviceId: 'hf', patch: { vfoMHz: 28.074, mode: 'FT8' } });
    h.advance(8);
    h.actOk({ type: 'worksheet.answer', id: 's10-allowed', values: answers('s10-allowed') });
    expect(allTrue(o('compare-modes'), h.m)).toBe(true);

    // 7 band edge
    h.actOk({ type: 'radio.set', deviceId: 'hf', patch: { vfoMHz: 28.498, mode: 'USB' } });
    expect(allTrue(o('reject-band-edge'), h.m)).toBe(false);
    h.actRefused({ type: 'ptt', deviceId: 'hf', intent: { kind: 'test' }, holdS: 1 });
    expect(allTrue(o('reject-band-edge'), h.m)).toBe(false); // refusal alone is not enough
    h.actOk({ type: 'radio.set', deviceId: 'hf', patch: { vfoMHz: 28.4 } });
    h.actOk({ type: 'ptt', deviceId: 'hf', intent: { kind: 'test' }, holdS: 1 });
    h.advance(2);
    expect(allTrue(o('reject-band-edge'), h.m)).toBe(true);
  });

  it('a closed band gives no contact', () => {
    const h = harness({ ...cfg(), hf: { ...cfg().hf!, defaultCondition: 'closed' } });
    h.actOk({ type: 'radio.set', deviceId: 'hf', patch: { vfoMHz: 28.4, mode: 'USB', filterHz: 2700 } });
    h.actOk({ type: 'ptt', deviceId: 'hf', intent: { kind: 'cq' }, holdS: 3 });
    h.advance(15);
    expect(h.m.getReception('w0src').length).toBe(0);
    expect(allTrue(o('make-hf-contact'), h.m)).toBe(false);
  });
});
