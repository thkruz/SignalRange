import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS08Data } from '../../../src/campaigns/ham-sdr/tech/s08-noise-in-the-shack';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { type Harness, harness } from '../../ham/manager/harness';
import { expectedQuizIds, failing, quizLocalIds } from './solve-utils-b';

const data = hamTechS08Data;
let h: Harness;

const record = (): void => {
  h.advance(1);
  h.actOk({ type: 'rx.record', deviceId: 'sdr' });
};
const power = (deviceId: string, on: boolean): void => {
  h.actOk({ type: 'power', deviceId, on });
};
const point = (azDeg: number): void => {
  h.actOk({ type: 'antenna.adjust', deviceId: 'df-yagi', azDeg });
};

afterEach(() => {
  HamStationManager.destroy();
});

describe('S8 solve (KF0SRT)', () => {
  it('uses exactly the ten S08 quiz items once each', () => {
    expect([...quizLocalIds(data)].sort()).toEqual([...expectedQuizIds('08')].sort());
  });

  it('can be solved step by step with the manager', () => {
    h = harness(data.settings.hamStation!);
    h.advance(3);

    // baseline
    expect(failing(data, 'record-pattern', h.m)).not.toEqual([]);
    record();
    expect(failing(data, 'record-pattern', h.m)).toEqual([]);

    // battery baseline
    expect(failing(data, 'battery-baseline', h.m)).not.toEqual([]);
    power('suspect-supply', false);
    power('laptop-charger', false);
    record();
    expect(failing(data, 'battery-baseline', h.m)).toEqual([]);

    // isolate
    expect(failing(data, 'isolate-source', h.m)).toHaveLength(2);
    power('laptop-charger', true);
    record();
    expect(failing(data, 'isolate-source', h.m)).toHaveLength(1);
    power('laptop-charger', false);
    power('suspect-supply', true);
    record();
    expect(failing(data, 'isolate-source', h.m)).toEqual([]);

    // locate
    power('suspect-supply', true);
    expect(failing(data, 'locate-direction', h.m)).toHaveLength(2);
    for (const az of [0, 45, 90, 135, 225]) {
      point(az);
      record();
    }
    expect(failing(data, 'locate-direction', h.m)).toHaveLength(1);
    h.actOk({
      type: 'worksheet.answer',
      id: 's08-reflection',
      values: { why: 'The noise bounces off a nearby surface and reaches the antenna from another direction', trust: 'The direction with the strongest, most consistent reading' },
    });
    expect(failing(data, 'locate-direction', h.m)).toEqual([]);

    // substitute
    point(0);
    h.actOk({ type: 'inspect', targetId: 'suspect-supply' });
    expect(failing(data, 'substitute-supply', h.m)).not.toEqual([]);
    h.actOk({ type: 'install', spareId: 'spare-supply', replaces: 'suspect-supply' });
    record();
    expect(failing(data, 'substitute-supply', h.m)).toEqual([]);

    // audio
    expect(failing(data, 'check-audio', h.m)).not.toEqual([]);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'call', target: 'KD0RLY' }, holdS: 4 });
    h.advance(15);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { micGain: 5 } });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'reply', item: 'report' }, holdS: 3 } as never);
    h.advance(12);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'identify' }, holdS: 3 } as never);
    h.advance(12);
    expect(failing(data, 'check-audio', h.m)).toEqual([]);

    // symptoms
    h.actOk({ type: 'worksheet.answer', id: 's08-symptoms', values: { audio: 'Microphone gain set too high' } });
    expect(failing(data, 'name-the-symptom', h.m)).toEqual([]);
  });
});

describe('S8 negatives', () => {
  it('a reading at a different gain does not count as a comparison', () => {
    h = harness(data.settings.hamStation!);
    h.advance(3);
    record();
    h.actOk({ type: 'radio.set', deviceId: 'sdr', patch: { rfGainDb: 5 } });
    power('suspect-supply', false);
    power('laptop-charger', false);
    record();
    expect(failing(data, 'battery-baseline', h.m)).not.toEqual([]);
  });

  it('a sweep that never reaches the source does not find the bearing', () => {
    h = harness(data.settings.hamStation!);
    h.advance(3);
    for (const az of [180, 225, 270, 315]) {
      point(az);
      record();
    }
    expect(failing(data, 'locate-direction', h.m)).toHaveLength(2);
  });

  it('powering the supply off is not a substitution', () => {
    h = harness(data.settings.hamStation!);
    h.advance(3);
    power('suspect-supply', false);
    record();
    expect(failing(data, 'substitute-supply', h.m).length).toBeGreaterThanOrEqual(3);
  });

  it('leaving the microphone overdriven does not clear the audio check', () => {
    h = harness(data.settings.hamStation!);
    h.advance(3);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'call', target: 'KD0RLY' }, holdS: 4 });
    h.advance(15);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'reply', item: 'report' }, holdS: 3 } as never);
    h.advance(12);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'identify' }, holdS: 3 } as never);
    h.advance(12);
    expect(failing(data, 'check-audio', h.m)).not.toEqual([]);
  });
});
