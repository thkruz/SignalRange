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
const AUDIO_CAUSE = {
  'follows-gain': 'Microphone gain set too high',
  'follows-power': 'RF getting back into the audio path',
  remedy: 'Fit a ferrite choke on the feed line',
};
const testTx = (): void => {
  h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 3 } as never);
  h.advance(12);
};
const callRiley = (): void => {
  h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'call', target: 'KD0RLY' }, holdS: 4 });
  h.advance(15);
};
const finishWithRiley = (): void => {
  h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'reply', item: 'report' }, holdS: 3 } as never);
  h.advance(12);
  h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'identify' }, holdS: 3 } as never);
  h.advance(12);
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

    // guided comparison of the two audio problems
    expect(failing(data, 'compare-audio', h.m)).toHaveLength(3);
    testTx();
    expect(h.m.audioReports().map((r) => r.verdict)).toEqual(['feedback']);
    expect(failing(data, 'compare-audio', h.m)).toHaveLength(2);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { txPowerW: 5, micGain: 9 } });
    testTx();
    expect(h.m.audioReports().map((r) => r.verdict)).toEqual(['feedback', 'overdrive']);
    expect(failing(data, 'compare-audio', h.m)).toHaveLength(1);
    h.actOk({ type: 'worksheet.answer', id: 's08-audio-cause', values: AUDIO_CAUSE });
    expect(failing(data, 'compare-audio', h.m)).toEqual([]);

    // audio check: back to 15 W and gain 5, then the remedy the evidence supports
    expect(failing(data, 'check-audio', h.m)).not.toEqual([]);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { txPowerW: 15, micGain: 5 } });
    callRiley();
    expect(h.m.qsoNotes().some((n) => n.code === 'rf-feedback')).toBe(true);
    h.actOk({ type: 'inspect', targetId: 'feed' });
    h.actOk({ type: 'install', spareId: 'feed-choked', replaces: 'feed' });
    finishWithRiley();
    expect(failing(data, 'check-audio', h.m)).toEqual([]);

    // symptoms
    h.actOk({ type: 'worksheet.answer', id: 's08-symptoms', values: { audio: 'RF getting back into the audio path' } });
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

  it('leaving the feed line unchoked does not clear the audio check', () => {
    h = harness(data.settings.hamStation!);
    h.advance(3);
    callRiley();
    finishWithRiley();
    expect(failing(data, 'check-audio', h.m)).not.toEqual([]);
  });

  it('the wrong remedy (lower mic gain) does not clear RF feedback', () => {
    h = harness(data.settings.hamStation!);
    h.advance(3);
    callRiley();
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { micGain: 3 } });
    finishWithRiley();
    expect(h.m.qsoNotes().filter((n) => n.code === 'rf-feedback').length).toBeGreaterThan(1);
    expect(failing(data, 'check-audio', h.m)).not.toEqual([]);
  });

  it('dropping the power hides the feedback but is not a fix', () => {
    h = harness(data.settings.hamStation!);
    h.advance(3);
    callRiley();
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { txPowerW: 5 } });
    finishWithRiley();
    expect(failing(data, 'check-audio', h.m)).not.toEqual([]);
  });

  it('mic overdrive reads as both at high power and as overdrive at low power', () => {
    h = harness(data.settings.hamStation!);
    h.advance(3);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { micGain: 9 } });
    testTx();
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { txPowerW: 5 } });
    testTx();
    expect(h.m.audioReports().map((r) => r.verdict)).toEqual(['both', 'overdrive']);
    expect(failing(data, 'compare-audio', h.m)).toHaveLength(2);
  });

  it('a clean low-power test with normal gain produces no problem report', () => {
    h = harness(data.settings.hamStation!);
    h.advance(3);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { txPowerW: 5 } });
    testTx();
    expect(h.m.audioReports().map((r) => r.verdict)).toEqual(['clean']);
  });

  it('a wrong remedy answer on the worksheet does not pass the comparison', () => {
    h = harness(data.settings.hamStation!);
    h.advance(3);
    h.actOk({ type: 'worksheet.answer', id: 's08-audio-cause', values: { ...AUDIO_CAUSE, remedy: 'Turn the mic gain down further' } });
    expect(failing(data, 'compare-audio', h.m).join(' ')).toContain('Symptoms matched');
  });
});
