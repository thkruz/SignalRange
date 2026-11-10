import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS02Data } from '../../../src/campaigns/ham-sdr/tech/s02-power-on-the-bench';
import { S02_SYMBOL_ANSWER } from '../../../src/campaigns/ham-sdr/tech/s02-station';
import { evaluateWith } from '../../../src/ham/ham-conditions';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { harness } from '../../ham/manager/harness';
import { practical, quizIds } from './solve-utils-a';

afterEach(() => HamStationManager.destroy());

const config = () => structuredClone(hamTechS02Data.settings.hamStation) as NonNullable<typeof hamTechS02Data.settings.hamStation>;

type H = ReturnType<typeof harness>;
// The action union is large; the meter actions are exercised through a loose helper.
const act = (h: H, a: Record<string, unknown>) => h.actOk(a as never);
const place = (h: H, p: Record<string, unknown>) => act(h, { type: 'meter.place', targetId: 'board', ...p });

describe('S2 Power on the Bench solve', () => {
  it('uses exactly its ten quiz items, each once', () => {
    const ids = quizIds(hamTechS02Data);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect([...ids].sort()).toEqual(['S02-A1', 'S02-A2', 'S02-Q1', 'S02-Q2', 'S02-Q3', 'S02-Q4', 'S02-Q5', 'S02-Q6', 'S02-Q7', 'S02-Q8']);
  });

  it('solves every objective in order', () => {
    const h = harness(config());
    const m = h.m;
    const ok = (id: string) => practical(hamTechS02Data, id).every((c) => evaluateWith(c, m));
    h.advance(2);

    expect(ok('match-circuit-symbols')).toBe(false);
    act(h, { type: 'worksheet.answer', id: 's02-symbols', values: { parts: { ...S02_SYMBOL_ANSWER } } });
    expect(ok('match-circuit-symbols')).toBe(true);

    expect(ok('select-meter-function')).toBe(false);
    act(h, { type: 'worksheet.answer', id: 's02-select', values: { setup: 'DC voltage, red lead in the VΩ socket' } });
    expect(ok('select-meter-function')).toBe(false); // meter not yet set
    act(h, { type: 'meter.mode', mode: 'DCV' });
    expect(ok('select-meter-function')).toBe(true);

    expect(ok('measure-test-supply')).toBe(false);
    place(h, { red: 'tp-supply+', black: 'tp-supply-' });
    act(h, { type: 'meter.read' });
    expect(ok('measure-test-supply')).toBe(false); // reverse reading missing
    place(h, { red: 'tp-supply-', black: 'tp-supply+' });
    act(h, { type: 'meter.read' });
    place(h, { red: 'tp-supply+', black: 'tp-supply-' });
    act(h, { type: 'meter.read' });
    expect(ok('measure-test-supply')).toBe(true);

    // predict: close SW1, the series current reads about 0 A because of the open contact
    expect(ok('predict-branch-current')).toBe(false);
    act(h, { type: 'board.switch', deviceId: 'board', on: true });
    act(h, { type: 'worksheet.answer', id: 's02-predict', values: { current: 0.1, power: 1.2 } });
    act(h, { type: 'meter.mode', mode: 'DCA' });
    act(h, { type: 'meter.socket', socket: 'A' });
    place(h, { series: 'r1-branch' });
    act(h, { type: 'meter.read' });
    expect(m.lastMeasurement({ instrument: 'multimeter', quantity: 'current' })?.value).toBeLessThan(0.01);
    expect(ok('predict-branch-current')).toBe(true);

    // find the open branch: power off, verify 0 V, then continuity
    expect(ok('find-open-branch')).toBe(false);
    act(h, { type: 'power', deviceId: 'board', on: false });
    act(h, { type: 'meter.mode', mode: 'DCV' });
    act(h, { type: 'meter.socket', socket: 'VOHM' });
    place(h, { red: 'tp-supply+', black: 'tp-supply-' });
    act(h, { type: 'meter.read' });
    expect(ok('find-open-branch')).toBe(false); // no continuity yet
    act(h, { type: 'meter.mode', mode: 'CONT' });
    place(h, { red: 'tp-sw1-in', black: 'tp-sw1-out' });
    act(h, { type: 'meter.read' });
    expect(ok('find-open-branch')).toBe(true);

    // restore
    expect(ok('restore-indicator-circuit')).toBe(false);
    act(h, { type: 'inspect', targetId: 'board' });
    act(h, { type: 'repair', faultId: 'sw1-contact' });
    act(h, { type: 'power', deviceId: 'board', on: true });
    h.advance(2);
    expect(ok('restore-indicator-circuit')).toBe(false); // no post-repair readings yet
    act(h, { type: 'meter.mode', mode: 'DCA' });
    act(h, { type: 'meter.socket', socket: 'A' });
    place(h, { series: 'r1-branch' });
    act(h, { type: 'meter.read' });
    expect(ok('restore-indicator-circuit')).toBe(false); // led branch missing
    place(h, { series: 'led-branch' });
    act(h, { type: 'meter.read' });
    expect(ok('restore-indicator-circuit')).toBe(true);

    expect(ok('compare-circuit-families')).toBe(false);
    act(h, {
      type: 'worksheet.answer',
      id: 's02-families',
      values: { series: 'series', branches: 'parallel', capacitor: 'an electric field', inductor: 'a magnetic field', diode: 'rectification', regulator: 'regulation' },
    });
    expect(ok('compare-circuit-families')).toBe(true);
  });

  it('negative: continuity on the energized board is refused and nothing is logged', () => {
    const h = harness(config());
    act(h, { type: 'meter.mode', mode: 'CONT' });
    place(h, { red: 'tp-sw1-in', black: 'tp-sw1-out' });
    expect(h.actRefused({ type: 'meter.read' } as never).ok).toBe(false);
    expect(practical(hamTechS02Data, 'find-open-branch').every((c) => evaluateWith(c, h.m))).toBe(false);
  });

  it('negative: repair is refused while the board is powered, and a wrong prediction fails', () => {
    const h = harness(config());
    act(h, { type: 'inspect', targetId: 'board' });
    expect(h.actRefused({ type: 'repair', faultId: 'sw1-contact' }).ok).toBe(false);
    act(h, { type: 'worksheet.answer', id: 's02-predict', values: { current: 1.0, power: 12 } });
    expect(h.m.events('worksheet:s02-predict:wrong').length).toBe(1);
    expect(practical(hamTechS02Data, 'predict-branch-current').every((c) => evaluateWith(c, h.m))).toBe(false);
  });
});
