import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS02Data } from '../../../src/campaigns/ham-sdr/tech/s02-power-on-the-bench';
import { S02_SYMBOL_ANSWER } from '../../../src/campaigns/ham-sdr/tech/s02-station';
import { evaluateWith } from '../../../src/ham/ham-conditions';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { harness } from '../../ham/manager/harness';
import { practical } from './solve-utils-a';

afterEach(() => HamStationManager.destroy());

const config = () => structuredClone(hamTechS02Data.settings.hamStation) as NonNullable<typeof hamTechS02Data.settings.hamStation>;
type H = ReturnType<typeof harness>;
const act = (h: H, a: Record<string, unknown>) => h.actOk(a as never);
const refused = (h: H, a: Record<string, unknown>) => h.actRefused(a as never);
const place = (h: H, p: Record<string, unknown>) => act(h, { type: 'meter.place', targetId: 'board', ...p });
const rowDone = (h: H, id: string) => practical(hamTechS02Data, id).every((c) => evaluateWith(c, h.m));
const cont = (h: H, red = 'tp-sw1-in', black = 'tp-sw1-out') => {
  act(h, { type: 'meter.mode', mode: 'CONT' });
  place(h, { red, black });
  act(h, { type: 'meter.read' });
};
const boardOffSw1On = (h: H) => {
  h.advance(2);
  act(h, { type: 'board.switch', deviceId: 'board', on: true });
  act(h, { type: 'power', deviceId: 'board', on: false });
};

describe('S2 order of play never strands a row', () => {
  it('player order: repair before Find is refused and the Find row stays reachable', () => {
    const h = harness(config());
    boardOffSw1On(h);
    act(h, { type: 'inspect', targetId: 'board' });
    const r = refused(h, { type: 'repair', faultId: 'sw1-contact' });
    expect(r.ok).toBe(false);
    expect(h.m.faultCleared('sw1-contact')).toBe(false);
    cont(h);
    expect(rowDone(h, 'find-open-branch')).toBe(false); // 0 V check still missing, continuity row is the point:
    expect(
      practical(hamTechS02Data, 'find-open-branch')
        .filter((c) => c.description === 'No continuity across the SW1 contact')
        .every((c) => evaluateWith(c, h.m))
    ).toBe(true);
    act(h, { type: 'repair', faultId: 'sw1-contact' });
    expect(h.m.faultCleared('sw1-contact')).toBe(true);
  });

  it('inspect hides the fault until the meter has located it, then names it', () => {
    const h = harness(config());
    boardOffSw1On(h);
    const before = act(h, { type: 'inspect', targetId: 'board' });
    expect(before.message).not.toMatch(/open/iu);
    const f = h.m.faults()[0];
    expect(h.m.faultLocated(f)).toBe(false);
    cont(h);
    expect(h.m.faultLocated(f)).toBe(true);
    expect(act(h, { type: 'inspect', targetId: 'board' }).message).toMatch(/open/iu);
  });

  it('an OL reading with SW1 off does not unlock repair; closing SW1 and reading again does', () => {
    const h = harness(config());
    h.advance(2);
    act(h, { type: 'power', deviceId: 'board', on: false });
    cont(h);
    expect(refused(h, { type: 'repair', faultId: 'sw1-contact' }).ok).toBe(false);
    act(h, { type: 'board.switch', deviceId: 'board', on: true });
    cont(h, 'tp-sw1-out', 'tp-sw1-in');
    act(h, { type: 'repair', faultId: 'sw1-contact' });
    expect(h.m.faultCleared('sw1-contact')).toBe(true);
  });

  it('the Compare worksheet done early still ticks its row once reached', () => {
    const h = harness(config());
    act(h, {
      type: 'worksheet.answer',
      id: 's02-families',
      values: { series: 'series', branches: 'parallel', capacitor: 'an electric field', inductor: 'a magnetic field', diode: 'rectification', regulator: 'regulation' },
    });
    act(h, { type: 'worksheet.answer', id: 's02-symbols', values: { parts: { ...S02_SYMBOL_ANSWER } } });
    expect(rowDone(h, 'compare-circuit-families')).toBe(true);
    expect(rowDone(h, 'match-circuit-symbols')).toBe(true);
    // the practical rows of every later objective stay open: nothing was credited out of order
    expect(rowDone(h, 'find-open-branch')).toBe(false);
    expect(rowDone(h, 'restore-indicator-circuit')).toBe(false);
  });

  it('the series reading only counts with the board powered and SW1 on', () => {
    const h = harness(config());
    h.advance(2);
    act(h, { type: 'meter.mode', mode: 'DCA' });
    act(h, { type: 'meter.socket', socket: 'A' });
    place(h, { series: 'r1-branch' });
    act(h, { type: 'meter.read' }); // SW1 off, board on
    expect(rowDone(h, 'predict-branch-current')).toBe(false);
    act(h, { type: 'worksheet.answer', id: 's02-predict', values: { current: 0.1, power: 1.2 } });
    expect(rowDone(h, 'predict-branch-current')).toBe(false); // SW1 still off
    act(h, { type: 'board.switch', deviceId: 'board', on: true });
    act(h, { type: 'meter.read' });
    expect(rowDone(h, 'predict-branch-current')).toBe(true);
  });

  it('0.000 A after the repair with the board off is correct and says why', () => {
    const h = harness(config());
    boardOffSw1On(h);
    cont(h);
    act(h, { type: 'repair', faultId: 'sw1-contact' });
    act(h, { type: 'meter.mode', mode: 'DCA' });
    act(h, { type: 'meter.socket', socket: 'A' });
    place(h, { series: 'r1-branch' });
    const off = act(h, { type: 'meter.read' }) as { message: string; data?: { warning?: string | null } };
    expect(off.message).toContain('0.000 A');
    expect(String(off.data?.warning)).toMatch(/switched off/iu);
    act(h, { type: 'power', deviceId: 'board', on: true });
    h.advance(2);
    act(h, { type: 'meter.read' });
    expect(h.m.lastMeasurement({ instrument: 'multimeter', quantity: 'current' })?.value).toBeGreaterThan(0.09);
  });
});
