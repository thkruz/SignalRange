import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS07Data } from '../../../src/campaigns/ham-sdr/tech/s07-it-only-fails-on-transmit';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { type Harness, harness } from '../../ham/manager/harness';
import { expectedQuizIds, failing, quizLocalIds } from './solve-utils-b';

const data = hamTechS07Data;
let h: Harness;

const read = (red: string, black: string): void => {
  h.actOk({ type: 'meter.mode', mode: 'DCV' });
  h.actOk({ type: 'meter.place', targetId: 'psu', red, black });
  h.actOk({ type: 'meter.read' });
};
const keyAndRead = (red: string, black: string): void => {
  h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 3 });
  h.advance(0.5, 0.25);
  read(red, black);
  h.advance(4, 0.5);
};

afterEach(() => {
  HamStationManager.destroy();
});

describe('S7 solve (KF0SRT)', () => {
  it('uses exactly the ten S07 quiz items once each', () => {
    expect([...quizLocalIds(data)].sort()).toEqual([...expectedQuizIds('07')].sort());
  });

  it('can be solved step by step with the manager', () => {
    h = harness(data.settings.hamStation!);
    h.advance(12);

    // reproduce the reset into the dummy load
    expect(failing(data, 'reproduce-reset', h.m)).not.toEqual([]);
    keyAndRead('radio+', 'radio-');
    expect(failing(data, 'reproduce-reset', h.m)).toEqual([]);

    // compare probe points
    expect(failing(data, 'compare-probe-points', h.m).length).toBe(2);
    h.advance(3);
    read('psu+', 'psu-');
    h.advance(1);
    read('radio+', 'radio-');
    expect(failing(data, 'compare-probe-points', h.m)).toEqual([]);

    // worksheet
    expect(failing(data, 'explain-missing-voltage', h.m)).not.toEqual([]);
    h.actOk({ type: 'worksheet.answer', id: 's07-drop', values: { drop: 1.2, culprit: 'The DC lead has too much resistance' } });
    expect(failing(data, 'explain-missing-voltage', h.m)).not.toEqual([]);
    h.actOk({ type: 'worksheet.answer', id: 's07-drop', values: { drop: 2.4, culprit: 'The DC lead has too much resistance' } });
    expect(failing(data, 'explain-missing-voltage', h.m)).toEqual([]);

    // repair: refused while energized
    h.actOk({ type: 'inspect', targetId: 'psu' });
    expect(h.actRefused({ type: 'repair', faultId: 'worn-dc-lead' }).refusal).toBe('energized');
    h.actOk({ type: 'power', deviceId: 'psu', on: false });
    h.actOk({ type: 'repair', faultId: 'worn-dc-lead' });
    expect(failing(data, 'repair-lead', h.m)).toHaveLength(1);
    h.actOk({ type: 'power', deviceId: 'psu', on: true });
    h.actOk({ type: 'power', deviceId: 'mobile', on: true });
    expect(failing(data, 'repair-lead', h.m)).toEqual([]);

    // verify under load, then contact via the antenna
    expect(failing(data, 'verify-transmit-load', h.m).length).toBe(3);
    h.advance(3);
    keyAndRead('radio+', 'radio-');
    expect(failing(data, 'verify-transmit-load', h.m)).toHaveLength(1);
    h.actOk({ type: 'disconnect', connectionId: 'mob-dummy' });
    h.actOk({ type: 'connect', a: { deviceId: 'mobile', portId: 'ant' }, b: { deviceId: 'feed', portId: 'a' } } as never);
    h.advance(3);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'call', target: 'KD0RLY' }, holdS: 4 });
    h.advance(15);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'reply', item: 'report' }, holdS: 3 } as never);
    h.advance(12);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'identify' }, holdS: 3 } as never);
    h.advance(12);
    expect(failing(data, 'verify-transmit-load', h.m)).toEqual([]);

    // endurance
    expect(failing(data, 'estimate-endurance', h.m)).not.toEqual([]);
    h.actOk({
      type: 'worksheet.answer',
      id: 's07-endurance',
      values: { avg: 2.4, hours: 4.17, why: 'The transmitter is not 100 percent efficient, so the rest becomes heat' },
    });
    expect(failing(data, 'estimate-endurance', h.m)).toEqual([]);
  });
});

describe('S7 negatives', () => {
  it('a supply-terminal reading alone does not reproduce the reset', () => {
    h = harness(data.settings.hamStation!);
    h.advance(12);
    read('psu+', 'psu-');
    expect(failing(data, 'reproduce-reset', h.m)).toHaveLength(2);
  });

  it('an unloaded radio reading does not show the sag', () => {
    h = harness(data.settings.hamStation!);
    read('radio+', 'radio-');
    expect(failing(data, 'compare-probe-points', h.m)).toHaveLength(2);
  });

  it('a transmission before the repair does not count as verified', () => {
    h = harness(data.settings.hamStation!);
    h.advance(12);
    keyAndRead('radio+', 'radio-');
    expect(failing(data, 'verify-transmit-load', h.m).length).toBe(3);
  });

  it('a wrong endurance answer is not accepted', () => {
    h = harness(data.settings.hamStation!);
    h.actOk({ type: 'worksheet.answer', id: 's07-endurance', values: { avg: 8, hours: 1.25, why: 'The antenna stores the extra power' } });
    expect(failing(data, 'estimate-endurance', h.m)).not.toEqual([]);
  });
});
